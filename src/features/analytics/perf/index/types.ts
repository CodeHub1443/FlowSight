import type { Windowed } from '@/data/api';
import type { BayPerformance } from '@/domain';

/** The part of `useBayPerformance(range)` the widgets read. One query feeds W1, W2 and W3. */
export interface PerfQuery {
  data: Windowed<BayPerformance> | undefined;
  isError: boolean;
  refetch: () => unknown;
}
