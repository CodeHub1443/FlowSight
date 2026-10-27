import { LogOut, PackageCheck, PackageOpen, Truck, Warehouse, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Caption, CollapsiblePanel, IconTile, StatusPill } from '@/components/common';
import type { BayVisit } from '@/domain';
import { formatPlate } from '@/lib/format';
import { cn } from '@/lib/utils';
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
        {waiting ? (
          <StatusPill tone="neutral">{t('queue.waiting')}</StatusPill>
        ) : (
          <StatusPill tone={PHASE_TONE[visit.phase]}>{t(`phase.${visit.phase}`)}</StatusPill>
        )}
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

function Header({ active, fmt }: { active: ActiveVisit | null; fmt: Fmt }) {
  const { t } = useTranslation('live');
  const now = useStreamNow();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <IconTile icon={Truck} size="sm" />
      <span className="text-ink-900 truncate text-[14px] leading-5 font-semibold">
        {t('tracker.title')}
      </span>
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
    </div>
  );
}

/**
 * Bottom-left visit tracker (docs/01 §3.1): Arrived -> Docked -> Loading n/expected -> Finished -> Departed for the
 * selected visit. A truck queued on the apron starts at "Waiting" (with its holding slot) instead of "Arrived".
 * Compact (at most 140 px tall) and collapsible: it may overlap the shed floor.
 */
export function VisitTracker() {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const active = useSelectedVisit();
  return (
    <CollapsiblePanel
      testId="visit-tracker"
      className="w-full"
      headerClassName="ps-[16px] pe-[12px] pt-[12px] pb-[6px]"
      bodyClassName="grid grid-cols-[minmax(0,1fr)_248px] items-center gap-[20px] ps-[16px] pe-[16px] pb-[12px]"
      collapseLabel={t('panel.collapse')}
      expandLabel={t('panel.expand')}
      header={<Header active={active} fmt={fmt} />}
    >
      <Stepper visit={active?.visit ?? null} waiting={active?.waiting != null} fmt={fmt} />
      <Subject active={active} fmt={fmt} />
    </CollapsiblePanel>
  );
}
