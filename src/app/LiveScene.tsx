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
import { findActor } from '@/features/live/useLiveModel';
import { SceneSlotPlaceholder } from '@/features/live/SceneSlot';
import type { ActorFeed, ActorSelection, QualityTier, SceneSelection } from '@/scene';
// Direct paths (not '@/scene'): these are tiny and must not pull three.js into the entry chunk.
import { useSceneCamera } from '@/scene/camera/cameraController';
import { SCENE_SAFE_AREA } from '@/scene/camera/view';
import { newestOpenEventForCamera } from '@/scene/glyphs/cameraGlyph';
import { AUTO_START_TIER } from '@/scene/quality';
import { QUALITY_DEBUG } from '@/scene/qualityProbe';
import {
  alertStore,
  canViewCategory,
  getActors,
  getBay,
  liveStore,
  sessionStore,
  subscribeActors,
  subscribeBay,
  subscribeCases,
  uiStore,
  useLiveStore,
  useUiStore,
  type Selection,
} from '@/stores';
import { MapControls } from './MapControls';
import { QualityBadge } from './QualityBadge';
import { installSoakProbe } from './soakProbe';
import { bayOfSelection, flyTargetFor, type SceneTargetContext } from './sceneTarget';
import { hasWebGL } from './webgl';

// three, R3F and drei load in their own chunk, on /live only (docs/02 section 6 bundle budget).
declare global {
  interface Window {
    __sceneCamera?: ReturnType<typeof useSceneCamera>;
    /** Debug builds: lets the e2e run toggle X-ray and select without a control for it. */
    __uiStore?: typeof uiStore;
  }
}

if (QUALITY_DEBUG) installSoakProbe();

const SceneRoot = lazy(() => import('@/scene').then((m) => ({ default: m.SceneRoot })));

const BAY_IDS: ReadonlySet<string> = new Set(
  DEFAULT_SITE.dockFaces.flatMap((f) => f.bays.map((b) => b.id)),
);

const TIERS: readonly QualityTier[] = ['high', 'med', 'low'];

/**
 * `?quality=high|med|low` pins the tier (screenshots, a weak PC), `?quality=auto` forces the automatic mode over a
 * uiStore pin; anything else defers to uiStore.
 */
function qualityFromUrl(): QualityTier | 'auto' | undefined {
  const v = new URLSearchParams(window.location.search).get('quality');
  return v === 'auto' ? 'auto' : TIERS.find((t) => t === v);
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

/**
 * Non-React access to live data: what the actor layer interpolates between (docs/02 section 6 rule 1). Camera health has
 * no accessor in stores/accessors.ts yet, so it is read from the liveStore here (same pattern as getBay).
 */
const ACTOR_FEED: ActorFeed = {
  getBay,
  subscribeBay,
  getActors,
  subscribeActors,
  subscribeCases,
  getCams: () => liveStore.getState().health?.cams,
  subscribeCams: (cb) =>
    liveStore.subscribe((s, prev) => {
      if (s.health !== prev.health) cb(s.health?.cams);
    }),
};

/** A click in the scene becomes a uiStore selection; the scene itself never touches a store. */
function selectFromScene(s: SceneSelection): void {
  const ui = uiStore.getState();
  switch (s.kind) {
    case 'bay':
      ui.select({ kind: 'bay', id: s.bayId });
      return;
    case 'truck':
    case 'person':
    case 'forklift':
      ui.select({ kind: s.kind, id: s.id });
      return;
    case 'camera': {
      // the camera's newest open event, or nothing (a click on a healthy camera's glyph selects nothing)
      const role = sessionStore.getState().role;
      const id = newestOpenEventForCamera(alertStore.getState().events, s.camId, (e) =>
        canViewCategory(role, e.category),
      );
      if (id) ui.select({ kind: 'event', id });
      return;
    }
  }
}

/** Whether the scene has the selected truck, person or forklift to mark (else the bay is marked, as for any selection). */
function actorInScene(sel: Selection, ctx: SceneTargetContext): boolean {
  if (sel.kind === 'truck') {
    return Object.values(ctx.bays).some(
      (b) => b.visit?.visitId === sel.id || b.queue.some((q) => q.visitId === sel.id),
    );
  }
  return findActor(ctx.actors, sel.id) !== null;
}

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
 * Quality follows uiStore: 'auto' (default) lets TierGovernor step tiers, a tier pins it; `?quality=` wins.
 * On the Low tier, pinned or automatic, `<html data-quality="low">` turns off the card backdrop blur (docs/06 section 3
 * fallback).
 * The default framing keeps every bay inside SCENE_SAFE_AREA, clear of the KPI chips and the right column.
 * The scene itself never touches a store.
 */
export function LiveScene() {
  const { t } = useTranslation('live');
  const camera = useSceneCamera();
  const theme = useUiStore((s) => s.theme);
  const labels = useUiStore((s) => s.labels);
  const selection = useUiStore((s) => s.selection);
  const xray = useUiStore((s) => s.xray);
  // a selected truck, person or forklift is marked itself; the bay is marked for everything else
  const selectedActor = useMemo<ActorSelection | null>(() => {
    if (!selection) return null;
    if (
      selection.kind !== 'truck' &&
      selection.kind !== 'person' &&
      selection.kind !== 'forklift'
    ) {
      return null;
    }
    return actorInScene(selection, targetContext())
      ? { kind: selection.kind, id: selection.id }
      : null;
  }, [selection]);
  const selectedBayId =
    selection && !selectedActor ? bayOfSelection(selection, targetContext()) : null;
  const setting = useUiStore((s) => s.quality);
  const [urlQuality] = useState(qualityFromUrl);
  const requested = urlQuality ?? setting;
  const quality = requested === 'auto' ? undefined : requested;
  const [tier, setTier] = useState<QualityTier>(AUTO_START_TIER);
  const lowTier = (quality ?? tier) === 'low';
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

  // debug builds: lets the screenshots and the e2e run fly the camera without a pointer
  useEffect(() => {
    if (QUALITY_DEBUG) window.__sceneCamera = camera;
  }, [camera]);
  useEffect(() => {
    if (QUALITY_DEBUG) window.__uiStore = uiStore;
  }, []);

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
    // Focusable so the camera keys work after Tab as well as after a click (SCENE_KEYS_SELECTOR, keyboardPan.ts). The
    // ring is on a pseudo-element, because the canvas would cover a ring drawn on this box itself.
    <div
      ref={ref}
      data-testid="scene-canvas"
      data-scene-keys=""
      role="region"
      tabIndex={0}
      aria-label={t('map.sceneRegion')}
      className="focus-visible:after:ring-ring/70 absolute inset-0 focus-visible:outline-none focus-visible:after:pointer-events-none focus-visible:after:absolute focus-visible:after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-inset"
    >
      <SceneBoundary>
        <Suspense fallback={<SceneSkeleton />}>
          <SceneRoot
            siteConfig={DEFAULT_SITE}
            theme={theme}
            quality={quality}
            onTierChange={setTier}
            safeArea={SCENE_SAFE_AREA}
            labels={labels}
            selectedBayId={selectedBayId}
            selectedActor={selectedActor}
            xray={xray}
            bayStatus={bayStatus}
            actors={ACTOR_FEED}
            onSelect={selectFromScene}
            onReady={() => {
              if (ref.current) ref.current.dataset.sceneReady = 'true';
            }}
          />
        </Suspense>
      </SceneBoundary>
      <MapControls />
      {QUALITY_DEBUG && <QualityBadge tier={quality ?? tier} />}
    </div>
  );
}
