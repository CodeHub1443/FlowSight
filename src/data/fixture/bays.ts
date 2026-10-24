import type { ActorsFrame, BayState, HealthFrame, SiteState } from '@/domain';

// Deterministic per-bay variants derived from the B02 contract fixture. Pure: (bay index, tick, now) -> message.

export const FIXTURE_BAYS = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07'] as const;

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toBn = (n: number): string => [...String(n)].map((d) => BN_DIGITS[Number(d)] ?? d).join('');

/** ISO-8601 in the site zone (Asia/Dhaka is a fixed +06:00). */
export function dhakaIso(ms: number): string {
  return new Date(ms + 6 * 3_600_000).toISOString().replace('Z', '+06:00');
}

export function visitIdFor(bay: string, index: number): string {
  return `V-20261024-${bay}-${String(7 + index).padStart(4, '0')}`;
}

const CAMS = ['DOCK', 'CREW', 'BELT'] as const;

/** Camera status per bay; B06 has an offline CREW camera so the health path has something to show. */
function camStatus(bay: string, role: (typeof CAMS)[number]): 'OK' | 'OFFLINE' {
  return bay === 'B06' && role === 'CREW' ? 'OFFLINE' : 'OK';
}

function bayAt(index: number): (typeof FIXTURE_BAYS)[number] {
  const bay = FIXTURE_BAYS[index];
  if (bay === undefined) throw new Error(`no fixture bay at index ${index}`);
  return bay;
}

export function bayVariant(base: BayState, index: number, tick: number, nowMs: number): BayState {
  const bay = bayAt(index);
  const b: BayState = structuredClone(base);
  b.ts = dhakaIso(nowMs);
  b.bay = bay;
  b.health = {
    cams: Object.fromEntries(CAMS.map((r) => [`${bay}-${r}`, camStatus(bay, r)])),
    lagMs: 380 + ((tick * 37 + index * 11) % 120),
  };
  const v = b.visit;
  if (v) {
    v.visitId = visitIdFor(bay, index);
    const num = 2171 + index * 37;
    v.plate = { bn: `ঢাকা মেট্রো-ড ১১-${toBn(num)}`, en: `DHAKA METRO-DA 11-${num}`, conf: 0.93 };
  }

  switch (bay) {
    case 'B01':
      b.door.status = 'CLOSED';
      b.belt = { ...b.belt, status: 'NO_TRUCK', direction: 'NONE', rateCpm: 0 };
      b.visit = null;
      b.crew = {
        total: 0,
        captains: 0,
        workers: 0,
        forkliftOps: 0,
        captain: null,
        ppeViolationsNow: 0,
      };
      b.alerts = { open: 0, maxSev: null };
      break;
    case 'B02':
      b.belt.rateCpm = Math.round((14 + (tick % 4) * 0.3) * 10) / 10;
      if (v) v.casesOut = 412 + tick * 8;
      break;
    case 'B03':
      b.door.status = 'CLOSED';
      b.belt = { ...b.belt, status: 'NO_TRUCK', direction: 'NONE', rateCpm: 0 };
      if (v) {
        Object.assign(v, {
          phase: 'ARRIVED',
          dockedAt: null,
          startedAt: null,
          casesOut: 0,
          etaMin: null,
          etaSource: 'NONE',
          damage: 0,
          skuTop: [],
        });
      }
      b.alerts = { open: 0, maxSev: null };
      break;
    case 'B04':
      b.belt = { ...b.belt, direction: 'IN', directionSource: 'WMS', rateCpm: 11 + (tick % 3) };
      if (v) Object.assign(v, { phase: 'UNLOADING', casesOut: 0, casesIn: 230 + tick * 6 });
      b.alerts = { open: 1, maxSev: 'info' };
      break;
    case 'B05':
      b.belt = { ...b.belt, status: 'STOPPED', rateCpm: 0 };
      if (v) {
        Object.assign(v, {
          phase: 'FINISHED',
          casesOut: 960,
          finishedAt: '2026-10-24T19:48:10+06:00',
        });
      }
      b.alerts = { open: 1, maxSev: 'warn' };
      break;
    case 'B06':
      b.belt = { ...b.belt, status: 'RUNNING_EMPTY', rateCpm: 0 };
      b.crew.captain = {
        present: false,
        trackId: null,
        employeeId: 'EMP-1051',
        name: null,
        idSource: 'ROSTER',
      };
      b.crew.ppeViolationsNow = 1;
      b.alerts = { open: 3, maxSev: 'critical' };
      break;
    case 'B07':
      b.door.status = 'OPEN';
      b.belt = { ...b.belt, status: 'STOPPED', rateCpm: 0 };
      if (v) Object.assign(v, { phase: 'DOCKED', startedAt: null, casesOut: 0, skuTop: [] });
      break;
  }
  return b;
}

export function actorsVariant(
  base: ActorsFrame,
  index: number,
  tick: number,
  nowMs: number,
): ActorsFrame {
  const f: ActorsFrame = structuredClone(base);
  f.ts = dhakaIso(nowMs);
  f.bay = bayAt(index);
  f.actors = f.actors.map((a, i) => ({ ...a, x: a.x + Math.sin(tick / 2 + index + i) * 0.4 }));
  return f;
}

export function healthVariant(base: HealthFrame, nowMs: number): HealthFrame {
  const h: HealthFrame = structuredClone(base);
  h.ts = dhakaIso(nowMs);
  h.cams = FIXTURE_BAYS.flatMap((bay) =>
    CAMS.map((r) => ({
      cam: `${bay}-${r}`,
      status: camStatus(bay, r),
      fps: 15,
      lastFrameAt: dhakaIso(nowMs - 100),
    })),
  );
  return h;
}

export function siteVariant(
  base: SiteState,
  bays: BayState[],
  tick: number,
  nowMs: number,
): SiteState {
  const s: SiteState = structuredClone(base);
  s.ts = dhakaIso(nowMs);
  s.kpi.casesOut += tick * 12;
  s.kpi.baysRunning = bays.filter((b) => b.belt.status.startsWith('RUNNING')).length;
  s.kpi.baysTotal = bays.length;
  const count = (sev: 'info' | 'warn' | 'critical') =>
    bays.filter((b) => b.alerts.maxSev === sev).length;
  s.kpi.openAlerts = { info: count('info'), warn: count('warn'), critical: count('critical') };
  return s;
}
