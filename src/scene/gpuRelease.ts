import type { Object3D, WebGLRenderer } from 'three';

// Why this exists (Task 21): a WebGLRenderer adds a 'dispose' listener to every material, geometry and texture it
// uploads, and only that resource's own dispose() removes it again; neither renderer.dispose() nor the context loss on
// unmount does. The listener closes over the renderer, its GL context and its canvas. A resource that outlives the
// scene (a module-level material, a geometry or texture cache, a GLTF in the loader cache) therefore kept every dead
// renderer alive, and through its canvas the whole detached /live DOM tree: about 900 nodes and a canvas per visit.
// dispose() frees GPU state only. The CPU data stays, and the next renderer uploads it again unchanged.

export interface Disposable {
  dispose(): void;
}

const shared = new Set<Disposable>();

/** Marks a module-level three.js resource that every scene mount reuses. Released whenever a scene unmounts. */
export function sharedAcrossMounts<T extends Disposable>(resource: T): T {
  shared.add(resource);
  return resource;
}

/** Number of registered shared resources (tests). */
export function sharedResourceCount(): number {
  return shared.size;
}

interface UniformLike {
  value?: unknown;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isTexture = (v: unknown): v is Disposable => isObject(v) && v.isTexture === true;
const isMaterial = (v: unknown): v is Disposable & Record<string, unknown> =>
  isObject(v) && v.isMaterial === true;
const isGeometry = (v: unknown): v is Disposable => isObject(v) && v.isBufferGeometry === true;

function addUniformTextures(out: Set<Disposable>, uniforms: unknown): void {
  if (!isObject(uniforms)) return;
  for (const u of Object.values(uniforms)) {
    const value = isObject(u) ? (u as UniformLike).value : undefined;
    if (isTexture(value)) out.add(value);
  }
}

/**
 * Everything `gl` may hold a dispose listener on that can outlive this mount: the shared registry, the geometries and
 * materials reachable from `scene`, the textures of those materials, and the textures the renderer itself bound into
 * their uniforms (three's module-level DFG lookup texture). Collect it while the scene graph is still whole.
 */
export function collectSceneResources(gl: WebGLRenderer, scene: Object3D): Set<Disposable> {
  const out = new Set<Disposable>(shared);
  const materials = new Set<Disposable & Record<string, unknown>>();
  for (const r of shared) if (isMaterial(r)) materials.add(r);
  scene.traverse((o) => {
    const obj = o as unknown as Record<string, unknown>;
    if (isGeometry(obj.geometry)) out.add(obj.geometry);
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of [...list, obj.customDepthMaterial, obj.customDistanceMaterial]) {
      if (isMaterial(m)) materials.add(m);
    }
  });
  for (const m of materials) {
    out.add(m);
    for (const v of Object.values(m)) if (isTexture(v)) out.add(v);
    addUniformTextures(out, m.uniforms);
    addUniformTextures(out, (gl.properties.get(m) as Record<string, unknown>).uniforms);
  }
  return out;
}

/** Dispose all of `resources`. Only once the renderer that used them will never draw again. */
export function disposeAll(resources: Iterable<Disposable>): void {
  for (const r of resources) r.dispose();
}

interface QuadLike {
  render: unknown;
  dispose: () => void;
  material: unknown;
}

const isQuad = (v: unknown): v is QuadLike =>
  isObject(v) &&
  typeof v.render === 'function' &&
  typeof v.dispose === 'function' &&
  'material' in v &&
  v.isMaterial !== true;

/**
 * n8ao's full-screen quads share one module-level triangle geometry, and the pass's dispose() (postprocessing's
 * Pass.dispose) never reaches them, so every renderer that drew the AO kept a listener on that geometry. Disposing the
 * pass's own quads releases them; a new pass builds new quads on the same geometry.
 */
export function disposeFullScreenQuads(pass: object | null): void {
  if (!pass) return;
  for (const v of Object.values(pass)) if (isQuad(v)) v.dispose();
}
