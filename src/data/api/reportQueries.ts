import { useQuery } from '@tanstack/react-query';
import type { Report, SiteConfig } from '@/domain';
import { DEFAULT_SITE } from '@/features/live/siteInfo';
import { PERF_REFETCH_MS } from '@/lib/period';
import { businessDayStart, shiftBounds } from '@/lib/time';
import { getReport, type ReportKind } from './endpoints';
import { dataNow } from './queries';

// React Query hook for the shift and daily reports (Task 22.0). Own module so the /live entry chunk does not carry it.

/** The period a report covers: the business day ("yyyy-MM-dd") and, for a shift report, the shift id. */
export type ReportPeriod = { date: string; shift?: string };

export const reportKeys = {
  all: ['reports'] as const,
  report: (site: string, kind: ReportKind, p: ReportPeriod) =>
    ['reports', site, kind, p.date, kind === 'shift' ? (p.shift ?? null) : null] as const,
};

/** End of the period in epoch ms, or null for a shift id the site does not have. */
export function reportPeriodEnd(
  kind: ReportKind,
  p: ReportPeriod,
  site: Pick<SiteConfig, 'businessDayStart' | 'shiftsPlaceholder'>,
): number | null {
  if (kind === 'daily') return businessDayStart(p.date, site.businessDayStart, 1).getTime();
  const b = p.shift
    ? shiftBounds(p.date, p.shift, site.shiftsPlaceholder, site.businessDayStart)
    : null;
  return b ? b.end.getTime() : null;
}

/** A period is in progress while stream time ("now" of the data) is before its end. */
export function isReportInProgress(
  kind: ReportKind,
  p: ReportPeriod,
  site: Pick<SiteConfig, 'businessDayStart' | 'shiftsPlaceholder'>,
  now: number,
): boolean {
  const end = reportPeriodEnd(kind, p, site);
  return end !== null && now < end;
}

/**
 * GET /reports/shift or /reports/daily. An in-progress period is refetched every 60 s (the check runs on every refetch tick,
 * so a period that completes stops refetching); a completed one is fetched once.
 */
export function useReport(kind: ReportKind, period: ReportPeriod) {
  const site = DEFAULT_SITE;
  return useQuery<Report>({
    queryKey: reportKeys.report(site.id, kind, period),
    queryFn: ({ signal }) => getReport(kind, { site: site.id, ...period }, signal),
    refetchInterval: () =>
      isReportInProgress(kind, period, site, dataNow()) ? PERF_REFETCH_MS : false,
    staleTime: () => (isReportInProgress(kind, period, site, dataNow()) ? 30_000 : Infinity),
  });
}
