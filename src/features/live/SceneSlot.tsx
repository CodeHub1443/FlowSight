import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Full-bleed area behind the /live overlays. The interior 3D view mounts here.
 *
 * Children contract (for the main session, when it mounts <SceneRoot/> after the step-5 and step-6 merge):
 *  - Pass the scene as `children`: `<SceneSlot><SceneRoot /></SceneSlot>`. When children are given the neutral
 *    placeholder is not rendered.
 *  - The slot is `position: absolute; inset: 0` inside the /live page and has no padding, so a Canvas that fills
 *    its parent (`width/height: 100%`) fills the screen. It sits below every overlay (z-index 0) and receives pointer
 *    events anywhere the overlays do not (the overlay layer is `pointer-events: none`; only the cards take events).
 *  - The overlays leave the centre of the screen free: the shed floor is shown there.
 *  - The slot does not read uiStore selection or camera targets; the scene does (uiStore.selection / cameraTarget).
 */
export function SceneSlot({ children }: { children?: ReactNode }) {
  const { t } = useTranslation('live');
  return (
    <div data-testid="scene-slot" className="bg-scene-ground absolute inset-0 z-0 overflow-hidden">
      {children ?? (
        <div
          data-testid="scene-slot-placeholder"
          className="text-muted-foreground absolute inset-0 grid place-items-center"
          style={{
            backgroundImage:
              'linear-gradient(color-mix(in oklab, var(--scene-road) 55%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--scene-road) 55%, transparent) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        >
          <span className="bg-scene-yard/80 rounded-xl border border-dashed px-5 py-2 text-[1.05rem] font-semibold tracking-wide">
            {t('scene.placeholder')}
          </span>
        </div>
      )}
    </div>
  );
}
