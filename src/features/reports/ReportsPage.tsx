import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/data/api/client';
import { getReport, type ReportKind } from '@/data/api/endpoints';
import { dataNow } from '@/data/api/queries';
import {
  isReportInProgress,
  reportKeys,
  useReport,
  type ReportPeriod,
} from '@/data/api/reportQueries';
import { DEFAULT_SITE } from '@/features/live/siteInfo';
import { canExportReports } from '@/lib/rbac';
import { shiftBounds } from '@/lib/time';
import { useSessionStore } from '@/stores';
import { baysCsv, downloadCsv, truckLogCsv } from './csv';
import { buildReportModel } from './model';
import {
  addDaysIso,
  chipOf,
  defaultPeriod,
  periodBounds,
  periodFromParams,
  periodToParams,
  previousPeriod,
  previousShiftOf,
  todayOf,
  type ReportChip,
} from './period';
import { ReportControls, type ShiftChoice } from './ReportControls';
import { ReportDocument, type DeltaInput } from './ReportDocument';
import { useReportFmt } from './reportFmt';
import { isEmptyReport } from './selectors';
import '@/i18n/reports';

const TICK_MS = 30_000;

function Notice({
  testId,
  title,
  hint,
  children,
}: {
  testId: string;
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="bg-card border-card-border text-ink-600 mx-auto flex min-h-[160px] w-full max-w-[1100px] flex-col items-center justify-center gap-2 rounded-[12px] border px-4 py-8 text-center text-sm print:hidden"
    >
      <p className="text-ink-900 font-medium">{title}</p>
      {hint && <p>{hint}</p>}
      {children}
    </div>
  );
}

