import { useTranslation } from 'react-i18next';
import { MaybeValue, TONE_BAR } from '@/components/common';
import type { BayState } from '@/domain';
import { cn } from '@/lib/utils';
import { useNow1Hz } from '@/stores';
import { SectionTitle } from '../InspectorFrame';
import {
  visitTimeline,
  type TimelineSegment,
  type TimelineSegmentId,
} from '../kpiDetail/selectors';
import { SEGMENT_FILL_CLASS, SEGMENT_TONE, SEGMENT_TRACK_CLASS } from '../kpiDetail/segmentTone';
import { useFmt } from '../useFmt';
import { BayCell, BayCells } from './BayCells';

const MIN_MS = 60_000;
const SEGMENT_IDS: readonly TimelineSegmentId[] = ['preOp', 'work', 'postOp'];

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
    <BayCell label={t('timeline.eta')}>
      <span data-testid="bay-eta">
        {t('timeline.etaValue', {
          n: fmt.num(Math.round(eta)),
          clock: fmt.clock(nowMs + eta * MIN_MS),
        })}
      </span>
    </BayCell>
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
        {etaRow && <BayCells cols={2}>{etaRow}</BayCells>}
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
        className={cn(SEGMENT_TRACK_CLASS, 'mt-1 mb-1.5')}
      >
        {SEGMENT_IDS.map((id) => (
          <div
            key={id}
            data-seg={id}
            className={cn(
              SEGMENT_FILL_CLASS,
              TONE_BAR[SEGMENT_TONE[id]],
              byId.get(id)?.inProgress && 'opacity-60',
            )}
            style={{ width: `${(tl.shares?.[id] ?? 0) * 100}%` }}
          />
        ))}
      </div>
      {/* 19.9b (D2): the three phases side by side, then occupancy and ETA, so the section fits above the fold */}
      <BayCells cols={3}>
        {SEGMENT_IDS.map((id) => {
          const seg = byId.get(id);
          return (
            <BayCell key={id} label={label(id)} swatch={SEGMENT_TONE[id]}>
              <span
                data-testid={`bay-seg-${id}`}
                data-in-progress={seg?.inProgress ? 'true' : 'false'}
              >
                <MaybeValue value={seg} reason={t('timeline.notStarted')}>
                  {seg && span(seg.min, seg.inProgress)}
                </MaybeValue>
              </span>
            </BayCell>
          );
        })}
      </BayCells>
      <BayCells cols={2}>
        <BayCell label={t('timeline.occupancy')}>
          <span data-testid="bay-occupancy">{span(tl.occupancyMin, tl.occupancyInProgress)}</span>
        </BayCell>
        {etaRow}
      </BayCells>
    </section>
  );
}
