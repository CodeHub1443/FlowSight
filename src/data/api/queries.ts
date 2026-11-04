import { QueryClient, useQuery } from '@tanstack/react-query';
import type { BayPerformance, SiteConfig, ThroughputResponse } from '@/domain';
import { DEFAULT_SITE } from '@/features/live/siteInfo';
import {
  periodWindow,
  previousWindow,
  refetchIntervalOf,
  type PerfRange,
  type PeriodWindow,
  type SiteCalendar,
} from '@/lib/period';
import { clockNow, liveStore } from '@/stores';
import { getBayPerformance, getThroughput } from './endpoints';

// React Query hooks over the REST endpoints (docs/02 section 3). Components use these, never fetch.

/** Client defaults: LAN, no refetch on focus (control-room screens keep focus elsewhere), one retry. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
    },
  });
}

export const analyticsKeys = {
  all: ['analytics'] as const,
  bayPerformance: (site: string, range: PerfRange) =>
    ['analytics', 'bay-performance', site, range] as const,
  throughput: (site: string, range: PerfRange, previous: boolean) =>
    ['analytics', 'throughput', site, range, previous ? 'previous' : 'current'] as const,
};

/**
 * "Now" of the data: the newest stream timestamp (correct under mock speed-up and replay), else the wall clock.
 * Read when a query runs, so a 60 s refetch also rolls the period over at a shift or day boundary.
 */
export function dataNow(): number {
  return liveStore.getState().lastTs ?? clockNow();
}

export const calendarOf = (site: SiteConfig): SiteCalendar => ({
  businessDayStart: site.businessDayStart,
  shifts: site.shiftsPlaceholder,
});

/** A response with the period it was asked for. */
export type Windowed<T> = { window: PeriodWindow; response: T };

/** GET /analytics/bay-performance for the range; refetched every 60 s for shift and day. */
export function useBayPerformance(range: PerfRange) {
  const site = DEFAULT_SITE;
  return useQuery({
    queryKey: analyticsKeys.bayPerformance(site.id, range),
    queryFn: async ({ signal }): Promise<Windowed<BayPerformance>> => {
      const window = periodWindow(range, dataNow(), calendarOf(site));
      const response = await getBayPerformance(
        { site: site.id, from: window.start, to: window.to },
        signal,
      );
      return { window, response };
    },
    refetchInterval: refetchIntervalOf(range),
  });
}

/**
 * GET /analytics/throughput (hourly buckets, every bay x direction) for the range, or with `previous` for the period of
 * the same length immediately before it (complete). Align the two with `offsetInPeriod`.
 */
export function useThroughput(range: PerfRange, previous: boolean) {
  const site = DEFAULT_SITE;
  return useQuery({
    queryKey: analyticsKeys.throughput(site.id, range, previous),
    queryFn: async ({ signal }): Promise<Windowed<ThroughputResponse>> => {
      const current = periodWindow(range, dataNow(), calendarOf(site));
      const window = previous ? previousWindow(current) : current;
      const response = await getThroughput(
        { site: site.id, from: window.start, to: window.to, bucket: 'hour' },
        signal,
      );
      return { window, response };
    },
    refetchInterval: refetchIntervalOf(range),
  });
}