/** /reports: shift and daily report as one A4 document on screen and in print (Task 22C). */
export function ReportsPage() {
  const { t } = useTranslation('reports');
  const fmt = useReportFmt();
  const role = useSessionStore((s) => s.role);
  const site = DEFAULT_SITE;
  const [params, setParams] = useSearchParams();

  // "now" is stream time. A light tick keeps the chips and the in-progress status right between refetches.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const now = dataNow();
  const minute = Math.floor(now / 60_000);

  const { kind, period } = useMemo(
    () => periodFromParams(params, now, site),
    // `now` only matters at minute resolution (it picks the default and the chip)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, minute, site],
  );
  const chip = chipOf(kind, period, now, site);
  const [picking, setPicking] = useState(false);

  const go = useCallback(
    (k: ReportKind, p: ReportPeriod) => {
      setParams(periodToParams(k, p, dataNow(), site), { replace: true });
    },
    [setParams, site],
  );

  const bounds = periodBounds(kind, period, site);
  const inProgress = isReportInProgress(kind, period, site, now);
  const report = useReport(kind, period);
  const reportData = report.data;

  // Deltas: a second request for the previous period, only once this one is complete.
  const prev = previousPeriod(kind, period, site);
  const prevReport = useQuery({
    queryKey: reportKeys.report(site.id, kind, prev ?? period),
    queryFn: ({ signal }) => getReport(kind, { site: site.id, ...(prev ?? period) }, signal),
    enabled: !inProgress && prev !== null && report.isSuccess,
    staleTime: Infinity,
  });
  let deltaInput: DeltaInput = { state: 'none' };
  if (!inProgress) {
    if (prev === null || prevReport.isError) deltaInput = { state: 'unavailable' };
    else if (prevReport.data) deltaInput = { state: 'ready', previous: prevReport.data };
    else deltaInput = { state: 'loading' };
  }

  const model = useMemo(
    () => (reportData ? buildReportModel(reportData, role) : null),
    [reportData, role],
  );
  const generatedAt = useMemo(
    () => dataNow(),
    // refreshed whenever the figures are
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report.dataUpdatedAt],
  );

  const [thumbsReady, setThumbsReady] = useState(false);
  const onPrintReady = useCallback((ready: boolean) => setThumbsReady(ready), []);

  // ---- controls ----
  const today = todayOf(now, site);
  const shifts: ShiftChoice[] = site.shiftsPlaceholder.map((s) => {
    const b = shiftBounds(period.date, s.id, site.shiftsPlaceholder, site.businessDayStart);
    return { id: s.id, start: s.start, end: s.end, future: b !== null && b.start.getTime() > now };
  });
  const startedShift = (date: string, wanted: string | undefined): string | undefined => {
    const ok = (id: string) => {
      const b = shiftBounds(date, id, site.shiftsPlaceholder, site.businessDayStart);
      return b !== null && b.start.getTime() <= now;
    };
    if (wanted && ok(wanted)) return wanted;
    return [...site.shiftsPlaceholder].reverse().find((s) => ok(s.id))?.id ?? wanted;
  };
  const previousShift = previousShiftOf(now, site);

  const onChip = (c: ReportChip) => {
    if (c === 'pick') {
      setPicking(true);
      return;
    }
    setPicking(false);
    if (c === 'current') go(kind, defaultPeriod(kind, now, site));
    else if (kind === 'daily') go(kind, { date: addDaysIso(today, -1) });
    else if (previousShift) go(kind, previousShift);
  };

  const csvName = (what: string) =>
    ['report', kind, period.date, kind === 'shift' ? period.shift : null, what]
      .filter(Boolean)
      .join('-') + '.csv';
  const onCsv = (which: 'bays' | 'trucks') => {
    if (!model || !canExportReports(role)) return;
    if (which === 'bays') {
      downloadCsv(
        csvName('bays'),
        baysCsv(model.bays, {
          bay: t('csv.bays.bay'),
          casesOut: t('csv.bays.casesOut'),
          casesIn: t('csv.bays.casesIn'),
          trucks: t('csv.bays.trucks'),
          avgOccupancyMin: t('csv.bays.avgOccupancyMin'),
          beltLoadedPct: t('csv.bays.beltLoadedPct'),
          detentions: t('csv.bays.detentions'),
          productIssues: t('csv.bays.productIssues'),
          ppe: t('csv.bays.ppe'),
        }),
      );
      return;
    }
    downloadCsv(
      csvName('truck-log'),
      truckLogCsv(
        model.truckLog,
        {
          visitId: t('csv.trucks.visitId'),
          plateBn: t('csv.trucks.plateBn'),
          plateEn: t('csv.trucks.plateEn'),
          agency: t('csv.trucks.agency'),
          bay: t('csv.trucks.bay'),
          dir: t('csv.trucks.dir'),
          arrival: t('csv.trucks.arrival'),
          docked: t('csv.trucks.docked'),
          departed: t('csv.trucks.departed'),
          waitMin: t('csv.trucks.waitMin'),
          occupancyMin: t('csv.trucks.occupancyMin'),
          casesOut: t('csv.trucks.casesOut'),
          casesIn: t('csv.trucks.casesIn'),
          detention: t('csv.trucks.detention'),
          yes: t('csv.yes'),
          no: t('csv.no'),
        },
        {
          agency: (r) =>
            r.agency
              ? fmt.lang === 'bn'
                ? r.agency.bn || r.agency.en
                : r.agency.en || r.agency.bn
              : '',
          dir: (r) => t(`trucks.dir.${r.dir}`),
        },
      ),
    );
  };

  // ---- body ----
  const unknownShift = kind === 'shift' && bounds === null;
  const notFound =
    report.error instanceof ApiRequestError &&
    report.error.kind === 'http' &&
    report.error.status === 404;
  let body: ReactNode;
  if (unknownShift || notFound) {
    body = (
      <Notice
        testId="report-not-available"
        title={t('state.notAvailable')}
        hint={t('state.notAvailableHint')}
      />
    );
  } else if (report.isPending) {
    body = (
      <div
        data-testid="report-loading"
        role="status"
        aria-label={t('state.loading')}
        className="bg-muted mx-auto h-[320px] w-full max-w-[1100px] animate-pulse rounded-[12px] motion-reduce:animate-none print:hidden"
      />
    );
  } else if (!reportData && report.isError) {
    body = (
      <Notice testId="report-error" title={t('state.error')}>
        <Button variant="outline" size="sm" onClick={() => void report.refetch()}>
          {t('state.retry')}
        </Button>
      </Notice>
    );
  } else if (reportData && model && isEmptyReport(reportData)) {
    body = <Notice testId="report-empty" title={t('state.empty')} />;
  } else if (reportData && model) {
    body = (
      <ReportDocument
        report={reportData}
        kind={kind}
        bounds={bounds}
        model={model}
        inProgress={inProgress}
        generatedAt={generatedAt}
        deltaInput={deltaInput}
        onPrintReady={onPrintReady}
      />
    );
  }
  const documentShown = reportData !== undefined && model !== null && !isEmptyReport(reportData);

  return (
    <div
      data-testid="reports-page"
      aria-label={t('page.title')}
      className="flex min-w-0 flex-col gap-4"
    >
      <ReportControls
        kind={kind}
        period={period}
        chip={chip}
        picking={picking}
        today={today}
        shifts={shifts}
        canExport={canExportReports(role)}
        printReady={documentShown && thumbsReady}
        hasPrevious={kind === 'daily' || previousShift !== null}
        onKind={(k) => {
          setPicking(false);
          go(k, defaultPeriod(k, now, site));
        }}
        onChip={onChip}
        onDate={(date) =>
          go(kind, kind === 'shift' ? { date, shift: startedShift(date, period.shift) } : { date })
        }
        onShift={(shift) => go(kind, { date: period.date, shift })}
        onPrint={() => window.print()}
        onCsv={onCsv}
      />
      {body}
    </div>
  );
}
