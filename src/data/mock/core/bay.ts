import type {
  Actor,
  ActorAct,
  ActorsFrame,
  BayState,
  BeltStatus,
  CameraStatus,
  CaseFlag,
  DoorStatus,
  PackType,
  VisitPhase,
} from '@/domain';
import { employeeName, skuInfo, UNKNOWN_SKU } from './catalog';
import { iso, MIN, SEC, type ShiftSlot } from './clock';
import { BELT_KEY_OF, type SimCtx } from './ctx';
import { clamp, round } from './rng';
import type { VisitTimes } from './kpi';
import { BELT_KEYS, type BeltAcc, type EventRec, type VisitRec } from './types';

// One bay: visit lifecycle, belt segments, crew, forklift, staging. Everything the bay publishes
// (BayState, ActorsFrame, CaseTick, events) is derived from the fields of this class.

type Stage = 'IDLE' | 'REVERSING' | 'DOCKED' | 'LOADING' | 'TAIL' | 'POST' | 'LEAVING';
type Seg = 'LOADED' | 'EMPTY' | 'STOP';

/** Items per staged pallet. */
export const PALLET_ITEMS = 40;
/** Historical class average used for the ETA (etaSource HISTORICAL). */
const HIST_TOTAL = 575;
const HIST_RATE = 14;
const PALLET_CAPACITY = 8;
/** People at the belt mouth stand at least this far from its centre line: the conveyor body is about 1.8 m wide. */
const BELT_CLEARANCE_X = 1.3;
/** A forklift runs E-W along the aisle (docs/04 section 3) to this distance from the bay's centre line. */
const AISLE_RUN_X = 2.5;

interface Person {
  id: string;
  role: 'CAPTAIN' | 'WORKER';
  x: number;
  y: number;
  h: number;
  act: ActorAct;
  tx: number;
  ty: number;
  moving: boolean;
  nextAt: number;
  step: number;
  slotX: number;
  speed: number;
  ppeOk: boolean;
  ppeEnd: number;
}

interface Lift {
  id: string;
  phase: 'IDLE' | 'OUT' | 'DROP' | 'BACK';
  phaseStart: number;
  phaseEnd: number;
  reactAt: number | null;
  /** Bay x at the start of a run along the aisle and at its far end; bay y of the aisle. */
  ax: number;
  ay: number;
  sx: number;
}

interface Crew {
  captain: Person;
  captainEmp: string;
  workers: Person[];
  lift: Lift;
}

type PalletWait = { since: number; reported: boolean };

/** Moved sideways out of the conveyor body; no random draw, so the simulator's sequence is unchanged. */
function clearOfBelt(x: number): number {
  if (Math.abs(x) >= BELT_CLEARANCE_X) return x;
  return x < 0 ? -BELT_CLEARANCE_X : BELT_CLEARANCE_X;
}

