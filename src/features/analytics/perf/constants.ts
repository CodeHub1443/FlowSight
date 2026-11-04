import type { Tone } from '@/components/common';

// The one place for the Performance tab's display constants (docs/tasks/t20-spec.md section 2).

/** The index every bay is compared with: 100 = typical for this depot's comparable trucks (docs/03 section 4.4, definition 8). */
export const INDEX_CENTER = 100;
/** Display band, inclusive: 90 to 110 reads "comparable"; under is "slower", over is "faster". */
export const INDEX_BAND = { low: 90, high: 110 } as const;
/** Included visits for an OK index; the response's own `minIncluded` wins when present. */
export const MIN_INCLUDED_DEFAULT = 8;
/** Below this many included visits the backend sends no index (confidence NONE). */
export const LOW_CONFIDENCE_MIN = 4;

export type IndexBand = 'slower' | 'comparable' | 'faster';

/**
 * Tones for the bands: attention for slower, calm for the rest. No red/green shouting (spec section 2): "faster" is
 * informational, not a reward colour.
 */
export const INDEX_BAND_TONE: Readonly<Record<IndexBand, Tone>> = {
  slower: 'warn',
  comparable: 'neutral',
  faster: 'info',
};
