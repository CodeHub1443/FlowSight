import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Color, SRGBColorSpace, type Scene, type WebGLRenderer } from 'three';
import type { BeltStatus, SiteConfig } from '@/domain';
import { ActorsLayer } from './actors/ActorsLayer';
import { maxTrucks } from './actors/actorRig';
import type { ActorFeed } from './actors/feed';
import { TruckPlates, type PlateElements } from './actors/TruckPlates';
import { preloadLiveModels } from './assets/loader';
import { AutoQuality } from './AutoQuality';
import { Bay } from './bay/Bay';
import { BayAnimRegistry, boomReach } from './bay/bayAnim';
import { Shed } from './building/Shed';
import { CameraRig } from './camera/CameraRig';
import { CAMERA_FOV, NO_SAFE_AREA, type SafeArea } from './camera/view';
import { GlyphBoard } from './glyphs/cameraGlyph';
import { CameraGlyphs } from './glyphs/CameraGlyphs';
import type { ActorSelection, SceneSelection } from './interaction/types';
import { bayPillAnchor, selectionPillAnchor } from './labels/anchors';
import type { ActorLabelStrings } from './labels/actorLabel';
import { PillLayer, PillProjector, SELECTION_KEY, type PillElements } from './labels/Pills';
import { EventPin } from './labels/EventPin';
import {
  createMaterials,
  disposeMaterials,
  hexAlpha,
  paletteFor,
  type SceneTheme,
} from './materials';
import { AUTO_START_TIER, autoStartTier, QUALITY, type QualityTier } from './quality';
import { QUALITY_DEBUG, qualityProbe } from './qualityProbe';
import { SceneLights } from './SceneLights';
import { ScenePost } from './ScenePost';
import { SceneEnvContext, type SceneEnv } from './sceneEnv';
import {
  DARK_TONE_MAPPING,
  SCENE_TONE_MAPPING,
  THREE_TONE_MAPPING,
  unlitColor,
  type SceneToneMapping,
} from './toneMapping';
import { ExteriorContext } from './site/ExteriorContext';
import { FaceContents } from './site/FaceContents';
import { buildSiteLayout, type SiteLayout } from './site/layout';
import { applySoftShadows } from './softShadows';
import { useReleaseOnUnmount } from './useReleaseOnUnmount';
import { useRenderPixelRatio } from './useRenderPixelRatio';

// 16-tap PCF for the key light (docs/06 section 2 soft shadow without grain); before any material compiles
applySoftShadows();

export type { SceneSelection } from './interaction/types';

/**
 * Distance fog into the void (docs/06 section 7.3: D7 and section 8.3 moved out, because the hero camera stands 75-105 m
 * from the bays and the specified 60-140 m washed the near props out). The apron and the far floor still fade.
 */
const FOG = { light: [85, 170], dark: [75, 150] } as const;
/** Light-theme vignette (docs/06 D7): clear up to the 0.35 offset, tinted towards the corners. */
const VIGNETTE_ALPHA = 0.7;

export interface SceneRootProps {
  siteConfig: SiteConfig;
  /** Fixed quality tier. When omitted the tier is automatic: it starts at Med and TierGovernor steps it. */
  quality?: QualityTier;
  /** Called with the tier in force, on mount and whenever it changes, pinned or automatic. */
  onTierChange?: (tier: QualityTier) => void;
  theme?: SceneTheme;
  /** Screen insets covered by overlays; the default framing keeps every bay inside the rest (docs/06 section 2). */
  safeArea?: Readonly<SafeArea>;
  /** Bay number pills on the dock wall band (uiStore `labels`). */
  labels?: boolean;
  /**
   * Called when a bay (floor, belt, staging, ...), a truck, a person, a forklift or a camera glyph is clicked. The scene
   * never writes to a store.
   */
  onSelect?: (selection: SceneSelection) => void;
  /** Bay whose floor ring and pill are drawn as selected. */
  selectedBayId?: string | null;
  /** The selected truck (visit id), person or forklift (track id): a floor ring and a pill follow it. */
  selectedActor?: ActorSelection | null;
  /** X-ray mode: the camera glyphs show whatever their health (otherwise only the ones that need attention). */
  xray?: boolean;
  /** Shutter state of a bay before a live feed drives it (default: open); a feed opens and closes it with the trucks. */
  doorOpen?: (bayId: string) => boolean;
  /** Belt status per bay id (default NO_TRUCK): work lights and status colours of the dark theme. */
  bayStatus?: Readonly<Record<string, BeltStatus>>;
  /** Live trucks, people, forklifts and belt items (docs/04 sections 3 and 4). Without it the shed stands empty. */
  actors?: ActorFeed;
  /** Event pins (docs/06 D9): three.js world positions of the pin bases. Bound to live events in step 9. */
  pins?: readonly { id: string; at: readonly [number, number, number] }[];
  /** Tone mapping (read once when the canvas is created). Default SCENE_TONE_MAPPING; the dev preview A/B tests it. */
  toneMapping?: SceneToneMapping;
  /** Dev hook: receives the renderer once the canvas is created (stats, screenshots). */
  onReady?: (gl: WebGLRenderer, scene: Scene) => void;
}

