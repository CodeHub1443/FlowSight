import { Environment, Html, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useLoader } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type BufferGeometry, type Material, type Mesh, SRGBColorSpace, type Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useModel } from '@/scene/assets/loader';
import { MODELS, type ModelName } from '@/scene/assets/models';
import {
  createMaterials,
  disposeMaterials,
  paletteFor,
  type SceneMaterials,
  type SceneTheme,
} from '@/scene/materials';

// Dev-only quality check of the converted models (ADR-13): imported behind `import.meta.env.DEV`, so production
// builds contain neither the route nor this file. Query params drive the screenshots:
//   ?theme=dark   ?only=truck   ?compare=truck (the unsimplified mesh beside the budget one; needs assets-src/.build)
//   ?az=<deg>&el=<deg>&dist=<m>   ?grid=2   ?wire=1

const params = new URLSearchParams(window.location.search);
const num = (name: string, fallback: number) => {
  const v = Number(params.get(name));
  return params.has(name) && Number.isFinite(v) ? v : fallback;
};

const ALL = Object.keys(MODELS) as ModelName[];
const CELL = 3.2;
/** Largest extent of a model in the grid. Its real size is on its label. */
const FIT = 2;

function ModelMesh({
  name,
  materials,
  wire,
}: {
  name: ModelName;
  materials: SceneMaterials;
  wire: boolean;
}) {
  const parts = useModel(name);
  return (
    <>
      {parts.map((part) => {
        const painted = materials[part.tone] as Material | undefined;
        return (
          <mesh
            key={part.tone}
            geometry={part.geometry}
            material={painted ?? part.material}
            matrixAutoUpdate={false}
            matrix={part.matrix}
          />
        );
      })}
      {wire &&
        parts.map((part) => (
          <mesh
            key={part.tone}
            geometry={part.geometry}
            matrixAutoUpdate={false}
            matrix={part.matrix}
          >
            <meshBasicMaterial color="#000000" wireframe transparent opacity={0.25} />
          </mesh>
        ))}
    </>
  );
}

function Label({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Html center position={[0, -0.28, FIT / 2 + 0.2]} zIndexRange={[10, 0]}>
      <div
        style={{
          width: 240,
          padding: '4px 8px',
          borderRadius: 8,
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          font: '12px/1.35 Inter, sans-serif',
          textAlign: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,.2)',
        }}
      >
        <b>{title}</b>
        {lines.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
    </Html>
  );
}

function Cell({
  name,
  at,
  materials,
  wire,
  fit,
}: {
  name: ModelName;
  at: [number, number, number];
  materials: SceneMaterials;
  wire: boolean;
  fit: boolean;
}) {
  const { t } = useTranslation('scene');
  const m = MODELS[name];
  const k = fit ? FIT / Math.max(...m.sizeM) : 1;
  return (
    <group position={at}>
      <group scale={k}>
        <Suspense fallback={null}>
          <ModelMesh name={name} materials={materials} wire={wire} />
        </Suspense>
      </group>
      <Label
        title={name}
        lines={[
          t('dev.assetTris', {
            tris: m.tris.toLocaleString('en'),
            source: m.trisSource.toLocaleString('en'),
          }),
          t('dev.assetSize', {
            kb: (m.bytes / 1024).toFixed(1),
            size: m.sizeM.map((v) => v.toFixed(2)).join(' x '),
          }),
        ]}
      />
    </group>
  );
}

/** The raw conversion, straight from assets-src/.build: Vite serves it in dev, it never reaches public/. */
function RawCompare({
  name,
  at,
  wire,
}: {
  name: string;
  at: [number, number, number];
  wire: boolean;
}) {
  const { t } = useTranslation('scene');
  const gltf = useLoader(GLTFLoader, `/assets-src/.build/${name}.compare.glb`);
  const scene = useMemo(() => gltf.scene as Group, [gltf]);
  const tris = useMemo(() => {
    let n = 0;
    scene.traverse((o) => {
      const g = (o as Mesh).geometry as BufferGeometry | undefined;
      if (g?.index) n += g.index.count / 3;
    });
    return n;
  }, [scene]);
  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.computeVertexNormals();
      (mesh.material as { wireframe?: boolean }).wireframe = wire;
    });
  }, [scene, wire]);
  return (
    <group position={at}>
      <primitive object={scene} />
      <Label
        title={t('dev.assetRaw')}
        lines={[t('dev.assetRawTris', { tris: tris.toLocaleString('en') })]}
      />
    </group>
  );
}

