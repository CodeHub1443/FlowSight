import type { BayPerformance, BayPerfRow } from '@/domain';
import { INDEX_BAND, INDEX_CENTER } from '../constants';
import { noComparableBays, noFinishedTrucks } from '../selectors';

// Pure helpers for W1 to W3 (task 20A). Bays are always listed in bay order, never sorted by a value
// (docs/tasks/t20-spec.md section 0).

/** The rows in bay order (B01, B02, ... B07): by id with numeric collation. */
export function inBayOrder(rows: readonly BayPerfRow[]): BayPerfRow[] {
  return [...rows].sort((a, b) =>
    a.bay.localeCompare(b.bay, 'en', { numeric: true, sensitivity: 'base' }),
  );
}

/** W1 insufficient state: the highest `included` of any bay (spec section 4). */
export function maxIncluded(perf: BayPerformance): number {
  return perf.rows.reduce((m, r) => Math.max(m, r.included), 0);
}

export type WorkDirection = 'loading' | 'unloading' | 'work';

/** The label of a bay's work phase: loading when it mostly sent cartons out, unloading when it mostly took them in. */
export function workDirection(row: Pick<BayPerfRow, 'cartonsOut' | 'cartonsIn'>): WorkDirection {
  if (row.cartonsOut > row.cartonsIn) return 'loading';
  if (row.cartonsIn > row.cartonsOut) return 'unloading';
  return 'work';
}

// ---- W1 scale ---------------------------------------------------------------------------------------------------

/** The scale never shows less than twice the comparable band on each side of the centre. */
const MIN_HALF_SPAN_BANDS = 2;

/** Half the width of W1's scale in index points: covers every shown index, at least twice the 90..110 band. */
export function indexHalfSpan(indices: readonly (number | null)[]): number {
  const band = Math.max(INDEX_CENTER - INDEX_BAND.low, INDEX_BAND.high - INDEX_CENTER);
  let span = band * MIN_HALF_SPAN_BANDS;
  for (const v of indices) {
    if (v !== null && Number.isFinite(v)) span = Math.max(span, Math.abs(v - INDEX_CENTER));
  }
  return span;
}

/** Position of an index on W1's scale, in percent of the track width (the centre, 100, at 50 %). Clamped. */
export function indexPos(value: number, halfSpan: number): number {
  const pct = 50 + ((value - INDEX_CENTER) / halfSpan) * 50;
  return Math.min(100, Math.max(0, pct));
}

// ---- W2 axis ----------------------------------------------------------------------------------------------------

const NICE_STEPS = [1, 2, 2.5, 5, 10] as const;

/** The smallest "nice" number (1, 2, 2.5, 5 x 10^k) at or above `v`; 0 for non-positive input. */
export function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const s of NICE_STEPS) if (s * mag >= v) return s * mag;
  return 10 * mag;
}

/** Sum of a bay's mean phases (pre-op + work + post-op), or null when none is known. */
export function phaseTotal(row: BayPerfRow): number | null {
  const parts = [row.mean.preOpMin, row.mean.activeMin, row.mean.postOpMin];
  if (parts.every((p) => p === null)) return null;
  return parts.reduce<number>((s, p) => s + (p ?? 0), 0);
}

// ---- states -----------------------------------------------------------------------------------------------------

export type Judgement = 'empty' | 'insufficient' | 'ready';

/** W1: empty without finished trucks, insufficient when no bay has an index. */
export const judgeIndex = (perf: BayPerformance): Judgement =>
  noFinishedTrucks(perf) ? 'empty' : noComparableBays(perf) ? 'insufficient' : 'ready';

/** W2: empty without finished trucks, insufficient when no bay has a known phase or occupancy. */
export const judgeTimeSplit = (perf: BayPerformance): Judgement =>
  noFinishedTrucks(perf)
    ? 'empty'
    : perf.rows.every((r) => phaseTotal(r) === null && r.mean.occupancyMin === null)
      ? 'insufficient'
      : 'ready';

/** W3: empty without finished trucks, insufficient when no bay has a known loading rate. */
export const judgeWorkload = (perf: BayPerformance): Judgement =>
  noFinishedTrucks(perf)
    ? 'empty'
    : perf.rows.every((r) => r.cartonsPerLoadingHour === null)
      ? 'insufficient'
      : 'ready';
