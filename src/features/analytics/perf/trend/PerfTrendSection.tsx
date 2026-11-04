import { useTranslation } from 'react-i18next';
import type { PerfRange } from '@/lib/period';
import { DetentionStrip } from './DetentionStrip';
import { ThroughputTrend } from './ThroughputTrend';

/** Task 20B: W4 cartons through the period against the previous one, W5 trucks over the expected time per bay. */
export function PerfTrendSection({ range }: { range: PerfRange }) {
  const { t } = useTranslation('perftrend');
  return (
    <section
      data-testid="perf-trend-section"
      data-range={range}
      aria-label={t('title')}
      className="flex min-w-0 flex-col gap-4"
    >
      <ThroughputTrend range={range} />
      <DetentionStrip range={range} />
    </section>
  );
}
