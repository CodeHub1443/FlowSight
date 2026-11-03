import { useTranslation } from 'react-i18next';
import {
  KeyValue,
  KeyValueList,
  MaybeValue,
  TONE_BAR,
  TONE_DOT,
  type Tone,
} from '@/components/common';
import type { BayState } from '@/domain';
import { cn } from '@/lib/utils';
import { useNow1Hz } from '@/stores';
import { SectionTitle } from '../InspectorFrame';
import {
  visitTimeline,
  type TimelineSegment,
  type TimelineSegmentId,
} from '../kpiDetail/selectors';
import { useFmt } from '../useFmt';

const MIN_MS = 60_000;
const SEGMENT_IDS: readonly TimelineSegmentId[] = ['preOp', 'work', 'postOp'];

/** Delays read as warnings, the physical work as ok, the wait after work as neutral. */
const SEGMENT_TONE: Record<TimelineSegmentId, Tone> = {
  preOp: 'warn',
  work: 'ok',
  postOp: 'neutral',
};

/**
 * Section 1 of the bay inspector (T19 spec 5B): pre-op / loading|unloading / post-op as a proportional bar with a
 * duration per phase and the bay occupancy. The running phase is "so far" and ticks with the shared 1 Hz stream
 * clock (`useNow1Hz`); no timer of its own, no per-frame state.
 */
export function BayTimeline({ bay }: { bay: BayState }) {
  const { t } = useTranslation('baypanel');
  const fmt = useFmt();
  const nowMs = useNow1Hz();
  const { visit } = bay;

  if (!visit) {
    return (
      <section data-testid="bay-timeline">
        <SectionTitle>{t('timeline.title')}</SectionTitle>
        <p data-testid="bay-timeline-empty" className="text-ink-400 py-2 text-[13px] leading-5">
          {t('timeline.empty')}
        </p>
      </section>
    );
  }

  const tl = visitTimeline(visit, nowMs, bay.belt.direction);
  const byId = new Map<TimelineSegmentId, TimelineSegment>(tl.segments.map((s) => [s.id, s]));
  const label = (id: TimelineSegmentId) => t(`timeline.${id === 'work' ? tl.work : id}`);
  // A running span is an elapsed counter: floor it ("12m so far" until the 13th minute). A closed span is rounded.
  const span = (min: number, inProgress: boolean) =>
    inProgress ? t('timeline.soFar', { dur: fmt.durHM(Math.floor(min)) }) : fmt.durHM(min);
  const eta = visit.etaMin;
  const etaRow = eta !== null && (
    <KeyValue label={t('timeline.eta')}>
      <span data-testid="bay-eta">
        {t('timeline.etaValue', {
          n: fmt.num(Math.round(eta)),
          clock: fmt.clock(nowMs + eta * MIN_MS),
        })}
      </span>
    </KeyValue>
  );

  if (tl.occupancyMin === null) {
    return (
      <section data-testid="bay-timeline" data-work={tl.work}>
        <SectionTitle>{t('timeline.title')}</SectionTitle>
        <p
          data-testid="bay-timeline-not-docked"
          className="text-ink-400 py-2 text-[13px] leading-5"
        >
          {t('timeline.notDocked')}
        </p>
        {etaRow && <KeyValueList>{etaRow}</KeyValueList>}
      </section>
    );
  }

  return (
    <section data-testid="bay-timeline" data-work={tl.work}>
      <SectionTitle>{t('timeline.title')}</SectionTitle>
      {/* Always three segments in the same order: widths glide, nothing mounts or unmounts per tick. */}
      <div
        data-testid="bay-timeline-bar"
        role="img"
        aria-label={t('timeline.barLabel')}
        className="bg-track mt-1 mb-1.5 flex h-[8px] w-full gap-px overflow-hidden rounded-full"
      >
        {SEGMENT_IDS.map((id) => (
          <div
            key={id}
            data-seg={id}
            className={cn(
              'ease-soft h-full transition-[width] duration-300',
              TONE_BAR[SEGMENT_TONE[id]],
              byId.get(id)?.inProgress && 'opacity-60',
            )}
            style={{ width: `${(tl.shares?.[id] ?? 0) * 100}%` }}
          />
        ))}
      </div>
      <KeyValueList>
        {SEGMENT_IDS.map((id) => {
          const seg = byId.get(id);
          return (
            <KeyValue
              key={id}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn('size-2 shrink-0 rounded-full', TONE_DOT[SEGMENT_TONE[id]])}
                  />
                  {label(id)}
                </span>
              }
            >
              <span
                data-testid={`bay-seg-${id}`}
                data-in-progress={seg?.inProgress ? 'true' : 'false'}
              >
                <MaybeValue value={seg} reason={t('timeline.notStarted')}>
                  {seg && span(seg.min, seg.inProgress)}
                </MaybeValue>
              </span>
            </KeyValue>
          );
        })}
        <KeyValue label={t('timeline.occupancy')}>
          <span data-testid="bay-occupancy">{span(tl.occupancyMin, tl.occupancyInProgress)}</span>
        </KeyValue>
        {etaRow}
      </KeyValueList>
    </section>
  );
}
