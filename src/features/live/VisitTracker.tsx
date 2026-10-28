import {
  ChevronDown,
  LogOut,
  PackageCheck,
  PackageOpen,
  Truck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Caption, FloatingCard, IconTile, StatusPill } from '@/components/common';
import type { BayVisit } from '@/domain';
import { formatPlate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';
import {
  dwellSec,
  trackerSteps,
  visitCount,
  type ActiveVisit,
  type StepState,
  type TrackerKey,
} from './model';
import { bayLabel } from './siteInfo';
import { PHASE_TONE } from './tones';
import { useFmt, type Fmt } from './useFmt';
import { useSelectedVisit, useStreamNow } from './useLiveModel';

/** One icon per step position, so a queued truck ("Waiting") and a docked one never swap (remount) the icon. */
const STEP_ICONS: readonly LucideIcon[] = [Truck, Warehouse, PackageOpen, PackageCheck, LogOut];
const EMPTY_KEYS: readonly TrackerKey[] = ['arrived', 'docked', 'loading', 'finished', 'departed'];

function stepLabel(
  key: TrackerKey,
  visit: BayVisit | null,
  fmt: Fmt,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (key === 'waiting') return t('queue.waiting');
  if (key !== 'loading' || !visit) return t(`tracker.steps.${key}`);
  const unloading = visit.phase === 'UNLOADING';
  return t(unloading ? 'tracker.unloadingCount' : 'tracker.loadingCount', {
    n: fmt.num(visitCount(visit)),
    expected: visit.expected === null ? '—' : fmt.num(visit.expected),
  });
}

/**
 * Stepper as in the reference: done steps are filled brand circles, the current step is filled with a soft halo,
 * pending steps are hollow; a line joins them and turns blue up to the current step. Time below each label.
 * Always mounted (all pending when there is no visit), so selecting a bay without a truck never changes its height.
 */
function Stepper({ visit, waiting, fmt }: { visit: BayVisit | null; waiting: boolean; fmt: Fmt }) {
  const { t } = useTranslation('live');
  const steps = visit
    ? trackerSteps(visit, waiting)
    : EMPTY_KEYS.map((key) => ({ key, at: null, state: 'pending' as StepState }));
  return (
    <ol className="relative grid min-w-0 grid-cols-5" data-testid="tracker-steps">
      {steps.map((step, i) => {
        const Icon = STEP_ICONS[i] ?? Truck;
        return (
          <li
            key={i}
            data-testid={`tracker-step-${step.key}`}
            data-state={step.state}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className="relative flex min-w-0 flex-col items-center px-0.5 text-center"
          >
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'soft-transition absolute top-[13px] right-[calc(50%+18px)] left-[calc(-50%+18px)] h-[2px] rounded-full',
                  step.state === 'pending' ? 'bg-track' : 'bg-info',
                )}
              />
            )}
            <span
              className={cn(
                'soft-transition relative z-10 grid size-[28px] place-items-center rounded-full',
                step.state === 'pending' && 'bg-card text-ink-400 border-track border-2',
                step.state === 'done' && 'bg-info text-on-solid',
                step.state === 'current' && 'bg-info ring-info/20 text-on-solid ring-4',
              )}
            >
              <Icon className="size-3.5" strokeWidth={2} aria-hidden />
            </span>
            <span
              className={cn(
                'mt-1.5 w-full truncate text-[12px] leading-4 font-medium',
                step.state === 'pending' ? 'text-ink-400' : 'text-ink-900',
              )}
            >
              {stepLabel(step.key, visit, fmt, t)}
            </span>
            <span className="text-ink-400 w-full truncate text-[11px] leading-4 tabular-nums">
              {step.at ? fmt.clock(step.at) : '—'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Right-hand subject card (the reference's shipment card): plate, phase pill, transporter or apron slot, ETA. */
function Subject({ active, fmt }: { active: ActiveVisit | null; fmt: Fmt }) {
  const { t } = useTranslation('live');
  if (!active) {
    return (
      <div className="bg-muted flex min-w-0 items-center rounded-[12px] px-3 py-2.5">
        <p
          className="text-ink-400 line-clamp-2 text-[12px] leading-4 bn-leading"
          data-testid="tracker-empty"
        >
          {t('tracker.empty')}
        </p>
      </div>
    );
  }
  const { visit, bay, waiting } = active;
  const plate = formatPlate(visit.plate);
  return (
    <div
      className="bg-muted flex min-w-0 flex-col justify-center gap-1 rounded-[12px] px-3 py-2.5"
      data-testid="tracker-subject"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-ink-900 min-w-0 flex-1 truncate text-[14px] leading-5 font-semibold">
          {plate.primary}
        </span>
        <PhasePill active={active} />
      </div>
      <p className="text-ink-400 truncate text-[12px] leading-4">
        {[plate.secondary, bayLabel(bay, fmt.lang)].filter(Boolean).join(' · ')} ·{' '}
        <span data-testid="tracker-info">
          {waiting
            ? waiting.slot === null
              ? t('queue.noSlot')
              : t('queue.slot', { n: fmt.num(waiting.slot) })
            : visit.agency
              ? visit.agency[fmt.lang] || visit.agency.en
              : t('tracker.noAgency')}
        </span>{' '}
        ·{' '}
        <span className="text-ink-600">
          {visit.etaMin === null
            ? t('tracker.etaUnknown')
            : t('tracker.etaLeft', { n: fmt.num(visit.etaMin) })}
        </span>
      </p>
    </div>
  );
}

/** Phase pill of the tracked visit ("Waiting" for a truck queued on the apron). */
function PhasePill({ active }: { active: ActiveVisit }) {
  const { t } = useTranslation('live');
  return active.waiting ? (
    <StatusPill tone="neutral">{t('queue.waiting')}</StatusPill>
  ) : (
    <StatusPill tone={PHASE_TONE[active.visit.phase]}>
      {t(`phase.${active.visit.phase}`)}
    </StatusPill>
  );
}

/**
 * Header row, the whole card when collapsed: icon, then the title (expanded) or the tracked truck's plate and phase
 * (collapsed), the dwell clock and the chevron. The dwell node is the same in both states.
 */
function Header({
  active,
  expanded,
  onToggle,
  fmt,
}: {
  active: ActiveVisit | null;
  expanded: boolean;
  onToggle: () => void;
  fmt: Fmt;
}) {
  const { t } = useTranslation('live');
  const now = useStreamNow();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <IconTile icon={Truck} size="sm" />
      {expanded || !active ? (
        <span className="text-ink-900 min-w-0 truncate text-[14px] leading-5 font-semibold">
          {t('tracker.title')}
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-2" data-testid="tracker-compact">
          <span
            lang={active.visit.plate.bn.trim() ? 'bn' : undefined}
            className="text-ink-900 min-w-0 truncate text-[14px] leading-6 font-semibold"
          >
            {formatPlate(active.visit.plate).primary}
          </span>
          <PhasePill active={active} />
        </span>
      )}
      {active && (
        <span
          className="ms-auto flex shrink-0 items-baseline gap-1.5 whitespace-nowrap"
          data-testid="tracker-dwell"
        >
          <Caption className="text-ink-400 font-normal">{t('tracker.dwell')}</Caption>
          <span className="text-ink-900 inline-block min-w-[4.5ch] text-[13px] font-semibold tabular-nums">
            {fmt.dur(dwellSec(active.visit, now))}
          </span>
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-expanded={expanded}
        aria-label={expanded ? t('panel.collapse') : t('panel.expand')}
        className={cn(
          'soft-transition text-ink-400 hover:bg-row-hover hover:text-ink-900 focus-visible:ring-ring/50 grid size-7 shrink-0 place-items-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none',
          !active && 'ms-auto',
        )}
      >
        <ChevronDown
          className={cn('soft-transition size-4', !expanded && 'rotate-180')}
          strokeWidth={1.75}
        />
      </button>
    </div>
  );
}

/**
 * Bottom-left visit tracker (docs/01 §3.1): Arrived -> Docked -> Loading n/expected -> Finished -> Departed for the
 * selected visit. A truck queued on the apron starts at "Waiting" (with its holding slot) instead of "Arrived".
 * Collapsed by default to one 56 px bar (plate, phase, dwell; at most 520 px wide) so the scene's safe area keeps
 * its bottom row; it expands on click or when a truck is selected and collapses again when the selection is cleared.
 * The stepper stays mounted while collapsed (hidden), so expanding never remounts it.
 */
export function VisitTracker() {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const active = useSelectedVisit();
  const selection = useUiStore((s) => s.selection);
  const [expanded, setExpanded] = useState(selection?.kind === 'truck');
  const [seen, setSeen] = useState(selection);
  if (selection !== seen) {
    setSeen(selection);
    if (selection === null) setExpanded(false);
    else if (selection.kind === 'truck') setExpanded(true);
  }
  return (
    <FloatingCard
      data-testid="visit-tracker"
      data-expanded={expanded}
      aria-label={t('tracker.title')}
      className={cn('flex min-h-0 flex-col', expanded ? 'w-full' : 'w-full max-w-[520px]')}
    >
      <div
        className={cn(
          'shrink-0 ps-[16px] pe-[12px]',
          // collapsed: 11 + 32 px tile + 11 + the 1 px borders = 56 px
          expanded ? 'pt-[12px] pb-[6px]' : 'cursor-pointer py-[11px]',
        )}
        onClick={expanded ? undefined : () => setExpanded(true)}
      >
        <Header
          active={active}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          fmt={fmt}
        />
      </div>
      <div
        hidden={!expanded}
        className="animate-in fade-in-0 slide-in-from-bottom-1 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_248px] items-center gap-[20px] ps-[16px] pe-[16px] pb-[12px] duration-200"
      >
        <Stepper visit={active?.visit ?? null} waiting={active?.waiting != null} fmt={fmt} />
        <Subject active={active} fmt={fmt} />
      </div>
    </FloatingCard>
  );
}
