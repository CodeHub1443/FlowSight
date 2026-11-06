import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import type { BayPerfRow } from '@/domain';
import { bayLabel } from '@/features/live';
import { SEGMENT_TONE } from '@/features/live/kpiDetail/segmentTone';
import type { Fmt } from '@/features/live/useFmt';
import type { ChartTokens } from '../../chart/theme';
import { axisMaxWith, siteMedianLine } from '../selectors';
import { phaseTotal, workDirection } from './rows';

// The ECharts option of W2 (pure; colours from useChartTokens(), digits and labels from useFmt()).

const BAR_MAX_WIDTH = 18;
/** Room right of the longest bar for its occupancy label (px). */
const END_LABEL_ROOM = 64;

/** The most the value axis may extend past the longest bar or the median line (fraction). */
export const AXIS_HEADROOM = 0.1;

/**
 * The value axis maximum: the smallest multiple of a round step (1, 2 or 5 x 10^k, the roundest first) that holds `v` with
 * at most `AXIS_HEADROOM` to spare. 0 when there is nothing to draw.
 */
export function headroomMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  const limit = v * (1 + AXIS_HEADROOM) + 1e-9;
  const top = Math.floor(Math.log10(v));
  for (let k = top; k >= top - 3; k--) {
    for (const m of [5, 2, 1]) {
      const step = m * 10 ** k;
      const max = Math.ceil(v / step - 1e-9) * step;
      if (max <= limit) return Number(max.toPrecision(12));
    }
  }
  return v;
}

export type T = (key: string, opts?: Record<string, unknown>) => string;

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** "Loading" / "Unloading" by the bay's dominant direction, "Loading / unloading" on a tie. */
export function workLabel(t: T, row: BayPerfRow): string {
  const dir = workDirection(row);
  return t(dir === 'work' ? 'w2.work' : `w2.${dir}`);
}

export function timeSplitOption({
  rows,
  median,
  fmt,
  tokens,
  t,
}: {
  rows: readonly BayPerfRow[];
  median: number | null;
  fmt: Fmt;
  tokens: ChartTokens;
  t: T;
}): EChartsOption {
  const categories = rows.map((r) => bayLabel(r.bay, fmt.lang));
  const totals = rows.map((r) => Math.max(phaseTotal(r) ?? 0, r.mean.occupancyMin ?? 0));
  const max = headroomMax(axisMaxWith(totals, median));
  const shared = siteMedianLine(median, {
    label: t('w2.medianLine', { label: t('analytics:siteMedian'), value: fmt.durHM(median) }),
    color: tokens.ink600,
    labelColor: tokens.ink600,
  });
  // the category axis is inverted (bay 1 on top), so the line's `end` is at the bottom, on the x-axis ticks; `start` puts
  // the label at the top, in the grid's top margin (20.9 seam fix)
  const medianLine = shared
    ? { ...shared, label: { ...shared.label, position: 'start' as const } }
    : null;

  // unknown phases draw as nothing (0) so the stack stays aligned; the tooltip and the table show "—"
  const phase = (
    id: 'preOp' | 'work' | 'postOp',
    name: string,
    value: (r: BayPerfRow) => number | null,
  ) => ({
    id,
    name,
    type: 'bar' as const,
    stack: 'occupancy',
    barMaxWidth: BAR_MAX_WIDTH,
    itemStyle: { color: tokens[SEGMENT_TONE[id]] },
    emphasis: { disabled: true },
    data: rows.map((r) => value(r) ?? 0),
  });

  const tooltipFormatter = (params: TooltipComponentFormatterCallbackParams): string => {
    const first = Array.isArray(params) ? params[0] : params;
    const row = first ? rows[first.dataIndex] : undefined;
    if (!row) return '';
    const line = (color: string, label: string, value: number | null) =>
      `<div style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${color}"></span><span style="flex:1">${escapeHtml(label)}</span><b style="margin-inline-start:12px">${escapeHtml(fmt.durHM(value))}</b></div>`;
    return [
      `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(bayLabel(row.bay, fmt.lang))}</div>`,
      line(tokens[SEGMENT_TONE.preOp], t('w2.preOp'), row.mean.preOpMin),
      line(tokens[SEGMENT_TONE.work], workLabel(t, row), row.mean.activeMin),
      line(tokens[SEGMENT_TONE.postOp], t('w2.postOp'), row.mean.postOpMin),
      `<div style="margin-top:4px;display:flex;gap:12px"><span style="flex:1">${escapeHtml(t('w2.occupancy'))}</span><b>${escapeHtml(fmt.durHM(row.mean.occupancyMin))}</b></div>`,
    ].join('');
  };

  return {
    grid: { left: 8, right: END_LABEL_ROOM, top: 28, bottom: 36, containLabel: true },
    legend: {
      bottom: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      data: [t('w2.preOp'), t('w2.work'), t('w2.postOp')],
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: tooltipFormatter,
    },
    xAxis: {
      type: 'value',
      max: max > 0 ? max : undefined,
      name: t('w2.axis'),
      // the unit sits at the end of the axis, level with the axis line (not below the tick labels)
      nameLocation: 'end',
      nameGap: 8,
      nameTextStyle: { align: 'left', verticalAlign: 'middle' },
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: categories,
      axisTick: { show: false },
      axisLabel: { color: tokens.ink900 },
    },
    series: [
      phase('preOp', t('w2.preOp'), (r) => r.mean.preOpMin),
      phase('work', t('w2.work'), (r) => r.mean.activeMin),
      {
        ...phase('postOp', t('w2.postOp'), (r) => r.mean.postOpMin),
        ...(medianLine ? { markLine: medianLine } : {}),
      },
      // zero-width cap of the stack: carries the occupancy label at the end of each bar
      {
        id: 'occupancy',
        name: t('w2.occupancy'),
        type: 'bar',
        stack: 'occupancy',
        barMaxWidth: BAR_MAX_WIDTH,
        silent: true,
        tooltip: { show: false },
        itemStyle: { color: 'transparent' },
        // above the median line, on the card colour, so the dashed line never runs through the value
        z: 3,
        label: {
          show: true,
          position: 'right',
          color: tokens.ink900,
          fontWeight: 600,
          backgroundColor: tokens.card,
          padding: [1, 3],
          formatter: (p: { dataIndex: number }) =>
            fmt.durHM(rows[p.dataIndex]?.mean.occupancyMin ?? null),
        },
        data: rows.map(() => 0),
      },
    ],
  };
}
