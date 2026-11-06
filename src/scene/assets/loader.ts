import { useLoader } from '@react-three/fiber';
import { type BufferGeometry, Matrix4, type Mesh, type MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { sharedAcrossMounts } from '../gpuRelease';
import type { PaletteKey } from '../materials';
import { LIVE_MODELS, modelUrl, type ModelName } from './models';

// GLTFLoader + the MeshoptDecoder that ships inside three, both bundled: no decoder is fetched from anywhere, and DRACO
// (whose default path is a CDN) is never configured (ADR-13). useLoader caches by URL and suspends.

export interface ModelPart {
  /** Palette token the GLB's material names; the truck's texture material is the one exception. */
  tone: PaletteKey;
  geometry: BufferGeometry;
  /** Node transform: meshopt quantisation stores the positions in a normalised box, so this cannot be skipped. */
  matrix: Matrix4;
  /** The GLB's own material (only meaningful for textured models). */
  material: MeshStandardMaterial;
}

const extendLoader = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

/** Flatten a loaded scene into its parts, once per GLTF object. */
const partsCache = new WeakMap<object, readonly ModelPart[]>();

function partsOf(gltf: {
  scene: { updateMatrixWorld: (f?: boolean) => void; traverse: (fn: (o: unknown) => void) => void };
}): readonly ModelPart[] {
  const hit = partsCache.get(gltf);
  if (hit) return hit;
  const parts: ModelPart[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as MeshStandardMaterial;
    parts.push({
      tone: material.name as PaletteKey,
      geometry: sharedAcrossMounts(mesh.geometry),
      matrix: new Matrix4().copy(mesh.matrixWorld),
      material: sharedAcrossMounts(material),
    });
  });
  // tones in a stable order, whatever order the file lists them in
  parts.sort((a, b) => a.tone.localeCompare(b.tone));
  partsCache.set(gltf, parts);
  return parts;
}

/** Suspends until the model is loaded. */
export function useModel(name: ModelName): readonly ModelPart[] {
  const gltf = useLoader(GLTFLoader, modelUrl(name), extendLoader);
  return partsOf(gltf as never);
}

/** Starts the downloads of everything the live scene uses. Safe to call repeatedly. */
export function preloadLiveModels(): void {
  for (const name of LIVE_MODELS) useLoader.preload(GLTFLoader, modelUrl(name), extendLoader);
}
