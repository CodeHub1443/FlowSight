import type { Series } from '@/domain';
import { offsetInPeriod, periodLengthMs, type PerfRange, type PeriodWindow } from '../selectors';

// Pure selectors for W4 (cartons through the period, this period vs the previous one) and W5 (trucks over the expected
// time). No React, no ECharts: the widgets only draw what these return.

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Granularity of the W4 points: hourly for a shift and a day, per-day totals for the week. */
export type TrendUnit = 'hour' | 'day';

export const trendUnitOf = (range: PerfRange): TrendUnit => (range === 'week' ? 'day' : 'hour');
const unitMs = (unit: TrendUnit): number => (unit === 'day' ? DAY_MS : HOUR_MS);

/** The bay of a throughput series key (`B01.OUT` -> `B01`). */
export const bayOfSeriesKey = (key: string): string => key.split('.')[0] ?? key;

/**
 * Cartons per hour of the period, indexed by whole hours since `window.start`: the sum of every series (both
 * directions) of the chosen bay, or of all bays without `bay`. Points outside the period and null values are ignored.
 */
export function hourlyTotals(
  series: readonly Series[],
  window: PeriodWindow,
  bay?: string | null,
): Map<number, number> {
  const totals = new Map<number, number>();
  const length = periodLengthMs(window);
  for (const s of series) {
    if (bay && bayOfSeriesKey(s.key) !== bay) continue;
    for (const p of s.points) {
      if (p.v === null || !Number.isFinite(p.v)) continue;
      const t = Date.parse(p.t);
      if (Number.isNaN(t)) continue;
      const offset = offsetInPeriod(window, t);
      if (offset < 0 || offset >= length) continue;
      const hour = Math.floor(offset / HOUR_MS);
      totals.set(hour, (totals.get(hour) ?? 0) + p.v);
    }
  }
  return totals;
}

/**
 * Hours of the period whose every point is null (no recorded data, as the simulator answers before its history starts).
 * An hour with no point at all is not unknown: it counts as 0 where `hourlyTotals` has nothing for it.
 */
export function unknownHours(
  series: readonly Series[],
  window: PeriodWindow,
  bay?: string | null,
): Set<number> {
  const seen = new Set<number>();
  const known = new Set<number>();
  const length = periodLengthMs(window);
  for (const s of series) {
    if (bay && bayOfSeriesKey(s.key) !== bay) continue;
    for (const p of s.points) {
      const t = Date.parse(p.t);
      if (Number.isNaN(t)) continue;
      const offset = offsetInPeriod(window, t);
      if (offset < 0 || offset >= length) continue;
      const hour = Math.floor(offset / HOUR_MS);
      seen.add(hour);
      if (p.v !== null && Number.isFinite(p.v)) known.add(hour);
    }
  }
  return new Set([...seen].filter((h) => !known.has(h)));
}

/** Sum the hourly totals into slots of `unit` (identity for hours; per business day for the week). */
function slotTotals(hourly: ReadonlyMap<number, number>, unit: TrendUnit, slots: number): number[] {
  const perSlot = unitMs(unit) / HOUR_MS;
  const out = new Array<number>(slots).fill(0);
  for (const [hour, v] of hourly) {
    const slot = Math.floor(hour / perSlot);
    if (slot >= 0 && slot < slots) out[slot] = (out[slot] ?? 0) + v;
  }
  return out;
}

export type Trend = {
  unit: TrendUnit;
  /** Start of every slot in the current period (epoch ms): the x axis of both lines. */
  slotStarts: number[];
  /** This period per slot; `null` for slots that have not started yet (the line stops at "now"). */
  current: (number | null)[];
  /** The previous period per slot, aligned by offset into the period; `null` where it has no recorded data (a gap). */
  previous: (number | null)[];
  /** Slots that have started (a slot in progress counts). 0 when the period has not begun. */
  elapsedSlots: number;
  /** Index of the slot still in progress (drawn hollow, joined by a dashed segment); null when every started slot is complete. */
  partialIndex: number | null;
  /** The moment the partial slot is counted until (epoch ms); null without a partial slot. */
  partialUntil: number | null;
  /** Cartons of this period so far. */
  currentTotal: number;
  /**
   * Cartons of the previous period up to the same point in time (the hour in progress pro-rated); null when any of its
   * buckets up to that point has no recorded data.
   */
  previousToDate: number | null;
  /** True when every previous-period bucket up to the same point in time has recorded data. */
  previousKnown: boolean;
  /** The whole previous period (buckets without data count as nothing). */
  previousFull: number;
  /**
   * (current - previous at the same point) / previous at the same point, in percent. Null unless the previous period is
   * known up to that point and its total there is above 0: the caption then says there is no previous-period data yet.
   */
  deltaPct: number | null;
};

