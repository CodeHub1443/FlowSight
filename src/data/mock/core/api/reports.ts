import type {
  LeaderboardResponse,
  LeaderboardRow,
  Period,
  Report,
  ReportBayRow,
  Role,
  Severity,
  SiteState,
  WhEventWithStatus,
} from '@/domain';
import { shiftBounds } from '@/lib/time';
import { employeeName } from '../catalog';
import { DAY, HOUR, iso, MIN } from '../clock';
import type { Depot } from '../depot';
import { clamp, round } from '../rng';
import { BELT_KEYS, type VisitRec } from '../types';
import { aggregateTurnaround, complianceScoreOf } from '../kpi';
import { beltUtilisation, skuAnalytics } from './analytics';
import { NAME_ROLES, visitFor } from './util';

export const DEFAULT_WEIGHTS = { throughput: 40, tat: 20, damage: 15, compliance: 15, idle: 10 };

type Weights = typeof DEFAULT_WEIGHTS;

function scoreOf(visits: VisitRec[]): Pick<
  LeaderboardRow,
  'metrics' | 'scoreParts' | 'mixFactor'
> & {
  score: number;
  bays: string[];
} {
  let out = 0;
  let inn = 0;
  let activeMs = 0;
  let stoppedMs = 0;
  let flagged = 0;
  let sack = 0;
  let ppe = 0;
  let tatSum = 0;
  let tatN = 0;
  const bays = new Set<string>();
  for (const v of visits) {
    out += v.casesOut;
    inn += v.casesIn;
    activeMs += v.loadedMs + v.stoppedMs + v.emptyMs;
    stoppedMs += v.stoppedMs;
    flagged += v.damaged + v.openTape + v.tornSack + v.wetStained;
    ppe += v.ppeViolations;
    for (const t of v.sku.values()) if (t.pack === 'SACK') sack += t.count;
    if (v.departedAt !== null) {
      tatSum += (v.departedAt - v.arrivedAt) / MIN;
      tatN += 1;
    }
    bays.add(v.bay);
  }
  const cases = out + inn;
  const cph = activeMs > 0 ? cases / (activeMs / HOUR) : 0;
  const avgTat = tatN > 0 ? tatSum / tatN : null;
  const damageRate = cases > 0 ? (flagged / cases) * 100 : 0;
  const ppeCompliance = clamp(100 - (ppe / Math.max(1, visits.length)) * 10, 0, 100);
  const stoppedPct = activeMs > 0 ? (stoppedMs / activeMs) * 100 : 0;
  // sacks are heavier to handle: credit them so Rin/Wheel bays are not penalised
  const mixFactor = round(1 + 0.3 * (cases > 0 ? sack / cases : 0), 2);
  const parts = {
    throughput: round(clamp((cph * mixFactor) / 9, 0, 100), 1),
    tat: round(avgTat === null ? 0 : clamp(100 - Math.max(0, avgTat - 60) * 1.5, 0, 100), 1),
    damage: round(clamp(100 - damageRate * 25, 0, 100), 1),
    compliance: round(ppeCompliance, 1),
    idle: round(clamp(100 - stoppedPct * 3, 0, 100), 1),
  };
  const w: Weights = DEFAULT_WEIGHTS;
  const total = w.throughput + w.tat + w.damage + w.compliance + w.idle;
  const score = round(
    (parts.throughput * w.throughput +
      parts.tat * w.tat +
      parts.damage * w.damage +
      parts.compliance * w.compliance +
      parts.idle * w.idle) /
      total,
    1,
  );
  return {
    metrics: {
      casesOut: out,
      casesIn: inn,
      trucks: visits.length,
      casesPerHour: round(cph, 1),
      avgTatMin: avgTat === null ? null : round(avgTat, 1),
      damageRatePct: round(damageRate, 2),
      ppeCompliancePct: round(ppeCompliance, 1),
      stoppedPct: round(stoppedPct, 1),
    },
    scoreParts: parts,
    mixFactor,
    score,
    bays: [...bays].sort(),
  };
}

