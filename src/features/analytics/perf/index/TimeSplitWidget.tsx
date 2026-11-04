import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BayPerformance } from '@/domain';
import { bayLabel, useFmt } from '@/features/live';
import { Chart, type ChartTable } from '../../chart/Chart';
import { useChartTokens } from '../../chart/theme';
import { widgetStatus } from '../selectors';
import { WidgetBody, WidgetCard } from '../shared';
import { inBayOrder, judgeTimeSplit } from './rows';
import { timeSplitOption, workLabel } from './timeSplitOption';
import type { PerfQuery } from './types';

// W2: where the time goes (docs/tasks/t20-spec.md sections 2 and 4). Per bay, in bay order: the mean pre-operation
// delay, loading or unloading and post-operation delay as one stacked horizontal bar (tones from segmentTone.ts),
// the mean bay occupancy at the end of the bar and a dashed line at the site median occupancy. Not volume-normalised.

const CHART_HEIGHT = 300;

export function TimeSplitWidget({ query }: { query: PerfQuery }) {
  const { t } = useTranslation('perfindex');
  const status = widgetStatus(query, (d) => judgeTimeSplit(d.response));
  const perf = query.data?.response;
  return (
    <WidgetCard title={t('w2.title')} testId="perf-w2">
      <WidgetBody
        status={status}
        onRetry={() => void query.refetch()}
        insufficientText={t('w2.insufficient')}
        skeletonHeight={CHART_HEIGHT}
      >
        {perf && <TimeSplitChart perf={perf} />}
      </WidgetBody>
    </WidgetCard>
  );
}

function TimeSplitChart({ perf }: { perf: BayPerformance }) {
  const { t } = useTranslation('perfindex');
  const fmt = useFmt();
  const tokens = useChartTokens();
  const rows = useMemo(() => inBayOrder(perf.rows), [perf.rows]);
  const median = perf.site.medianOccupancyMin;

  const option = useMemo(
    () => timeSplitOption({ rows, median, fmt, tokens, t }),
    [rows, median, fmt, tokens, t],
  );
  const table = useMemo<ChartTable>(
    () => ({
      caption: t('w2.caption'),
      columns: [t('bay'), t('w2.preOp'), t('w2.work'), t('w2.postOp'), t('w2.occupancy')],
      rows: rows.map((r) => [
        bayLabel(r.bay, fmt.lang),
        fmt.durHM(r.mean.preOpMin),
        r.mean.activeMin === null ? null : `${workLabel(t, r)}: ${fmt.durHM(r.mean.activeMin)}`,
        fmt.durHM(r.mean.postOpMin),
        fmt.durHM(r.mean.occupancyMin),
      ]),
    }),
    [rows, fmt, t],
  );

  return (
    <Chart
      option={option}
      ariaLabel={t('w2.aria', { median: fmt.durHM(median) })}
      table={table}
      height={CHART_HEIGHT}
      testId="w2-chart"
    />
  );
}
