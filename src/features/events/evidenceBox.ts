import type { WhEventWithStatus } from '@/domain';

type Media = NonNullable<WhEventWithStatus['media']>;

export interface BoxPercent {
  left: string;
  top: string;
  width: string;
  height: string;
}

const pct = (v: number, of: number): string => `${Math.min(100, Math.max(0, (v / of) * 100))}%`;

/** [x, y, w, h] in source-frame pixels -> CSS percentages of the frame, so the box follows any display size. */
export function bboxPercent(media: Pick<Media, 'bbox' | 'frameW' | 'frameH'>): BoxPercent {
  const [x, y, w, h] = media.bbox;
  return {
    left: pct(x, media.frameW),
    top: pct(y, media.frameH),
    width: pct(w, media.frameW),
    height: pct(h, media.frameH),
  };
}