export function captainRows(depot: Depot, from: number, to: number, role: Role): LeaderboardRow[] {
  const byCaptain = new Map<string, VisitRec[]>();
  for (const v of depot.store.visits) {
    if (!v.captain || v.startedAt === null || v.startedAt < from || v.startedAt >= to) continue;
    const list = byCaptain.get(v.captain) ?? [];
    list.push(v);
    byCaptain.set(v.captain, list);
  }
  const rows = [...byCaptain.entries()].map(([employeeId, visits]) => {
    const s = scoreOf(visits);
    // seven daily scores ending at `to` for the sparkline
    const trend: number[] = [];
    for (let d = 6; d >= 0; d--) {
      const dayFrom = to - (d + 1) * DAY;
      const dayVisits = visits.filter(
        (v) => (v.startedAt ?? 0) >= dayFrom && (v.startedAt ?? 0) < dayFrom + DAY,
      );
      trend.push(dayVisits.length > 0 ? scoreOf(dayVisits).score : 0);
    }
    return { employeeId, s, trend };
  });
  rows.sort((a, b) => b.s.score - a.s.score || a.employeeId.localeCompare(b.employeeId));
  return rows.map(({ employeeId, s, trend }, i) => ({
    rank: i + 1,
    employeeId,
    name: NAME_ROLES.has(role) ? employeeName(employeeId) : null,
    bays: s.bays,
    metrics: s.metrics,
    score: s.score,
    scoreParts: s.scoreParts,
    mixFactor: s.mixFactor,
    trend,
  }));
}

export function periodWindow(
  depot: Depot,
  period: Period,
  date: string | undefined,
  shiftId: string | undefined,
): { from: number; to: number } | null {
  const day = date ?? depot.clock.businessDay(depot.now);
  const dayStart = depot.clock.businessDayStart(Date.parse(`${day}T12:00:00+06:00`));
  if (period === 'shift') {
    const id = shiftId ?? depot.clock.at(depot.now).id;
    const b = shiftBounds(day, id, depot.cfg.shiftsPlaceholder, depot.cfg.businessDayStart);
    if (!b) return null;
    const start = b.start.getTime();
    return { from: start, to: Math.min(b.end.getTime(), Math.max(depot.now, start + 1)) };
  }
  const end = Math.min(dayStart + DAY, Math.max(depot.now, dayStart + 1));
  if (period === 'day') return { from: dayStart, to: end };
  return { from: dayStart + DAY - (period === 'week' ? 7 : 30) * DAY, to: end };
}

export function leaderboard(
  depot: Depot,
  q: Record<string, string>,
  role: Role,
): LeaderboardResponse | null {
  const period: Period =
    q.period === 'day' || q.period === 'week' || q.period === 'month' ? q.period : 'shift';
  const w = periodWindow(depot, period, q.date, q.shift);
  if (!w) return null;
  return {
    period,
    from: iso(w.from),
    to: iso(w.to),
    rows: captainRows(depot, w.from, w.to, role),
    weights: { ...DEFAULT_WEIGHTS },
  };
}

function kpiFor(depot: Depot, from: number, to: number, isNow: boolean): SiteState['kpi'] {
  let out = 0;
  let inn = 0;
  for (const [key, n] of depot.store.hourCounts) {
    const [, dir, h] = key.split('|');
    const t = Number(h) * HOUR;
    if (t + HOUR <= from || t >= to) continue;
    if (dir === 'OUT') out += n;
    else inn += n;
  }
  const completed = depot.store.visits.filter(
    (v) => v.departedAt !== null && v.departedAt >= from && v.departedAt < to,
  );
  const turnaround = aggregateTurnaround(completed);
  const open: Record<Severity, number> = { info: 0, warn: 0, critical: 0 };
  let ppe = 0;
  for (const e of depot.store.eventsBetween(from, to)) {
    if (e.status !== 'CLOSED') open[e.sev] += 1;
    // PPE compliance (contract rev 1.1) counts PPE only.
    if (e.category === 'ppe') ppe += 1;
  }
  const live = isNow ? depot.siteState().kpi : null;
  return {
    casesOut: out,
    casesIn: inn,
    casesOutDeltaPct: null,
    casesInDeltaPct: null,
    trucksOnSite: live?.trucksOnSite ?? 0,
    trucksDocked: live?.trucksDocked ?? 0,
    trucksWaiting: live?.trucksWaiting ?? 0,
    baysRunning: live?.baysRunning ?? 0,
    baysTotal: depot.bays.length,
    avgTatMin: turnaround.depotTatMin,
    avgTatDeltaMin: null,
    complianceScore: out + inn > 0 ? complianceScoreOf(ppe) : null,
    openAlerts: open,
    turnaround,
  };
}

