import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import type { Fmt } from '@/features/live/useFmt';
import type { ChartTokens } from '../../chart/theme';
import type { Trend } from './trendSelectors';

// The ECharts option of W4 (pure; colours from useChartTokens(), digits and labels from useFmt()).
//
// A period still in progress is partial (task 20.10 D1): its last started slot is a HOLLOW marker joined to the
// previous point by a DASHED segment, and its tooltip says "so far (until HH:mm)". Nothing is extrapolated.
// Unknown is not zero (D2): a null point is a gap, no line and no marker.

export type T = (key: string, opts?: Record<string, unknown>) => string;

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Name of the dashed "so far" series: kept out of the legend, never shown (the tooltip is built by hand). */
const PARTIAL_SUFFIX = '  ';

export function trendOption({
  trend,
  labels,
  currentName,
  previousName,
  fmt,
  tokens,
  t,
}: {
  trend: Trend;
  labels: readonly string[];
  currentName: string;
  previousName: string;
  fmt: Fmt;
  tokens: ChartTokens;
  t: T;
}): EChartsOption {
  const daily = trend.unit === 'day';
  const { partialIndex } = trend;
  const cartons = (v: number): string => t('throughput.cartons', { n: fmt.num(v) });

  // the finished slots as full buckets; the slot in progress belongs to the dashed series
  const solid = trend.current.map((v, i) =>
    partialIndex !== null && i >= partialIndex ? null : v,
  );
  const partialValue = partialIndex === null ? null : (trend.current[partialIndex] ?? null);

  const partialSeries =
    partialIndex !== null && partialValue !== null
      ? [
          {
            name: currentName + PARTIAL_SUFFIX,
            type: 'line' as const,
            // [slot before, slot in progress]: the dash joins the last full bucket to the hollow marker
            data: trend.current.map((v, i) => {
              if (i === partialIndex) {
                return {
                  value: v,
                  symbol: 'circle',
                  symbolSize: 9,
                  itemStyle: { color: tokens.card, borderColor: tokens.uiBlue, borderWidth: 2 },
                };
              }
              if (i === partialIndex - 1 && v !== null) return { value: v, symbol: 'none' };
              return null;
            }),
            connectNulls: false,
            showSymbol: true,
            lineStyle: { type: 'dashed' as const, width: 3, color: tokens.uiBlue },
            itemStyle: { color: tokens.uiBlue },
            z: 2,
          },
        ]
      : [];

  const row = (color: string, name: string, value: string): string =>
    `<div style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${color}"></span><span style="flex:1">${escapeHtml(name)}</span><b style="margin-inline-start:12px">${escapeHtml(value)}</b></div>`;

  const tooltipFormatter = (params: TooltipComponentFormatterCallbackParams): string => {
    const first = Array.isArray(params) ? params[0] : params;
    if (!first) return '';
    const i = first.dataIndex;
    const cur = trend.current[i] ?? null;
    const prev = trend.previous[i] ?? null;
    const currentText =
      cur === null
        ? '—'
        : i === partialIndex && trend.partialUntil !== null
          ? t('throughput.soFar', { value: cartons(cur), time: fmt.clock(trend.partialUntil) })
          : cartons(cur);
    return [
      `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(labels[i] ?? '')}</div>`,
      row(tokens.uiBlue, currentName, currentText),
      row(tokens.ink400, previousName, prev === null ? '—' : cartons(prev)),
    ].join('');
  };

  return {
    grid: { left: 4, right: 16, top: 36, bottom: 4, containLabel: true },
    // the previous period's entry shows the dash, like its line
    legend: {
      top: 0,
      left: 0,
      data: [{ name: currentName }, { name: previousName, lineStyle: { type: 'dashed' } }],
    },
    tooltip: { trigger: 'axis', formatter: tooltipFormatter },
    xAxis: {
      type: 'category',
      data: [...labels],
      boundaryGap: daily,
      axisLabel: { hideOverlap: true },
    },
    yAxis: { type: 'value', min: 0 },
    series: [
      {
        name: previousName,
        type: 'line',
        data: [...trend.previous],
        connectNulls: false,
        showSymbol: daily,
        symbolSize: 6,
        lineStyle: { type: 'dashed', width: 2, color: tokens.ink400 },
        itemStyle: { color: tokens.ink400 },
        z: 1,
      },
      {
        name: currentName,
        type: 'line',
        data: solid,
        connectNulls: false,
        showSymbol: daily,
        symbolSize: 7,
        lineStyle: { width: 3, color: tokens.uiBlue },
        itemStyle: { color: tokens.uiBlue },
        z: 2,
      },
      ...partialSeries,
    ],
  };
}
