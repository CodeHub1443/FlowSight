import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import type { BayPerfRow } from '@/domain';
import { bayLabel } from '@/features/live';
import { SEGMENT_TONE } from '@/features/live/kpiDetail/segmentTone';
import type { Fmt } from '@/features/live/useFmt';
import type { ChartTokens } from '../../chart/theme';
import { axisMaxWith, siteMedianLine } from '../selectors';
import { niceCeil, phaseTotal, workDirection } from './rows';

// The ECharts option of W2 (pure; colours from useChartTokens(), digits and labels from useFmt()).

const BAR_MAX_WIDTH = 18;
/** Room right of the longest bar for its occupancy label (px). */
const END_LABEL_ROOM = 64;

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
  const max = niceCeil(axisMaxWith(totals, median));
  const medianLine = siteMedianLine(median, {
    label: t('w2.medianLine', { label: t('analytics:siteMedian'), value: fmt.durHM(median) }),
    color: tokens.ink600,
    labelColor: tokens.ink600,
  });

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
      nameGap: 8,
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
        label: {
          show: true,
          position: 'right',
          color: tokens.ink900,
          fontWeight: 600,
          formatter: (p: { dataIndex: number }) =>
            fmt.durHM(rows[p.dataIndex]?.mean.occupancyMin ?? null),
        },
        data: rows.map(() => 0),
      },
    ],
  };
}
