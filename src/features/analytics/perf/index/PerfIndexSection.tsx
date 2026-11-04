import { useTranslation } from 'react-i18next';
import type { PerfRange } from '@/lib/period';
import { Skeleton, WidgetCard } from '../shared';

// STUB (task 20.0). Owned by task 20A: W1 bay efficiency index, W2 where the time goes, W3 workload context.
// Data: useBayPerformance(range) from '@/data/api'. Strings: the `perfindex` namespace.

export function PerfIndexSection({ range }: { range: PerfRange }) {
  const { t } = useTranslation('perfindex');
  return (
    <section data-testid="perf-index-section" data-range={range} aria-label={t('title')}>
      <WidgetCard title={t('title')}>
        <Skeleton style={{ height: 220 }} />
      </WidgetCard>
    </section>
  );
}