function normH(h: number): number {
  let r = h;
  while (r <= -Math.PI) r += 2 * Math.PI;
  while (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

/** Contract heading: 0 faces +y, counter-clockwise positive seen from above (x to the right). */
function headingTo(dx: number, dy: number): number {
  return normH(Math.atan2(-dx, dy));
}

export class BaySim {
  stage: Stage = 'IDLE';
  stageEnd = 0;
  freeAt = 0;
  current: VisitRec | null = null;
  readonly queue: VisitRec[] = [];

  /** Underlying belt status; `shown` adds the camera-offline override. */
  belt: BeltStatus = 'NO_TRUCK';
  shown: BeltStatus = 'NO_TRUCK';
  since: number;
  direction: 'OUT' | 'IN' | 'NONE' = 'NONE';
  private seg: Seg = 'LOADED';
  private segEnd = 0;
  private segRate = 14;
  private nextItemAt = 0;
  private emptySince = 0;
  private emptyReported = false;
  private itemTimes: number[] = [];

  acc: BeltAcc = { runningLoaded: 0, runningEmpty: 0, stopped: 0, noTruck: 0, offline: 0 };
  private accT: number;
  slot: ShiftSlot;
  private bizDay: string;

  today = BaySim.emptyToday();

  /** Today's counters; `done` holds the timestamps of the visits completed today (kpi.turnaround sample). */
  private static emptyToday() {
    return {
      casesOut: 0,
      casesIn: 0,
      trucks: 0,
      tatSum: 0,
      tatN: 0,
      damage: 0,
      fallOff: 0,
      ppe: 0,
      done: [] as VisitTimes[],
    };
  }

  private crewArriveAt: number | null = null;
  private crewLeaveAt: number | null = null;
  crew: Crew | null = null;
  private staged = 0;
  private pallets: PalletWait[] = [];
  private consumedSincePallet = 0;
  private lastT: number;

  /** True when something discrete changed since the last BayState was emitted. */
  dirty = true;

  constructor(
    private readonly ctx: SimCtx,
    readonly id: string,
    startMs: number,
  ) {
    this.slot = ctx.clock.at(startMs);
    this.bizDay = this.slot.businessDay;
    this.accT = startMs;
    this.lastT = startMs;
    this.since = startMs;
  }

  // ---- derived facts ------------------------------------------------------------------------------------------

  private cam(role: 'DOCK' | 'CREW' | 'BELT'): CameraStatus {
    return this.ctx.camStatus(`${this.id}-${role}`);
  }

  private get beltCamOk(): boolean {
    return this.cam('BELT') !== 'OFFLINE';
  }

  get hasCrew(): boolean {
    return this.crew !== null;
  }

  get crewVisible(): boolean {
    return this.crew !== null && this.cam('CREW') !== 'OFFLINE';
  }

  get door(): DoorStatus {
    if (this.cam('DOCK') === 'OFFLINE') return 'UNKNOWN';
    return this.stage === 'DOCKED' ||
      this.stage === 'LOADING' ||
      this.stage === 'TAIL' ||
      this.stage === 'POST' ||
      this.stage === 'LEAVING'
      ? 'OPEN'
      : 'CLOSED';
  }

  get docked(): boolean {
    return (
      this.stage === 'DOCKED' ||
      this.stage === 'LOADING' ||
      this.stage === 'TAIL' ||
      this.stage === 'POST'
    );
  }

  get running(): boolean {
    return this.shown === 'RUNNING_LOADED';
  }

  /** Trucks waiting for this bay's dock, in arrival order: a reversing truck stays queued (and keeps its slot) until it docks. */
  get waitingVisits(): VisitRec[] {
    return this.stage === 'REVERSING' && this.current ? [this.current, ...this.queue] : this.queue;
  }

  /** Visit count at the bay that is waiting (= BayState.queue length). */
  get waiting(): number {
    return this.waitingVisits.length;
  }

  /** Rough "how busy" score for dispatch: lower is better. */
  get load(): number {
    return this.queue.length + (this.current ? 1 : 0);
  }

  enqueue(v: VisitRec): void {
    this.queue.push(v);
    this.dirty = true;
  }

  // ---- time -------------------------------------------------------------------------------------------------

  /** Adds belt-state seconds up to `t1`, rolling over at shift and business-day boundaries. */
  private accumulate(t1: number): void {
    while (this.accT < t1) {
      const upTo = Math.min(t1, this.slot.end);
      const key = BELT_KEY_OF[this.shown] ?? 'noTruck';
      this.acc[key] += upTo - this.accT;
      this.accT = upTo;
      if (this.accT >= this.slot.end) {
        this.slot = this.ctx.clock.at(this.accT);
        this.acc = { runningLoaded: 0, runningEmpty: 0, stopped: 0, noTruck: 0, offline: 0 };
        if (this.slot.businessDay !== this.bizDay) {
          this.bizDay = this.slot.businessDay;
          this.today = BaySim.emptyToday();
        }
        this.dirty = true;
      }
    }
  }

  shiftSec(): Record<(typeof BELT_KEYS)[number], number> {
    const out = { runningLoaded: 0, runningEmpty: 0, stopped: 0, noTruck: 0, offline: 0 };
    for (const k of BELT_KEYS) out[k] = this.acc[k] / SEC;
    return out;
  }

  advance(t1: number): void {
    const dtMs = t1 - this.lastT;
    this.accumulate(t1);
    for (let guard = 0; guard < 24; guard++) {
      if (!this.stageStep(t1)) break;
    }
    this.crewTick(t1);
    this.sideEffects(t1, dtMs);
    if (this.ctx.live && this.crew) this.moveCrew(this.lastT, t1);
    this.lastT = t1;
  }

  // ---- visit lifecycle ----------------------------------------------------------------------------------------

  private stageStep(t1: number): boolean {
    const v = this.current;
    switch (this.stage) {
      case 'IDLE': {
        const next = this.queue[0];
        if (!next || this.freeAt > t1) return false;
        this.queue.shift();
        this.beginReverse(next, Math.max(this.freeAt, next.arrivedAt));
        return true;
      }
      case 'REVERSING':
        if (!v || this.stageEnd > t1) return false;
        this.dock(v, this.stageEnd);
        return true;
      case 'DOCKED':
        if (!v || this.stageEnd > t1) return false;
        this.startLoading(v, this.stageEnd);
        return true;
      case 'LOADING':
        return v ? this.loadingStep(v, t1) : false;
      case 'TAIL':
        if (!v || this.stageEnd > t1) return false;
        this.finish(v, this.stageEnd);
        return true;
      case 'POST':
        if (!v || this.stageEnd > t1) return false;
        this.depart(v, this.stageEnd);
        return true;
      case 'LEAVING':
        if (this.stageEnd > t1) return false;
        this.clear(this.stageEnd);
        return true;
    }
  }

  private visitEvent(
    v: VisitRec,
    key: 'truck.docked' | 'truck.started' | 'truck.finished' | 'truck.departed',
    ts: number,
    extra: Record<string, unknown>,
  ): void {
    const ev = this.ctx.addEvent({
      key,
      ts,
      bay: this.id,
      visit: { visitId: v.visitId, plateEn: v.plate.en },
      data: { visitId: v.visitId, plateEn: v.plate.en, at: iso(ts), ...extra },
    });
    v.eventIds.push(ev.id);
  }

  private beginReverse(v: VisitRec, t: number): void {
    this.current = v;
    this.stage = 'REVERSING';
    this.stageEnd = t + this.ctx.rng.range(1.5, 4) * MIN;
    v.phase = 'ARRIVED';
    this.direction = 'NONE';
    this.setBelt('NO_TRUCK', t);
    this.dirty = true;
  }

  private dock(v: VisitRec, t: number): void {
    const { rng } = this.ctx;
    v.phase = 'DOCKED';
    v.dockedAt = t;
    this.ctx.releaseSlot(v);
    this.direction = v.dir;
    this.today.trucks += 1;
    this.stage = 'DOCKED';
    this.stageEnd = t + rng.tri(5, 10, 25) * MIN;
    this.crewArriveAt = t + rng.range(1, 3) * MIN;
    this.crewLeaveAt = null;
    v.captain = this.ctx.captainFor(this.id, t);
    this.setBelt('STOPPED', t);
    this.visitEvent(v, 'truck.docked', t, {});
    this.dirty = true;
  }

  private startLoading(v: VisitRec, t: number): void {
    const phase: VisitPhase = v.dir === 'OUT' ? 'LOADING' : 'UNLOADING';
    v.phase = phase;
    v.startedAt = t;
    this.stage = 'LOADING';
    this.seg = 'LOADED';
    this.beginSegment(t);
    this.setBelt('RUNNING_LOADED', t);
    this.visitEvent(v, 'truck.started', t, { dir: v.dir });
    this.dirty = true;
  }

  private itemIntervalMs(): number {
    return (60_000 / this.segRate) * this.ctx.rng.range(0.6, 1.4);
  }

  private beginSegment(t: number): void {
    const { rng } = this.ctx;
    const v = this.current;
    this.segRate = (v?.baseRateCpm ?? 12) * rng.range(0.88, 1.12);
    this.segEnd = t + rng.range(2, 7) * MIN;
    this.nextItemAt = t + this.itemIntervalMs();
  }

  /** Move to the next belt segment after the current one ended at `t`. */
  private nextSegment(t: number): void {
    const { rng, cfg } = this.ctx;
    if (this.seg !== 'LOADED') {
      this.seg = 'LOADED';
      this.beginSegment(t);
      this.setBelt('RUNNING_LOADED', t);
      return;
    }
    const r = rng.next();
    if (r < 0.014) {
      // a long starved run, long enough to raise belt.empty_run
      this.seg = 'EMPTY';
      this.segEnd = t + (cfg.thresholds.emptyRunMin + rng.range(0.5, 4)) * MIN;
      this.emptySince = t;
      this.emptyReported = false;
      this.setBelt('RUNNING_EMPTY', t);
    } else if (r < 0.12) {
      this.seg = 'EMPTY';
      this.segEnd = t + rng.range(20, 90) * SEC;
      this.emptySince = t;
      this.emptyReported = true;
      this.setBelt('RUNNING_EMPTY', t);
    } else if (r < 0.19) {
      this.seg = 'STOP';
      this.segEnd = t + (rng.chance(0.08) ? rng.range(3, 8) * MIN : rng.range(20, 150) * SEC);
      this.setBelt('STOPPED', t);
    } else {
      this.beginSegment(t);
    }
  }

  private loadingStep(v: VisitRec, t1: number): boolean {
    const tn = this.seg === 'LOADED' ? Math.min(this.segEnd, this.nextItemAt) : this.segEnd;
    // starved-run alarm fires at the threshold, before the run ends
    if (this.seg === 'EMPTY' && !this.emptyReported) {
      const at = this.emptySince + this.ctx.cfg.thresholds.emptyRunMin * MIN;
      if (at <= t1) {
        this.emptyReported = true;
        const ev = this.ctx.addEvent({
          key: 'belt.empty_run',
          ts: at,
          bay: this.id,
          visit: { visitId: v.visitId, plateEn: v.plate.en },
          data: { minutes: this.ctx.cfg.thresholds.emptyRunMin },
        });
        v.eventIds.push(ev.id);
        this.dirty = true;
      }
    }
    if (tn > t1) return false;
    if (this.seg === 'LOADED' && this.nextItemAt <= this.segEnd) {
      const ts = this.nextItemAt;
      this.item(v, ts);
      if (v.loaded >= v.total) {
        this.stage = 'TAIL';
        this.stageEnd = ts + this.ctx.cfg.thresholds.finishedGapMin * MIN;
        this.setBelt('RUNNING_EMPTY', ts);
      } else {
        this.nextItemAt = ts + this.itemIntervalMs();
      }
    } else {
      this.nextSegment(this.segEnd);
    }
    return true;
  }

  private pickSku(v: VisitRec): string {
    const { rng } = this.ctx;
    if (rng.chance(0.04)) return UNKNOWN_SKU;
    const i = rng.weightedIndex(v.skuMix.map((m) => m.weight));
    return v.skuMix[i]?.sku ?? UNKNOWN_SKU;
  }

  private item(v: VisitRec, ts: number): void {
    const { rng } = this.ctx;
    v.loaded += 1;
    const sku = this.pickSku(v);
    const info = skuInfo(sku);
    const pack: PackType = info?.pack ?? 'CASE';
    const conf = sku === UNKNOWN_SKU ? 0 : round(rng.range(0.8, 0.98), 2);
    // damaged 0.5%, open tape 0.3%, wet 0.1% of items; torn sack 0.4% of sacks
    let flag: CaseFlag | null = null;
    const r = rng.next();
    if (r < 0.005) flag = 'DAMAGED';
    else if (r < 0.008) flag = 'OPEN_TAPE';
    else if (r < 0.009) flag = 'WET_STAINED';
    else if (pack === 'SACK' && rng.chance(0.004)) flag = 'TORN_SACK';
    this.palletTick(v, ts);
    if (this.beltCamOk) {
      if (v.dir === 'OUT') {
        v.casesOut += 1;
        this.today.casesOut += 1;
      } else {
        v.casesIn += 1;
        this.today.casesIn += 1;
      }
      const tally = v.sku.get(sku) ?? { pack, count: 0, confSum: 0 };
      tally.count += 1;
      tally.confSum += conf;
      v.sku.set(sku, tally);
      this.ctx.store.countCase(this.id, v.dir, ts, sku, conf);
      this.itemTimes.push(ts);
      if (this.itemTimes.length > 40) this.itemTimes.shift();
      if (this.ctx.live) {
        this.ctx.emit({
          kind: 'case',
          value: {
            v: 1,
            ts: iso(ts),
            site: this.ctx.site,
            bay: this.id,
            dir: v.dir,
            sku,
            pack,
            conf,
            flag,
          },
        });
      }
      if (flag) this.flagEvent(v, flag, sku, pack, ts);
    }
    this.dirty = true;
  }

  private flagEvent(v: VisitRec, flag: CaseFlag, sku: string, pack: PackType, ts: number): void {
    const { rng } = this.ctx;
    const key =
      flag === 'DAMAGED'
        ? 'hygiene.damaged'
        : flag === 'OPEN_TAPE'
          ? 'hygiene.open_tape'
          : flag === 'TORN_SACK'
            ? 'hygiene.torn_sack'
            : 'hygiene.wet_stained';
    if (flag === 'DAMAGED') {
      v.damaged += 1;
      this.today.damage += 1;
    } else if (flag === 'OPEN_TAPE') v.openTape += 1;
    else if (flag === 'TORN_SACK') v.tornSack += 1;
    else v.wetStained += 1;
    const ev = this.ctx.addEvent({
      key,
      ts,
      bay: this.id,
      visit: { visitId: v.visitId, plateEn: v.plate.en },
      sku,
      data: { sku, pack },
      pos: { x: round(rng.range(-0.4, 0.4), 2), y: round(rng.range(2, 8), 1) },
    });
    v.eventIds.push(ev.id);
  }

  private finish(v: VisitRec, t: number): void {
    const { rng } = this.ctx;
    v.phase = 'FINISHED';
    v.finishedAt = t;
    this.stage = 'POST';
    this.stageEnd = t + rng.tri(3, 5, 12) * MIN;
    this.crewLeaveAt = t + rng.range(1, 4) * MIN;
    this.setBelt('STOPPED', t);
    this.visitEvent(v, 'truck.finished', t, { casesOut: v.casesOut, casesIn: v.casesIn });
    this.dirty = true;
  }

  private depart(v: VisitRec, t: number): void {
    v.phase = 'DEPARTED';
    v.departedAt = t;
    const tat = (t - v.arrivedAt) / MIN;
    this.today.tatSum += tat;
    this.today.tatN += 1;
    this.today.done.push({
      arrivedAt: v.arrivedAt,
      dockedAt: v.dockedAt,
      startedAt: v.startedAt,
      finishedAt: v.finishedAt,
      departedAt: t,
    });
    this.stage = 'LEAVING';
    this.stageEnd = t + 30 * SEC;
    this.setBelt('NO_TRUCK', t);
    this.direction = 'NONE';
    this.visitEvent(v, 'truck.departed', t, { tatMin: round(tat, 1) });
    if (this.crew) this.despawnCrew(t);
    this.dirty = true;
  }

  private clear(t: number): void {
    this.current = null;
    this.stage = 'IDLE';
    this.freeAt = t + this.ctx.rng.range(1, 2) * MIN;
    this.dirty = true;
  }

  // ---- belt state ---------------------------------------------------------------------------------------------

  private setBelt(status: BeltStatus, t: number): void {
    this.belt = status;
    this.syncShown(t);
  }

  /** Re-derive the published belt status (underlying status, or OFFLINE while the BELT camera is out). */
  syncShown(t: number): void {
    const shown: BeltStatus = this.beltCamOk ? this.belt : 'OFFLINE';
    if (shown === this.shown) return;
    const from = this.shown;
    this.ctx.store.addBeltInterval(this.id, { status: from, start: this.since, end: t });
    const v = this.current;
    const ev = this.ctx.addEvent({
      key: 'belt.state_changed',
      ts: t,
      bay: this.id,
      visit: v ? { visitId: v.visitId, plateEn: v.plate.en } : null,
      data: { from, to: shown },
    });
    if (v) v.eventIds.push(ev.id);
    this.shown = shown;
    this.since = t;
    this.dirty = true;
  }

  // ---- crew -------------------------------------------------------------------------------------------------

  private crewTick(t1: number): void {
    const v = this.current;
    if (!this.crew && v && this.crewArriveAt !== null && this.crewArriveAt <= t1 && this.docked) {
      this.spawnCrew(v, this.crewArriveAt);
      this.crewArriveAt = null;
    }
    if (this.crew && this.crewLeaveAt !== null && this.crewLeaveAt <= t1) {
      this.despawnCrew(this.crewLeaveAt);
    }
  }

  private spawnCrew(v: VisitRec, t: number): void {
    const { rng, cfg } = this.ctx;
    const wz = cfg.bayInterior.workZone;
    const st = cfg.bayInterior.staging;
    const nWorkers = rng.int(3, 6);
    const person = (role: 'CAPTAIN' | 'WORKER', idx: number): Person => {
      const slotX = round(
        wz.x[0] + 0.6 + (idx * (wz.x[1] - wz.x[0] - 1.2)) / Math.max(1, nWorkers),
        2,
      );
      return {
        id: this.ctx.nextTrackId('t'),
        role,
        x: round(rng.range(st.x[0] + 0.4, st.x[1] - 0.4), 2),
        y: round(rng.range(st.y[0] + 0.5, st.y[0] + 3), 2),
        h: round(rng.range(-3, 3), 2),
        act: 'STATIONARY',
        tx: 0,
        ty: 0,
        moving: false,
        nextAt: t + rng.range(0, 10) * SEC,
        step: rng.int(0, 3),
        slotX,
        speed: rng.range(1.0, 1.4),
        ppeOk: true,
        ppeEnd: 0,
      };
    };
    const workers = Array.from({ length: nWorkers }, (_, i) => person('WORKER', i));
    const captain = person('CAPTAIN', nWorkers / 2);
    const aisle = cfg.bayInterior.forkliftAisle.y;
    const lift: Lift = {
      id: this.ctx.nextTrackId('f'),
      phase: 'IDLE',
      phaseStart: t,
      phaseEnd: t,
      reactAt: null,
      ax: round(rng.range(wz.x[0] + 1, wz.x[1] - 1), 2),
      ay: round((aisle[0] + aisle[1]) / 2, 2),
      sx: 0,
    };
    lift.sx = lift.ax >= 0 ? -AISLE_RUN_X : AISLE_RUN_X;
    this.crew = {
      captain,
      captainEmp: v.captain ?? this.ctx.captainFor(this.id, t),
      workers,
      lift,
    };
    v.crewWorkers = nWorkers;
    v.crewTotal = nWorkers + 2;
    v.crewFrom = t;
    v.workerTracks = workers.map((w) => w.id);
    this.staged = v.dir === 'OUT' ? 4 : 1;
    this.pallets = [];
    this.consumedSincePallet = 0;
    const ev = this.ctx.addEvent({
      key: 'roster.captain_detected',
      ts: t,
      bay: this.id,
      visit: { visitId: v.visitId, plateEn: v.plate.en },
      trackId: captain.id,
      data: { employeeId: this.crew.captainEmp, trackId: captain.id },
    });
    v.eventIds.push(ev.id);
    this.dirty = true;
  }

  private despawnCrew(t: number): void {
    const v = this.current;
    if (v) v.crewTo = t;
    this.crew = null;
    this.crewLeaveAt = null;
    this.staged = 0;
    this.pallets = [];
    this.dirty = true;
  }

  // ---- staging and forklift -----------------------------------------------------------------------------------

  private palletTick(v: VisitRec, ts: number): void {
    const crew = this.crew;
    if (!crew) return;
    this.consumedSincePallet += 1;
    if (this.consumedSincePallet < PALLET_ITEMS) return;
    this.consumedSincePallet = 0;
    if (v.dir === 'OUT') this.staged = Math.max(0, this.staged - 1);
    else this.staged = Math.min(PALLET_CAPACITY, this.staged + 1);
    this.pallets.push({ since: ts, reported: false });
    const lift = crew.lift;
    if (lift.phase === 'IDLE' && lift.reactAt === null) {
      const { rng } = this.ctx;
      lift.reactAt = ts + (rng.chance(0.01) ? rng.range(300, 420) : rng.range(25, 150)) * SEC;
    }
  }

  private liftTick(t1: number): void {
    const crew = this.crew;
    const v = this.current;
    if (!crew || !v) return;
    const lift = crew.lift;
    const { rng, cfg } = this.ctx;
    // unserved pallets beyond the threshold raise pallet_wait once each
    const head = this.pallets[0];
    if (head && !head.reported) {
      const at = head.since + cfg.thresholds.palletWaitSec * SEC;
      if (at <= t1) {
        head.reported = true;
        const ev = this.ctx.addEvent({
          key: 'staging.pallet_wait',
          ts: at,
          bay: this.id,
          visit: { visitId: v.visitId, plateEn: v.plate.en },
          data: {
            palletsWaiting: this.pallets.length,
            oldestWaitSec: cfg.thresholds.palletWaitSec,
          },
          pos: { x: round(rng.range(-2, 2), 2), y: round(rng.range(10, 15), 1) },
        });
        v.eventIds.push(ev.id);
        this.dirty = true;
      }
    }
    for (let guard = 0; guard < 8; guard++) {
      if (lift.phase === 'IDLE') {
        if (lift.reactAt === null || lift.reactAt > t1) return;
        lift.phase = 'OUT';
        lift.phaseStart = lift.reactAt;
        lift.phaseEnd = lift.reactAt + rng.range(6, 10) * SEC;
      } else if (lift.phase === 'OUT') {
        if (lift.phaseEnd > t1) return;
        lift.phase = 'DROP';
        lift.phaseStart = lift.phaseEnd;
        lift.phaseEnd = lift.phaseStart + rng.range(8, 16) * SEC;
      } else if (lift.phase === 'DROP') {
        if (lift.phaseEnd > t1) return;
        const served = this.pallets.shift();
        if (served) {
          v.palletWaitsSec.push(Math.round((lift.phaseEnd - served.since) / SEC));
          if (v.dir === 'OUT') this.staged = Math.min(PALLET_CAPACITY, this.staged + 1);
          else this.staged = Math.max(0, this.staged - 1);
          this.dirty = true;
        }
        lift.phase = 'BACK';
        lift.phaseStart = lift.phaseEnd;
        lift.phaseEnd = lift.phaseStart + rng.range(6, 10) * SEC;
      } else {
        if (lift.phaseEnd > t1) return;
        lift.phase = 'IDLE';
        lift.reactAt = this.pallets.length > 0 ? lift.phaseEnd + rng.range(5, 25) * SEC : null;
      }
    }
  }

  // ---- random per-step effects --------------------------------------------------------------------------------

  private sideEffects(t1: number, dtMs: number): void {
    const { rng, cfg } = this.ctx;
    const thr = cfg.thresholds.detentionMin * MIN;
    for (const vis of this.current ? [this.current, ...this.queue] : this.queue) {
      if (!vis.detention && vis.phase !== 'DEPARTED' && t1 - vis.arrivedAt >= thr) {
        vis.detention = true;
        const ev = this.ctx.addEvent({
          key: 'truck.detention',
          ts: vis.arrivedAt + thr,
          bay: this.id,
          visit: { visitId: vis.visitId, plateEn: vis.plate.en },
          data: {
            visitId: vis.visitId,
            phase: vis.phase,
            minutes: cfg.thresholds.detentionMin,
            thresholdMin: cfg.thresholds.detentionMin,
          },
        });
        vis.eventIds.push(ev.id);
        this.dirty = true;
      }
    }
    const v = this.current;
    if (v && this.stage === 'LOADING') {
      // time-in-state for the per-visit stoppage statistics
      if (this.shown === 'RUNNING_LOADED') v.loadedMs += dtMs;
      else if (this.shown === 'STOPPED') v.stoppedMs += dtMs;
      else if (this.shown === 'RUNNING_EMPTY') v.emptyMs += dtMs;
      // fall-off: about one per bay per day of belt time
      if (this.shown === 'RUNNING_LOADED' && rng.chance(dtMs / 1000 / 20_000))
        this.fallOff(v, t1 - rng.range(0, dtMs));
    }
    this.liftTick(t1);
    const crew = this.crew;
    if (crew) {
      for (const w of crew.workers) {
        if (!w.ppeOk && w.ppeEnd <= t1) {
          w.ppeOk = true;
          this.dirty = true;
        }
      }
    }
  }

  private fallOff(v: VisitRec, ts: number): void {
    if (!this.beltCamOk) return;
    const { rng } = this.ctx;
    const sku = this.pickSku(v);
    const pack: PackType = skuInfo(sku)?.pack ?? 'CASE';
    v.fallOff += 1;
    this.today.fallOff += 1;
    const ev = this.ctx.addEvent({
      key: 'belt.fall_off',
      ts,
      bay: this.id,
      visit: { visitId: v.visitId, plateEn: v.plate.en },
      sku,
      data: { sku, pack },
      pos: { x: round(rng.range(-0.5, 0.5), 2), y: round(rng.range(1, 8), 1) },
    });
    v.eventIds.push(ev.id);
    this.dirty = true;
  }

  /** Called by the depot's Poisson process. Returns the event, or null if nobody can violate right now. */
  ppeViolation(ts: number): EventRec | null {
    const crew = this.crew;
    const v = this.current;
    if (!crew || !v) return null;
    const { rng } = this.ctx;
    const w = rng.pick(crew.workers);
    if (!w.ppeOk) return null;
    w.ppeOk = false;
    w.ppeEnd = ts + rng.range(60, 180) * SEC;
    v.ppeViolations += 1;
    this.today.ppe += 1;
    const missing: ('vest' | 'gloves')[] = rng.chance(0.7)
      ? ['vest']
      : rng.chance(0.5)
        ? ['gloves']
        : ['vest', 'gloves'];
    const ev = this.ctx.addEvent({
      key: 'ppe.violation',
      ts,
      bay: this.id,
      visit: { visitId: v.visitId, plateEn: v.plate.en },
      trackId: w.id,
      data: { trackId: w.id, role: 'WORKER', missing },
      pos: { x: round(w.x, 2), y: round(w.y, 2) },
    });
    v.eventIds.push(ev.id);
    this.dirty = true;
    return ev;
  }

  /** Rare critical compliance events (person on belt, person in forklift path). */
  complianceCritical(ts: number, kind: 'on_belt' | 'forklift_proximity'): EventRec | null {
    const crew = this.crew;
    const v = this.current;
    if (!crew || !v) return null;
    const { rng } = this.ctx;
    const w = rng.pick(crew.workers);
    const common = {
      ts,
      bay: this.id,
      visit: { visitId: v.visitId, plateEn: v.plate.en },
      trackId: w.id,
    };
    const ev =
      kind === 'on_belt'
        ? this.ctx.addEvent({
            key: 'compliance.on_belt',
            ...common,
            data: { trackId: w.id },
            pos: { x: round(w.x, 2), y: round(rng.range(6, 8), 1) },
          })
        : this.ctx.addEvent({
            key: 'compliance.forklift_proximity',
            ...common,
            data: { trackId: w.id, forkliftId: crew.lift.id, distM: round(rng.range(0.6, 1.8), 1) },
            pos: { x: round(w.x, 2), y: round(w.y, 2) },
          });
    v.eventIds.push(ev.id);
    this.dirty = true;
    return ev;
  }

  // ---- movement (live only) ---------------------------------------------------------------------------------

  private moveCrew(t0: number, t1: number): void {
    const crew = this.crew;
    if (!crew) return;
    const dt = Math.max(0, (t1 - t0) / 1000);
    const loading = this.stage === 'LOADING' && this.seg === 'LOADED';
    this.movePerson(crew.captain, t1, dt, loading);
    for (const w of crew.workers) this.movePerson(w, t1, dt, loading);
  }

  private pointIn(zone: { x: readonly [number, number]; y: readonly [number, number] }, m = 0.3) {
    const { rng } = this.ctx;
    return {
      x: round(rng.range(zone.x[0] + m, zone.x[1] - m), 2),
      y: round(rng.range(zone.y[0] + m, zone.y[1] - m), 2),
    };
  }

  private movePerson(p: Person, t: number, dt: number, loading: boolean): void {
    const { rng, cfg } = this.ctx;
    const wz = cfg.bayInterior.workZone;
    const st = cfg.bayInterior.staging;
    if (!p.moving) {
      if (p.nextAt > t) return;
      // choose the next leg
      p.step = (p.step + 1) % 4;
      if (p.role === 'CAPTAIN') {
        const target =
          p.step % 2 === 0
            ? { x: clearOfBelt(round(rng.range(-1.2, 1.2), 2)), y: round(rng.range(7.4, 8.6), 2) }
            : this.pointIn({ x: st.x, y: [st.y[0], st.y[0] + 4] });
        p.tx = target.x;
        p.ty = target.y;
      } else if (!loading) {
        const target = this.pointIn(st);
        p.tx = target.x;
        p.ty = target.y;
      } else if (p.step === 0 || p.step === 1) {
        p.tx = clearOfBelt(clamp(p.slotX + rng.range(-0.2, 0.2), wz.x[0] + 0.3, wz.x[1] - 0.3));
        p.ty = round(rng.range(wz.y[0] + 0.5, wz.y[1] - 0.4), 2);
      } else {
        const target = this.pointIn({ x: st.x, y: [st.y[0], st.y[0] + 3] });
        p.tx = target.x;
        p.ty = target.y;
      }
      p.moving = true;
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const dist = Math.hypot(dx, dy);
    const stepLen = p.speed * dt;
    if (dist <= stepLen || dist < 0.05) {
      p.x = round(p.tx, 2);
      p.y = round(p.ty, 2);
      p.moving = false;
      const atWork = p.ty < wz.y[1] + 0.2 && p.ty >= wz.y[0];
      if (p.role === 'CAPTAIN') {
        p.act = atWork ? 'SCANNING' : 'STATIONARY';
        p.nextAt = t + (atWork ? rng.range(20, 50) : rng.range(8, 20)) * SEC;
      } else if (loading) {
        p.act = 'HANDLING';
        p.nextAt = t + (atWork ? rng.range(12, 40) : rng.range(4, 10)) * SEC;
      } else {
        p.act = 'STATIONARY';
        p.nextAt = t + rng.range(10, 40) * SEC;
      }
      p.h = atWork ? round(Math.PI, 2) : round(headingTo(rng.range(-1, 1), rng.range(-1, 1)), 2);
    } else {
      p.x = round(p.x + (dx / dist) * stepLen, 2);
      p.y = round(p.y + (dy / dist) * stepLen, 2);
      p.h = round(headingTo(dx, dy), 2);
      const carrying = loading && p.role === 'WORKER' && p.ty <= wz.y[1] && p.y > wz.y[1];
      p.act = carrying ? 'CARRYING' : 'WALKING';
    }
  }

  // ---- published messages -------------------------------------------------------------------------------------

  /** Mean items per minute over the last 30 s of observed ticks (0 unless the belt is loaded). */
  private rateCpm(t: number): number {
    if (this.shown !== 'RUNNING_LOADED') return 0;
    let n = 0;
    for (const ts of this.itemTimes) if (ts > t - 30 * SEC) n += 1;
    return round(n * 2, 1);
  }

  actorsFrame(t: number): ActorsFrame | null {
    if (this.cam('CREW') === 'OFFLINE') return null;
    const actors: Actor[] = [];
    const crew = this.crew;
    if (crew) {
      const person = (p: Person): Actor => ({
        id: p.id,
        kind: 'PERSON',
        role: p.role,
        x: round(p.x, 2),
        y: round(p.y, 2),
        h: round(normH(p.h), 2),
        act: p.act,
        ppeOk: p.ppeOk,
      });
      actors.push(person(crew.captain), ...crew.workers.map(person));
      const l = crew.lift;
      const dur = Math.max(1, l.phaseEnd - l.phaseStart);
      const f = clamp((t - l.phaseStart) / dur, 0, 1);
      let x = l.ax;
      let act: ActorAct = 'STATIONARY';
      const carrying = this.current?.dir === 'OUT' ? l.phase === 'OUT' : l.phase === 'BACK';
      if (l.phase === 'OUT') {
        x = l.ax + (l.sx - l.ax) * f;
        act = carrying ? 'CARRYING' : 'DRIVING';
      } else if (l.phase === 'DROP') {
        x = l.sx;
      } else if (l.phase === 'BACK') {
        // back along the aisle in reverse: the forks keep pointing the same way, so it never spins on the spot
        x = l.sx + (l.ax - l.sx) * f;
        act = carrying ? 'CARRYING' : 'DRIVING';
      }
      actors.push({
        id: l.id,
        kind: 'FORKLIFT',
        role: 'FORKLIFT_OP',
        x: round(x, 2),
        y: round(l.ay, 2),
        h: round(headingTo(l.sx - l.ax, 0), 2),
        act,
        ppeOk: null,
      });
    }
    return { v: 1, ts: iso(t), site: this.ctx.site, bay: this.id, actors };
  }

  state(t: number): BayState {
    const v = this.current;
    const crew = this.crew;
    const { store } = this.ctx;
    const open = store.openStats(this.id);
    const done = v ? v.casesOut + v.casesIn : 0;
    const loadingNow = this.stage === 'LOADING' || this.stage === 'TAIL';
    const skuTop = v
      ? [...v.sku.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([sku, tally]) => ({
            sku,
            count: tally.count,
            conf: sku === UNKNOWN_SKU ? 0 : round(tally.confSum / Math.max(1, tally.count), 2),
          }))
      : [];
    const empEmp = crew?.captainEmp ?? this.ctx.captainFor(this.id, t);
    const cams: Record<string, CameraStatus> = {
      [`${this.id}-DOCK`]: this.cam('DOCK'),
      [`${this.id}-CREW`]: this.cam('CREW'),
      [`${this.id}-BELT`]: this.cam('BELT'),
    };
    const ppeNow = crew ? crew.workers.filter((w) => !w.ppeOk).length : 0;
    const oldest = this.pallets[0];
    return {
      v: 1,
      ts: iso(t),
      site: this.ctx.site,
      bay: this.id,
      door: { status: this.door },
      belt: {
        status: this.shown,
        since: iso(this.since),
        direction: this.direction,
        directionSource: 'AUTO',
        rateCpm: this.rateCpm(t),
        shiftSec: this.shiftSec(),
      },
      visit: v
        ? {
            visitId: v.visitId,
            plate: v.plate,
            agency: v.agency,
            phase: v.phase,
            arrivedAt: iso(v.arrivedAt),
            dockedAt: v.dockedAt === null ? null : iso(v.dockedAt),
            startedAt: v.startedAt === null ? null : iso(v.startedAt),
            finishedAt: v.finishedAt === null ? null : iso(v.finishedAt),
            departedAt: v.departedAt === null ? null : iso(v.departedAt),
            casesIn: v.casesIn,
            casesOut: v.casesOut,
            expected: null,
            etaMin:
              loadingNow && v.phase !== 'FINISHED'
                ? Math.max(0, Math.ceil((HIST_TOTAL - done) / HIST_RATE))
                : null,
            etaSource: loadingNow && v.phase !== 'FINISHED' ? 'HISTORICAL' : 'NONE',
            damage: v.damaged,
            openTape: v.openTape,
            tornSack: v.tornSack,
            fallOff: v.fallOff,
            skuTop,
            skuCount: [...v.sku.keys()].filter((sku) => sku !== UNKNOWN_SKU).length,
          }
        : null,
      crew: {
        total: crew ? crew.workers.length + 2 : 0,
        captains: crew ? 1 : 0,
        workers: crew ? crew.workers.length : 0,
        forkliftOps: crew ? 1 : 0,
        captain: {
          present: crew !== null,
          trackId: crew ? crew.captain.id : null,
          employeeId: empEmp,
          name: this.ctx.cfg.privacy.showCaptainNames ? employeeName(empEmp) : null,
          idSource: crew ? 'ROSTER+VEST' : 'ROSTER',
        },
        ppeViolationsNow: ppeNow,
      },
      queue: this.waitingVisits.map((q) => ({
        visitId: q.visitId,
        plate: q.plate,
        arrivedAt: iso(q.arrivedAt),
        slot: q.slot,
      })),
      staging: {
        occupancyPct: crew ? Math.round((this.staged / PALLET_CAPACITY) * 100) : 0,
        palletsWaiting: this.pallets.length,
        oldestWaitSec: oldest ? Math.max(0, Math.round((t - oldest.since) / SEC)) : 0,
      },
      today: {
        casesOut: this.today.casesOut,
        casesIn: this.today.casesIn,
        trucks: this.today.trucks,
        avgTatMin: this.today.tatN > 0 ? Math.round(this.today.tatSum / this.today.tatN) : null,
        damage: this.today.damage,
        fallOff: this.today.fallOff,
        ppe: this.today.ppe,
      },
      health: { cams, lagMs: this.ctx.pipelineLagMs() },
      alerts: { open: open.count, maxSev: open.maxSev },
    };
  }

  /** Pallet queue length, exposed for tests and the productivity report. */
  get palletsWaiting(): number {
    return this.pallets.length;
  }
}
