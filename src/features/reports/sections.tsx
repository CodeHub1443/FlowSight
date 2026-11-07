import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { StatusPill } from '@/components/common';
import type { Report, WhEventWithStatus } from '@/domain';
import { eventPath } from '@/features/events/urlState';
import { formatLang, formatPlate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EvidenceThumb } from './EvidenceThumb';
import { useEventTitle, useReportFmt } from './reportFmt';
import {
  shortId,
  type BayRowView,
  type CaptainRow,
  type Handover,
  type SkuSummary,
  type TruckLogRow,
} from './selectors';
import { SEV_TONE, STATUS_TONE } from './tones';

// The sections of the report document (spec section 5, items 3 to 8). Each is a plain presentational component over a
// view model from selectors.ts. Section headings are h2; tables are real tables so a screen reader gets headers.

export function Section({
  id,
  title,
  flow = false,
  children,
}: {
  id: string;
  title: string;
  /** The section may split across printed pages (long tables); rows still stay whole. */
  flow?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={`report-${id}`}
      aria-labelledby={`report-${id}-h`}
      className={cn('rp-section', flow && 'rp-section--flow')}
    >
      <h2 id={`report-${id}-h`} className="text-ink-900 text-[15px] leading-6 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const TH = 'text-ink-600 rp-muted px-2 py-1.5 text-start text-[12px] leading-4 font-medium';
const TD = 'px-2 py-1.5 align-top text-[13px] leading-5';
const NUM = 'text-end tabular-nums';

function Empty({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <p data-testid={testId} className="text-ink-600 rp-muted text-[13px]">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Handover
// ---------------------------------------------------------------------------------------------------------------

export function HandoverSection({ handover, report }: { handover: Handover; report: Report }) {
  const { t } = useTranslation('reports');
  const fmt = useReportFmt();
  const title = useEventTitle();
  const reportTo = Date.parse(report.to);
  // When the report's topEvents subset doesn't carry every open alert, each chip's count is only what's listed,
  // not the group's true total; say so rather than presenting a partial count as if it were complete.
  const partial = handover.listed < handover.total;
  return (
    <Section id="handover" title={t('handover.title')}>
      {handover.groups.length === 0 ? (
        <Empty testId="report-handover-none">{t('handover.none')}</Empty>
      ) : (
        <>
          <ul
            aria-label={t('handover.groupsLabel')}
            data-testid="report-handover-groups"
            className="flex flex-wrap gap-2"
          >
            {handover.groups.map((g) => (
              <li
                key={g.id}
                data-group={g.id}
                className="bg-muted border-hairline flex items-center gap-2 rounded-[10px] border px-3 py-1.5 text-[13px]"
              >
                <span className="text-ink-900">{t(`groups.${g.id}`)}</span>
                <span className="text-ink-900 font-semibold tabular-nums">
                  {fmt.num(g.total)}
                  {partial && <span className="font-normal"> {t('handover.listedSuffix')}</span>}
                </span>
                <span className="text-ink-600 rp-muted text-[12px]">
                  {[
                    g.critical > 0 ? `${fmt.num(g.critical)} ${t('sev.critical')}` : null,
                    g.warn > 0 ? `${fmt.num(g.warn)} ${t('sev.warn')}` : null,
                    g.info > 0 ? `${fmt.num(g.info)} ${t('sev.info')}` : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </li>
            ))}
          </ul>
          {handover.listed < handover.total && (
            <p data-testid="report-handover-partial" className="text-ink-600 rp-muted text-[12px]">
              {t('handover.partial', {
                shown: fmt.num(handover.listed),
                total: fmt.num(handover.total),
              })}
            </p>
          )}
          <h3 className="text-ink-900 mt-1 text-[13px] font-semibold">{t('handover.topTitle')}</h3>
          <table data-testid="report-handover-table" className="w-full">
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  {t('handover.col.severity')}
                </th>
                <th scope="col" className={TH}>
                  {t('handover.col.event')}
                </th>
                <th scope="col" className={TH}>
                  {t('handover.col.bay')}
                </th>
                <th scope="col" className={cn(TH, 'text-end')}>
                  {t('handover.col.age')}
                </th>
                <th scope="col" className={TH}>
                  {t('handover.col.status')}
                </th>
                <th scope="col" className={TH}>
                  {t('handover.col.id')}
                </th>
              </tr>
            </thead>
            <tbody>
              {handover.top.map((e) => (
                <tr
                  key={e.id}
                  data-testid="report-handover-row"
                  className="border-hairline border-t"
                >
                  <td className={TD}>
                    <StatusPill tone={SEV_TONE[e.sev]}>{t(`sev.${e.sev}`)}</StatusPill>
                  </td>
                  <td className={cn(TD, 'text-ink-900')}>{title(e)}</td>
                  <td className={TD}>{e.bay ?? fmt.dash}</td>
                  <td className={cn(TD, NUM)}>
                    {fmt.dur(Math.max(0, (reportTo - Date.parse(e.ts)) / 1000))}
                  </td>
                  <td className={TD}>
                    <StatusPill tone={STATUS_TONE[e.status]}>{t(`status.${e.status}`)}</StatusPill>
                  </td>
                  <td className={cn(TD, 'font-mono text-[12px]')}>
                    <Link
                      to={eventPath(e.id)}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {shortId(e.id)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Bays
// ---------------------------------------------------------------------------------------------------------------

export function BaysSection({ rows, totals }: { rows: BayRowView[]; totals: BayRowView }) {
  const { t } = useTranslation('reports');
  const fmt = useReportFmt();
  const cells = (r: BayRowView): ReactNode => (
    <>
      <td className={cn(TD, NUM)}>{fmt.num(r.casesOut)}</td>
      <td className={cn(TD, NUM)}>{fmt.num(r.casesIn)}</td>
      <td className={cn(TD, NUM)}>{fmt.num(r.trucks)}</td>
      <td className={cn(TD, NUM)} data-col="occupancy">
        {r.avgOccupancyMin === null ? fmt.dash : fmt.durHM(r.avgOccupancyMin)}
      </td>
      <td className={cn(TD, NUM)} data-col="belt">
        {r.beltLoadedShare === null ? fmt.dash : fmt.pct(r.beltLoadedShare * 100)}
      </td>
      <td className={cn(TD, NUM)}>{fmt.num(r.detentions)}</td>
      <td className={cn(TD, NUM)}>{fmt.num(r.productIssues)}</td>
      <td className={cn(TD, NUM)}>{fmt.num(r.ppe)}</td>
    </>
  );
  return (
    <Section id="bays" title={t('bays.title')}>
      <div className="overflow-x-auto">
        <table data-testid="report-bays-table" className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th scope="col" className={TH}>
                {t('bays.col.bay')}
              </th>
              {(
                [
                  'casesOut',
                  'casesIn',
                  'trucks',
                  'occupancy',
                  'beltShare',
                  'detentions',
                  'productIssues',
                  'ppe',
                ] as const
              ).map((c) => (
                <th key={c} scope="col" className={cn(TH, 'text-end')}>
                  {t(`bays.col.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.bay}
                data-testid="report-bay-row"
                data-bay={r.bay}
                className="border-hairline border-t"
              >
                <th scope="row" className={cn(TD, 'text-ink-900 text-start font-medium')}>
                  {r.bay}
                </th>
                {cells(r)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr
              data-total=""
              data-testid="report-bays-total"
              className="border-hairline border-t-2 font-semibold"
            >
              <th scope="row" className={cn(TD, 'text-ink-900 text-start')}>
                {t('bays.total')}
              </th>
              {cells(totals)}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-ink-600 rp-muted text-[12px]">
        {t('bays.trucksNote')} {t('bays.beltShareNote')} {t('bays.issuesNote')}
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Truck log
// ---------------------------------------------------------------------------------------------------------------

export function TruckLogSection({ rows }: { rows: TruckLogRow[] }) {
  const { t } = useTranslation('reports');
  const fmt = useReportFmt();
  return (
    <Section id="trucks" title={t('trucks.title')} flow>
      {rows.length === 0 ? (
        <Empty testId="report-trucks-empty">{t('trucks.empty')}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="report-trucks-table" className="w-full min-w-[720px]">
            <thead>
              <tr>
                {(
                  [
                    'plate',
                    'agency',
                    'bay',
                    'dir',
                    'arrival',
                    'wait',
                    'occupancy',
                    'cartons',
                    'detention',
                  ] as const
                ).map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className={cn(
                      TH,
                      (c === 'wait' || c === 'occupancy' || c === 'cartons') && 'text-end',
                    )}
                  >
                    {t(`trucks.col.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const plate = formatPlate(r.plate);
                return (
                  <tr
                    key={r.visitId}
                    data-testid="report-truck-row"
                    className="border-hairline border-t"
                  >
                    <td className={TD}>
                      <span className="text-ink-900 block font-medium">{plate.primary}</span>
                      {plate.secondary && (
                        <span className="text-ink-600 rp-muted block text-[12px]">
                          {plate.secondary}
                        </span>
                      )}
                    </td>
                    <td className={TD}>{r.agency ? formatLang(r.agency, fmt.lang) : fmt.dash}</td>
                    <td className={TD}>{r.bay}</td>
                    <td className={TD}>{t(`trucks.dir.${r.dir}`)}</td>
                    <td className={cn(TD, 'tabular-nums')}>{fmt.clock(r.arrivedAt)}</td>
                    <td className={cn(TD, NUM)}>
                      {r.waitForDockMin === null ? fmt.dash : fmt.durHM(r.waitForDockMin)}
                    </td>
                    <td className={cn(TD, NUM)}>
                      {r.occupancyMin === null ? fmt.dash : fmt.durHM(r.occupancyMin)}
                    </td>
                    <td className={cn(TD, NUM)}>{fmt.num(r.cartons)}</td>
                    <td className={TD}>
                      {r.detention && <StatusPill tone="warn">{t('trucks.detention')}</StatusPill>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 6. Evidence
// ---------------------------------------------------------------------------------------------------------------

export function EvidenceSection({
  events,
  onSettled,
}: {
  events: WhEventWithStatus[];
  onSettled: (eventId: string) => void;
}) {
  const { t } = useTranslation('reports');
  const fmt = useReportFmt();
  const title = useEventTitle();
  return (
    <Section id="evidence" title={t('evidence.title')}>
      {events.length === 0 ? (
        <Empty testId="report-evidence-empty">{t('evidence.none')}</Empty>
      ) : (
        <ul
          data-testid="report-evidence-list"
          className="rp-evidence-grid grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
        >
          {events.map((e) =>
            e.media ? (
              <li key={e.id} data-testid="report-evidence-item" className="flex flex-col gap-1.5">
                <figure className="flex flex-col gap-1.5">
                  <EvidenceThumb
                    eventId={e.id}
                    media={e.media}
                    title={title(e)}
                    onSettled={onSettled}
                  />
                  <figcaption className="flex flex-col gap-1 text-[12px] leading-4">
                    <span className="text-ink-900 font-medium">{title(e)}</span>
                    <span className="text-ink-600 rp-muted">{e.bay ?? fmt.dash}</span>
                    <span className="flex flex-wrap gap-1">
                      <StatusPill tone={SEV_TONE[e.sev]}>{t(`sev.${e.sev}`)}</StatusPill>
                      <StatusPill tone={STATUS_TONE[e.status]}>
                        {t(`status.${e.status}`)}
                      </StatusPill>
                    </span>
                  </figcaption>
                </figure>
              </li>
            ) : null,
          )}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 7. SKU summary
// ---------------------------------------------------------------------------------------------------------------

export function SkuSection({ sku }: { sku: SkuSummary }) {
  const { t } = useTranslation('reports');
  const fmt = useReportFmt();
  return (
    <Section id="sku" title={t('sku.title')}>
      {sku.rows.length === 0 ? (
        <Empty testId="report-sku-empty">{t('sku.empty')}</Empty>
      ) : (
        <table data-testid="report-sku-table" className="w-full">
          <thead>
            <tr>
              <th scope="col" className={TH}>
                {t('sku.col.sku')}
              </th>
              <th scope="col" className={TH}>
                {t('sku.col.name')}
              </th>
              <th scope="col" className={TH}>
                {t('sku.col.pack')}
              </th>
              <th scope="col" className={cn(TH, 'text-end')}>
                {t('sku.col.count')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sku.rows.map((r) => (
              <tr key={r.sku} data-testid="report-sku-row" className="border-hairline border-t">
                <td className={cn(TD, 'font-mono text-[12px]')}>{r.sku}</td>
                <td className={TD}>{r.name ? formatLang(r.name, fmt.lang) : fmt.dash}</td>
                <td className={TD}>{t(`sku.pack.${r.pack}`)}</td>
                <td className={cn(TD, NUM)}>{fmt.num(r.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sku.unknownSharePct !== null && (
        <p
          data-testid="report-sku-unknown"
          title={t('sku.unknownHint')}
          className="text-ink-600 rp-muted text-[12px]"
        >
          {t('sku.unknownShare', { pct: fmt.pct(sku.unknownSharePct, false, 1) })}.{' '}
          {t('sku.unknownHint')}
        </p>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 8. Captains (names: roles that may see them only; the caller omits the section otherwise)
// ---------------------------------------------------------------------------------------------------------------

export function CaptainsSection({ captains }: { captains: CaptainRow[] }) {
  const { t } = useTranslation('reports');
  const fmt = useReportFmt();
  return (
    <Section id="captains" title={t('captains.title')}>
      <table data-testid="report-captains-table" className="w-full">
        <thead>
          <tr>
            <th scope="col" className={TH}>
              {t('captains.col.captain')}
            </th>
            <th scope="col" className={TH}>
              {t('captains.col.bays')}
            </th>
          </tr>
        </thead>
        <tbody>
          {captains.map((c) => (
            <tr
              key={c.employeeId}
              data-testid="report-captain-row"
              className="border-hairline border-t"
            >
              <td className={cn(TD, 'text-ink-900')}>{formatLang(c.name, fmt.lang)}</td>
              <td className={TD}>{c.bays.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-ink-600 rp-muted text-[12px]">{t('captains.note')}</p>
    </Section>
  );
}
