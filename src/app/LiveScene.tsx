import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { BeltStatus } from '@/domain';
import { DEFAULT_SITE } from '@/features/live';
import { SceneSlotPlaceholder } from '@/features/live/SceneSlot';
import type { WebGLRenderer } from 'three';
import type { QualityTier, SceneSelection } from '@/scene';
// Direct paths (not '@/scene'): these are tiny and must not pull three.js into the entry chunk.
import { useSceneCamera } from '@/scene/camera/cameraController';
import { SCENE_SAFE_AREA } from '@/scene/camera/view';
import { AUTO_START_TIER, autoStartTier } from '@/scene/quality';
import { alertStore, liveStore, uiStore, useLiveStore, useUiStore } from '@/stores';
import { MapControls } from './MapControls';
import { bayOfSelection, flyTargetFor, type SceneTargetContext } from './sceneTarget';
import { hasWebGL } from './webgl';

// three, R3F and drei load in their own chunk, on /live only (docs/02 section 6 bundle budget).
const SceneRoot = lazy(() => import('@/scene').then((m) => ({ default: m.SceneRoot })));

const BAY_IDS: ReadonlySet<string> = new Set(
  DEFAULT_SITE.dockFaces.flatMap((f) => f.bays.map((b) => b.id)),
);

const TIERS: readonly QualityTier[] = ['high', 'med', 'low'];

/** `?quality=high|med|low` pins the tier (screenshots, a weak PC); anything else leaves it automatic. */
function qualityFromUrl(): QualityTier | undefined {
  const v = new URLSearchParams(window.location.search).get('quality');
  return TIERS.find((t) => t === v);
}

/** First automatic tier for the canvas's renderer (the same rule SceneRoot applies). */
function startTierOf(gl: WebGLRenderer): QualityTier {
  const ctx = gl.getContext();
  const info = ctx.getExtension('WEBGL_debug_renderer_info');
  return autoStartTier(info ? String(ctx.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null);
}

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
 * The /live 3D view, wired to the stores: theme and labels from uiStore, bay clicks select the bay, and
 * uiStore.cameraTarget flies the camera (bays directly; trucks, people, forklifts and events via their bay).
 * Quality follows uiStore: 'auto' (default) lets PerformanceMonitor step tiers, a tier pins it; `?quality=` wins.
 * On the Low tier `<html data-quality="low">` turns off the card backdrop blur (docs/06 section 3 fallback). In auto
 * mode that is the start tier (a software rasteriser starts at Low); later automatic steps are not reported.
 * The default framing keeps every bay inside SCENE_SAFE_AREA, clear of the KPI chips and the right column.
 * The scene itself never touches a store.
 */
export function LiveScene() {
  const camera = useSceneCamera();
  const theme = useUiStore((s) => s.theme);
  const labels = useUiStore((s) => s.labels);
  const selection = useUiStore((s) => s.selection);
  const selectedBayId = selection ? bayOfSelection(selection, targetContext()) : null;
  const setting = useUiStore((s) => s.quality);
  const [urlQuality] = useState(qualityFromUrl);
  const quality = urlQuality ?? (setting === 'auto' ? undefined : setting);
  const [autoStart, setAutoStart] = useState<QualityTier>(AUTO_START_TIER);
  const lowTier = (quality ?? autoStart) === 'low';
  const ref = useRef<HTMLDivElement>(null);
  // one string, so the scene re-renders when a belt status changes and not on every store flush
  const statusKey = useLiveStore((s) =>
    Object.values(s.bays)
      .map((b) => `${b.bay}:${b.belt.status}`)
      .join(),
  );
  const bayStatus = useMemo(
    () =>
      Object.fromEntries(
        statusKey
          .split(',')
          .filter(Boolean)
          .map((e) => e.split(':') as [string, BeltStatus]),
      ),
    [statusKey],
  );

  useEffect(() => {
    const root = document.documentElement;
    if (lowTier) root.dataset.quality = 'low';
    else delete root.dataset.quality;
    return () => {
      delete root.dataset.quality;
    };
  }, [lowTier]);

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
            safeArea={SCENE_SAFE_AREA}
            labels={labels}
            selectedBayId={selectedBayId}
            bayStatus={bayStatus}
            onSelect={selectBay}
            onReady={(gl) => {
              setAutoStart(startTierOf(gl));
              if (ref.current) ref.current.dataset.sceneReady = 'true';
            }}
          />
        </Suspense>
      </SceneBoundary>
      <MapControls />
    </div>
  );
}