export function report(
  depot: Depot,
  kind: 'shift' | 'daily',
  q: Record<string, string>,
  role: Role,
): Report | null {
  const date = q.date ?? depot.clock.businessDay(depot.now);
  const w = periodWindow(
    depot,
    kind === 'shift' ? 'shift' : 'day',
    date,
    kind === 'shift' ? q.shift : undefined,
  );
  if (!w) return null;
  const slot = depot.clock.at(w.from);
  const isNow = depot.now >= w.from && depot.now <= w.to + 1;
  const belt = beltUtilisation(depot, {}, w.from, w.to);
  const bays: ReportBayRow[] = depot.bays.map((b) => {
    const visits = depot.store.visits.filter(
      (v) => v.bay === b.id && v.arrivedAt >= w.from && v.arrivedAt < w.to,
    );
    const departed = visits.filter((v) => v.departedAt !== null);
    const sec = belt.bays.find((x) => x.bay === b.id)?.sec ?? {
      runningLoaded: 0,
      runningEmpty: 0,
      stopped: 0,
      noTruck: 0,
      offline: 0,
    };
    const sum = (f: (v: VisitRec) => number): number => visits.reduce((s, v) => s + f(v), 0);
    return {
      bay: b.id,
      casesOut: sum((v) => v.casesOut),
      casesIn: sum((v) => v.casesIn),
      trucks: visits.length,
      avgTatMin:
        departed.length > 0
          ? Math.round(
              departed.reduce((s, v) => s + ((v.departedAt ?? 0) - v.arrivedAt) / MIN, 0) /
                departed.length,
            )
          : null,
      beltSec: Object.fromEntries(BELT_KEYS.map((k) => [k, sec[k]])) as ReportBayRow['beltSec'],
      damaged: sum((v) => v.damaged),
      openTape: sum((v) => v.openTape),
      tornSack: sum((v) => v.tornSack),
      wetStained: sum((v) => v.wetStained),
      fallOff: sum((v) => v.fallOff),
      ppe: sum((v) => v.ppeViolations),
      detentions: visits.filter((v) => v.detention).length,
    };
  });
  const visits = depot.store.visits
    .filter((v) => v.arrivedAt >= w.from && v.arrivedAt < w.to)
    .map((v) => visitFor(depot, v, role));
  const top: WhEventWithStatus[] = depot.store
    .eventsBetween(w.from, w.to)
    .filter((e) => e.sev !== 'info')
    .sort(
      (a, b) =>
        (b.sev === 'critical' ? 1 : 0) - (a.sev === 'critical' ? 1 : 0) ||
        Date.parse(b.ts) - Date.parse(a.ts),
    )
    .slice(0, 10);
  return {
    kind,
    site: depot.site,
    businessDay: slot.businessDay,
    shiftId: kind === 'shift' ? slot.id : null,
    from: iso(w.from),
    to: iso(w.to),
    kpi: kpiFor(depot, w.from, w.to, isNow),
    bays,
    captains: captainRows(depot, w.from, w.to, role),
    visits,
    topEvents: top,
    sku: skuAnalytics(depot, {}, w.from, w.to).rows,
  };
}

export function reportCsv(r: Report): string {
  const head = [
    'bay',
    'casesOut',
    'casesIn',
    'trucks',
    'avgTatMin',
    'damaged',
    'openTape',
    'tornSack',
    'wetStained',
    'fallOff',
    'ppe',
    'detentions',
  ];
  const lines = r.bays.map((b) =>
    [
      b.bay,
      b.casesOut,
      b.casesIn,
      b.trucks,
      b.avgTatMin ?? '',
      b.damaged,
      b.openTape,
      b.tornSack,
      b.wetStained,
      b.fallOff,
      b.ppe,
      b.detentions,
    ].join(','),
  );
  return [head.join(','), ...lines].join('\n') + '\n';
}
