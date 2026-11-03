import { lazy, memo, useMemo, useState, type ReactNode } from 'react';
import { ChevronsLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Bell3d,
  Box3d,
  Conveyor3d,
  FloatingCard,
  IconTile,
  MaybeValue,
  Num,
  Shield3d,
  Stopwatch3d,
  TONE_DOT,
  TONE_TEXT,
  Truck3d,
  type Icon3d,
  type Tone,
} from '@/components/common';
import type { SiteState } from '@/domain';
import { cn } from '@/lib/utils';
import { useBays, useSiteKpi } from '@/stores';
import { Delta } from './kpiDetail/Delta';
import { KpiPopover, KpiPopoverPanel, KpiPopoverTrigger } from './kpiDetail/KpiPopover';
import {
  selectAttention,
  selectTurnaround,
  selectWorstPpeBay,
  type AttentionCounts,
  type WorstPpeBay,
} from './kpiDetail/selectors';
import { bayLabel } from './siteInfo';
import { SEV_TONE } from './tones';
import { useFmt, type Fmt } from './useFmt';

type Kpi = SiteState['kpi'];

// The popover bodies are one lazy chunk (Task 19 spec 5A): fetched on the first hover, focus or open of a chip.
const loadDetails = () => import('./kpiDetail/details');
const preloadDetails = () => void loadDetails();
const CartonsDetail = lazy(() => loadDetails().then((m) => ({ default: m.CartonsDetail })));
const TurnaroundDetail = lazy(() => loadDetails().then((m) => ({ default: m.TurnaroundDetail })));
const PpeDetail = lazy(() => loadDetails().then((m) => ({ default: m.PpeDetail })));
const AlertsDetail = lazy(() => loadDetails().then((m) => ({ default: m.AlertsDetail })));

interface ChipDetail {
  /** Popover id: trigger `kpi-open-<id>`, panel `kpidetail-<id>`. */
  id: string;
  title: string;
  panel: ReactNode;
}

/**
 * One KPI chip (docs/06 §3, U2). Chips share the row equally (`flex-1 basis-0`), so their width never depends on the
 * values inside: a number growing a digit cannot reflow the row. The delta sits on the label row, because beside a
 * 26 px value it overflows the narrower chips; where the chips are narrow (below 1700 px) it moves to the sub-line, so
 * the label keeps its full width. One grid, so the move never remounts it.
 *
 * With `detail`, a transparent button covers the chip and opens its popover. The text grid sits above that button
 * but lets clicks through, except the "—" tooltip triggers of MaybeValue (`.cursor-help`), which stay hoverable.
 */
function Chip({
  testId,
  icon,
  iconTone,
  label,
  value,
  delta,
  sub,
  className,
  detail,
  kind,
}: {
  testId: string;
  icon: Icon3d;
  iconTone?: Tone;
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  sub: ReactNode;
  className?: string;
  detail?: ChipDetail;
  /** Optional data-kind (the turnaround chip's view: full | legacy | none). */
  kind?: string;
}) {
  const card = (
    <FloatingCard
      data-testid={testId}
      data-kind={kind}
      className={cn(
        'relative flex max-w-[272px] min-w-0 flex-1 basis-0 items-center gap-[10px] py-[12px] ps-[10px] pe-[10px] min-[1700px]:gap-[12px] min-[1700px]:ps-[12px] min-[1700px]:pe-[16px]',
        className,
      )}
    >
      {detail && <KpiPopoverTrigger id={detail.id} label={label} onIntent={preloadDetails} />}
      <IconTile icon={icon} tone={iconTone} />
      <span
        className={cn(
          'grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline',
          detail && 'pointer-events-none relative [&_.cursor-help]:pointer-events-auto',
        )}
      >
        <span
          data-testid={testId.replace('kpi-', 'kpi-label-')}
          className="text-ink-600 col-span-2 row-start-1 min-w-0 truncate text-[13px] leading-[18px] font-medium min-[1700px]:col-span-1"
        >
          {label}
        </span>
        {delta && (
          <span className="col-start-2 row-start-3 ms-1.5 min-[1700px]:row-start-1">{delta}</span>
        )}
        <span className="text-ink-900 col-span-2 row-start-2 text-[26px] leading-[30px] font-bold whitespace-nowrap tabular-nums">
          {value}
        </span>
        <span
          data-testid={testId.replace('kpi-', 'kpi-sub-')}
          className={cn(
            'text-ink-400 row-start-3 flex min-w-0 items-center gap-1.5 truncate text-[12px] leading-4 whitespace-nowrap',
            delta ? 'col-start-1 min-[1700px]:col-span-2' : 'col-span-2',
          )}
        >
          {sub}
        </span>
      </span>
    </FloatingCard>
  );
  if (!detail) return card;
  return (
    <KpiPopover>
      {card}
      <KpiPopoverPanel id={detail.id} title={detail.title}>
        {detail.panel}
      </KpiPopoverPanel>
    </KpiPopover>
  );
}

