import type {
  BeltSec,
  Lang,
  LeaderboardRow,
  Report,
  ReportBayRow,
  Role,
  Severity,
  SkuRow,
  Visit,
  WhEventWithStatus,
} from '@/domain';
import {
  selectAlertGroups,
  selectTurnaround,
  type AlertGroupRow,
} from '@/features/live/kpiDetail/selectors';
import { canSeeCaptainNames, canViewCategory, type EventCategory } from '@/lib/rbac';

// Pure selectors for the report document (Task 22C). No React, no i18n, no stores: Report in, view models out.
// The report reuses the KPI definitions of docs/03 and the KPI popover groups; it adds no metric of its own.

const MIN_MS = 60_000;

// ---------------------------------------------------------------------------------------------------------------
// Headlines and deltas
// ---------------------------------------------------------------------------------------------------------------

export interface Headlines {
  casesOut: number;
  casesIn: number;
  /** Visits with a departure time in the report. Same set as the truck log. */
  trucksCompleted: number;
  /**
   * Bay occupancy (the T19 headline). `available` is false on an older backend without kpi.turnaround: the row is hidden
   * (not measurable), not shown as a permanent dash. `min` is null when it is measurable but no truck has finished.
   */
  occupancy: { available: boolean; min: number | null };
  depotTatMin: number | null;
  /** PPE compliance, percent points; null until something was evaluated. */
  ppePct: number | null;
  /** Open alerts at the end of the period (kpi.openAlerts). `needsAttention` = critical + warn, like the KPI chip. */
  openAlerts: { critical: number; warn: number; info: number; needsAttention: number };
}

export function selectHeadlines(r: Report): Headlines {
  const turnaround = selectTurnaround(r.kpi);
  const { critical, warn, info } = r.kpi.openAlerts;
  let occupancy: Headlines['occupancy'] = { available: false, min: null };
  let depotTatMin: number | null = r.kpi.avgTatMin;
  if (turnaround.kind === 'full') {
    occupancy = { available: true, min: turnaround.occupancyMin };
    depotTatMin = turnaround.depotTatMin;
  }
  return {
    casesOut: r.kpi.casesOut,
    casesIn: r.kpi.casesIn,
    trucksCompleted: r.visits.filter((v) => v.departedAt !== null).length,
    occupancy,
    depotTatMin,
    ppePct: r.kpi.complianceScore,
    openAlerts: { critical, warn, info, needsAttention: critical + warn },
  };
}

export interface Deltas {
  /** Percent change; null when the previous value is 0 or missing. */
  casesOutPct: number | null;
  casesInPct: number | null;
  /** Absolute change; null when either side is unknown. */
  trucks: number;
  occupancyMin: number | null;
  depotTatMin: number | null;
  /** Percent points. */
  ppePts: number | null;
  openAlerts: number;
}

const pctChange = (cur: number, prev: number): number | null =>
  prev > 0 ? ((cur - prev) / prev) * 100 : null;
const diff = (cur: number | null, prev: number | null): number | null =>
  cur === null || prev === null ? null : cur - prev;

