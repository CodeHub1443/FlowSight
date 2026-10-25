import { useTranslation } from 'react-i18next';
import { Inspector } from './Inspector';
import { KpiChips } from './KpiChips';
import { SceneSlot } from './SceneSlot';
import { Tray } from './Tray';
import { VisitTracker } from './VisitTracker';

/**
 * /live: a full-bleed scene slot with floating 2D chrome on top (docs/01 section 3.1).
 * The overlay layer ignores pointer events; each card opts back in, so the 3D view stays interactive
 * everywhere else. The middle of the screen is deliberately empty.
 *
 * Layout: KPI chips top-left, inspector top-right, tray bottom-right, visit tracker bottom-left.
 * The right column shrinks the inspector (it scrolls) before it would touch the tray.
 */
export function LivePage({ scene }: { scene?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden" data-testid="live-page">
      <SceneSlot>{scene}</SceneSlot>
      <div className="pointer-events-none absolute inset-0 z-10 p-3">
        <div className="absolute start-3 top-3 end-[27rem]">
          <KpiChips />
        </div>
        <div className="absolute end-3 top-3 bottom-3 flex w-[25.5rem] flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col">
            <Inspector />
          </div>
          <Tray />
        </div>
        <div className="absolute start-3 bottom-3 w-[min(46rem,calc(100%-31rem))]">
          <VisitTracker />
        </div>
        <div className="text-muted-foreground absolute start-1/2 bottom-1 -translate-x-1/2 text-[0.75rem] opacity-70">
          {t('app.developedBy')}
        </div>
      </div>
    </div>
  );
}
