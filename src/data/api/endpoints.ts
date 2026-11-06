import {
  BayPerformanceSchema,
  PageSchema,
  PresignSchema,
  ReportSchema,
  ThroughputResponseSchema,
  VisitDetailSchema,
  WhEventWithStatusSchema,
  type BayPerformance,
  type EventStatus,
  type Page,
  type Presign,
  type Report,
  type Severity,
  type ThroughputResponse,
  type VisitDetail,
  type WhEventWithStatus,
} from '@/domain';
import { formatInTimeZone } from 'date-fns-tz';
import { SITE_TZ } from '@/lib/time';
import { apiGet, apiPost } from './client';

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

// ---------------------------------------------------------------------------
// Events, visits, reports, media (Task 22.0)
// ---------------------------------------------------------------------------

export const EVENTS_PAGE_SIZE = 100;

export type EventsParams = {
  site: string;
  from?: number;
  to?: number;
  status?: readonly EventStatus[];
  sev?: readonly Severity[];
  category?: readonly string[];
  bay?: readonly string[];
  q?: string;
  cursor?: string;
  limit?: number;
};

const csvOf = (v: readonly string[] | undefined): string | undefined =>
  v && v.length > 0 ? v.join(',') : undefined;

/** GET /events: one page (cursor paging; `nextCursor` null = end). */
export function getEvents(p: EventsParams, signal?: AbortSignal): Promise<Page<WhEventWithStatus>> {
  return apiGet(
    '/events',
    {
      site: p.site,
      from: p.from === undefined ? undefined : isoDhaka(p.from),
      to: p.to === undefined ? undefined : isoDhaka(p.to),
      status: csvOf(p.status),
      sev: csvOf(p.sev),
      category: csvOf(p.category),
      bay: csvOf(p.bay),
      q: p.q || undefined,
      cursor: p.cursor,
      limit: p.limit ?? EVENTS_PAGE_SIZE,
    },
    PageSchema(WhEventWithStatusSchema),
    signal,
  );
}

const eventUrl = (id: string, action?: 'ack' | 'close' | 'note'): string =>
  `/events/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;

/** GET /events/{id}. */
export function getEvent(id: string, signal?: AbortSignal): Promise<WhEventWithStatus> {
  return apiGet(eventUrl(id), {}, WhEventWithStatusSchema, signal);
}

/** POST /events/{id}/ack. */
export function ackEvent(id: string): Promise<WhEventWithStatus> {
  return apiPost(eventUrl(id, 'ack'), {}, WhEventWithStatusSchema);
}

/** POST /events/{id}/close {note}. */
export function closeEvent(id: string, note: string): Promise<WhEventWithStatus> {
  return apiPost(eventUrl(id, 'close'), { note }, WhEventWithStatusSchema);
}

/** POST /events/{id}/note {text}. */
export function noteEvent(id: string, text: string): Promise<WhEventWithStatus> {
  return apiPost(eventUrl(id, 'note'), { text }, WhEventWithStatusSchema);
}

/** GET /visits/{visitId}: the visit and its events. */
export function getVisit(visitId: string, signal?: AbortSignal): Promise<VisitDetail> {
  return apiGet(`/visits/${encodeURIComponent(visitId)}`, {}, VisitDetailSchema, signal);
}

export type ReportKind = 'shift' | 'daily';
/** `date` is the business day (yyyy-MM-dd); `shift` (a shift id) only for the shift report. */
export type ReportParams = { site: string; date?: string; shift?: string };

/** GET /reports/shift or /reports/daily. */
export function getReport(
  kind: ReportKind,
  p: ReportParams,
  signal?: AbortSignal,
): Promise<Report> {
  return apiGet(
    `/reports/${kind}`,
    { site: p.site, date: p.date, shift: kind === 'shift' ? p.shift : undefined },
    ReportSchema,
    signal,
  );
}

/** GET /media/presign?key=: a short-lived URL for one evidence object. */
export function getMediaUrl(key: string, signal?: AbortSignal): Promise<Presign> {
  return apiGet('/media/presign', { key }, PresignSchema, signal);
}