/**
 * "<critical> critical, <warn> warning, <info> info" in the width of the old two-part line: a dot and a count per
 * severity, the full sentence as the accessible name and tooltip. Critical uses the critical token.
 */
function SevSplit({ attention, fmt }: { attention: AttentionCounts; fmt: Fmt }) {
  const { t } = useTranslation('kpidetail');
  const sentence = t('chip.sevSplit', {
    critical: fmt.num(attention.critical),
    warn: fmt.num(attention.warn),
    info: fmt.num(attention.info),
  });
  return (
    <span role="img" aria-label={sentence} title={sentence} className="flex items-center gap-2">
      {(['critical', 'warn', 'info'] as const).map((sev) => (
        <span key={sev} className="inline-flex items-center gap-1">
          <span aria-hidden className={cn('size-1.5 rounded-full', TONE_DOT[SEV_TONE[sev]])} />
          <span
            data-testid={`kpi-sev-${sev}`}
            data-value={attention[sev]}
            className={cn(
              'tabular-nums',
              sev === 'critical' && attention.critical > 0 && TONE_TEXT.critical,
            )}
          >
            {fmt.num(attention[sev])}
          </span>
        </span>
      ))}
    </span>
  );
}

const Chips = memo(function Chips({
  kpi,
  fmt,
  worstPpe,
  hasBays,
}: {
  kpi: Kpi | null;
  fmt: Fmt;
  worstPpe: WorstPpeBay | null;
  hasBays: boolean;
}) {
  const { t } = useTranslation('live');
  const { t: td } = useTranslation('kpidetail');
  const noData = t('kpi.noData');
  const unknownDelta = t('kpi.noDelta');
  const tat = selectTurnaround(kpi);
  const attention = selectAttention(kpi);
  // the bell takes the colour of the worst open alert
  const alertTone: Tone = !kpi
    ? 'info'
    : kpi.openAlerts.critical > 0
      ? 'critical'
      : kpi.openAlerts.warn > 0
        ? 'warn'
        : 'info';
  const worstText = worstPpe
    ? td('chip.worstBay', { bay: bayLabel(worstPpe.bay, fmt.lang), n: fmt.num(worstPpe.count) })
    : hasBays
      ? td('chip.noViolations')
      : '—';

  return (
    <>
      <Chip
        testId="kpi-cases"
        icon={Box3d}
        label={t('kpi.cases')}
        detail={{ id: 'cartons', title: td('cartons.title'), panel: <CartonsDetail /> }}
        value={
          <MaybeValue value={kpi?.casesOut} reason={noData}>
            <Num value={kpi?.casesOut ?? 0} format={fmt.int} minCh={6} />
          </MaybeValue>
        }
        delta={
          <Delta value={kpi?.casesOutDeltaPct} good="up" reason={unknownDelta}>
            {(v) => <Num value={v} format={fmt.pctAbs1} />}
          </Delta>
        }
        sub={<span>{t('kpi.casesIn', { n: kpi ? fmt.num(kpi.casesIn) : '—' })}</span>}
      />
      <Chip
        testId="kpi-trucks"
        icon={Truck3d}
        label={t('kpi.trucks')}
        value={
          <MaybeValue value={kpi?.trucksOnSite} reason={noData}>
            <Num value={kpi?.trucksOnSite ?? 0} format={fmt.int} minCh={2} />
          </MaybeValue>
        }
        sub={
          <span className="truncate">
            {kpi
              ? t('kpi.trucksSplit', {
                  docked: fmt.num(kpi.trucksDocked),
                  waiting: fmt.num(kpi.trucksWaiting),
                })
              : '—'}
          </span>
        }
      />
      <Chip
        testId="kpi-bays"
        icon={Conveyor3d}
        label={t('kpi.bays')}
        value={
          <MaybeValue value={kpi?.baysRunning} reason={noData}>
            {fmt.num(kpi?.baysRunning ?? 0)}
            <span className="text-ink-400 text-[16px] font-medium">
              /{fmt.num(kpi?.baysTotal ?? 0)}
            </span>
          </MaybeValue>
        }
        sub={<span className="truncate">{t('kpi.baysSub')}</span>}
      />
      {/* Headline: bay occupancy (rev 1.1). An older backend has no breakdown: then the truthful "Avg turnaround". */}
      <Chip
        testId="kpi-tat"
        kind={tat.kind}
        icon={Stopwatch3d}
        label={tat.kind === 'full' ? td('chip.occupancy') : t('kpi.tat')}
        className="hidden min-[1700px]:flex"
        detail={{ id: 'turnaround', title: td('turnaround.title'), panel: <TurnaroundDetail /> }}
        value={
          tat.kind === 'full' ? (
            <MaybeValue value={tat.occupancyMin} reason={t('kpi.noTat')}>
              {fmt.durHM(tat.occupancyMin)}
            </MaybeValue>
          ) : (
            <MaybeValue value={kpi?.avgTatMin} reason={t('kpi.noTat')}>
              {fmt.durHM(kpi?.avgTatMin)}
            </MaybeValue>
          )
        }
        delta={
          // the delta is the depot turnaround's: it sits on the chip only while the chip shows that number
          tat.kind === 'full' ? undefined : (
            <Delta value={kpi?.avgTatDeltaMin} good="down" reason={unknownDelta}>
              {(v) => t('kpi.minutes', { n: fmt.num(Math.abs(v)) })}
            </Delta>
          )
        }
        sub={<span className="truncate">{t('kpi.tatSub')}</span>}
      />
      <Chip
        testId="kpi-compliance"
        icon={Shield3d}
        label={t('kpi.compliance')}
        className="hidden min-[2000px]:flex"
        detail={{ id: 'ppe', title: td('ppe.title'), panel: <PpeDetail /> }}
        value={
          <MaybeValue value={kpi?.complianceScore} reason={t('kpi.noCompliance')}>
            <Num value={kpi?.complianceScore ?? 0} format={fmt.pctInt} minCh={4} />
          </MaybeValue>
        }
        sub={
          <span className="truncate" title={worstText} data-bay={worstPpe?.bay}>
            {worstText}
          </span>
        }
      />
      <Chip
        testId="kpi-alerts"
        icon={Bell3d}
        iconTone={alertTone}
        label={td('chip.attention')}
        detail={{ id: 'alerts', title: td('alerts.title'), panel: <AlertsDetail /> }}
        value={
          <MaybeValue value={attention?.needsAttention} reason={noData}>
            <Num value={attention?.needsAttention ?? 0} format={fmt.int} minCh={3} />
          </MaybeValue>
        }
        sub={attention ? <SevSplit attention={attention} fmt={fmt} /> : '—'}
      />
    </>
  );
});

