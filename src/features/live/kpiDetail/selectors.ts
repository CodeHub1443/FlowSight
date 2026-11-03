import type { BayState, BayVisit, BeltDirection, EventStatus, Severity, SiteKpi } from '@/domain';

// Shared pure selectors for the KPI popovers (19A) and the bay panel (19B). Task 19 spec section 4.
// No React, no stores, no i18n: inputs are store values, outputs are numbers and ids. Owned by 19.0;
// 19A and 19B import these and do not edit them.

const MIN_MS = 60_000;

// ---------------------------------------------------------------------------------------------------------------
// Rate now (cartons/hour by direction)
// ---------------------------------------------------------------------------------------------------------------

export interface FlowRates {
  /** Outbound cartons/hour: sum over bays with belt.direction OUT of belt.rateCpm x 60. null when no belt runs. */
  outPerHour: number | null;
  /** Inbound cartons/hour, same rule for direction IN. null when no belt runs. */
  inPerHour: number | null;
  /** Bays whose belt status is RUNNING_LOADED or RUNNING_EMPTY. */
  runningBays: number;
}

export function isBeltRunning(bay: BayState): boolean {
  return bay.belt.status === 'RUNNING_LOADED' || bay.belt.status === 'RUNNING_EMPTY';
}

/** Live depot rate. Direction NONE counts in neither. Both rates are null when no bay is RUNNING_*. */
export function selectRates(bays: readonly BayState[]): FlowRates {
  let out = 0;
  let inn = 0;
  let running = 0;
  for (const b of bays) {
    if (isBeltRunning(b)) running += 1;
    const perHour = b.belt.rateCpm * 60;
    if (b.belt.direction === 'OUT') out += perHour;
    else if (b.belt.direction === 'IN') inn += perHour;
  }
  if (running === 0) return { outPerHour: null, inPerHour: null, runningBays: 0 };
  return { outPerHour: out, inPerHour: inn, runningBays: running };
}

// ---------------------------------------------------------------------------------------------------------------
// Turnaround breakdown (kpi.turnaround, contract rev 1.1)
// ---------------------------------------------------------------------------------------------------------------

/** Shares of bay occupancy for the stacked bar; they sum to 1. */
export interface PhaseShares {
  preOp: number;
  work: number;
  postOp: number;
}

export type TurnaroundView =
  /** No SiteState yet. */
  | { kind: 'none' }
  /** Older backend (no kpi.turnaround): only the depot turnaround is known; label it "Avg turnaround". */
  | { kind: 'legacy'; avgTatMin: number | null; avgTatDeltaMin: number | null }
  | {
      kind: 'full';
      /** Visits completed today in the sample. */
      n: number;
      /** Headline: bay occupancy. */
      occupancyMin: number | null;
      depotTatMin: number | null;
      /** kpi.avgTatDeltaMin: the existing delta vs the same time yesterday, for the depot turnaround row. */
      depotTatDeltaMin: number | null;
      /** null = not measured; spec section 0: hide the row rather than show a permanent dash. */
      waitForDockMin: number | null;
      preOpDelayMin: number | null;
      activeMin: number | null;
      postOpDelayMin: number | null;
      /** null when any of the three phases is unknown or all are zero. */
      shares: PhaseShares | null;
    };

/** Proportions of three non-negative spans; null when one is unknown or they sum to zero. */
export function phaseShares(
  preOp: number | null,
  work: number | null,
  postOp: number | null,
): PhaseShares | null {
  if (preOp === null || work === null || postOp === null) return null;
  const p = Math.max(0, preOp);
  const w = Math.max(0, work);
  const q = Math.max(0, postOp);
  const total = p + w + q;
  if (total <= 0) return null;
  return { preOp: p / total, work: w / total, postOp: q / total };
}

