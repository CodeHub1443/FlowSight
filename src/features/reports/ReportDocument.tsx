import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusPill } from '@/components/common';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ReportKind } from '@/data/api/endpoints';
import type { Report } from '@/domain';
import { DEFAULT_SITE } from '@/features/live/siteInfo';
import { formatLang } from '@/lib/format';
import type { ReportModel } from './model';
import { ReportDevelopedBy, ReportClientLogo, ReportProductName } from './reportBrand';
import { useReportFmt, type ReportFmt } from './reportFmt';
import { selectDeltas, selectHeadlines, type Deltas, type Headlines } from './selectors';
import {
  BaysSection,
  CaptainsSection,
  EvidenceSection,
  HandoverSection,
  Section,
  SkuSection,
  TruckLogSection,
} from './sections';
import type { PeriodBounds } from './period';
import './reports-print.css';

/** How long the print button waits for thumbnails before it gives up and treats the rest as failed. */
export const THUMB_WAIT_MS = 15_000;

/** Deltas against the previous period: only for a completed period, and only once that report has arrived. */
export type DeltaInput =
  | { state: 'none' }
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'ready'; previous: Report };

export interface ReportDocumentProps {
  report: Report;
  kind: ReportKind;
  /** Nominal [start, end) of the period for the header line; the report's own `to` is "now" while it runs. */
  bounds: PeriodBounds | null;
  /** Derived view models (built once by the page, which also feeds the CSV exports). */
  model: ReportModel;
  inProgress: boolean;
  /** Wall time the figures were fetched (stream time in mock mode). */
  generatedAt: number;
  deltaInput: DeltaInput;
  /** Called with false while snapshots are still loading, true once all have loaded or failed (or the wait ran out). */
  onPrintReady: (ready: boolean) => void;
}

// ---------------------------------------------------------------------------------------------------------------

function DeltaLine({ text, vs, testId }: { text: string | null; vs: string; testId: string }) {
  if (text === null) return null;
  return (
    <span data-testid={testId} className="text-ink-600 rp-muted text-[12px] leading-4">
      <span className="text-ink-900 font-medium tabular-nums">{text}</span> {vs}
    </span>
  );
}

function Tile({
  id,
  label,
  value,
  detail,
  delta,
  vs,
  title,
}: {
  id: string;
  label: string;
  value: string;
  detail?: string;
  delta: string | null;
  vs: string;
  /** Why the value is unknown (shown as a tooltip on a dash). */
  title?: string;
}) {
  return (
    <div
      data-testid={`report-headline-${id}`}
      className="bg-muted border-hairline flex min-w-0 flex-col gap-0.5 rounded-[10px] border px-3 py-2"
    >
      <span className="text-ink-600 rp-muted text-[12px] leading-4">{label}</span>
      <span
        className="text-ink-900 text-[22px] leading-7 font-semibold tabular-nums"
        title={title}
        data-testid={`report-headline-${id}-value`}
      >
        {value}
      </span>
      {detail && <span className="text-ink-600 rp-muted text-[12px] leading-4">{detail}</span>}
      <DeltaLine text={delta} vs={vs} testId={`report-headline-${id}-delta`} />
    </div>
  );
}

/** Delta text per headline; `null` = show nothing (no comparison for this report). */
function deltaTexts(
  input: DeltaInput,
  cur: Headlines,
  fmt: ReportFmt,
  unit: { min: string; pts: string },
): Record<
  'casesOut' | 'casesIn' | 'trucks' | 'occupancy' | 'depotTat' | 'ppe' | 'open',
  string | null
> {
  const none = {
    casesOut: null,
    casesIn: null,
    trucks: null,
    occupancy: null,
    depotTat: null,
    ppe: null,
    open: null,
  };
  if (input.state !== 'ready') return none;
  const d: Deltas = selectDeltas(cur, selectHeadlines(input.previous));
  const pct = (v: number | null) => (v === null ? fmt.dash : fmt.pct(v, true, 0));
  const min = (v: number | null) => (v === null ? fmt.dash : `${fmt.sInt(v)} ${unit.min}`);
  return {
    casesOut: pct(d.casesOutPct),
    casesIn: pct(d.casesInPct),
    trucks: fmt.sInt(d.trucks),
    occupancy: min(d.occupancyMin),
    depotTat: min(d.depotTatMin),
    ppe:
      d.ppePts === null ? fmt.dash : `${fmt.signed(Math.round(d.ppePts * 10) / 10, 1)} ${unit.pts}`,
    open: fmt.sInt(d.openAlerts),
  };
}