export default function AssetPreview() {
  const { t } = useTranslation('scene');
  const [theme, setTheme] = useState<SceneTheme>(params.get('theme') === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  const palette = useMemo(() => {
    // the palette reads the CSS tokens, so the class must be on <html> before the first read
    document.documentElement.classList.toggle('dark', theme === 'dark');
    return paletteFor(theme);
  }, [theme]);
  const materials = useMemo(() => createMaterials(palette, theme), [palette, theme]);
  useEffect(() => () => disposeMaterials(materials), [materials]);

  const only = params.get('only');
  const compare = params.get('compare');
  const wire = params.get('wire') === '1';
  const names = only ? ALL.filter((n) => n === only) : compare ? [] : ALL;
  const columns = num('grid', 4);
  const az = (num('az', 35) * Math.PI) / 180;
  const el = (num('el', 46) * Math.PI) / 180;
  const rows = Math.ceil(names.length / columns);
  const spanX = (Math.min(columns, names.length) - 1) * CELL;
  const spanZ = (rows - 1) * CELL;
  const dist = num('dist', compare ? 12 : only ? 6 : 18);
  const target: [number, number, number] = [
    0,
    compare ? 1.2 : only ? 0.7 : 0,
    only || compare ? 0 : 0.6,
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: palette.floor }}
      data-testid="asset-preview"
    >
      <Canvas
        camera={{
          fov: 35,
          near: 0.05,
          far: 400,
          position: [
            target[0] + Math.sin(az) * Math.cos(el) * dist,
            target[1] + Math.sin(el) * dist,
            target[2] + Math.cos(az) * Math.cos(el) * dist,
          ],
        }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace;
        }}
      >
        <color attach="background" args={[palette.floor]} />
        <hemisphereLight
          args={[palette.hemiSky, palette.hemiGround, theme === 'dark' ? 0.55 : 1.4]}
        />
        <directionalLight
          color={palette.keyLight}
          intensity={theme === 'dark' ? 0.9 : 2.2}
          position={[6, 12, 8]}
        />
        <directionalLight
          color={palette.rimLight}
          intensity={theme === 'dark' ? 0.4 : 0.8}
          position={[-8, 6, -6]}
        />
        {/* local light cards, as in the scene (ADR-11): metal needs something to reflect */}
        <Environment resolution={64}>
          <Lightformer
            intensity={1.6}
            color={palette.card}
            position={[0, 8, 0]}
            rotation-x={Math.PI / 2}
            scale={18}
          />
          <Lightformer
            intensity={0.7}
            color={palette.hemiSky}
            position={[-8, 3, 4]}
            rotation-y={Math.PI / 2}
            scale={12}
          />
          <Lightformer
            intensity={0.7}
            color={palette.hemiSky}
            position={[8, 3, -4]}
            rotation-y={-Math.PI / 2}
            scale={12}
          />
        </Environment>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
          <planeGeometry args={[300, 300]} />
          <meshStandardMaterial color={palette.zone} roughness={0.9} />
        </mesh>
        {names.map((name, i) => (
          <Cell
            key={name}
            name={name}
            materials={materials}
            wire={wire}
            fit={!only}
            at={[(i % columns) * CELL - spanX / 2, 0, Math.floor(i / columns) * CELL - spanZ / 2]}
          />
        ))}
        {compare && (
          <Suspense fallback={null}>
            <RawCompare name={compare} at={[-1.6, 0, 0]} wire={wire} />
            <Cell
              name={compare as ModelName}
              materials={materials}
              wire={wire}
              fit={false}
              at={[1.6, 0, 0]}
            />
          </Suspense>
        )}
        <OrbitControls makeDefault target={target} />
      </Canvas>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: 8,
          borderRadius: 12,
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          font: '14px Inter, sans-serif',
        }}
      >
        <b>{t('dev.assetsTitle')}</b>
        <button
          style={{ padding: '2px 10px', border: '1px solid var(--border)', borderRadius: 6 }}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {t(theme === 'dark' ? 'dev.light' : 'dev.dark')}
        </button>
      </div>
    </div>
  );
}