export function selectTurnaround(kpi: SiteKpi | null | undefined): TurnaroundView {
  if (!kpi) return { kind: 'none' };
  const t = kpi.turnaround;
  if (!t) return { kind: 'legacy', avgTatMin: kpi.avgTatMin, avgTatDeltaMin: kpi.avgTatDeltaMin };
  return {
    kind: 'full',
    n: t.n,
    occupancyMin: t.occupancyMin,
    depotTatMin: t.depotTatMin,
    depotTatDeltaMin: kpi.avgTatDeltaMin,
    waitForDockMin: t.waitForDockMin,
    preOpDelayMin: t.preOpDelayMin,
    activeMin: t.activeMin,
    postOpDelayMin: t.postOpDelayMin,
    shares: phaseShares(t.preOpDelayMin, t.activeMin, t.postOpDelayMin),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// PPE: the bay with the most violations today
// ---------------------------------------------------------------------------------------------------------------

export interface WorstPpeBay {
  bay: string;
  /** BayState.today.ppe */
  count: number;
}

/** The bay with the highest today.ppe (ties: lowest bay id). null when no bay has a violation today. */
export function selectWorstPpeBay(bays: readonly BayState[]): WorstPpeBay | null {
  let best: WorstPpeBay | null = null;
  for (const b of bays) {
    const count = b.today.ppe;
    if (count <= 0) continue;
    if (!best || count > best.count || (count === best.count && b.bay.localeCompare(best.bay) < 0))
      best = { bay: b.bay, count };
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Alert groups (one config table)
// ---------------------------------------------------------------------------------------------------------------

export type AlertGroupId =
  'delays' | 'idle' | 'throughput' | 'ppe' | 'safety' | 'hygiene' | 'security' | 'system' | 'other';

export interface AlertGroupDef {
  id: AlertGroupId;
  /** Exact `category.type` keys. They win over any category wildcard. */
  keys: readonly string[];
  /** Whole categories (`category.*`), used for keys no group lists exactly. */
  categories: readonly string[];
}

/**
 * The alert groups, in display order (spec section 5D). Resolution: an exact key first, then a category wildcard,
 * else 'other'. So `security.door_open_idle` is Idle & stoppage, the rest of `security.*` is Security.
 * Labels live in the 19A namespace: `kpidetail:groups.<id>`.
 */
export const ALERT_GROUPS: readonly AlertGroupDef[] = [
  { id: 'delays', keys: ['truck.detention'], categories: [] },
  { id: 'idle', keys: ['belt.empty_run', 'security.door_open_idle'], categories: [] },
  { id: 'throughput', keys: ['staging.pallet_wait'], categories: [] },
  { id: 'ppe', keys: ['ppe.violation'], categories: [] },
  {
    id: 'safety',
    keys: ['compliance.on_belt', 'compliance.crowding', 'compliance.forklift_proximity'],
    categories: [],
  },
  { id: 'hygiene', keys: ['belt.fall_off'], categories: ['hygiene'] },
  { id: 'security', keys: [], categories: ['security'] },
  { id: 'system', keys: [], categories: ['system', 'roster'] },
  { id: 'other', keys: [], categories: [] },
];

export const ALERT_GROUP_IDS: readonly AlertGroupId[] = ALERT_GROUPS.map((g) => g.id);

const BY_KEY = new Map<string, AlertGroupId>();
const BY_CATEGORY = new Map<string, AlertGroupId>();
for (const g of ALERT_GROUPS) {
  for (const k of g.keys) BY_KEY.set(k, g.id);
  for (const c of g.categories) BY_CATEGORY.set(c, g.id);
}

/** The group of one event type. Never throws; anything unmapped is 'other'. */
export function alertGroupOf(category: string, type: string): AlertGroupId {
  return BY_KEY.get(`${category}.${type}`) ?? BY_CATEGORY.get(category) ?? 'other';
}

/** The fields the alert selectors read. A WhEventWithStatus fits; so does an event of a type the UI does not know. */
export interface AlertLike {
  category: string;
  type: string;
  sev: Severity;
  /** Missing = open. */
  status?: EventStatus;
}

/** Predicate for the Alerts tray filter. */
export function matchesAlertGroup(
  e: Pick<AlertLike, 'category' | 'type'>,
  group: AlertGroupId,
): boolean {
  return alertGroupOf(e.category, e.type) === group;
}

export interface AlertGroupRow {
  id: AlertGroupId;
  critical: number;
  warn: number;
  info: number;
  total: number;
}

const ORDER = new Map(ALERT_GROUP_IDS.map((id, i) => [id, i]));

/**
 * Open alerts per group, sorted by critical, then warn, then info (desc), then table order.
 * Pass the role-filtered open set (`useOpenAlerts()`); CLOSED events are skipped defensively.
 * Empty groups are left out unless `includeEmpty` (then all nine rows, same sort).
 */
export function selectAlertGroups(
  events: Iterable<AlertLike>,
  opts: { includeEmpty?: boolean } = {},
): AlertGroupRow[] {
  const rows = new Map<AlertGroupId, AlertGroupRow>(
    ALERT_GROUP_IDS.map((id) => [id, { id, critical: 0, warn: 0, info: 0, total: 0 }]),
  );
  for (const e of events) {
    if (e.status === 'CLOSED') continue;
    const row = rows.get(alertGroupOf(e.category, e.type));
    if (!row) continue;
    row[e.sev] += 1;
    row.total += 1;
  }
  return [...rows.values()]
    .filter((r) => opts.includeEmpty === true || r.total > 0)
    .sort(
      (a, b) =>
        b.critical - a.critical ||
        b.warn - a.warn ||
        b.info - a.info ||
        (ORDER.get(a.id) ?? 0) - (ORDER.get(b.id) ?? 0),
    );
}

export interface AttentionCounts {
  /** Headline "Needs attention": open warn + critical. Info never inflates it. */
  needsAttention: number;
  critical: number;
  warn: number;
  info: number;
}

/** From kpi.openAlerts (the totals source). null before the first SiteState. */
export function selectAttention(kpi: SiteKpi | null | undefined): AttentionCounts | null {
  if (!kpi) return null;
  const { critical, warn, info } = kpi.openAlerts;
  return { needsAttention: critical + warn, critical, warn, info };
}

// ---------------------------------------------------------------------------------------------------------------
// Truck timeline for one visit (bay inspector)
// ---------------------------------------------------------------------------------------------------------------

export type TimelineSegmentId = 'preOp' | 'work' | 'postOp';

export interface TimelineSegment {
  id: TimelineSegmentId;
  /** Minutes (fractional). Format with fmt.durHM (rounds) or floor first for an elapsed counter. */
  min: number;
  /** True for the running segment: it ends at `nowMs` ("so far"). */
  inProgress: boolean;
}

export type WorkKind = 'loading' | 'unloading';

export interface VisitTimeline {
  /** Segments that have started, in order. Empty before docking. */
  segments: TimelineSegment[];
  /** Sum of the segments = departedAt (or now) - dockedAt. null before docking. */
  occupancyMin: number | null;
  /** True while the truck is still at the door (occupancy is "so far"). */
  occupancyInProgress: boolean;
  /** dockedAt - arrivedAt; null before docking. */
  waitForDockMin: number | null;
  /** Label of the work segment: belt OUT loading, IN unloading; NONE falls back to phase, then counts. */
  work: WorkKind;
  /** Shares of the segments for the stacked bar (null when occupancy is 0 or unknown). */
  shares: PhaseShares | null;
}

const parseTs = (ts: string | null): number | null => {
  if (ts === null) return null;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : null;
};

export function workKindOf(
  visit: Pick<BayVisit, 'phase' | 'casesIn' | 'casesOut'>,
  direction: BeltDirection,
): WorkKind {
  if (direction === 'OUT') return 'loading';
  if (direction === 'IN') return 'unloading';
  if (visit.phase === 'UNLOADING') return 'unloading';
  if (visit.phase === 'LOADING') return 'loading';
  return visit.casesIn > visit.casesOut ? 'unloading' : 'loading';
}

/**
 * Pre-op / work / post-op for one visit at `nowMs` (pass the shared 1 Hz `useNow1Hz()`).
 * Boundaries: dockedAt, startedAt, finishedAt, departedAt. A segment exists once its start is known; it ends at the
 * next known boundary, else at `nowMs` (in progress). A missing middle boundary folds that span into the previous
 * segment, so occupancy = departedAt - dockedAt always holds. Negative spans (clock skew) are 0.
 */
export function visitTimeline(
  visit: BayVisit,
  nowMs: number,
  direction: BeltDirection = 'NONE',
): VisitTimeline {
  const arrived = parseTs(visit.arrivedAt);
  const docked = parseTs(visit.dockedAt);
  const work = workKindOf(visit, direction);
  if (docked === null) {
    return {
      segments: [],
      occupancyMin: null,
      occupancyInProgress: false,
      waitForDockMin: null,
      work,
      shares: null,
    };
  }
  const bounds: { id: TimelineSegmentId | 'end'; t: number | null }[] = [
    { id: 'preOp', t: docked },
    { id: 'work', t: parseTs(visit.startedAt) },
    { id: 'postOp', t: parseTs(visit.finishedAt) },
    { id: 'end', t: parseTs(visit.departedAt) },
  ];
  const segments: TimelineSegment[] = [];
  for (let i = 0; i < 3; i++) {
    const b = bounds[i];
    if (!b || b.t === null || b.id === 'end') continue;
    let end: number | null = null;
    for (let j = i + 1; j < bounds.length; j++) {
      const t = bounds[j]?.t ?? null;
      if (t !== null) {
        end = t;
        break;
      }
    }
    const inProgress = end === null;
    segments.push({
      id: b.id,
      min: Math.max(0, (end ?? nowMs) - b.t) / MIN_MS,
      inProgress,
    });
  }
  const occupancyMin = segments.reduce((s, x) => s + x.min, 0);
  const span = (id: TimelineSegmentId) => segments.find((s) => s.id === id)?.min ?? 0;
  return {
    segments,
    occupancyMin,
    occupancyInProgress: segments.some((s) => s.inProgress),
    waitForDockMin: arrived === null ? null : Math.max(0, docked - arrived) / MIN_MS,
    work,
    shares: phaseShares(span('preOp'), span('work'), span('postOp')),
  };
}
