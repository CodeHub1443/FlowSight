import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QualityTier } from '@/scene';
import { qualityProbe } from '@/scene/qualityProbe';

const REFRESH_MS = 500;

/** Dev-only tier readout on /live: rendered behind QUALITY_DEBUG, so a production build does not contain it. */
export function QualityBadge({ tier }: { tier: QualityTier }) {
  const { t } = useTranslation();
  const [{ state, fps }, setReading] = useState({
    state: qualityProbe.state,
    fps: qualityProbe.fps,
  });
  useEffect(() => {
    const id = setInterval(
      () => setReading({ state: qualityProbe.state, fps: qualityProbe.fps }),
      REFRESH_MS,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <div
      data-testid="quality-badge"
      data-tier={tier}
      data-state={state}
      className="bg-card text-card-foreground pointer-events-none fixed bottom-1 left-1/2 z-50 -translate-x-1/2 rounded border px-2 text-xs tabular-nums"
    >
      {t('debug.quality', { tier, state, fps: fps === null ? '-' : Math.round(fps) })}
    </div>
  );
}
