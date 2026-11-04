import { useTranslation } from 'react-i18next';
import type { PerfRange } from '@/lib/period';
import { Skeleton, WidgetCard } from '../shared';

// STUB (task 20.0). Owned by task 20B: W4 throughput through the period vs the previous one, W5 detentions per bay.
// Data: useThroughput(range, previous) and useBayPerformance(range) from '@/data/api'. Strings: the `perftrend` namespace.

export function PerfTrendSection({ range }: { range: PerfRange }) {
  const { t } = useTranslation('perftrend');
  return (
    <section data-testid="perf-trend-section" data-range={range} aria-label={t('title')}>
      <WidgetCard title={t('title')}>
        <Skeleton style={{ height: 220 }} />
      </WidgetCard>
    </section>
  );
}