/**
 * Align the previous period with the current one by offset and cut the current line at "now" (`current.to`).
 * `current` and `previous` are the two throughput responses with their windows; `bay` filters both.
 */
export function buildTrend(args: {
  range: PerfRange;
  current: { window: PeriodWindow; series: readonly Series[] };
  previous: { window: PeriodWindow; series: readonly Series[] };
  bay?: string | null;
}): Trend {
  const { range, current, previous, bay } = args;
  const unit = trendUnitOf(range);
  const step = unitMs(unit);
  const length = periodLengthMs(current.window);
  const slots = Math.max(0, Math.ceil(length / step));
  const elapsed = Math.min(length, Math.max(0, offsetInPeriod(current.window, current.window.to)));
  const elapsedSlots = Math.min(slots, Math.ceil(elapsed / step));

  const curHourly = hourlyTotals(current.series, current.window, bay);
  const prevHourly = hourlyTotals(previous.series, previous.window, bay);
  const prevUnknown = unknownHours(previous.series, previous.window, bay);
  const cur = slotTotals(curHourly, unit, slots);
  const prevTotals = slotTotals(prevHourly, unit, slots);
  const perSlot = step / HOUR_MS;
  const prev = prevTotals.map((v, i) => {
    for (let h = i * perSlot; h < (i + 1) * perSlot; h++) if (prevUnknown.has(h)) return null;
    return v;
  });

  const currentLine = cur.map((v, i) => (i < elapsedSlots ? v : null));
  const currentTotal = cur.reduce((a, v, i) => (i < elapsedSlots ? a + v : a), 0);
  const previousFull = prev.reduce<number>((a, v) => a + (v ?? 0), 0);
  const partial = elapsedSlots > 0 && elapsed < Math.min(length, elapsedSlots * step);

  // the previous period "at the same point in time", from the hourly buckets so the week is not rounded to whole days
  let sumToDate = 0;
  for (const [hour, v] of prevHourly) {
    const hourStart = hour * HOUR_MS;
    if (hourStart >= elapsed) continue;
    sumToDate += v * Math.min(1, (elapsed - hourStart) / HOUR_MS);
  }
  const previousKnown = ![...prevUnknown].some((h) => h * HOUR_MS < elapsed);
  const previousToDate = previousKnown ? sumToDate : null;

  return {
    unit,
    slotStarts: Array.from({ length: slots }, (_, i) => current.window.start + i * step),
    current: currentLine,
    previous: prev,
    elapsedSlots,
    partialIndex: partial ? elapsedSlots - 1 : null,
    partialUntil: partial ? current.window.to : null,
    currentTotal,
    previousToDate,
    previousKnown,
    previousFull,
    deltaPct:
      previousToDate !== null && previousToDate > 0
        ? ((currentTotal - previousToDate) / previousToDate) * 100
        : null,
  };
}

export type TrendJudgement = 'empty' | 'insufficient' | 'ready';

/** Nothing has started yet -> insufficient; no cartons in either period -> empty. */
export function judgeTrend(t: Trend): TrendJudgement {
  if (t.elapsedSlots === 0) return 'insufficient';
  if (t.currentTotal === 0 && t.previousFull === 0) return 'empty';
  return 'ready';
}

export type DetentionCell = {
  bay: string;
  visits: number;
  detentions: number;
  /** Share of the bay's visits over the expected time, percent; null when the bay has no visits. */
  sharePct: number | null;
};

/** One cell per row, in the order the rows come (bay order). Never sorted. */
export function detentionCells(
  rows: readonly { bay: string; visits: number; detentions: number }[],
): DetentionCell[] {
  return rows.map((r) => ({
    bay: r.bay,
    visits: r.visits,
    detentions: r.detentions,
    sharePct: r.visits > 0 ? (r.detentions / r.visits) * 100 : null,
  }));
}
