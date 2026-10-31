import { memo, useState, type ReactNode } from 'react';
import {
  ArrowUp,
  Bell,
  ChevronsLeft,
  Package,
  ShieldCheck,
  Timer,
  Truck,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FloatingCard, IconTile, MaybeValue, Num, TONE_TEXT } from '@/components/common';
import type { SiteState } from '@/domain';
import { cn } from '@/lib/utils';
import { useSiteKpi } from '@/stores';
import { useFmt, type Fmt } from './useFmt';

type Kpi = SiteState['kpi'];

/** Delta vs the same time yesterday: arrow + value, green when the move is good, red when bad (docs/06 §3). */
function Delta({
  value,
  good,
  children,
  reason,
}: {
  value: number | null | undefined;
  /** Whether a rise is good (cases) or bad (turnaround minutes). */
  good: 'up' | 'down';
  children: (v: number) => ReactNode;
  reason: string;
}) {
  return (
    <MaybeValue value={value} reason={reason}>
      {value !== null && value !== undefined && (
        <span
          data-testid="kpi-delta"
          className={cn(
            'soft-transition inline-flex items-center gap-0.5 text-[12px] leading-4 font-medium whitespace-nowrap tabular-nums',
            value === 0
              ? 'text-ink-400'
              : value > 0 === (good === 'up')
                ? TONE_TEXT.ok
                : TONE_TEXT.critical,
          )}
        >
          {/* One arrow, rotated: the sign flipping never swaps (remounts) the icon. */}
          <ArrowUp
            aria-hidden
            strokeWidth={2}
            className={cn(
              'soft-transition size-3',
              value < 0 && 'rotate-180',
              value === 0 && 'opacity-0',
            )}
          />
          {children(value)}
        </span>
      )}
    </MaybeValue>
  );
}

/**
 * One KPI chip (docs/06 §3, U2). Chips share the row equally (`flex-1 basis-0`), so their width never depends on the
 * values inside: a number growing a digit cannot reflow the row. The delta sits on the label row, because beside a
 * 26 px value it overflows the narrower chips.
 */
function Chip({
  testId,
  icon,
  label,
  value,
  delta,
  sub,
  className,
}: {
  testId: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  sub: ReactNode;
  className?: string;
}) {
  return (
    <FloatingCard
      data-testid={testId}
      className={cn(
        'flex max-w-[272px] min-w-0 flex-1 basis-0 items-center gap-[12px] py-[12px] ps-[12px] pe-[16px]',
        className,
      )}
    >
      <IconTile icon={icon} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="text-ink-600 min-w-0 truncate text-[13px] leading-[18px] font-medium">
            {label}
          </span>
          {delta}
        </span>
        <span className="text-ink-900 text-[26px] leading-[30px] font-bold whitespace-nowrap tabular-nums">
          {value}
        </span>
        <span className="text-ink-400 flex min-w-0 items-center gap-1.5 truncate text-[12px] leading-4 whitespace-nowrap">
          {sub}
        </span>
      </span>
    </FloatingCard>
  );
}

const Chips = memo(function Chips({ kpi, fmt }: { kpi: Kpi | null; fmt: Fmt }) {
  const { t } = useTranslation('live');
  const noData = t('kpi.noData');
  const unknownDelta = t('kpi.noDelta');
  const openTotal = kpi
    ? kpi.openAlerts.info + kpi.openAlerts.warn + kpi.openAlerts.critical
    : null;

  return (
    <>
      <Chip
        testId="kpi-cases"
        icon={Package}
        label={t('kpi.cases')}
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
        icon={Truck}
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
        icon={Workflow}
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
      <Chip
        testId="kpi-tat"
        icon={Timer}
        label={t('kpi.tat')}
        className="hidden min-[1700px]:flex"
        value={
          <MaybeValue value={kpi?.avgTatMin} reason={t('kpi.noTat')}>
            {fmt.dur((kpi?.avgTatMin ?? 0) * 60)}
          </MaybeValue>
        }
        delta={
          <Delta value={kpi?.avgTatDeltaMin} good="down" reason={unknownDelta}>
            {(v) => t('kpi.minutes', { n: fmt.num(Math.abs(v)) })}
          </Delta>
        }
        sub={<span className="truncate">{t('kpi.tatSub')}</span>}
      />
      <Chip
        testId="kpi-compliance"
        icon={ShieldCheck}
        label={t('kpi.compliance')}
        className="hidden min-[2000px]:flex"
        value={
          <MaybeValue value={kpi?.complianceScore} reason={t('kpi.noCompliance')}>
            <Num value={kpi?.complianceScore ?? 0} format={fmt.pctInt} minCh={4} />
          </MaybeValue>
        }
        sub={<span className="truncate">{t('kpi.complianceSub')}</span>}
      />
      <Chip
        testId="kpi-alerts"
        icon={Bell}
        label={t('kpi.alerts')}
        value={
          <MaybeValue value={openTotal} reason={noData}>
            <Num value={openTotal ?? 0} format={fmt.int} minCh={3} />
          </MaybeValue>
        }
        sub={
          kpi ? (
            <>
              <span className={kpi.openAlerts.critical > 0 ? TONE_TEXT.critical : undefined}>
                {t('kpi.sevCritical', { n: fmt.num(kpi.openAlerts.critical) })}
              </span>
              <span aria-hidden>·</span>
              <span className="truncate">
                {t('kpi.sevWarn', { n: fmt.num(kpi.openAlerts.warn) })}
              </span>
            </>
          ) : (
            '—'
          )
        }
      />
    </>
  );
});

/**
 * KPI chips (top-left, docs/01 §3.1). Null values render "—" with a tooltip, never 0. Collapsible to a single toggle.
 * Six chips from 2000 px, five from 1700 px; compliance, then turnaround (both also in the depot inspector) give way
 * so the row
 * stays one line, inside the 120 px safe area the 3D view keeps free.
 */
export function KpiChips() {
  const { t } = useTranslation('live');
  const kpi = useSiteKpi();
  const fmt = useFmt();
  const [open, setOpen] = useState(true);
  return (
    <div className="flex items-center gap-[12px]" data-testid="kpi-chips">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? t('kpi.collapse') : t('kpi.expand')}
        className="card-surface soft-transition text-ink-400 hover:text-ink-900 focus-visible:ring-ring/50 pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <ChevronsLeft
          className={cn('soft-transition size-4', !open && 'rotate-180')}
          strokeWidth={1.75}
        />
      </button>
      {open && <Chips kpi={kpi} fmt={fmt} />}
    </div>
  );
}
