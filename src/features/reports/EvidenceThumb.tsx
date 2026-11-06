import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaUrl } from '@/data/api/eventQueries';
import type { WhEventWithStatus } from '@/domain';
import { bboxPercent } from '@/features/events/evidenceBox';
import { cn } from '@/lib/utils';

type Media = NonNullable<WhEventWithStatus['media']>;

/**
 * Snapshot thumbnail with the detection box, for the printed evidence section.
 *
 * Built here instead of reusing EvidenceImage because the print button must know when every picture has loaded or failed,
 * and EvidenceImage does not report that. It reuses the same data hook (`useMediaUrl`) and box maths (`bboxPercent`).
 * `onSettled(id)` fires once the picture has loaded, or has failed (presign error or image error).
 */
export function EvidenceThumb({
  eventId,
  media,
  title,
  onSettled,
}: {
  eventId: string;
  media: Media;
  title: string;
  onSettled: (eventId: string) => void;
}) {
  const { t } = useTranslation('reports');
  const url = useMediaUrl(media.snapshotKey);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = url.data?.url ?? null;
  const failed = url.isError || (src !== null && failedUrl === src);
  const loaded = src !== null && !failed;
  const [imgLoaded, setImgLoaded] = useState<string | null>(null);
  const settled = failed || (loaded && imgLoaded === src);

  useEffect(() => {
    if (settled) onSettled(eventId);
  }, [settled, onSettled, eventId]);

  const frame = cn(
    'bg-muted border-hairline relative grid w-full place-items-center overflow-hidden rounded-[8px] border',
  );
  const style = { aspectRatio: `${media.frameW} / ${media.frameH}` };
  const box = bboxPercent(media);

  if (failed) {
    return (
      <div data-testid="report-thumb" data-state="error" className={frame} style={style}>
        <span className="text-ink-600 rp-muted flex items-center gap-1 px-1 text-center text-[11px]">
          <ImageOff className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          {t('evidence.unavailable')}
        </span>
      </div>
    );
  }
  if (src === null) {
    return (
      <div
        data-testid="report-thumb"
        data-state="loading"
        className={cn(frame, 'animate-pulse')}
        style={style}
        role="status"
        aria-label={t('evidence.loading')}
      />
    );
  }
  return (
    <div
      data-testid="report-thumb"
      data-state={imgLoaded === src ? 'ready' : 'loading'}
      className={frame}
      style={style}
    >
      <img
        src={src}
        alt={t('evidence.alt', { title })}
        className="absolute inset-0 size-full object-contain"
        draggable={false}
        onLoad={() => setImgLoaded(src)}
        onError={() => setFailedUrl(src)}
      />
      <span
        data-bbox=""
        data-testid="report-thumb-box"
        aria-hidden
        className="border-critical absolute rounded-[3px] border-2"
        style={box}
      />
    </div>
  );
}
