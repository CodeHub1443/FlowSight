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
 * Layout contract with the 3D view, which keeps its subject out of { top: 112, right: 384, bottom: 24, left: 24 } px:
 *  - KPI chips top-left, one row, at most 112 px including the 16 px margin;
 *  - inspector over tray in a 360 px right column, 24 px from the edge (360 + 24 = 384);
 *  - visit tracker bottom-left, at most 140 px tall and collapsible; it may overlap the floor.
 * The right column shrinks the inspector (it scrolls) before it would touch the tray.
 */
export function LivePage({ scene }: { scene?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden" data-testid="live-page">
      <SceneSlot>{scene}</SceneSlot>
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute start-[24px] end-[408px] top-[16px]">
          <KpiChips />
        </div>
        <div className="absolute end-[24px] top-[16px] bottom-[24px] flex w-[360px] flex-col gap-[12px]">
          <div className="flex min-h-0 flex-1 flex-col">
            <Inspector />
          </div>
          <Tray />
        </div>
        <div className="absolute start-[24px] bottom-[24px] w-[min(820px,calc(100%-432px))]">
          <VisitTracker />
        </div>
        <div className="text-ink-400 absolute end-[24px] bottom-[4px] w-[360px] text-center text-[11px] leading-4 opacity-80">
          {t('app.developedBy')}
        </div>
      </div>
    </div>
  );
}
