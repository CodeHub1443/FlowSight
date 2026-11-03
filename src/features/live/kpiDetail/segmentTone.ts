import type { Tone } from '@/components/common';
import type { TimelineSegmentId } from './selectors';

/**
 * One tone mapping for every pre-op / work / post-op bar (T19.9 seam fix): the KPI turnaround popover and the bay
 * inspector truck timeline. Delays read as warnings, the physical work (loading or unloading) as ok, the wait after
 * the work as neutral. Tokens only (docs/06).
 */
export const SEGMENT_TONE: Readonly<Record<TimelineSegmentId, Tone>> = {
  preOp: 'warn',
  work: 'ok',
  postOp: 'neutral',
};

/** Track of every phase bar (19.9b, decision D5): 8 px, full radius, `--track`, 1 px gaps between segments. */
export const SEGMENT_TRACK_CLASS = 'bg-track flex h-2 w-full gap-px overflow-hidden rounded-full';

/** One segment of a phase bar (fill: `TONE_BAR[SEGMENT_TONE[id]]`); widths glide when the shares change. */
export const SEGMENT_FILL_CLASS = 'ease-soft h-full transition-[width] duration-300';
