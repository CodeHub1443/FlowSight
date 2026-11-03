import { useMemo, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { MaybeValue, TONE_DOT, TONE_TEXT, TONE_TINT, type Tone } from '@/components/common';
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
import { openAlertsTrayForGroup } from './trayFilter';

// Popover bodies for the KPI chips (Task 19 spec 5A). A separate chunk, loaded on first use (React.lazy in
// KpiChips). Every value comes from the stores through the 19.0 selectors; nothing here is computed from a sample.
// Values are plain text (no tween) and carry their raw store value in `data-value`, so a test can compare the two.

/** Phase colours of the turnaround stacked bar (tokens only). */
const PHASE_TONE = { preOp: 'warn', work: 'info', postOp: 'neutral' } as const satisfies Record<
  string,
  Tone
>;

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
      className="border-hairline bn-leading flex min-h-9 items-center justify-between gap-3 border-b py-1.5 text-[13px] leading-5 last:border-b-0"
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
  return (
    <>
      <Rows>
        <Row
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
        />
        <Row
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
        />
      </Rows>
      <Note>{t('cartons.deltaNote')}</Note>
      <SectionTitle>{t('cartons.rateTitle')}</SectionTitle>
      <Rows>
        <Row
          testId="kpidetail-rate-out"
          label={t('cartons.outPerHour')}
          raw={rates.outPerHour}
          value={
            <MaybeValue value={rates.outPerHour} reason={noRate}>
              {t('cartons.perHour', { n: fmt.int(rates.outPerHour ?? 0) })}
            </MaybeValue>
          }
        />
        <Row
          testId="kpidetail-rate-in"
          label={t('cartons.inPerHour')}
          raw={rates.inPerHour}
          value={
            <MaybeValue value={rates.inPerHour} reason={noRate}>
              {t('cartons.perHour', { n: fmt.int(rates.inPerHour ?? 0) })}
            </MaybeValue>
          }
        />
      </Rows>
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
      className="bg-hairline my-2 flex h-2 w-full overflow-hidden rounded-full"
    >
      {(['preOp', 'work', 'postOp'] as const).map((id) => (
        <span
          key={id}
          data-share={shares[id]}
          className={cn('soft-transition h-full', TONE_DOT[PHASE_TONE[id]])}
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
      <Rows>
        <Row
          testId="kpidetail-turnaround-preop"
          label={t('turnaround.preOp')}
          swatch={PHASE_TONE.preOp}
          raw={view.preOpDelayMin}
          value={dur(view.preOpDelayMin)}
        />
        <Row
          testId="kpidetail-turnaround-work"
          label={t('turnaround.work')}
          swatch={PHASE_TONE.work}
          raw={view.activeMin}
          value={dur(view.activeMin)}
        />
        <Row
          testId="kpidetail-turnaround-postop"
          label={t('turnaround.postOp')}
          swatch={PHASE_TONE.postOp}
          raw={view.postOpDelayMin}
          value={dur(view.postOpDelayMin)}
        />
        <Row
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
        />
        {view.waitForDockMin !== null && (
          <Row
            testId="kpidetail-turnaround-waitdock"
            label={t('turnaround.waitForDock')}
            raw={view.waitForDockMin}
            value={dur(view.waitForDockMin)}
          />
        )}
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
  const kpi = useSiteKpi();
  const bays = useBays();
  const worst = useMemo(() => selectWorstPpeBay(bays), [bays]);
  return (
    <>
      <Rows>
        <Row
          testId="kpidetail-ppe-score"
          label={t('ppe.score')}
          raw={kpi?.complianceScore}
          value={
            <MaybeValue value={kpi?.complianceScore} reason={tl('kpi.noCompliance')}>
              {fmt.pctInt(kpi?.complianceScore ?? 0)}
            </MaybeValue>
          }
          strong
        />
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
  const { t: tl } = useTranslation('live');
  const fmt = useFmt();
  const kpi = useSiteKpi();
  const attention = selectAttention(kpi);
  const alerts = useOpenAlerts();
  const groups = useMemo(() => selectAlertGroups(alerts), [alerts]);
  return (
    <>
      <Rows>
        <Row
          testId="kpidetail-alerts-attention"
          label={t('alerts.title')}
          raw={attention?.needsAttention}
          value={
            <MaybeValue value={attention?.needsAttention} reason={tl('kpi.noData')}>
              {fmt.int(attention?.needsAttention ?? 0)}
            </MaybeValue>
          }
          strong
        />
      </Rows>
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