/**
 * KPI chips (top-left, docs/01 §3.1). Null values render "—" with a tooltip, never 0. Collapsible to a single toggle.
 * Six chips from 2000 px, five from 1700 px; PPE compliance, then turnaround (both also in the depot inspector) give
 * way so the row stays one line, inside the 120 px safe area the 3D view keeps free. Cartons, turnaround, PPE and
 * alerts open a detail popover (Task 19 spec 5A).
 */
export function KpiChips() {
  const { t } = useTranslation('live');
  const kpi = useSiteKpi();
  const bays = useBays();
  const fmt = useFmt();
  const [open, setOpen] = useState(true);
  const worst = useMemo(() => selectWorstPpeBay(bays), [bays]);
  // primitives, so a bay update that does not move the worst bay does not re-render the chips
  const worstBay = worst?.bay ?? null;
  const worstCount = worst?.count ?? 0;
  const worstPpe = useMemo(
    () => (worstBay === null ? null : { bay: worstBay, count: worstCount }),
    [worstBay, worstCount],
  );
  return (
    <div className="flex items-stretch gap-[12px]" data-testid="kpi-chips">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? t('kpi.collapse') : t('kpi.expand')}
        className="card-surface soft-transition text-ink-400 hover:text-ink-900 focus-visible:ring-ring/50 pointer-events-auto grid size-9 shrink-0 place-items-center self-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <ChevronsLeft
          className={cn('soft-transition size-4', !open && 'rotate-180')}
          strokeWidth={1.75}
        />
      </button>
      {open && <Chips kpi={kpi} fmt={fmt} worstPpe={worstPpe} hasBays={bays.length > 0} />}
    </div>
  );
}
