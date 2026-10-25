import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { WebGLRenderer } from 'three';
import type { SiteConfig } from '@/domain';
import { Bay, type BaySelection } from './bay/Bay';
import { Shed } from './building/Shed';
import { CameraRig } from './camera/CameraRig';
import { CAMERA_FOV } from './camera/presets';
import { createMaterials, disposeMaterials, paletteFor, type SceneTheme } from './materials';
import { QUALITY, stepTier, type QualityTier } from './quality';
import { SceneLights } from './SceneLights';
import { SceneEnvContext, type SceneEnv } from './sceneEnv';
import { ExteriorContext } from './site/ExteriorContext';
import { FaceContents } from './site/FaceContents';
import { buildSiteLayout } from './site/layout';

export type SceneSelection = BaySelection;

export interface SceneRootProps {
  siteConfig: SiteConfig;
  /** Fixed quality tier. When omitted the tier starts at High and PerformanceMonitor steps it up and down. */
  quality?: QualityTier;
  theme?: SceneTheme;
  /** Called when a bay (floor, belt, staging, ...) is clicked. The scene never writes to a store. */
  onSelect?: (selection: SceneSelection) => void;
  /** Bay whose floor ring is drawn as selected. */
  selectedBayId?: string | null;
  /** Static shutter state per bay (default: open). */
  doorOpen?: (bayId: string) => boolean;
  /** Dev hook: receives the renderer once the canvas is created (stats, screenshots). */
  onReady?: (gl: WebGLRenderer) => void;
}

/** The 3D shed interior (roofless cutaway "dollhouse"), fully built from `siteConfig`. Fills its parent. */
export function SceneRoot({
  siteConfig,
  quality,
  theme = 'light',
  onSelect,
  selectedBayId = null,
  doorOpen,
  onReady,
}: SceneRootProps) {
  const layout = useMemo(() => buildSiteLayout(siteConfig), [siteConfig]);
  const palette = paletteFor(theme);
  const materials = useMemo(() => createMaterials(palette), [palette]);
  useEffect(() => () => disposeMaterials(materials), [materials]);

  const [autoTier, setAutoTier] = useState<QualityTier>('high');
  const tier = quality ?? autoTier;
  const settings = QUALITY[tier];

  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  const env = useMemo<SceneEnv>(
    () => ({
      palette,
      materials,
      tier,
      quality: settings,
      shadows: settings.shadowMapSize !== null,
    }),
    [palette, materials, tier, settings],
  );

  return (
    <Canvas
      dpr={settings.dpr}
      flat
      shadows={env.shadows ? 'percentage' : false}
      frameloop={visible ? 'always' : 'demand'}
      camera={{ fov: CAMERA_FOV, near: 1, far: 700, position: [0, 60, 80] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%', display: 'block' }}
      onCreated={({ gl }) => onReady?.(gl)}
    >
      <SceneEnvContext.Provider value={env}>
        <color attach="background" args={[palette.void]} />
        <fog attach="fog" args={[palette.void, 160, 480]} />
        {quality === undefined && (
          <PerformanceMonitor
            onDecline={() => setAutoTier((t) => stepTier(t, -1))}
            onIncline={() => setAutoTier((t) => stepTier(t, 1))}
          />
        )}
        <SceneLights layout={layout} />
        <CameraRig layout={layout} />
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
      </SceneEnvContext.Provider>
    </Canvas>
  );
}
