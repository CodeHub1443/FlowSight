import type { EChartsOption } from 'echarts';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useThroughput } from '@/data/api';
import { bayLabel } from '@/features/live/siteInfo';
import { useFmt } from '@/features/live/useFmt';
import type { PerfRange } from '@/lib/period';
import { Chart } from '../../chart/Chart';
import { useChartTokens } from '../../chart/theme';
import { widgetStatus } from '../selectors';
import { WidgetBody, WidgetCard } from '../shared';
import { CONFIGURED_BAY_IDS } from './bays';
import { formatDayLabel } from './dayLabel';
import { buildTrend, judgeTrend, type Trend } from './trendSelectors';

// W4: cartons per hour (per day for the week) through the period, this period against the previous one of the same
// length (docs/tasks/t20-spec.md sections 1 and 4). Hourly data comes from /analytics/throughput, called twice.

const ALL_BAYS = 'all';

export function ThroughputTrend({ range }: { range: PerfRange }) {
  const { t } = useTranslation('perftrend');
  const fmt = useFmt();
  const tokens = useChartTokens();
  const [bay, setBay] = useState<string>(ALL_BAYS);

  const currentQuery = useThroughput(range, false);
  const previousQuery = useThroughput(range, true);
  const cur = currentQuery.data;
  const prev = previousQuery.data;

  const trend: Trend | null = useMemo(
    () =>
      cur && prev
        ? buildTrend({
            range,
            current: { window: cur.window, series: cur.response.series },
            previous: { window: prev.window, series: prev.response.series },
            bay: bay === ALL_BAYS ? null : bay,
          })
        : null,
    [cur, prev, range, bay],
  );

  const status = widgetStatus(
    {
      data: trend ?? undefined,
      isError: currentQuery.isError || previousQuery.isError,
    },
    judgeTrend,
  );

  const unitKey = trend?.unit === 'day' ? 'day' : 'hour';
  const title = t(`throughput.title.${unitKey}`);
  const currentName = t(`throughput.series.current.${range}`);
  const previousName = t(`throughput.series.previous.${range}`);

  const view = (() => {
    if (!trend) return null;
    const labelOf = (ms: number): string =>
      unitKey === 'day' ? formatDayLabel(ms, fmt.lang, fmt.digits) : fmt.clock(ms);
    const labels = trend.slotStarts.map(labelOf);
    const option: EChartsOption = {
      grid: { left: 4, right: 16, top: 36, bottom: 4, containLabel: true },
      legend: { top: 0, left: 0, icon: 'roundRect', data: [currentName, previousName] },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: unitKey === 'day',
        axisLabel: { hideOverlap: true },
      },
      yAxis: { type: 'value', min: 0 },
      series: [
        {
          name: previousName,
          type: 'line',
          data: trend.previous,
          showSymbol: unitKey === 'day',
          symbolSize: 6,
          lineStyle: { type: 'dashed', width: 2, color: tokens.ink400 },
          itemStyle: { color: tokens.ink400 },
          z: 1,
        },
        {
          name: currentName,
          type: 'line',
          data: trend.current,
          connectNulls: false,
          showSymbol: unitKey === 'day',
          symbolSize: 7,
          lineStyle: { width: 3, color: tokens.uiBlue },
          itemStyle: { color: tokens.uiBlue },
          z: 2,
        },
      ],
    };
    const table = {
      caption: title,
      columns: [t(`throughput.table.${unitKey}`), currentName, previousName],
      rows: trend.slotStarts.map((ms, i) => [
        labelOf(ms),
        trend.current[i] === null ? null : fmt.num(trend.current[i] ?? 0),
        fmt.num(trend.previous[i] ?? 0),
      ]),
    };
    return { option, table };
  })();

  const select = (
    <select
      value={bay}
      onChange={(e) => setBay(e.target.value)}
      aria-label={t('throughput.bayFilter')}
      data-testid="trend-bay-filter"
      className="border-border bg-card text-ink-900 focus-visible:ring-ring/50 h-8 rounded-md border px-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
    >
      <option value={ALL_BAYS}>{t('throughput.allBays')}</option>
      {CONFIGURED_BAY_IDS.map((id) => (
        <option key={id} value={id}>
          {bayLabel(id, fmt.lang)}
        </option>
      ))}
    </select>
  );

  return (
    <WidgetCard title={title} action={select} testId="perf-w4">
      <WidgetBody
        status={status}
        skeletonHeight={260}
        insufficientText={t('throughput.insufficient')}
        onRetry={() => {
          void currentQuery.refetch();
          void previousQuery.refetch();
        }}
      >
        {trend && view && (
          <>
            <Chart
              option={view.option}
              ariaLabel={t('throughput.aria', {
                title,
                current: currentName,
                previous: previousName,
              })}
              table={view.table}
              height={260}
              testId="trend-chart"
            />
            <p
              data-testid="trend-caption"
              className="text-ink-600 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
            >
              <span data-testid="trend-total-current">
                {t('throughput.caption.current', {
                  label: currentName,
                  value: t('throughput.cartons', { n: fmt.num(trend.currentTotal) }),
                })}
              </span>
              <span data-testid="trend-total-previous">
                {t('throughput.caption.previous', {
                  label: previousName,
                  value: t('throughput.cartons', { n: fmt.num(trend.previousToDate) }),
                })}
              </span>
              {trend.deltaPct !== null && (
                <span data-testid="trend-delta" className="text-ink-900 font-medium">
                  {t('throughput.caption.delta', { pct: fmt.pct(trend.deltaPct, true) })}
                </span>
              )}
            </p>
          </>
        )}
      </WidgetBody>
    </WidgetCard>
  );
}