function applyToneMapping(gl: WebGLRenderer, mapping: SceneToneMapping): void {
  gl.toneMapping = THREE_TONE_MAPPING[mapping];
}

/** Keeps the renderer's own curve in step with the theme on the tier without post (the composer owns it otherwise). */
function RendererToneMapping({ mapping, active }: { mapping: SceneToneMapping; active: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (active) applyToneMapping(gl, mapping);
  }, [gl, mapping, active]);
  return null;
}

/** One BayAnim per bay, each with the reach its boom may run out to; `doorOpen` gives the shutters' starting state. */
function buildAnim(layout: SiteLayout, doorOpen?: (bayId: string) => boolean): BayAnimRegistry {
  const registry = new BayAnimRegistry(
    layout.bays.map((b) => b.id),
    (id) => doorOpen?.(id) ?? true,
  );
  for (const b of layout.bays) {
    const a = registry.get(b.id);
    if (a) a.reach = boomReach(b.conveyor.boomMaxReach);
  }
  return registry;
}

/** The 3D shed interior (roofless cutaway "dollhouse"), fully built from `siteConfig`. Fills its parent. */
export function SceneRoot({
  siteConfig,
  quality,
  onTierChange,
  theme = 'light',
  safeArea = NO_SAFE_AREA,
  labels = true,
  onSelect,
  selectedBayId = null,
  selectedActor = null,
  xray = false,
  doorOpen,
  bayStatus,
  actors,
  pins,
  toneMapping: lightToneMapping = SCENE_TONE_MAPPING,
  onReady,
}: SceneRootProps) {
  const toneMapping = theme === 'dark' ? DARK_TONE_MAPPING : lightToneMapping;
  const layout = useMemo(() => buildSiteLayout(siteConfig), [siteConfig]);
  const palette = paletteFor(theme);
  const materials = useMemo(() => createMaterials(palette, theme), [palette, theme]);
  useEffect(() => () => disposeMaterials(materials), [materials]);

  const [autoTier, setAutoTier] = useState<QualityTier>(AUTO_START_TIER);
  const tier = quality ?? autoTier;
  const settings = QUALITY[tier];
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const pixelRatio = useRenderPixelRatio(frame, settings);
  // before the first frame, so the props are usually there when the bays mount; Low never downloads them
  if (tier !== 'low') preloadLiveModels();
  useEffect(() => onTierChange?.(tier), [tier, onTierChange]);
  useEffect(
    () => () => {
      if (QUALITY_DEBUG) qualityProbe.renderer = null;
    },
    [],
  );
  // shared materials, geometries and textures keep a dead renderer and its DOM alive unless released (Task 21)
  const createdRef = useReleaseOnUnmount();

  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  const { i18n, t } = useTranslation('scene');
  const lang = i18n.language === 'bn' ? 'bn' : 'en';
  // the words of the selected actor's pill; a new object only when the language changes
  const labelStrings = useMemo<ActorLabelStrings>(
    () => ({
      lang,
      captain: t('actor.captain'),
      worker: t('actor.worker'),
      person: t('actor.person'),
      forklift: t('actor.forklift'),
      phase: {
        ARRIVED: t('actor.phase.ARRIVED'),
        DOCKED: t('actor.phase.DOCKED'),
        LOADING: t('actor.phase.LOADING'),
        UNLOADING: t('actor.phase.UNLOADING'),
        FINISHED: t('actor.phase.FINISHED'),
        DEPARTED: t('actor.phase.DEPARTED'),
      },
    }),
    [t, lang],
  );
  // boom, belt surface and shutter of each bay (stepped by the actor layer), and the camera glyph states
  const [animFor, setAnimFor] = useState(() => ({ layout, registry: buildAnim(layout, doorOpen) }));
  let anim = animFor.registry;
  if (animFor.layout !== layout) {
    anim = buildAnim(layout, doorOpen);
    setAnimFor({ layout, registry: anim });
  }
  const glyphBoard = useMemo(() => new GlyphBoard(), []);
  const pillElements = useRef<PillElements>(new Map());
  const plateElements = useRef<PlateElements>(new Map());
  // the selection pill keeps showing the last selected bay while it fades out
  const [shownBayId, setShownBayId] = useState(selectedBayId);
  if (selectedBayId && selectedBayId !== shownBayId) setShownBayId(selectedBayId);
  const pillBays = useMemo(() => layout.bays.map((b) => ({ id: b.id })), [layout]);
  const anchors = useMemo(() => {
    const m = new Map<string, readonly [number, number, number]>();
    for (const b of layout.bays) {
      const a = bayPillAnchor(layout, b.id);
      if (a) m.set(b.id, a);
    }
    const sel = shownBayId ? selectionPillAnchor(layout, shownBayId) : null;
    if (sel) m.set(SELECTION_KEY, sel);
    return m;
  }, [layout, shownBayId]);
  const selectedBay = layout.bays.find((b) => b.id === shownBayId);
  const selection = selectedBay
    ? { title: selectedBay.label[lang], sub: selectedBay.conveyorName }
    : null;

  // Fog is tone-mapped on every tier, the clear colour only by the post chain (High/Med). Both are pre-scaled where
  // tone mapping applies so they come out at --scene-void.
  const hasPost = settings.post !== null;
  const fogColor = useMemo(() => unlitColor(palette.void, theme), [palette.void, theme]);
  const voidColor = useMemo(
    () => (hasPost ? unlitColor(palette.void, theme) : new Color(palette.void)),
    [palette.void, theme, hasPost],
  );

  const env = useMemo<SceneEnv>(
    () => ({
      theme,
      palette,
      materials,
      tier,
      quality: settings,
      shadows: settings.shadowMapSize !== null,
      toneMapping,
    }),
    [theme, palette, materials, tier, settings, toneMapping],
  );

  return (
    <div ref={setFrame} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        // a number, not the tier's range: the budget is already in it. The composer follows the renderer's ratio by itself.
        dpr={pixelRatio}
        shadows={env.shadows ? 'percentage' : false}
        frameloop={visible ? 'always' : 'demand'}
        camera={{ fov: CAMERA_FOV, near: 1, far: 700, position: [0, 60, 80] }}
        // MSAA serves Low (no post); on High/Med the composer renders off-screen and SMAA anti-aliases
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onCreated={({ gl, scene }) => {
          // exposure 1, sRGB output; under post-processing the ToneMapping effect applies the same curve
          applyToneMapping(gl, toneMapping);
          gl.toneMappingExposure = 1;
          gl.outputColorSpace = SRGBColorSpace;
          // automatic mode: a software rasteriser starts (and stays unless it inclines) at Low
          const ctx = gl.getContext();
          const info = ctx.getExtension('WEBGL_debug_renderer_info');
          const start = autoStartTier(
            info ? String(ctx.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null,
          );
          if (start !== AUTO_START_TIER) setAutoTier(start);
          if (QUALITY_DEBUG) qualityProbe.renderer = gl;
          createdRef.current = { gl, scene };
          onReady?.(gl, scene);
        }}
      >
        <SceneEnvContext.Provider value={env}>
          <primitive attach="background" object={voidColor} />
          <RendererToneMapping mapping={toneMapping} active={!hasPost} />
          <fog attach="fog" args={[fogColor, FOG[theme][0], FOG[theme][1]]} />
          {quality === undefined && <AutoQuality tier={autoTier} onStep={setAutoTier} />}
          <SceneLights layout={layout} />
          <CameraRig layout={layout} safeArea={safeArea} />
          <Shed layout={layout} />
          <ExteriorContext layout={layout} />
          {layout.faces.map((face) => (
            <group
              key={face.face}
              position={[face.origin.X, layout.floorLevel, face.origin.Z]}
              rotation={[0, face.yaw, 0]}
            >
              <FaceContents layout={layout} face={face} />
            </group>
          ))}
          {layout.bays.map((bay) => {
            const face = layout.faces.find((f) => f.face === bay.face);
            const bayAnim = anim.get(bay.id);
            if (!face || !bayAnim) return null;
            return (
              <group
                key={bay.id}
                position={[bay.door.X, layout.floorLevel, bay.door.Z]}
                rotation={[0, bay.yaw, 0]}
              >
                <Bay
                  face={face}
                  bay={bay}
                  selected={selectedBayId === bay.id}
                  anim={bayAnim}
                  status={bayStatus?.[bay.id] ?? 'NO_TRUCK'}
                  onSelect={onSelect}
                />
              </group>
            );
          })}
          {actors && (
            <>
              <ActorsLayer
                layout={layout}
                feed={actors}
                showPlates={labels}
                plates={plateElements}
                anim={anim}
                board={glyphBoard}
                selected={selectedActor}
                onSelect={onSelect}
                pills={pillElements}
                labelStrings={labelStrings}
              />
              <CameraGlyphs layout={layout} board={glyphBoard} feed={actors} xray={xray} />
            </>
          )}
          {pins?.map((pin) => (
            <EventPin key={pin.id} at={pin.at} />
          ))}
          <PillProjector anchors={anchors} elements={pillElements} />
          <ScenePost />
        </SceneEnvContext.Provider>
      </Canvas>
      {theme === 'light' && (
        <div
          aria-hidden
          data-testid="scene-vignette"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `radial-gradient(ellipse at center, transparent 35%, ${hexAlpha(palette.vignette, VIGNETTE_ALPHA)} 100%)`,
          }}
        />
      )}
      {actors && (
        <TruckPlates count={maxTrucks(layout)} palette={palette} elements={plateElements} />
      )}
      <PillLayer
        palette={palette}
        theme={theme}
        selectedBayId={selectedBayId}
        bays={pillBays}
        showBayPills={labels}
        selection={selection}
        selectionVisible={selectedBayId !== null && selectedBayId === shownBayId}
        elements={pillElements}
      />
    </div>
  );
}
