import type { ReactNode } from 'react';
import {
  Bell,
  ChevronsLeft,
  ChevronsRight,
  Package,
  ShieldCheck,
  Timer,
  Truck,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FloatingCard, MaybeValue, SmallCaps, TONE_TEXT } from '@/components/common';
import type { SiteState } from '@/domain';
import { cn } from '@/lib/utils';
import { useSiteKpi } from '@/stores';
import { useFmt, type Fmt } from './useFmt';

type Kpi = SiteState['kpi'];

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
            'font-semibold tabular-nums',
            value === 0
              ? 'text-muted-foreground'
              : value > 0 === (good === 'up')
                ? TONE_TEXT.ok
                : TONE_TEXT.critical,
          )}
        >
          {value > 0 ? '▲' : value < 0 ? '▼' : '■'} {children(value)}
        </span>
      )}
    </MaybeValue>
  );
}

function Chip({
  testId,
  icon: Icon,
  label,
  value,
  sub,
}: {
  testId: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sub: ReactNode;
}) {
  return (
    <FloatingCard
      data-testid={testId}
      className="flex min-w-[8.5rem] items-center gap-2.5 px-3 py-2 leading-tight"
    >
      {/* Icon tile as in the reference; dropped below 1600 px to keep six chips on one row. */}
      <span className="bg-primary/10 text-primary hidden size-10 shrink-0 place-items-center rounded-xl min-[1600px]:grid">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <SmallCaps className="truncate">{label}</SmallCaps>
        <span className="text-[1.65rem] leading-8 font-bold tabular-nums">{value}</span>
        <span className="text-muted-foreground flex items-center gap-1.5 text-[0.85rem] whitespace-nowrap">
          {sub}
        </span>
      </span>
    </FloatingCard>
  );
}

function Chips({ kpi, fmt }: { kpi: Kpi | null; fmt: Fmt }) {
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
            {fmt.num(kpi?.casesOut ?? 0)}
          </MaybeValue>
        }
        sub={
          <>
            <span>{t('kpi.casesIn', { n: kpi ? fmt.num(kpi.casesIn) : '—' })}</span>
            <Delta value={kpi?.casesOutDeltaPct} good="up" reason={unknownDelta}>
              {(v) => fmt.pct(Math.abs(v), false, 1)}
            </Delta>
          </>
        }
      />
      <Chip
        testId="kpi-trucks"
        icon={Truck}
        label={t('kpi.trucks')}
        value={
          <MaybeValue value={kpi?.trucksOnSite} reason={noData}>
            {fmt.num(kpi?.trucksOnSite ?? 0)}
          </MaybeValue>
        }
        sub={
          <span>
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
            <span className="text-muted-foreground text-[1.1rem] font-semibold">
              /{fmt.num(kpi?.baysTotal ?? 0)}
            </span>
          </MaybeValue>
        }
        sub={<span>{t('kpi.baysSub')}</span>}
      />
      <Chip
        testId="kpi-tat"
        icon={Timer}
        label={t('kpi.tat')}
        value={
          <MaybeValue value={kpi?.avgTatMin} reason={t('kpi.noTat')}>
            {fmt.dur((kpi?.avgTatMin ?? 0) * 60)}
          </MaybeValue>
        }
        sub={
          <Delta value={kpi?.avgTatDeltaMin} good="down" reason={unknownDelta}>
            {(v) => t('kpi.minutes', { n: fmt.num(Math.abs(v)) })}
          </Delta>
        }
      />
      <Chip
        testId="kpi-compliance"
        icon={ShieldCheck}
        label={t('kpi.compliance')}
        value={
          <MaybeValue value={kpi?.complianceScore} reason={t('kpi.noCompliance')}>
            {fmt.pct(kpi?.complianceScore ?? 0)}
          </MaybeValue>
        }
        sub={<span>{t('kpi.complianceSub')}</span>}
      />
      <Chip
        testId="kpi-alerts"
        icon={Bell}
        label={t('kpi.alerts')}
        value={
          <MaybeValue value={openTotal} reason={noData}>
            {fmt.num(openTotal ?? 0)}
          </MaybeValue>
        }
        sub={
          kpi ? (
            <>
              <span className={kpi.openAlerts.critical > 0 ? TONE_TEXT.critical : undefined}>
                {t('kpi.sevCritical', { n: fmt.num(kpi.openAlerts.critical) })}
              </span>
              <span>{t('kpi.sevWarn', { n: fmt.num(kpi.openAlerts.warn) })}</span>
            </>
          ) : (
            '—'
          )
        }
      />
    </>
  );
}

/** KPI chips (top-left). Null values render "—" with a tooltip, never 0. Collapsible to a single toggle. */
export function KpiChips() {
  const { t } = useTranslation('live');
  const kpi = useSiteKpi();
  const fmt = useFmt();
  const [open, setOpen] = useState(true);
  const Icon = open ? ChevronsLeft : ChevronsRight;
  return (
    <div className="flex flex-wrap items-start gap-2" data-testid="kpi-chips">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? t('kpi.collapse') : t('kpi.expand')}
        className="bg-card text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 pointer-events-auto grid size-9 place-items-center rounded-xl border shadow-lg shadow-black/10 focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <Icon className="size-4" />
      </button>
      {open && <Chips kpi={kpi} fmt={fmt} />}
    </div>
  );
}
