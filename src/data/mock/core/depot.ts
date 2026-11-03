import type {
  CameraStatus,
  EventKey,
  EventLifecycleUpdate,
  HealthFrame,
  SiteConfig,
  SiteState,
  WhEvent,
} from '@/domain';
import { BaySim } from './bay';
import {
  AGENCIES,
  CAPTAINS,
  EVENT_TITLES,
  makePlate,
  SKU_MASTER,
  TIMELINE_EVENTS,
  UNKNOWN_SKU,
} from './catalog';
import { DAY, HOUR, hourOfDay, iso, MIN, ShiftClock, dateOf } from './clock';
import type { SimCtx } from './ctx';
import { buildEvent, type EventSpec } from './eventFactory';
import { CURVE_SLOT_MS, HISTORY_RETENTION_DAYS, HistoryStore } from './history';
import { hashSeed, Rng, round } from './rng';
import type { EventRec, SimMessage, VisitRec } from './types';

export const HISTORY_STEP_MS = 5000;
export const LIVE_STEP_MS = 500;

export interface DepotOptions {
  seed: number;
  /** Virtual "now" when history ends and the live feed starts. Snapped down to the 5 s grid. */
  startMs: number;
  cfg: SiteConfig;
  historyDays?: number;
}

/** Cadences of the live feed in simulation steps (LIVE_STEP_MS each); the controller scales them with speed. */
export interface Cadence {
  actorsEvery: number;
  stateEvery: number;
  healthEvery: number;
}

export const DEFAULT_CADENCE: Cadence = { actorsEvery: 1, stateEvery: 2, healthEvery: 20 };

type Outage = { cam: string; offAt: number; onAt: number; status: CameraStatus; started: boolean };
type Spike = { at: number; until: number; lagMs: number; started: boolean };

export class Depot implements SimCtx {
  readonly cfg: SiteConfig;
  readonly site: string;
  readonly rng: Rng;
  /** Separate stream for manual triggers so poking the simulator never changes the scripted day. */
  readonly trigRng: Rng;
  readonly clock: ShiftClock;
  readonly store = new HistoryStore();
  readonly bays: BaySim[];
  readonly seed: number;
  readonly historyStartMs: number;
  readonly liveStartMs: number;
  readonly rosterOverrides = new Map<string, string>();

  live = false;
  now: number;
  cadence: Cadence = { ...DEFAULT_CADENCE };
  /** Outbound live messages since the last drain. */
  private out: SimMessage[] = [];
  private step_ = 0;
  private nextArrivalAt: number;
  private readonly cams = new Map<string, CameraStatus>();
  private outage: Outage | null = null;
  private outageDay = '';
  private spike: Spike | null = null;
  private trackSeq = 0;
  private trackDay = '';
  private readonly visitSeq = new Map<string, number>();
  private lastPruneAt: number;
  private day = { key: '', ppe: 0, critical: 0, evaluated: false };
  private shiftStart = 0;
  /** True while a manual trigger runs: events then draw ids from the trigger stream. */
  private manual = false;
  private tatCache = { at: -Infinity, value: null as number | null };
  /** Apron holding slots: the visitId parked in each, or null. */
  private readonly slots: (string | null)[];

  constructor(opts: DepotOptions) {
    this.cfg = opts.cfg;
    this.site = opts.cfg.id;
    this.seed = opts.seed;
    this.rng = new Rng(hashSeed(opts.seed, 'main'));
    this.trigRng = new Rng(hashSeed(opts.seed, 'trigger'));
    this.clock = new ShiftClock(opts.cfg.shiftsPlaceholder, opts.cfg.businessDayStart);
    this.liveStartMs = Math.floor(opts.startMs / HISTORY_STEP_MS) * HISTORY_STEP_MS;
    const days = opts.historyDays ?? 7;
    this.historyStartMs = this.clock.at(this.liveStartMs - days * DAY).start;
    this.now = this.historyStartMs;
    this.lastPruneAt = this.liveStartMs;
    const face = opts.cfg.dockFaces[0];
    if (!face) throw new Error('site config has no dock face');
    this.bays = face.bays.map((b) => new BaySim(this, b.id, this.historyStartMs));
    this.slots = Array.from({ length: opts.cfg.yard.holdingLane.slots }, () => null);
    for (const b of this.bays) {
      for (const role of ['DOCK', 'CREW', 'BELT']) this.cams.set(`${b.id}-${role}`, 'OK');
    }
    this.nextArrivalAt = this.now + this.arrivalGapMs(this.now);
    this.day.key = this.clock.businessDay(this.now);
  }

