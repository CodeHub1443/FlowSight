import { useMemo, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import {
  MaybeValue,
  TONE_BAR,
  TONE_DOT,
  TONE_TEXT,
  TONE_TINT,
  type Tone,
} from '@/components/common';
import type { Severity } from '@/domain';
import { cn } from '@/lib/utils';
import { useBays, useOpenAlerts, useSiteKpi } from '@/stores';
import { bayLabel } from '../siteInfo';
import { SEV_TONE } from '../tones';
import { useFmt } from '../useFmt';
import { Delta } from './Delta';
import {
  selectAlertGroups,
  selectAttention,
  selectRates,
  selectTurnaround,
  selectWorstPpeBay,
  type AlertGroupRow,
} from './selectors';
import { SEGMENT_FILL_CLASS, SEGMENT_TONE, SEGMENT_TRACK_CLASS } from './segmentTone';
import { openAlertsTrayForGroup } from './trayFilter';

// Popover bodies for the KPI chips (Task 19 spec 5A). A separate chunk, loaded on first use (React.lazy in
// KpiChips). Every value comes from the stores through the 19.0 selectors; nothing here is computed from a sample.
// Values are plain text (no tween) and carry their raw store value in `data-value`, so a test can compare the two.

function Rows({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col">{children}</dl>;
}

/** Label left (with an optional hint and colour swatch), value and delta right. */
function Row({
  testId,
  label,
  hint,
  swatch,
  raw,
  value,
  delta,
  strong,
}: {
  testId: string;
  label: string;
  hint?: string;
  swatch?: Tone;
  /** The store value behind the displayed text (omitted when unknown). */
  raw?: number | null;
  value: ReactNode;
  delta?: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      className="border-hairline bn-leading flex min-h-8 items-center justify-between gap-3 border-b py-1 text-[13px] leading-5 last:border-b-0"
    >
      <dt className="text-ink-600 flex min-w-0 items-center gap-2">
        {swatch && (
          <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOT[swatch])} />
        )}
        <span className="min-w-0">
          <span className={cn('block', strong && 'text-ink-900 font-semibold')}>{label}</span>
          {hint && <span className="text-ink-400 block text-[12px] leading-4">{hint}</span>}
        </span>
      </dt>
      <dd className="flex shrink-0 items-center gap-2">
        <span
          data-testid={`${testId}-value`}
          data-value={raw ?? undefined}
          className={cn(
            'text-ink-900 text-right whitespace-nowrap tabular-nums',
            strong ? 'text-[16px] leading-6 font-bold' : 'font-semibold',
          )}
        >
          {value}
        </span>
        {delta}
      </dd>
    </div>
  );
}

/**
 * One cell of a two- or three-column block (19.9b, decision D1: compact popovers). Label on top (optional tone dot and
 * hint), value and delta below, optional extra lines. Same test ids as a Row: `<testId>` and `<testId>-value`.
 */
function StatCell({
  testId,
  label,
  hint,
  swatch,
  raw,
  value,
  delta,
  size = 'lg',
  children,
}: {
  testId: string;
  label: string;
  hint?: string;
  swatch?: Tone;
  raw?: number | null;
  value: ReactNode;
  delta?: ReactNode;
  size?: 'lg' | 'md';
  children?: ReactNode;
}) {
  return (
    <div data-testid={testId} className="bn-leading min-w-0">
      <dt className="text-ink-600 flex min-w-0 items-start gap-1.5 text-[12px] leading-4">
        {swatch && (
          <span aria-hidden className={cn('mt-1 size-2 shrink-0 rounded-full', TONE_DOT[swatch])} />
        )}
        <span className="min-w-0">
          <span className="block">{label}</span>
          {hint && <span className="text-ink-400 block">{hint}</span>}
        </span>
      </dt>
      <dd className="flex flex-wrap items-baseline gap-x-1.5">
        <span
          data-testid={`${testId}-value`}
          data-value={raw ?? undefined}
          className={cn(
            'text-ink-900 whitespace-nowrap tabular-nums',
            size === 'lg'
              ? 'text-[16px] leading-6 font-bold'
              : 'text-[14px] leading-5 font-semibold',
          )}
        >
          {value}
        </span>
        {delta}
      </dd>
      {children}
    </div>
  );
}

