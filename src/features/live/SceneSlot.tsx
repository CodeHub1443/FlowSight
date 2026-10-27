import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Full-bleed area behind the /live overlays. The interior 3D view mounts here.
 *
 * Children contract:
 *  - Pass the scene as `children`: `<SceneSlot><SceneRoot /></SceneSlot>`. When children are given the neutral
 *    placeholder is not rendered (a child can render <SceneSlotPlaceholder/> itself, e.g. without WebGL).
 *  - The slot is `position: absolute; inset: 0` inside the /live page and has no padding, so a Canvas that fills
 *    its parent (`width/height: 100%`) fills the screen. It sits below every overlay (z-index 0) and receives pointer
 *    events anywhere the overlays do not (the overlay layer is `pointer-events: none`; only the cards take events).
 *  - The overlays leave the centre of the screen free: the shed floor is shown there.
 *  - The slot does not read uiStore selection or camera targets; the app-level scene adapter does
 *    (src/app/LiveScene.tsx), so neither this feature nor src/scene touches the other's stores.
 */
export function SceneSlot({ children }: { children?: ReactNode }) {
  return (
    <div data-testid="scene-slot" className="bg-scene-ground absolute inset-0 z-0 overflow-hidden">
      {children ?? <SceneSlotPlaceholder />}
    </div>
  );
}

/** Neutral grid with a label, shown when no scene is mounted. */
export function SceneSlotPlaceholder() {
  const { t } = useTranslation('live');
  return (
    <div
      data-testid="scene-slot-placeholder"
      className="text-muted-foreground absolute inset-0 grid place-items-center"
      style={{
        backgroundImage:
          'linear-gradient(color-mix(in oklab, var(--scene-road) 55%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--scene-road) 55%, transparent) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }}
    >
      <span className="card-surface text-ink-600 px-5 py-2 text-[14px] font-medium">
        {t('scene.placeholder')}
      </span>
    </div>
  );
}
