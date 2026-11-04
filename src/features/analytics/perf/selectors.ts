import type { BayPerformance, PerfConfidence } from '@/domain';
import { INDEX_BAND, type IndexBand } from './constants';

// Pure selectors shared by the Performance widgets (20A, 20B). Period helpers live in src/lib/period.ts and are
// re-exported here so widgets have one import.
export {
  DEFAULT_PERF_RANGE,
  offsetInPeriod,
  parseRange,
  PERF_RANGES,
  periodDays,
  periodLengthMs,
  periodWindow,
  previousWindow,
  RANGE_PARAM,
  refetchIntervalOf,
  type PerfRange,
  type PeriodWindow,
} from '@/lib/period';

/** Band of an index: under 90 slower, 90 to 110 comparable (inclusive), over 110 faster; null without an index. */
export function indexBand(index: number | null | undefined): IndexBand | null {
  if (index === null || index === undefined || !Number.isFinite(index)) return null;
  if (index < INDEX_BAND.low) return 'slower';
  if (index > INDEX_BAND.high) return 'faster';
  return 'comparable';
}

export type ConfidenceNote = {
  level: PerfConfidence;
  /** Show the index muted (LOW). */
  muted: boolean;
  /** An index exists to show (OK or LOW). */
  showIndex: boolean;
  /** `analytics` namespace key of the note, or null when none is needed (OK). */
  key: 'confidence.few' | 'confidence.none' | null;
  /** Interpolation values (format them before passing to t()). */
  params: { n: number; min: number };
};

/** The note under a bay's index: nothing for OK, "few trucks (n of min)" muted for LOW, "not enough" for NONE. */
export function confidenceNote(
  confidence: PerfConfidence,
  included: number,
  minIncluded: number,
): ConfidenceNote {
  const params = { n: included, min: minIncluded };
  switch (confidence) {
    case 'OK':
      return { level: 'OK', muted: false, showIndex: true, key: null, params };
    case 'LOW':
      return { level: 'LOW', muted: true, showIndex: true, key: 'confidence.few', params };
    case 'NONE':
      return { level: 'NONE', muted: false, showIndex: false, key: 'confidence.none', params };
  }
}

/** ECharts markLine for a site median (vertical on a horizontal bar chart: axis 'x'). */
export type MedianLine = {
  silent: true;
  symbol: 'none';
  animation: false;
  lineStyle: { type: 'dashed'; color: string; width: number };
  label: { show: boolean; formatter: string; position: 'end' | 'insideEndTop'; color: string };
  data: ({ xAxis: number } | { yAxis: number })[];
};

/** The site-median reference line for a chart, or null when there is no median. Colours from useChartTokens(). */
export function siteMedianLine(
  median: number | null | undefined,
  opts: { label: string; color: string; labelColor?: string; axis?: 'x' | 'y' },
): MedianLine | null {
  if (median === null || median === undefined || !Number.isFinite(median)) return null;
  const axis = opts.axis ?? 'x';
  return {
    silent: true,
    symbol: 'none',
    animation: false,
    lineStyle: { type: 'dashed', color: opts.color, width: 1 },
    label: {
      show: opts.label !== '',
      formatter: opts.label,
      position: axis === 'x' ? 'end' : 'insideEndTop',
      color: opts.labelColor ?? opts.color,
    },
    data: [axis === 'x' ? { xAxis: median } : { yAxis: median }],
  };
}

/** Axis maximum that keeps both the data and the median line in view. */
export function axisMaxWith(
  values: readonly (number | null)[],
  median: number | null | undefined,
): number {
  let max = 0;
  for (const v of values) if (v !== null && Number.isFinite(v) && v > max) max = v;
  if (median !== null && median !== undefined && Number.isFinite(median) && median > max)
    max = median;
  return max;
}

export type WidgetStatus = 'loading' | 'error' | 'empty' | 'insufficient' | 'ready';

/**
 * A widget's state from its query and its data. Data already on screen stays on screen when a refetch fails
 * (no flicker); the error state is for a widget that has nothing to show.
 */
export function widgetStatus<T>(
  query: { data: T | undefined; isError: boolean },
  judge: (data: T) => 'empty' | 'insufficient' | 'ready',
): WidgetStatus {
  if (query.data !== undefined) return judge(query.data);
  return query.isError ? 'error' : 'loading';
}

/** No finished visit anywhere in the range. */
export const noFinishedTrucks = (p: BayPerformance): boolean => p.site.visits === 0;

/** No bay has an index (every row NONE). */
export const noComparableBays = (p: BayPerformance): boolean =>
  p.rows.every((r) => r.confidence === 'NONE');
