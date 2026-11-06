import '@/i18n/events';
import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaUrl } from '@/data/api/eventQueries';
import type { WhEventWithStatus } from '@/domain';
import { cn } from '@/lib/utils';
import { bboxPercent } from './evidenceBox';

type Media = NonNullable<WhEventWithStatus['media']>;

export interface EvidenceImageProps {
  /** `event.media`; null = the event has no evidence. */
  media: Media | null | undefined;
  /** Accessible description of the picture (default: a generic snapshot label). */
  alt?: string;
  /** Draw the detection box (default true). */
  showBox?: boolean;
  className?: string;
  testId?: string;
}

/**
 * Snapshot of an event from a presigned URL, with the detection box drawn over it in percent of the frame.
 * Four states: loading skeleton, error with retry, no media, and the image. The frame keeps the source aspect ratio in all of
 * them, so nothing shifts when the picture arrives.
 */
export function EvidenceImage({
  media,
  alt,
  showBox = true,
  className,
  testId = 'evidence-image',
}: EvidenceImageProps) {
  const { t } = useTranslation('events');
  const url = useMediaUrl(media?.snapshotKey);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const frame = cn(
    'bg-muted border-hairline relative grid w-full place-items-center overflow-hidden rounded-[12px] border',
    className,
  );
  const style = { aspectRatio: media ? `${media.frameW} / ${media.frameH}` : '16 / 9' };

  if (!media) {
    return (
      <div data-testid={testId} data-state="no-media" className={frame} style={style}>
        <span className="text-ink-400 flex items-center gap-1.5 text-[12px]">
          <ImageOff className="size-4" strokeWidth={1.75} aria-hidden />
          {t('evidence.noMedia')}
        </span>
      </div>
    );
  }

  const src = url.data?.url ?? null;
  const failed = url.isError || (src !== null && failedUrl === src);
  if (failed) {
    return (
      <div data-testid={testId} data-state="error" className={frame} style={style} role="alert">
        <div className="text-ink-600 flex flex-col items-center gap-2 text-[12px]">
          <span>{t('evidence.error')}</span>
          <button
            type="button"
            data-testid={`${testId}-retry`}
            className="text-primary underline"
            onClick={() => {
              setFailedUrl(null);
              void url.refetch();
            }}
          >
            {t('evidence.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (src === null) {
    return (
      <div
        data-testid={testId}
        data-state="loading"
        className={cn(frame, 'animate-pulse')}
        style={style}
        role="status"
        aria-label={t('evidence.loading')}
      />
    );
  }

  const box = showBox ? bboxPercent(media) : null;
  return (
    <div data-testid={testId} data-state="ready" className={frame} style={style}>
      <img
        src={src}
        alt={alt ?? t('evidence.alt')}
        className="absolute inset-0 size-full object-contain"
        draggable={false}
        onError={() => setFailedUrl(src)}
      />
      {box && (
        <span
          data-testid={`${testId}-box`}
          role="img"
          aria-label={t('evidence.box')}
          className="border-critical absolute rounded-[4px] border-2"
          style={box}
        />
      )}
    </div>
  );
}