  /** Generates the history up to the live start, then switches to live mode. */
  runHistory(): void {
    while (this.now < this.liveStartMs)
      this.step(Math.min(HISTORY_STEP_MS, this.liveStartMs - this.now));
    this.live = true;
  }

  /** Runs fixed live steps until `target`. Determinism does not depend on how calls are batched. */
  advanceTo(target: number): void {
    while (this.now + LIVE_STEP_MS <= target) this.step(LIVE_STEP_MS);
    if (this.now - this.lastPruneAt >= DAY) this.pruneHistory();
  }

  /** Applies the retention of HistoryStore and of the per-day keys held here, relative to `now`. No random draws. */
  pruneHistory(): void {
    this.lastPruneAt = this.now;
    const cutoff = this.now - HISTORY_RETENTION_DAYS * DAY;
    const cutoffDay = this.clock.businessDay(cutoff);
    this.store.prune(cutoff, cutoffDay);
    const cutoffCompact = cutoffDay.replaceAll('-', '');
    for (const k of this.visitSeq.keys()) {
      if ((k.split('|')[0] ?? '') < cutoffCompact) this.visitSeq.delete(k);
    }
    for (const k of this.rosterOverrides.keys()) {
      if ((k.split('|')[0] ?? '') < cutoffDay) this.rosterOverrides.delete(k);
    }
  }