function Cells({ cols, children }: { cols: 2 | 3; children: ReactNode }) {
  return (
    <dl
      className={cn(
        'border-hairline grid gap-x-3 gap-y-2 border-b py-2 last:border-b-0',
        cols === 2 ? 'grid-cols-2' : 'grid-cols-3',
      )}
    >
      {children}
    </dl>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-ink-600 bn-leading pt-3 pb-0.5 text-[12px] leading-4 font-medium">
      {children}
    </h3>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-ink-400 bn-leading pt-2 text-[12px] leading-4">{children}</p>;
}

// ---------------------------------------------------------------------------------------------------------------

export function CartonsDetail() {
  const { t } = useTranslation('kpidetail');
  const { t: tl } = useTranslation('live');
  const fmt = useFmt();
  const kpi = useSiteKpi();
  const bays = useBays();
  const rates = useMemo(() => selectRates(bays), [bays]);
  const noData = tl('kpi.noData');
  const noDelta = tl('kpi.noDelta');
  const noRate = bays.length === 0 ? noData : t('cartons.noBelt');
  const pct = (v: number) => fmt.pctAbs1(v);
  // per direction: rate now, a measured "0/h" when belts run the other way only, "—" when no belt runs
  const rate = (testId: string, title: string, perHour: number | null) => (
    <dd data-testid={testId} title={title} className="text-ink-600 pt-0.5 text-[12px] leading-4">
      {t('cartons.rateTitle')}{' '}
      <span
        data-testid={`${testId}-value`}
        data-value={perHour ?? undefined}
        className="text-ink-900 font-semibold whitespace-nowrap tabular-nums"
      >
        <MaybeValue value={perHour} reason={noRate}>
          {t('cartons.perHour', { n: fmt.int(perHour ?? 0) })}
        </MaybeValue>
      </span>
    </dd>
  );
  return (
    <>
      <Cells cols={2}>
        <StatCell
          testId="kpidetail-cartons-out"
          label={t('cartons.out')}
          raw={kpi?.casesOut}
          value={
            <MaybeValue value={kpi?.casesOut} reason={noData}>
              {fmt.int(kpi?.casesOut ?? 0)}
            </MaybeValue>
          }
          delta={
            <Delta value={kpi?.casesOutDeltaPct} good="up" reason={noDelta}>
              {pct}
            </Delta>
          }
        >
          {rate('kpidetail-rate-out', t('cartons.outPerHour'), rates.outPerHour)}
        </StatCell>
        <StatCell
          testId="kpidetail-cartons-in"
          label={t('cartons.in')}
          raw={kpi?.casesIn}
          value={
            <MaybeValue value={kpi?.casesIn} reason={noData}>
              {fmt.int(kpi?.casesIn ?? 0)}
            </MaybeValue>
          }
          delta={
            <Delta value={kpi?.casesInDeltaPct} good="up" reason={noDelta}>
              {pct}
            </Delta>
          }
        >
          {rate('kpidetail-rate-in', t('cartons.inPerHour'), rates.inPerHour)}
        </StatCell>
      </Cells>
      <Note>{t('cartons.deltaNote')}</Note>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** Proportional pre-op / work / post-op bar. Hidden when the shares are unknown (spec section 0). */
function PhaseBar({ shares }: { shares: { preOp: number; work: number; postOp: number } | null }) {
  const { t } = useTranslation('kpidetail');
  const fmt = useFmt();
  if (!shares) return null;
  const pct = (v: number) => fmt.pctInt(v * 100);
  return (
    <div
      role="img"
      data-testid="kpidetail-turnaround-bar"
      aria-label={t('turnaround.bar', {
        preOp: pct(shares.preOp),
        work: pct(shares.work),
        postOp: pct(shares.postOp),
      })}
      className={cn(SEGMENT_TRACK_CLASS, 'my-2')}
    >
      {(['preOp', 'work', 'postOp'] as const).map((id) => (
        <span
          key={id}
          data-share={shares[id]}
          className={cn(SEGMENT_FILL_CLASS, TONE_BAR[SEGMENT_TONE[id]])}
          style={{ width: `${shares[id] * 100}%` }}
        />
      ))}
    </div>
  );
}

export function TurnaroundDetail() {
  const { t } = useTranslation('kpidetail');
  const { t: tl } = useTranslation('live');
  const fmt = useFmt();
  const kpi = useSiteKpi();
  const view = selectTurnaround(kpi);
  const noVisit = t('turnaround.noVisit');
  const noDelta = tl('kpi.noDelta');
  const minutes = (v: number) => tl('kpi.minutes', { n: fmt.num(Math.abs(v)) });
  const dur = (v: number | null, reason = noVisit) => (
    <MaybeValue value={v} reason={reason}>
      {fmt.durHM(v)}
    </MaybeValue>
  );

  if (view.kind === 'none') return <Note>{tl('kpi.noData')}</Note>;

  if (view.kind === 'legacy')
    return (
      <>
        <Rows>
          <Row
            testId="kpidetail-turnaround-depot"
            label={tl('kpi.tat')}
            hint={t('turnaround.depotHint')}
            raw={view.avgTatMin}
            value={dur(view.avgTatMin, tl('kpi.noTat'))}
            delta={
              <Delta value={view.avgTatDeltaMin} good="down" reason={noDelta}>
                {minutes}
              </Delta>
            }
            strong
          />
        </Rows>
        <Note>{t('turnaround.legacyNote')}</Note>
      </>
    );

  return (
    <>
      <Rows>
        <Row
          testId="kpidetail-turnaround-occupancy"
          label={t('turnaround.occupancy')}
          hint={t('turnaround.occupancyHint')}
          raw={view.occupancyMin}
          value={dur(view.occupancyMin)}
          strong
        />
      </Rows>
      <PhaseBar shares={view.shares} />
      <Cells cols={3}>
        <StatCell
          testId="kpidetail-turnaround-preop"
          label={t('turnaround.preOp')}
          swatch={SEGMENT_TONE.preOp}
          raw={view.preOpDelayMin}
          value={dur(view.preOpDelayMin)}
          size="md"
        />
        <StatCell
          testId="kpidetail-turnaround-work"
          label={t('turnaround.work')}
          swatch={SEGMENT_TONE.work}
          raw={view.activeMin}
          value={dur(view.activeMin)}
          size="md"
        />
        <StatCell
          testId="kpidetail-turnaround-postop"
          label={t('turnaround.postOp')}
          swatch={SEGMENT_TONE.postOp}
          raw={view.postOpDelayMin}
          value={dur(view.postOpDelayMin)}
          size="md"
        />
      </Cells>
      <Cells cols={2}>
        <StatCell
          testId="kpidetail-turnaround-depot"
          label={t('turnaround.depot')}
          hint={t('turnaround.depotHint')}
          raw={view.depotTatMin}
          value={dur(view.depotTatMin)}
          delta={
            <Delta value={view.depotTatDeltaMin} good="down" reason={noDelta}>
              {minutes}
            </Delta>
          }
          size="md"
        />
        {view.waitForDockMin !== null && (
          <StatCell
            testId="kpidetail-turnaround-waitdock"
            label={t('turnaround.waitForDock')}
            raw={view.waitForDockMin}
            value={dur(view.waitForDockMin)}
            size="md"
          />
        )}
      </Cells>
      <Rows>
        <Row
          testId="kpidetail-turnaround-visits"
          label={t('turnaround.visits')}
          raw={view.n}
          value={fmt.int(view.n)}
        />
      </Rows>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export function PpeDetail() {
  const { t } = useTranslation('kpidetail');
  const { t: tl } = useTranslation('live');
  const fmt = useFmt();
  const bays = useBays();
  const worst = useMemo(() => selectWorstPpeBay(bays), [bays]);
  return (
    <>
      <Rows>
        <Row
          testId="kpidetail-ppe-worst"
          label={t('ppe.worst')}
          raw={worst?.count}
          value={
            <MaybeValue value={bays.length > 0 ? true : null} reason={tl('kpi.noData')}>
              {worst ? (
                <span data-bay={worst.bay}>
                  {t('ppe.worstValue', {
                    bay: bayLabel(worst.bay, fmt.lang),
                    n: fmt.num(worst.count),
                  })}
                </span>
              ) : (
                t('ppe.none')
              )}
            </MaybeValue>
          }
        />
      </Rows>
      <Note>{t('ppe.note')}</Note>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------

const SEVS: readonly Severity[] = ['critical', 'warn', 'info'];

/** One alert group: label and its open counts; opens the Alerts tray filtered to it (and closes the popover). */
function GroupRow({ row }: { row: AlertGroupRow }) {
  const { t } = useTranslation('kpidetail');
  const { t: tl } = useTranslation('live');
  const fmt = useFmt();
  const label = t(`groups.${row.id}`);
  return (
    <li>
      <Popover.Close asChild>
        <button
          type="button"
          data-testid={`kpidetail-group-${row.id}`}
          data-group={row.id}
          data-total={row.total}
          aria-label={t('alerts.openGroup', { group: label })}
          onClick={() => openAlertsTrayForGroup(row.id)}
          className="soft-transition hover:bg-row-hover focus-visible:ring-ring/50 bn-leading grid min-h-10 w-full grid-cols-[minmax(0,1fr)_auto_14px] items-center gap-x-2 rounded-[12px] px-2 py-1.5 text-left text-[13px] leading-5 focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <span className="text-ink-900 min-w-0 truncate font-medium">{label}</span>
          <span className="flex items-center gap-1">
            {SEVS.map((sev) => (
              <span
                key={sev}
                data-sev={sev}
                data-value={row[sev]}
                title={tl(`sev.${sev}`)}
                className={cn(
                  'inline-grid h-[20px] min-w-[26px] place-items-center rounded-full px-1.5 text-[12px] leading-none font-semibold tabular-nums',
                  row[sev] > 0
                    ? [TONE_TINT[SEV_TONE[sev]], TONE_TEXT[SEV_TONE[sev]]]
                    : 'text-ink-400',
                )}
              >
                {fmt.num(row[sev])}
              </span>
            ))}
          </span>
          <ChevronRight
            className="text-ink-400 size-3.5 rtl:rotate-180"
            strokeWidth={1.75}
            aria-hidden
          />
        </button>
      </Popover.Close>
    </li>
  );
}

export function AlertsDetail() {
  const { t } = useTranslation('kpidetail');
  const fmt = useFmt();
  const kpi = useSiteKpi();
  const attention = selectAttention(kpi);
  const alerts = useOpenAlerts();
  const groups = useMemo(() => selectAlertGroups(alerts), [alerts]);
  return (
    <>
      {attention && (
        <p
          data-testid="kpidetail-alerts-split"
          data-critical={attention.critical}
          data-warn={attention.warn}
          data-info={attention.info}
          className="text-ink-600 bn-leading pt-1 text-[12px] leading-4 tabular-nums"
        >
          {SEVS.map((sev, i) => (
            <span key={sev}>
              {i > 0 && ', '}
              <span
                className={cn(
                  sev === 'critical' && attention.critical > 0 && TONE_TEXT.critical,
                  'font-medium',
                )}
              >
                {t(`chip.sev.${sev}`, { n: fmt.num(attention[sev]) })}
              </span>
            </span>
          ))}
        </p>
      )}
      <SectionTitle>{t('alerts.groupsTitle')}</SectionTitle>
      {groups.length === 0 ? (
        <Note>{t('alerts.none')}</Note>
      ) : (
        <ul className="-mx-2 flex flex-col gap-0.5" data-testid="kpidetail-groups">
          {groups.map((row) => (
            <GroupRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </>
  );
}
