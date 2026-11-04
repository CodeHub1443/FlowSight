import { useEffect } from 'react';
import { preloadChart } from '../chart/load';
import { PerfIndexSection } from './index/index';
import { PerfTrendSection } from './trend/index';
import type { PerfRange } from '@/lib/period';

/**
 * The Performance tab: 20B's trend section (W4, W5) first, answering "are we ahead or behind", then 20A's comparison
 * section (W1 to W3), answering "which bay and why". Both sections read the same useBayPerformance(range) query.
 */
export function PerformanceTab({ range }: { range: PerfRange }) {
  // the widgets' charts need ECharts: fetch its chunk in parallel with their data
  useEffect(preloadChart, []);
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="perf-tab">
      <PerfTrendSection range={range} />
      <PerfIndexSection range={range} />
    </div>
  );
}
