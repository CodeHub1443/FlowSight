import {
  BayPerformanceSchema,
  ThroughputResponseSchema,
  type BayPerformance,
  type ThroughputResponse,
} from '@/domain';
import { formatInTimeZone } from 'date-fns-tz';
import { SITE_TZ } from '@/lib/time';
import { apiGet } from './client';

// One function per REST endpoint of docs/03 section 4.2 that the UI uses. Times go out as ISO-8601 with +06:00.

/** Epoch ms -> "2026-10-24T06:00:00+06:00". */
export const isoDhaka = (ms: number): string =>
  formatInTimeZone(new Date(ms), SITE_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");

export type RangeParams = { site: string; from: number; to: number };

/** GET /analytics/bay-performance (contract rev 1.2, docs/03 section 4.4). */
export function getBayPerformance(p: RangeParams, signal?: AbortSignal): Promise<BayPerformance> {
  return apiGet(
    '/analytics/bay-performance',
    { site: p.site, from: isoDhaka(p.from), to: isoDhaka(p.to) },
    BayPerformanceSchema,
    signal,
  );
}

/** GET /analytics/throughput: one series per bay x direction. */
export function getThroughput(
  p: RangeParams & { bucket?: 'hour' | 'day'; bay?: string; dir?: 'OUT' | 'IN' },
  signal?: AbortSignal,
): Promise<ThroughputResponse> {
  return apiGet(
    '/analytics/throughput',
    {
      site: p.site,
      from: isoDhaka(p.from),
      to: isoDhaka(p.to),
      bucket: p.bucket ?? 'hour',
      bay: p.bay,
      dir: p.dir,
    },
    ThroughputResponseSchema,
    signal,
  );
}