  drain(): SimMessage[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  emit(m: SimMessage): void {
    if (this.live) this.out.push(m);
  }

  // ---- SimCtx ------------------------------------------------------------------------------------------------

  addEvent(spec: EventSpec): EventRec {
    const ev: WhEvent = buildEvent(this.site, this.manual ? this.trigRng : this.rng, spec);
    const rec = this.record(ev);
    this.markBay(spec.bay);
    return rec;
  }

  private record(ev: WhEvent): EventRec {
    const rec = this.store.addEvent(ev);
    const key = `${ev.category}.${ev.type}`;
    this.countDay(key);
    this.emit({ kind: 'event', value: ev });
    if (TIMELINE_EVENTS.has(key)) {
      this.emit({
        kind: 'lifecycle',
        value: {
          v: 1,
          id: ev.id,
          site: this.site,
          status: 'CLOSED',
          by: { userId: 'system', name: 'System' },
          at: ev.ts,
          note: 'auto-closed',
        },
      });
    }
    return rec;
  }

  private rollDay(t: number): void {
    const d = this.clock.businessDay(t);
    if (this.day.key !== d) this.day = { key: d, ppe: 0, critical: 0, evaluated: false };
  }

  private countDay(key: string): void {
    this.rollDay(this.now);
    if (key === 'ppe.violation') this.day.ppe += 1;
    else if (key === 'compliance.on_belt' || key === 'compliance.forklift_proximity')
      this.day.critical += 1;
  }

  nextTrackId(prefix: 't' | 'f'): string {
    const d = this.clock.businessDay(this.now);
    if (d !== this.trackDay) {
      this.trackDay = d;
      this.trackSeq = 0;
    }
    this.trackSeq += 1;
    this.rollDay(this.now);
    this.day.evaluated = true;
    return `${prefix}-${this.trackSeq}`;
  }

  captainFor(bay: string, ts: number): string {
    const slot = this.clock.at(ts);
    const key = `${slot.businessDay}|${slot.id}|${bay}`;
    const over = this.rosterOverrides.get(key);
    if (over) return over;
    const bayIdx = Math.max(
      0,
      this.bays.findIndex((b) => b.id === bay),
    );
    const shiftIdx = Math.max(
      0,
      this.cfg.shiftsPlaceholder.findIndex((s) => s.id === slot.id),
    );
    const dayIdx = Math.floor(slot.start / DAY);
    const idx = (dayIdx * 5 + shiftIdx * 3 + bayIdx) % CAPTAINS.length;
    return (CAPTAINS[idx] ?? CAPTAINS[0])?.employeeId ?? 'EMP-1040';
  }

  camStatus(cam: string): CameraStatus {
    return this.cams.get(cam) ?? 'OK';
  }

  pipelineLagMs(): number {
    if (this.spike?.started && this.now < this.spike.until) return this.spike.lagMs;
    return Math.round(380 + 90 * Math.sin(this.now / 37_000) + 40 * Math.sin(this.now / 9100));
  }

  // ---- arrivals -----------------------------------------------------------------------------------------------

  private arrivalGapMs(t: number): number {
    const h = hourOfDay(t);
    const { rng } = this;
    if (h >= 17 && h < 23) return rng.range(6, 15) * MIN;
    if (h >= 6 && h < 17) return rng.range(25, 70) * MIN;
    return rng.range(60, 180) * MIN;
  }

  private makeVisit(ts: number, bay: BaySim): VisitRec {
    const { rng } = this;
    const slot = this.clock.at(ts);
    const dayCompact = slot.businessDay.replaceAll('-', '');
    const seqKey = `${dayCompact}|${bay.id}`;
    const seq = (this.visitSeq.get(seqKey) ?? 0) + 1;
    this.visitSeq.set(seqKey, seq);
    const plate = makePlate(rng);
    const unreadable = rng.chance(0.02);
    const conf = unreadable ? round(rng.range(0.45, 0.69), 2) : round(rng.range(0.88, 0.99), 2);
    const k = rng.int(3, 5);
    const pool = SKU_MASTER.map((s) => ({ sku: s.sku, weight: s.weight * rng.range(0.5, 1.5) }));
    const skuMix: { sku: string; weight: number }[] = [];
    for (let i = 0; i < k; i++) {
      const j = rng.weightedIndex(pool.map((p) => p.weight));
      const [picked] = pool.splice(j, 1);
      if (picked) skuMix.push({ sku: picked.sku, weight: rng.range(0.4, 1.6) });
    }
    return {
      visitId: `V-${dayCompact}-${bay.id}-${String(seq).padStart(4, '0')}`,
      bay: bay.id,
      plate: { ...plate, conf },
      agency: rng.chance(0.93) ? rng.pick(AGENCIES) : null,
      dir: rng.chance(0.8) ? 'OUT' : 'IN',
      total: Math.round(rng.tri(250, 420, 900)),
      loaded: 0,
      baseRateCpm: round(rng.tri(8, 15, 20), 1),
      phase: 'ARRIVED',
      slot: null,
      arrivedAt: ts,
      dockedAt: null,
      startedAt: null,
      finishedAt: null,
      departedAt: null,
      casesOut: 0,
      casesIn: 0,
      damaged: 0,
      openTape: 0,
      tornSack: 0,
      wetStained: 0,
      fallOff: 0,
      sku: new Map(),
      skuMix: skuMix.length > 0 ? skuMix : [{ sku: UNKNOWN_SKU, weight: 1 }],
      captain: null,
      eventIds: [],
      detention: false,
      crewWorkers: 0,
      crewTotal: 0,
      workerTracks: [],
      crewFrom: null,
      crewTo: null,
      loadedMs: 0,
      stoppedMs: 0,
      emptyMs: 0,
      ppeViolations: 0,
      palletWaitsSec: [],
      shiftId: slot.id,
      businessDay: slot.businessDay,
    };
  }

  private arrive(ts: number): void {
    const { rng } = this;
    // dispatch: the bay with the fewest trucks, ties broken at random
    let best = Infinity;
    for (const b of this.bays) best = Math.min(best, b.load);
    const candidates = this.bays.filter((b) => b.load === best);
    const bay = rng.pick(candidates);
    const v = this.makeVisit(ts, bay);
    this.store.addVisit(v);
    v.slot = this.freeSlot();
    if (v.slot !== null) this.slots[v.slot - 1] = v.visitId;
    bay.enqueue(v);
    const ref = { visitId: v.visitId, plateEn: v.plate.en };
    const arrived = this.addEvent({
      key: 'truck.arrived',
      ts,
      bay: bay.id,
      visit: ref,
      conf: v.plate.conf,
      data: { ...ref, at: iso(ts) },
    });
    v.eventIds.push(arrived.id);
    if (v.plate.conf < 0.7) {
      const unknown = this.addEvent({
        key: 'truck.unknown_plate',
        ts: ts + 1,
        bay: bay.id,
        visit: ref,
        conf: v.plate.conf,
        data: { plateBn: v.plate.bn, plateEn: v.plate.en, conf: v.plate.conf },
      });
      v.eventIds.push(unknown.id);
    }
  }

  // ---- apron holding lane (config yard.holdingLane.slots, shared by all bays) --------------------------------

  /** Lowest free 1-based slot, or null when the lane is full. */
  private freeSlot(): number | null {
    const i = this.slots.indexOf(null);
    return i < 0 ? null : i + 1;
  }

  releaseSlot(v: VisitRec): void {
    const s = v.slot;
    if (s === null) return;
    v.slot = null;
    this.slots[s - 1] = null;
    // the earliest-arrived truck still waiting without a slot moves into the lane (no random draw: determinism)
    let next: { v: VisitRec; bay: BaySim } | null = null;
    for (const bay of this.bays) {
      for (const q of bay.queue) {
        if (q.slot === null && (!next || q.arrivedAt < next.v.arrivedAt)) next = { v: q, bay };
      }
    }
    if (!next) return;
    next.v.slot = s;
    this.slots[s - 1] = next.v.visitId;
    next.bay.dirty = true;
  }

  // ---- daily scripted incidents -------------------------------------------------------------------------------

  private planDay(t: number): void {
    const date = dateOf(t);
    if (this.outageDay === date) return;
    this.outageDay = date;
    const r = new Rng(hashSeed(this.seed, 'day', date));
    const bay = r.pick(this.bays);
    const role = r.pick(['DOCK', 'CREW', 'BELT'] as const);
    const midnight = Date.parse(`${date}T00:00:00+06:00`);
    const offAt = midnight + r.range(8, 21) * HOUR;
    this.outage = {
      cam: `${bay.id}-${role}`,
      offAt,
      onAt: offAt + r.range(4, 15) * MIN,
      status: 'OFFLINE',
      started: false,
    };
    const at = midnight + r.range(9, 21) * HOUR;
    this.spike = { at, until: at + r.range(1, 3) * MIN, lagMs: r.int(1800, 3500), started: false };
  }

  private scriptedIncidents(t1: number): void {
    this.planDay(t1);
    const o = this.outage;
    if (o) {
      if (!o.started && o.offAt <= t1) {
        o.started = true;
        this.setCamera(o.cam, o.status, Math.max(o.offAt, this.now));
      }
      if (o.started && o.onAt <= t1 && this.camStatus(o.cam) === o.status) {
        this.setCamera(o.cam, 'OK', Math.max(o.onAt, this.now));
      }
    }
    const s = this.spike;
    if (s && !s.started && s.at <= t1) {
      s.started = true;
      this.addEvent({ key: 'system.pipeline_lag', ts: s.at, bay: null, data: { lagMs: s.lagMs } });
    }
  }

  /** Change a camera status; offline/obstructed/... raise an event, going back to OK closes it. */
  setCamera(cam: string, status: CameraStatus, ts: number): void {
    const prev = this.camStatus(cam);
    if (prev === status) return;
    this.cams.set(cam, status);
    const bayId = cam.split('-')[0] ?? '';
    const bay = this.bays.find((b) => b.id === bayId);
    if (status === 'OK') {
      const ev = this.addEvent({ key: 'system.camera_ok', ts, bay: bayId, data: { cam } });
      const inc = [...this.store.incidents].reverse().find((i) => i.cam === cam && i.to === null);
      if (inc) inc.to = ts;
      // close the matching open alert
      for (const e of [...this.store.events].reverse()) {
        if (
          e.category === 'system' &&
          e.status !== 'CLOSED' &&
          'cam' in e.data &&
          e.data.cam === cam
        ) {
          this.closeEvent(
            e.id,
            { userId: 'system', name: 'System' },
            ts,
            `Camera back online (${ev.id})`,
          );
        }
      }
    } else {
      const key: EventKey =
        status === 'OFFLINE'
          ? 'system.camera_offline'
          : status === 'OBSTRUCTED'
            ? 'system.camera_obstructed'
            : status === 'DEFOCUS'
              ? 'system.camera_defocus'
              : 'system.camera_moved';
      this.addEvent({ key, ts, bay: bayId, data: { cam } });
      this.store.incidents.push({ cam, from: ts, to: null });
    }
    bay?.syncShown(ts);
    if (bay) bay.dirty = true;
  }

  /** At each shift change the previous shift's open info/warn alerts are closed by the system. */
  private handover(t1: number): void {
    const slot = this.clock.at(t1);
    if (this.shiftStart === slot.start) return;
    const first = this.shiftStart === 0;
    this.shiftStart = slot.start;
    if (first) return;
    for (const id of this.store.openIds()) {
      const e = this.store.eventById.get(id);
      if (!e || e.sev === 'critical' || Date.parse(e.ts) >= slot.start) continue;
      this.closeEvent(
        id,
        { userId: 'system', name: 'System' },
        slot.start,
        'Closed at shift handover',
      );
    }
  }

  // ---- lifecycle (REST mutations) -----------------------------------------------------------------------------

  private lifecycle(
    id: string,
    status: EventLifecycleUpdate['status'],
    by: { userId: string; name: string },
    note: string | null,
  ): void {
    this.emit({
      kind: 'lifecycle',
      value: { v: 1, id, site: this.site, status, by, at: iso(this.now), note },
    });
  }

  ackEvent(id: string, by: { userId: string; name: string }): EventRec | 'MISSING' | 'STATE' {
    const e = this.store.eventById.get(id);
    if (!e) return 'MISSING';
    if (e.status !== 'OPEN') return 'STATE';
    this.store.setStatus(id, 'ACK', by.name || by.userId, this.now, null);
    this.lifecycle(id, 'ACK', by, null);
    this.markBay(e.bay);
    return e;
  }

  closeEvent(
    id: string,
    by: { userId: string; name: string },
    ts: number,
    note: string,
  ): EventRec | 'MISSING' | 'STATE' {
    const e = this.store.eventById.get(id);
    if (!e) return 'MISSING';
    if (e.status === 'CLOSED') return 'STATE';
    this.store.setStatus(id, 'CLOSED', by.name || by.userId, ts, note);
    this.emit({
      kind: 'lifecycle',
      value: { v: 1, id, site: this.site, status: 'CLOSED', by, at: iso(ts), note },
    });
    this.markBay(e.bay);
    return e;
  }

  noteEvent(id: string, by: { userId: string; name: string }, text: string): EventRec | 'MISSING' {
    const e = this.store.eventById.get(id);
    if (!e) return 'MISSING';
    this.store.setStatus(id, e.status, by.name || by.userId, this.now, text);
    this.lifecycle(id, e.status, by, text);
    return e;
  }

  private markBay(bayId: string | null): void {
    for (const b of this.bays) if (b.id === bayId) b.dirty = true;
  }

  // ---- manual triggers (dev controls) -------------------------------------------------------------------------

  /** Emit one plausible event of a category now. Uses its own random stream. */
  trigger(category: string): EventRec | null {
    this.manual = true;
    try {
      return this.triggerEvent(category);
    } finally {
      this.manual = false;
    }
  }

  private triggerEvent(category: string): EventRec | null {
    const r = this.trigRng;
    const keys = (Object.keys(EVENT_TITLES) as EventKey[]).filter(
      (k) => k.startsWith(`${category}.`) && !TIMELINE_EVENTS.has(k),
    );
    const key = keys.length > 0 ? r.pick(keys) : null;
    if (!key) return null;
    const ts = this.now;
    const withCrew = this.bays.filter((b) => b.hasCrew);
    const bay = r.pick(withCrew.length > 0 ? withCrew : this.bays);
    const v = bay.current;
    const visit = v ? { visitId: v.visitId, plateEn: v.plate.en } : null;
    const track = bay.crew?.workers[0]?.id ?? null;
    const sku = r.pick(SKU_MASTER);
    const pos = { x: round(r.range(-2, 2), 2), y: round(r.range(2, 14), 1) };
    const common = { ts, bay: bay.id, visit, pos };
    let spec: EventSpec;
    switch (key) {
      case 'truck.detention':
        spec = {
          ...common,
          key,
          data: {
            visitId: v?.visitId ?? `V-${dateOf(ts).replaceAll('-', '')}-${bay.id}-9001`,
            phase: v?.phase ?? 'DOCKED',
            minutes: this.cfg.thresholds.detentionMin,
            thresholdMin: this.cfg.thresholds.detentionMin,
          },
        };
        break;
      case 'truck.unknown_plate':
        spec = {
          ...common,
          key,
          data: { plateBn: 'ঢাকা মেট্রো-ড ১১-২১৭১', plateEn: 'DHAKA METRO-DA 11-2171', conf: 0.52 },
        };
        break;
      case 'belt.empty_run':
        spec = { ...common, key, data: { minutes: this.cfg.thresholds.emptyRunMin } };
        break;
      case 'belt.fall_off':
      case 'hygiene.damaged':
      case 'hygiene.open_tape':
      case 'hygiene.torn_sack':
      case 'hygiene.wet_stained':
        spec = { ...common, key, sku: sku.sku, data: { sku: sku.sku, pack: sku.pack } };
        break;
      case 'hygiene.spillage':
      case 'hygiene.debris':
        spec = { ...common, key, data: { areaM2: round(r.range(0.2, 2.5), 1) } };
        break;
      case 'handling.rough_handling':
        spec = {
          ...common,
          key,
          trackId: track,
          data: { trackId: track, dropHeightM: round(r.range(0.8, 1.6), 1) },
        };
        break;
      case 'ppe.violation':
        spec = {
          ...common,
          key,
          trackId: track,
          data: { trackId: track, role: 'WORKER', missing: ['vest'] },
        };
        break;
      case 'compliance.on_belt':
        spec = { ...common, key, trackId: track, data: { trackId: track } };
        break;
      case 'compliance.crowding':
        spec = {
          ...common,
          key,
          data: {
            count: this.cfg.thresholds.crowdingCount + 2,
            limit: this.cfg.thresholds.crowdingCount,
          },
        };
        break;
      case 'compliance.forklift_proximity':
        spec = {
          ...common,
          key,
          trackId: track,
          data: {
            trackId: track,
            forkliftId: bay.crew?.lift.id ?? 'f-1',
            distM: round(r.range(0.6, 1.8), 1),
          },
        };
        break;
      case 'roster.captain_absent':
        spec = { ...common, key, data: { employeeId: this.captainFor(bay.id, ts), minutes: 12 } };
        break;
      case 'staging.pallet_wait':
        spec = {
          ...common,
          key,
          data: { palletsWaiting: 3, oldestWaitSec: this.cfg.thresholds.palletWaitSec + 40 },
        };
        break;
      case 'security.after_hours_presence':
        spec = { ...common, key, data: { count: 2 } };
        break;
      case 'security.door_open_idle':
        spec = { ...common, key, data: { minutes: this.cfg.thresholds.doorOpenIdleMin + 3 } };
        break;
      case 'security.truck_entry_no_loading':
        spec = { ...common, key, trackId: track, data: { trackId: track } };
        break;
      case 'system.camera_offline':
      case 'system.camera_obstructed':
      case 'system.camera_defocus':
      case 'system.camera_moved': {
        const cam = `${bay.id}-${r.pick(['DOCK', 'CREW', 'BELT'] as const)}`;
        const status: CameraStatus =
          key === 'system.camera_offline'
            ? 'OFFLINE'
            : key === 'system.camera_obstructed'
              ? 'OBSTRUCTED'
              : key === 'system.camera_defocus'
                ? 'DEFOCUS'
                : 'MOVED';
        this.setCamera(cam, status, ts);
        this.manualRecover.push({ cam, at: ts + 2 * MIN });
        return [...this.store.events].reverse().find((e) => e.category === 'system') ?? null;
      }
      case 'system.pipeline_lag':
        spec = { ...common, key, data: { lagMs: 2400 } };
        break;
      default:
        spec = { ...common, key, data: {} };
    }
    return this.addEvent(spec);
  }

  private manualRecover: { cam: string; at: number }[] = [];

  // ---- stepping -----------------------------------------------------------------------------------------------

  step(dtMs: number): void {
    const t1 = this.now + dtMs;
    this.rollDay(t1);
    this.handover(t1);
    this.scriptedIncidents(t1);
    for (let i = this.manualRecover.length - 1; i >= 0; i--) {
      const m = this.manualRecover[i];
      if (m && m.at <= t1) {
        this.manual = true;
        try {
          this.setCamera(m.cam, 'OK', m.at);
        } finally {
          this.manual = false;
        }
        this.manualRecover.splice(i, 1);
      }
    }
    while (this.nextArrivalAt <= t1) {
      this.arrive(this.nextArrivalAt);
      this.nextArrivalAt += this.arrivalGapMs(this.nextArrivalAt);
    }
    const { rng } = this;
    for (const bay of this.bays) {
      bay.advance(t1);
      if (bay.hasCrew && bay.current) {
        const dtS = dtMs / 1000;
        if (rng.chance(dtS * 3.0e-5)) bay.ppeViolation(t1 - rng.range(0, dtMs));
        if (rng.chance(dtS * 1.0e-6)) bay.complianceCritical(t1 - rng.range(0, dtMs), 'on_belt');
        if (rng.chance(dtS * 1.0e-6))
          bay.complianceCritical(t1 - rng.range(0, dtMs), 'forklift_proximity');
      }
    }
    this.now = t1;
    this.recordCurve();
    if (this.live) this.publish();
  }

  // ---- aggregates ---------------------------------------------------------------------------------------------

  private siteTotals(): { out: number; in: number } {
    let o = 0;
    let i = 0;
    for (const b of this.bays) {
      o += b.today.casesOut;
      i += b.today.casesIn;
    }
    return { out: o, in: i };
  }

  private recordCurve(): void {
    const slot = this.clock.at(this.now);
    const idx = Math.min(
      143,
      Math.floor((this.now - this.clock.businessDayStart(this.now)) / CURVE_SLOT_MS),
    );
    const totals = this.siteTotals();
    const c = this.store.curve(slot.businessDay);
    c.out[idx] = totals.out;
    c.in[idx] = totals.in;
  }

  private yesterdayAt(t: number): { out: number; in: number } | null {
    const yDay = this.clock.businessDay(t - DAY);
    if (!this.store.hasCurve(yDay)) return null;
    const idx = Math.min(
      143,
      Math.floor((t - DAY - this.clock.businessDayStart(t - DAY)) / CURVE_SLOT_MS),
    );
    const c = this.store.curve(yDay);
    // curves are cumulative within the day; the latest recorded slot at or before idx is the value
    let o = 0;
    let i = 0;
    for (let k = idx; k >= 0; k--) {
      if ((c.out[k] ?? 0) > 0 || (c.in[k] ?? 0) > 0) {
        o = c.out[k] ?? 0;
        i = c.in[k] ?? 0;
        break;
      }
    }
    return { out: o, in: i };
  }

  private avgTat(day: string, before: number): number | null {
    let sum = 0;
    let n = 0;
    for (let i = this.store.visits.length - 1; i >= 0; i--) {
      const v = this.store.visits[i] as VisitRec;
      if (v.arrivedAt < before - 2 * DAY) break;
      if (v.departedAt === null || v.departedAt > before) continue;
      if (this.clock.businessDay(v.departedAt) !== day) continue;
      sum += (v.departedAt - v.arrivedAt) / MIN;
      n += 1;
    }
    return n > 0 ? sum / n : null;
  }

  siteState(t: number = this.now): SiteState {
    const slot = this.clock.at(t);
    const totals = this.siteTotals();
    const y = this.yesterdayAt(t);
    const delta = (today: number, then: number | undefined): number | null =>
      then && then > 0 ? round(((today - then) / then) * 100, 1) : null;
    let docked = 0;
    let waiting = 0;
    let running = 0;
    for (const b of this.bays) {
      if (b.docked) docked += 1;
      waiting += b.waiting;
      if (b.running) running += 1;
    }
    let tatSum = 0;
    let tatN = 0;
    for (const b of this.bays) {
      tatSum += b.today.tatSum;
      tatN += b.today.tatN;
    }
    const avgTat = tatN > 0 ? Math.round(tatSum / tatN) : null;
    let tatDelta: number | null = null;
    if (avgTat !== null) {
      if (t - this.tatCache.at > MIN) {
        this.tatCache = { at: t, value: this.avgTat(this.clock.businessDay(t - DAY), t - DAY) };
      }
      tatDelta = this.tatCache.value === null ? null : Math.round(avgTat - this.tatCache.value);
    }
    const open = this.store.openBySeverity();
    const score = this.day.evaluated
      ? Math.max(0, Math.min(100, Math.round(100 - 1.5 * this.day.ppe - 10 * this.day.critical)))
      : null;
    return {
      v: 1,
      ts: iso(t),
      site: this.site,
      businessDay: slot.businessDay,
      shift: { id: slot.id, start: iso(slot.start), end: iso(slot.end) },
      kpi: {
        casesOut: totals.out,
        casesIn: totals.in,
        casesOutDeltaPct: delta(totals.out, y?.out),
        casesInDeltaPct: delta(totals.in, y?.in),
        trucksOnSite: docked + waiting,
        trucksDocked: docked,
        trucksWaiting: waiting,
        baysRunning: running,
        baysTotal: this.bays.length,
        avgTatMin: avgTat,
        avgTatDeltaMin: tatDelta,
        complianceScore: score,
        openAlerts: open,
      },
    };
  }

  healthFrame(t: number = this.now): HealthFrame {
    const cams: HealthFrame['cams'] = [];
    for (const b of this.bays) {
      for (const role of ['DOCK', 'CREW', 'BELT'] as const) {
        const cam = `${b.id}-${role}`;
        const status = this.camStatus(cam);
        cams.push({
          cam,
          status,
          fps: status === 'OFFLINE' ? 0 : 15,
          lastFrameAt: iso(status === 'OFFLINE' ? t - 5 * MIN : t - 120),
        });
      }
    }
    return {
      v: 1,
      ts: iso(t),
      site: this.site,
      cams,
      pipeline: {
        lagMs: this.pipelineLagMs(),
        gpuPct: Math.round(66 + 8 * Math.sin(t / 53_000)),
        host: 'gpu-tower-01',
      },
    };
  }

  /** Full current picture: what a client needs right after connecting (also GET /snapshot). */
  snapshot(): SimMessage[] {
    const out: SimMessage[] = [];
    for (const b of this.bays) out.push({ kind: 'bayState', value: b.state(this.now) });
    out.push({ kind: 'siteState', value: this.siteState() });
    for (const b of this.bays) {
      const f = b.actorsFrame(this.now);
      if (f) out.push({ kind: 'actors', value: f });
    }
    out.push({ kind: 'health', value: this.healthFrame() });
    return out;
  }

  /** Live publishing at the configured cadence; runs once per step. */
  private publish(): void {
    this.step_ += 1;
    const c = this.cadence;
    const n = this.step_;
    const t = this.now;
    if (n % c.actorsEvery === 0) {
      for (const b of this.bays) {
        const f = b.actorsFrame(t);
        // 2 Hz while anyone is present, 0.2 Hz otherwise
        if (f && (b.hasCrew || n % (c.actorsEvery * 10) === 0))
          this.emit({ kind: 'actors', value: f });
      }
    }
    if (n % c.stateEvery === 0) {
      const heartbeat = n % (c.stateEvery * 10) === 0;
      let any = heartbeat;
      for (const b of this.bays) {
        if (b.dirty || heartbeat) {
          this.emit({ kind: 'bayState', value: b.state(t) });
          b.dirty = false;
          any = true;
        }
      }
      if (any) this.emit({ kind: 'siteState', value: this.siteState(t) });
    }
    if (n % c.healthEvery === 0) this.emit({ kind: 'health', value: this.healthFrame(t) });
  }

  /** Dev: reset step counters so cadence changes take effect on a clean boundary. */
  setCadence(c: Cadence): void {
    this.cadence = c;
  }
}
