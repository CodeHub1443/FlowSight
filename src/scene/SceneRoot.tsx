import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Color, SRGBColorSpace, type Scene, type WebGLRenderer } from 'three';
import type { SiteConfig } from '@/domain';
import { Bay, type BaySelection } from './bay/Bay';
import { Shed } from './building/Shed';
import { CameraRig } from './camera/CameraRig';
import { CAMERA_FOV, NO_SAFE_AREA, type SafeArea } from './camera/view';
import { bayPillAnchor, selectionPillAnchor } from './labels/anchors';
import { PillLayer, PillProjector, SELECTION_KEY, type PillElements } from './labels/Pills';
import { createMaterials, disposeMaterials, paletteFor, type SceneTheme } from './materials';
import { AUTO_START_TIER, autoStartTier, QUALITY, stepTier, type QualityTier } from './quality';
import { SceneLights } from './SceneLights';
import { ScenePost } from './ScenePost';
import { SceneEnvContext, type SceneEnv } from './sceneEnv';
import {
  SCENE_TONE_MAPPING,
  THREE_TONE_MAPPING,
  UNLIT_GAIN,
  type SceneToneMapping,
} from './toneMapping';
import { ExteriorContext } from './site/ExteriorContext';
import { FaceContents } from './site/FaceContents';
import { buildSiteLayout } from './site/layout';
import { applySoftShadows } from './softShadows';

// 16-tap PCF for the key light (docs/06 section 2 soft shadow without grain); before any material compiles
applySoftShadows();

export type SceneSelection = BaySelection;

export interface SceneRootProps {
  siteConfig: SiteConfig;
  /** Fixed quality tier. When omitted the tier is automatic: it starts at Med and PerformanceMonitor steps it. */
  quality?: QualityTier;
  theme?: SceneTheme;
  /** Screen insets covered by overlays; the default framing keeps every bay inside the rest (docs/06 section 2). */
  safeArea?: Readonly<SafeArea>;
  /** Bay number pills on the dock wall band (uiStore `labels`). */
  labels?: boolean;
  /** Called when a bay (floor, belt, staging, ...) is clicked. The scene never writes to a store. */
  onSelect?: (selection: SceneSelection) => void;
  /** Bay whose floor ring and pill are drawn as selected. */
  selectedBayId?: string | null;
  /** Static shutter state per bay (default: open). */
  doorOpen?: (bayId: string) => boolean;
  /** Tone mapping (read once when the canvas is created). Default SCENE_TONE_MAPPING; the dev preview A/B tests it. */
  toneMapping?: SceneToneMapping;
  /** Dev hook: receives the renderer once the canvas is created (stats, screenshots). */
  onReady?: (gl: WebGLRenderer, scene: Scene) => void;
}

/** The 3D shed interior (roofless cutaway "dollhouse"), fully built from `siteConfig`. Fills its parent. */
export function SceneRoot({
  siteConfig,
  quality,
  theme = 'light',
  safeArea = NO_SAFE_AREA,
  labels = true,
  onSelect,
  selectedBayId = null,
  doorOpen,
  toneMapping = SCENE_TONE_MAPPING,
  onReady,
}: SceneRootProps) {
  const layout = useMemo(() => buildSiteLayout(siteConfig), [siteConfig]);
  const palette = paletteFor(theme);
  const materials = useMemo(() => createMaterials(palette), [palette]);
  useEffect(() => () => disposeMaterials(materials), [materials]);

  const [autoTier, setAutoTier] = useState<QualityTier>(AUTO_START_TIER);
  const tier = quality ?? autoTier;
  const settings = QUALITY[tier];

  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  const { i18n } = useTranslation('scene');
  const lang = i18n.language === 'bn' ? 'bn' : 'en';
  const pillElements = useRef<PillElements>(new Map());
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
  const fogColor = useMemo(
    () => new Color(palette.void).multiplyScalar(UNLIT_GAIN),
    [palette.void],
  );
  const voidColor = useMemo(
    () => new Color(palette.void).multiplyScalar(hasPost ? UNLIT_GAIN : 1),
    [palette.void, hasPost],
  );

  const env = useMemo<SceneEnv>(
    () => ({
      palette,
      materials,
      tier,
      quality: settings,
      shadows: settings.shadowMapSize !== null,
      toneMapping,
    }),
    [palette, materials, tier, settings, toneMapping],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        dpr={settings.dpr}
        shadows={env.shadows ? 'percentage' : false}
        frameloop={visible ? 'always' : 'demand'}
        camera={{ fov: CAMERA_FOV, near: 1, far: 700, position: [0, 60, 80] }}
        // MSAA serves Low (no post); on High/Med the composer renders off-screen and SMAA anti-aliases
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onCreated={({ gl, scene }) => {
          // exposure 1, sRGB output; under post-processing the ToneMapping effect applies the same curve
          gl.toneMapping = THREE_TONE_MAPPING[toneMapping];
          gl.toneMappingExposure = 1;
          gl.outputColorSpace = SRGBColorSpace;
          // automatic mode: a software rasteriser starts (and stays unless it inclines) at Low
          const ctx = gl.getContext();
          const info = ctx.getExtension('WEBGL_debug_renderer_info');
          const start = autoStartTier(
            info ? String(ctx.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null,
          );
          if (start !== AUTO_START_TIER) setAutoTier(start);
          onReady?.(gl, scene);
        }}
      >
        <SceneEnvContext.Provider value={env}>
          <primitive attach="background" object={voidColor} />
          <fog attach="fog" args={[fogColor, 170, 520]} />
          {quality === undefined && (
            <PerformanceMonitor
              onDecline={() => setAutoTier((t) => stepTier(t, -1))}
              onIncline={() => setAutoTier((t) => stepTier(t, 1))}
              flipflops={4}
              onFallback={() => setAutoTier('low')}
            />
          )}
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
            if (!face) return null;
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
                  doorOpen={doorOpen ? doorOpen(bay.id) : true}
                  onSelect={onSelect}
                />
              </group>
            );
          })}
          <PillProjector anchors={anchors} elements={pillElements} />
          <ScenePost />
        </SceneEnvContext.Provider>
      </Canvas>
      <PillLayer
        palette={palette}
        bays={pillBays}
        showBayPills={labels}
        selection={selection}
        selectionVisible={selectedBayId !== null && selectedBayId === shownBayId}
        elements={pillElements}
      />
    </div>
  );
}