/** Change of a completed period against the previous period of the same length. */
export function selectDeltas(cur: Headlines, prev: Headlines): Deltas {
  return {
    casesOutPct: pctChange(cur.casesOut, prev.casesOut),
    casesInPct: pctChange(cur.casesIn, prev.casesIn),
    trucks: cur.trucksCompleted - prev.trucksCompleted,
    occupancyMin: diff(cur.occupancy.min, prev.occupancy.min),
    depotTatMin: diff(cur.depotTatMin, prev.depotTatMin),
    ppePts: diff(cur.ppePct, prev.ppePct),
    openAlerts: cur.openAlerts.needsAttention - prev.openAlerts.needsAttention,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Handover
// ---------------------------------------------------------------------------------------------------------------

const SEV_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

/** Open or acknowledged events the role may see (the same visibility rule as /events). */
export function openEventsOf(r: Report, role: Role): WhEventWithStatus[] {
  return r.topEvents.filter(
    (e) => e.status !== 'CLOSED' && canViewCategory(role, e.category as EventCategory),
  );
}

/** Most severe first, then newest, then id (stable). */
export function bySeverityThenNewest(a: WhEventWithStatus, b: WhEventWithStatus): number {
  return (
    SEV_RANK[a.sev] - SEV_RANK[b.sev] ||
    Date.parse(b.ts) - Date.parse(a.ts) ||
    a.id.localeCompare(b.id)
  );
}

export interface Handover {
  /** Same call as the KPI popover: selectAlertGroups over the open events (empty groups left out). */
  groups: AlertGroupRow[];
  /** The five most severe open or acknowledged events. */
  top: WhEventWithStatus[];
  /** Open events the report carries (the sum of the group totals). */
  listed: number;
  /** Open alerts the KPI counts (critical + warn + info); listed < total means the report lists a subset. */
  total: number;
}

export function selectHandover(r: Report, role: Role, limit = 5): Handover {
  const open = openEventsOf(r, role);
  const groups = selectAlertGroups(open);
  const { critical, warn, info } = r.kpi.openAlerts;
  return {
    groups,
    top: [...open].sort(bySeverityThenNewest).slice(0, limit),
    listed: groups.reduce((s, g) => s + g.total, 0),
    total: critical + warn + info,
  };
}

/** Last six characters of the event id, upper-case: a short reference to quote on the phone. */
export const shortId = (id: string): string => id.slice(-6).toUpperCase();

// ---------------------------------------------------------------------------------------------------------------
// Bays
// ---------------------------------------------------------------------------------------------------------------

/**
 * Belt running loaded as a share of the time a truck was docked: loaded / (loaded + empty + stopped). 0..1.
 * null when the denominator is 0 (no truck-time), never NaN.
 */
export function beltLoadedShare(sec: Pick<BeltSec, 'runningLoaded' | 'runningEmpty' | 'stopped'>) {
  const denom = sec.runningLoaded + sec.runningEmpty + sec.stopped;
  return denom > 0 ? sec.runningLoaded / denom : null;
}

/** Damaged + open tape + torn sack + wet + fall-off. */
export const productIssuesOf = (
  r: Pick<ReportBayRow, 'damaged' | 'openTape' | 'tornSack' | 'wetStained' | 'fallOff'>,
): number => r.damaged + r.openTape + r.tornSack + r.wetStained + r.fallOff;

export interface BayRowView {
  bay: string;
  casesOut: number;
  casesIn: number;
  trucks: number;
  /** null when the backend sends no avgOccupancyMin (older backend) or no truck finished. Shown as "-". */
  avgOccupancyMin: number | null;
  beltLoadedShare: number | null;
  detentions: number;
  productIssues: number;
  ppe: number;
}

const bayNo = (id: string): number => Number(/\d+/.exec(id)?.[0] ?? Number.MAX_SAFE_INTEGER);
/** Bay order: B01 to B07 by id. This is never a sort by value. */
const byBay = (a: string, b: string): number => bayNo(a) - bayNo(b) || a.localeCompare(b);

export function selectBayRows(
  r: Report,
  /** Depot-wide bay occupancy for the totals row (the headline), as an average of departed visits cannot be rebuilt from bay means. */
  depotOccupancyMin: number | null,
): { rows: BayRowView[]; totals: BayRowView } {
  const rows = [...r.bays]
    .sort((a, b) => byBay(a.bay, b.bay))
    .map((b): BayRowView => ({
      bay: b.bay,
      casesOut: b.casesOut,
      casesIn: b.casesIn,
      trucks: b.trucks,
      avgOccupancyMin: b.avgOccupancyMin ?? null,
      beltLoadedShare: beltLoadedShare(b.beltSec),
      detentions: b.detentions,
      productIssues: productIssuesOf(b),
      ppe: b.ppe,
    }));
  const sec = r.bays.reduce(
    (s, b) => ({
      runningLoaded: s.runningLoaded + b.beltSec.runningLoaded,
      runningEmpty: s.runningEmpty + b.beltSec.runningEmpty,
      stopped: s.stopped + b.beltSec.stopped,
    }),
    { runningLoaded: 0, runningEmpty: 0, stopped: 0 },
  );
  const sum = (f: (b: BayRowView) => number) => rows.reduce((s, b) => s + f(b), 0);
  return {
    rows,
    totals: {
      bay: '',
      casesOut: sum((b) => b.casesOut),
      casesIn: sum((b) => b.casesIn),
      trucks: sum((b) => b.trucks),
      avgOccupancyMin: depotOccupancyMin,
      beltLoadedShare: beltLoadedShare(sec),
      detentions: sum((b) => b.detentions),
      productIssues: sum((b) => b.productIssues),
      ppe: sum((b) => b.ppe),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Truck log
// ---------------------------------------------------------------------------------------------------------------

const ms = (ts: string | null): number | null => {
  if (ts === null) return null;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : null;
};

export interface TruckLogRow {
  visitId: string;
  plate: Visit['plate'];
  agency: Lang | null;
  bay: string;
  dir: Visit['dir'];
  arrivedAt: string;
  dockedAt: string | null;
  departedAt: string | null;
  waitForDockMin: number | null;
  occupancyMin: number | null;
  casesOut: number;
  casesIn: number;
  /** Cartons on the visit's own direction: out for OUT, in for IN, both for MIXED. */
  cartons: number;
  detention: boolean;
}

const minutesBetween = (from: string | null, to: string | null): number | null => {
  const a = ms(from);
  const b = ms(to);
  return a === null || b === null ? null : Math.max(0, b - a) / MIN_MS;
};

/** Finished visits (departed), in arrival order; ties by visit id. Not sorted by any value. */
export function selectTruckLog(visits: readonly Visit[]): TruckLogRow[] {
  return visits
    .filter((v) => v.departedAt !== null)
    .sort(
      (a, b) =>
        (ms(a.arrivedAt) ?? 0) - (ms(b.arrivedAt) ?? 0) || a.visitId.localeCompare(b.visitId),
    )
    .map((v): TruckLogRow => ({
      visitId: v.visitId,
      plate: v.plate,
      agency: v.agency,
      bay: v.bay,
      dir: v.dir,
      arrivedAt: v.arrivedAt,
      dockedAt: v.dockedAt,
      departedAt: v.departedAt,
      waitForDockMin: v.dwell.waitForDockMin ?? minutesBetween(v.arrivedAt, v.dockedAt),
      occupancyMin: v.dwell.occupancyMin ?? minutesBetween(v.dockedAt, v.departedAt),
      casesOut: v.casesOut,
      casesIn: v.casesIn,
      cartons: v.dir === 'OUT' ? v.casesOut : v.dir === 'IN' ? v.casesIn : v.casesOut + v.casesIn,
      detention: v.detention,
    }));
}

// ---------------------------------------------------------------------------------------------------------------
// Evidence, SKU, captains
// ---------------------------------------------------------------------------------------------------------------

export const EVIDENCE_MAX = 5;

/** Up to five events with a snapshot, most severe first, then newest. Any status; only categories the role may view. */
export function selectEvidence(r: Report, role: Role, max = EVIDENCE_MAX): WhEventWithStatus[] {
  return r.topEvents
    .filter((e) => e.media !== null && canViewCategory(role, e.category as EventCategory))
    .sort(bySeverityThenNewest)
    .slice(0, max);
}

export const UNKNOWN_SKU = 'UNKNOWN';
export const SKU_TOP = 8;

export interface SkuSummary {
  /** Top eight matched SKUs by count (ties by code). The unknown bucket is never in the list. */
  rows: SkuRow[];
  /** Share of counted cartons with no SKU match, percent; null when nothing was counted. */
  unknownSharePct: number | null;
}

export function selectSku(rows: readonly SkuRow[], top = SKU_TOP): SkuSummary {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const unknown = rows.filter((r) => r.sku === UNKNOWN_SKU).reduce((s, r) => s + r.count, 0);
  return {
    rows: rows
      .filter((r) => r.sku !== UNKNOWN_SKU)
      .sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku))
      .slice(0, top),
    unknownSharePct: total > 0 ? (unknown / total) * 100 : null,
  };
}

export interface CaptainRow {
  employeeId: string;
  name: Lang;
  /** Bays in bay order. */
  bays: string[];
}

/**
 * Captains by bay assignment. Only for roles that may see names; everyone else gets []. No rank, no score and no metric
 * crosses over from the leaderboard row. Ordered by first bay, then name.
 */
export function selectCaptains(captains: readonly LeaderboardRow[], role: Role): CaptainRow[] {
  if (!canSeeCaptainNames(role)) return [];
  return captains
    .flatMap((c) =>
      c.name === null
        ? []
        : [{ employeeId: c.employeeId, name: c.name, bays: [...c.bays].sort(byBay) }],
    )
    .sort((a, b) => byBay(a.bays[0] ?? '', b.bays[0] ?? '') || a.name.en.localeCompare(b.name.en));
}

// ---------------------------------------------------------------------------------------------------------------
// Empty report
// ---------------------------------------------------------------------------------------------------------------

/** True when nothing at all happened in the period: no cartons, no visits, no events. */
export const isEmptyReport = (r: Report): boolean =>
  r.kpi.casesOut + r.kpi.casesIn === 0 && r.visits.length === 0 && r.topEvents.length === 0;
