import { useTranslation } from 'react-i18next';
import { useBayPerformance } from '@/data/api';
import type { PerfRange } from '@/lib/period';
import { useRange } from '../../useRange';
import { BayIndexWidget } from './BayIndexWidget';
import { TimeSplitWidget } from './TimeSplitWidget';
import { WorkloadWidget } from './WorkloadWidget';

// Task 20A: the bay comparison section of the Performance tab (docs/tasks/t20-spec.md section 4): W1 bay efficiency
// vs comparable trucks, W2 where the time goes, W3 workload context. One bay-performance query feeds all three.

export function PerfIndexSection({ range }: { range: PerfRange }) {
  const { t } = useTranslation('perfindex');
  const query = useBayPerformance(range);
  const [, setRange] = useRange();
  return (
    <section
      data-testid="perf-index-section"
      data-range={range}
      aria-label={t('title')}
      className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2"
    >
      <BayIndexWidget query={query} range={range} onShowWeek={() => setRange('week')} />
      <TimeSplitWidget query={query} />
      <WorkloadWidget query={query} className="xl:col-span-2" />
    </section>
  );
}