// ---------------------------------------------------------------------------------------------------------------

export function ReportDocument({
  report,
  kind,
  bounds,
  model,
  inProgress,
  generatedAt,
  deltaInput,
  onPrintReady,
}: ReportDocumentProps) {
  const { t } = useTranslation('reports');
  const fmt = useReportFmt();
  const { headlines: h } = model;

  // Print waits for every evidence thumbnail to load or fail.
  const evidenceIds = useMemo(() => model.evidence.map((e) => e.id), [model.evidence]);
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set());
  const [timedOutKey, setTimedOutKey] = useState<string | null>(null);
  const onSettled = useCallback((id: string) => {
    setSettled((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);
  const evidenceKey = evidenceIds.join('|');
  useEffect(() => {
    if (evidenceKey === '') return;
    const timer = setTimeout(() => setTimedOutKey(evidenceKey), THUMB_WAIT_MS);
    return () => clearTimeout(timer);
  }, [evidenceKey]);
  const ready = timedOutKey === evidenceKey || evidenceIds.every((id) => settled.has(id));
  useEffect(() => {
    onPrintReady(ready);
  }, [ready, onPrintReady]);

  const vs = t(`headlines.vs.${kind}`);
  const delta = deltaTexts(deltaInput, h, fmt, { min: t('units.min'), pts: t('units.pts') });
  const noOccupancyReason = t('headlines.reason.noFinishedTrucks');

  const periodLine =
    kind === 'shift'
      ? t('doc.periodShift', {
          shift: report.shiftId ?? '',
          date: fmt.day(report.businessDay),
          from: fmt.clock(bounds?.start ?? report.from),
          to: fmt.clock(bounds?.end ?? report.to),
        })
      : t('doc.periodDaily', {
          date: fmt.day(report.businessDay),
          from: fmt.clock(bounds?.start ?? report.from),
          to: fmt.clock(bounds?.end ?? report.to),
        });
  const generated = t('doc.generated', { time: fmt.stamp(generatedAt) });

  return (
    <article
      data-testid="report-document"
      data-kind={kind}
      data-state={inProgress ? 'in-progress' : 'complete'}
      aria-label={t(`doc.title.${kind}`)}
      className="rp-sheet bg-card border-card-border shadow-raised mx-auto w-full max-w-[1100px] rounded-[12px] border p-6"
    >
      <div className="rp-frame">
        <div className="rp-frame-body">
          <div className="rp-frame-row">
            <div className="rp-frame-cell">
              <div className="rp-stack">
                {/* 1. Header */}
                <header
                  data-testid="report-header"
                  className="border-hairline flex flex-wrap items-start justify-between gap-4 border-b pb-3"
                >
                  <div className="flex items-center gap-3">
                    <ReportClientLogo />
                    <div className="flex flex-col">
                      <ReportProductName />
                      <span
                        data-testid="report-depot"
                        className="text-ink-600 rp-muted text-[13px]"
                      >
                        {formatLang(DEFAULT_SITE.name, fmt.lang)}
                      </span>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col items-end gap-1 text-end">
                    <h1 className="text-ink-900 text-xl leading-7 font-semibold">
                      {t(`doc.title.${kind}`)}
                    </h1>
                    <p data-testid="report-period" className="text-ink-900 text-[14px]">
                      {periodLine}
                    </p>
                    <p className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
                      <span data-testid="report-status">
                        <StatusPill tone={inProgress ? 'info' : 'ok'}>
                          {inProgress ? t('doc.status.inProgress') : t('doc.status.complete')}
                        </StatusPill>
                      </span>
                      <span data-testid="report-generated" className="text-ink-600 rp-muted">
                        {generated}
                      </span>
                      {import.meta.env.VITE_DATA_MODE === 'mock' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              tabIndex={0}
                              data-testid="report-simulated"
                              className="rounded-full"
                            >
                              <StatusPill tone="neutral">{t('doc.simulated')}</StatusPill>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{t('doc.simulatedHint')}</TooltipContent>
                        </Tooltip>
                      )}
                    </p>
                  </div>
                </header>

                {/* 2. Headlines */}
                <Section id="headlines" title={t('headlines.title')}>
                  {inProgress && (
                    <p
                      data-testid="report-figures-so-far"
                      className="text-ink-600 rp-muted text-[12px]"
                    >
                      {t('doc.figuresSoFar')}
                    </p>
                  )}
                  <div
                    data-testid="report-headline-grid"
                    className="rp-headlines grid grid-cols-2 gap-3 md:grid-cols-3"
                  >
                    <Tile
                      id="casesOut"
                      label={t('headlines.casesOut')}
                      value={fmt.num(h.casesOut)}
                      delta={delta.casesOut}
                      vs={vs}
                    />
                    <Tile
                      id="casesIn"
                      label={t('headlines.casesIn')}
                      value={fmt.num(h.casesIn)}
                      delta={delta.casesIn}
                      vs={vs}
                    />
                    <Tile
                      id="trucks"
                      label={t('headlines.trucks')}
                      value={fmt.num(h.trucksCompleted)}
                      delta={delta.trucks}
                      vs={vs}
                    />
                    {h.occupancy.available && (
                      <Tile
                        id="occupancy"
                        label={t('headlines.occupancy')}
                        value={h.occupancy.min === null ? fmt.dash : fmt.durHM(h.occupancy.min)}
                        title={h.occupancy.min === null ? noOccupancyReason : undefined}
                        delta={delta.occupancy}
                        vs={vs}
                      />
                    )}
                    <Tile
                      id="depotTat"
                      label={t('headlines.depotTat')}
                      value={h.depotTatMin === null ? fmt.dash : fmt.durHM(h.depotTatMin)}
                      title={h.depotTatMin === null ? noOccupancyReason : undefined}
                      delta={delta.depotTat}
                      vs={vs}
                    />
                    <Tile
                      id="ppe"
                      label={t('headlines.ppe')}
                      value={h.ppePct === null ? fmt.dash : fmt.pct(h.ppePct, false, 1)}
                      title={h.ppePct === null ? t('headlines.reason.noPpe') : undefined}
                      delta={delta.ppe}
                      vs={vs}
                    />
                    <Tile
                      id="openAlerts"
                      label={t('headlines.openAlerts')}
                      value={fmt.num(h.openAlerts.needsAttention)}
                      detail={t('headlines.openAlertsDetail', {
                        critical: fmt.num(h.openAlerts.critical),
                        warn: fmt.num(h.openAlerts.warn),
                      })}
                      delta={delta.open}
                      vs={vs}
                    />
                  </div>
                </Section>

                {/* 3. Handover */}
                <HandoverSection handover={model.handover} report={report} />
                {/* 4. Bays */}
                <BaysSection rows={model.bays} totals={model.bayTotals} />
                {/* 5. Truck log */}
                <TruckLogSection rows={model.truckLog} />
                {/* 6. Evidence */}
                <EvidenceSection events={model.evidence} onSettled={onSettled} />
                {/* 7. SKU summary */}
                <SkuSection sku={model.sku} />
                {/* 8. Captains by bay assignment (roles that may see names only) */}
                {model.captains.length > 0 && <CaptainsSection captains={model.captains} />}
              </div>
            </div>
          </div>
        </div>
        <div className="rp-frame-foot" aria-hidden>
          <div className="rp-frame-row">
            <div className="rp-frame-cell">
              <div className="rp-spacer" />
            </div>
          </div>
        </div>
      </div>

      {/* Printed footer, repeated on every page (fixed position; hidden on screen) */}
      <footer data-testid="report-footer" className="rp-footer">
        <ReportDevelopedBy />
        <span>{generated}</span>
      </footer>
    </article>
  );
}
