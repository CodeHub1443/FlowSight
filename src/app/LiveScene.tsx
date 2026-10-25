import { Component, lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_SITE } from '@/features/live';
import { SceneSlotPlaceholder } from '@/features/live/SceneSlot';
import type { SceneSelection } from '@/scene';
// Direct path (not '@/scene'): the controller is tiny and must not pull three.js into the entry chunk.
import { useSceneCamera } from '@/scene/camera/cameraController';
import { alertStore, liveStore, uiStore, useUiStore } from '@/stores';
import { bayOfSelection, flyTargetFor, type SceneTargetContext } from './sceneTarget';
import { hasWebGL } from './webgl';

// three, R3F and drei load in their own chunk, on /live only (docs/02 section 6 bundle budget).
const SceneRoot = lazy(() => import('@/scene').then((m) => ({ default: m.SceneRoot })));

const BAY_IDS: ReadonlySet<string> = new Set(
  DEFAULT_SITE.dockFaces.flatMap((f) => f.bays.map((b) => b.id)),
);

function targetContext(): SceneTargetContext {
  const live = liveStore.getState();
  return {
    bayIds: BAY_IDS,
    bays: live.bays,
    visits: live.visits,
    actors: live.actors,
    events: alertStore.getState().events,
  };
}

const selectBay = (s: SceneSelection) => uiStore.getState().select({ kind: 'bay', id: s.bayId });

/** Falls back to the placeholder if the scene chunk fails to load or WebGL fails at runtime. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <SceneSlotPlaceholder /> : this.props.children;
  }
}

function SceneSkeleton() {
  const { t } = useTranslation('live');
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('scene.placeholder')}
      data-testid="scene-skeleton"
      className="bg-scene-void absolute inset-0 animate-pulse"
    />
  );
}

/**
 * The /live 3D view, wired to the stores: theme and quality from uiStore, bay clicks select the bay, and
 * uiStore.cameraTarget flies the camera (bays directly; trucks, people, forklifts and events via their bay).
 * The scene itself never touches a store.
 */
export function LiveScene() {
  const camera = useSceneCamera();
  const theme = useUiStore((s) => s.theme);
  const quality = useUiStore((s) => s.quality);
  const selection = useUiStore((s) => s.selection);
  const selectedBayId = selection ? bayOfSelection(selection, targetContext()) : null;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      uiStore.subscribe((s, prev) => {
        const target = s.cameraTarget;
        if (!target || target === prev.cameraTarget) return;
        const fly = flyTargetFor(target, targetContext());
        if (fly) camera.flyTo(fly);
      }),
    [camera],
  );

  if (!hasWebGL()) return <SceneSlotPlaceholder />;
  return (
    <div ref={ref} data-testid="scene-canvas" className="absolute inset-0">
      <SceneBoundary>
        <Suspense fallback={<SceneSkeleton />}>
          <SceneRoot
            siteConfig={DEFAULT_SITE}
            theme={theme}
            quality={quality}
            selectedBayId={selectedBayId}
            onSelect={selectBay}
            onReady={() => {
              if (ref.current) ref.current.dataset.sceneReady = 'true';
            }}
          />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
