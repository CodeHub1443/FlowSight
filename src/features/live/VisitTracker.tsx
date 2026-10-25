import { Check, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CollapsiblePanel, SmallCaps, StatusPill, TONE_DOT } from '@/components/common';
import type { BayVisit } from '@/domain';
import { formatPlate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dwellSec, trackerSteps, visitCount, type ActiveVisit, type TrackerStep } from './model';
import { bayLabel } from './siteInfo';
import { PHASE_TONE } from './tones';
import { useFmt, type Fmt } from './useFmt';
import { useSelectedVisit, useStreamNow } from './useLiveModel';

function stepLabel(
  step: TrackerStep,
  visit: BayVisit,
  fmt: Fmt,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (step.key === 'waiting') return t('queue.waiting');
  if (step.key !== 'loading') return t(`tracker.steps.${step.key}`);
  const unloading = visit.phase === 'UNLOADING';
  return t(unloading ? 'tracker.unloadingCount' : 'tracker.loadingCount', {
    n: fmt.num(visitCount(visit)),
    expected: visit.expected === null ? '—' : fmt.num(visit.expected),
  });
}

function Stepper({ visit, waiting, fmt }: { visit: BayVisit; waiting: boolean; fmt: Fmt }) {
  const { t } = useTranslation('live');
  const steps = trackerSteps(visit, waiting);
  return (
    <ol className="relative grid grid-cols-5" data-testid="tracker-steps">
      {steps.map((step, i) => (
        <li
          key={step.key}
          data-testid={`tracker-step-${step.key}`}
          data-state={step.state}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className="relative flex min-w-0 flex-col items-center gap-1 px-0.5 text-center"
        >
          {i > 0 && (
            <span
              aria-hidden
              className={cn(
                'absolute top-[1.05rem] right-1/2 h-0.5 w-full -translate-y-1/2',
                step.state === 'pending' ? 'bg-border' : TONE_DOT.info,
              )}
            />
          )}
          <span
            className={cn(
              'relative z-10 grid size-[2.1rem] place-items-center rounded-full border-2',
              step.state === 'pending' && 'bg-card border-border text-muted-foreground',
              step.state === 'done' && 'bg-status-info border-status-info text-white',
              step.state === 'current' &&
                'bg-card border-status-info text-status-info ring-status-info/25 ring-4',
            )}
          >
            {step.state === 'done' ? (
              <Check className="size-4" />
            ) : (
              <span className="font-semibold tabular-nums">{fmt.num(i + 1)}</span>
            )}
          </span>
          <span
            className={cn(
              'w-full truncate leading-4 font-semibold',
              step.state === 'pending' && 'text-muted-foreground',
            )}
          >
            {stepLabel(step, visit, fmt, t)}
          </span>
          <span className="text-muted-foreground text-[0.85rem] leading-4 tabular-nums">
            {step.at ? fmt.clock(step.at) : '—'}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Header({ active, fmt }: { active: ActiveVisit | null; fmt: Fmt }) {
  const { t } = useTranslation('live');
  const now = useStreamNow();
  if (!active) return <span className="font-semibold">{t('tracker.title')}</span>;
  const { visit, bay } = active;
  const plate = formatPlate(visit.plate);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
      <span className="flex items-center gap-2 font-semibold">
        <Truck className="text-primary size-4 shrink-0" aria-hidden />
        {t('tracker.title')}
      </span>
      <span className="text-muted-foreground truncate text-[0.9rem]" data-testid="tracker-subject">
        {plate.primary}
        {plate.secondary ? ` · ${plate.secondary}` : ''} · {bayLabel(bay, fmt.lang)}
      </span>
      <span
        className="ms-auto flex items-center gap-1.5 text-[0.9rem] whitespace-nowrap"
        data-testid="tracker-dwell"
      >
        <SmallCaps>{t('tracker.dwell')}</SmallCaps>
        <span className="font-semibold tabular-nums">{fmt.dur(dwellSec(visit, now))}</span>
      </span>
    </div>
  );
}

/**
 * Bottom-left visit tracker: Arrived -> Docked -> Loading n/expected -> Finished -> Departed for the selected visit.
 * A truck queued on the apron starts at "Waiting" (with its holding slot) instead of "Arrived".
 */
export function VisitTracker() {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const active = useSelectedVisit();
  const visit = active?.visit ?? null;
  const waiting = active?.waiting ?? null;

  return (
    <CollapsiblePanel
      testId="visit-tracker"
      className="w-full"
      bodyClassName="px-3 pb-3"
      collapseLabel={t('panel.collapse')}
      expandLabel={t('panel.expand')}
      header={<Header active={active} fmt={fmt} />}
    >
      {visit ? (
        <div className="flex flex-col gap-2.5">
          <Stepper visit={visit} waiting={waiting !== null} fmt={fmt} />
          <div className="bg-muted/60 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-1.5">
            {waiting ? (
              <StatusPill tone="neutral">{t('queue.waiting')}</StatusPill>
            ) : (
              <StatusPill tone={PHASE_TONE[visit.phase]}>{t(`phase.${visit.phase}`)}</StatusPill>
            )}
            <span className="text-muted-foreground text-[0.9rem]" data-testid="tracker-info">
              {waiting
                ? waiting.slot === null
                  ? t('queue.noSlot')
                  : t('queue.slot', { n: fmt.num(waiting.slot) })
                : visit.agency
                  ? visit.agency[fmt.lang] || visit.agency.en
                  : t('tracker.noAgency')}
            </span>
            <span className="text-[0.9rem] font-medium tabular-nums">
              {visit.etaMin === null
                ? t('tracker.etaUnknown')
                : t('tracker.etaLeft', { n: fmt.num(visit.etaMin) })}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground py-3 text-center" data-testid="tracker-empty">
          {t('tracker.empty')}
        </p>
      )}
    </CollapsiblePanel>
  );
}
