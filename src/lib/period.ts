import type { ShiftWindow } from '../domain/types';
import { businessDayOf, businessDayStart, shiftOf } from './time';

// Analytics periods (docs/tasks/t20-spec.md section 4): `shift` = the current shift, `day` = today's business day,
// `week` = the last 7 business days including today. All Asia/Dhaka, from the site's business-day start and shifts.

export const PERF_RANGES = ['shift', 'day', 'week'] as const;
export type PerfRange = (typeof PERF_RANGES)[number];
export const DEFAULT_PERF_RANGE: PerfRange = 'day';
/** URL search parameter that carries the range. */
export const RANGE_PARAM = 'range';
/** Refetch interval for ranges that are still filling up; `week` is not refetched. */
export const PERF_REFETCH_MS = 60_000;

export type SiteCalendar = { businessDayStart: string; shifts: readonly ShiftWindow[] };

/**
 * A period: nominal bounds [start, end) and `to` = the end of the data so far (min(end, now)).
 * `start`, `end` and `to` are epoch ms.
 */
export type PeriodWindow = { range: PerfRange; start: number; end: number; to: number };

export function parseRange(raw: string | null | undefined): PerfRange {
  return PERF_RANGES.find((r) => r === raw) ?? DEFAULT_PERF_RANGE;
}

const DAY_MS = 86_400_000;

/** The period that contains `now`. A shift range in a gap between configured shifts falls back to the day. */
export function periodWindow(range: PerfRange, now: number, site: SiteCalendar): PeriodWindow {
  const today = businessDayOf(now, site.businessDayStart);
  let start: number;
  let end: number;
  if (range === 'shift') {
    const inst = shiftOf(now, site.shifts, site.businessDayStart);
    if (inst) {
      start = inst.start.getTime();
      end = inst.end.getTime();
    } else {
      return periodWindow('day', now, site);
    }
  } else if (range === 'day') {
    start = businessDayStart(today, site.businessDayStart).getTime();
    end = businessDayStart(today, site.businessDayStart, 1).getTime();
  } else {
    start = businessDayStart(today, site.businessDayStart, -6).getTime();
    end = businessDayStart(today, site.businessDayStart, 1).getTime();
  }
  return { range, start, end, to: Math.max(start, Math.min(end, now)) };
}

/** The period of the same length immediately before (complete: `to` = `end`). */
export function previousWindow(w: PeriodWindow): PeriodWindow {
  const len = w.end - w.start;
  return { range: w.range, start: w.start - len, end: w.start, to: w.start };
}

/** Milliseconds since the period start: aligns a point of this period with the same moment of the previous one. */
export const offsetInPeriod = (w: PeriodWindow, t: number): number => t - w.start;

export const periodLengthMs = (w: PeriodWindow): number => w.end - w.start;

/** Number of business days a period spans (1 for shift and day, 7 for week). */
export const periodDays = (w: PeriodWindow): number =>
  Math.max(1, Math.round((w.end - w.start) / DAY_MS));

export function refetchIntervalOf(range: PerfRange): number | false {
  return range === 'week' ? false : PERF_REFETCH_MS;
}
