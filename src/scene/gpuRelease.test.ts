import {
  BufferGeometry,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Scene,
  Texture,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ACTOR_BOX_MATERIAL, ACTOR_SOLID_MATERIAL } from './actors/pool';
import { bracketGeometry } from './bay/brackets';
import {
  BOX_DEPTH_MATERIAL,
  BOX_MATERIAL,
  CYL_MATERIAL,
  UNIT_PLANE,
  unitBox,
  unitCylinder,
  unitSphere,
} from './geometry';
import {
  collectSceneResources,
  disposeAll,
  disposeFullScreenQuads,
  sharedResourceCount,
  type Disposable,
} from './gpuRelease';
import { roundedPlate } from './shapes';

// Task 21: a renderer keeps a 'dispose' listener on everything it uploads, and only the resource's dispose() removes
// it. These tests stand in for the renderer with such a listener and check that unmounting a scene reaches it.

/** A stand-in for the renderer's renderer-side material state (`gl.properties`). */
function fakeRenderer(uniforms: Record<string, { value: unknown }> = {}): WebGLRenderer {
  return { properties: { get: () => ({ uniforms }) } } as unknown as WebGLRenderer;
}

/** Listens the way three's renderer does: removes itself when the resource is disposed. */
function listen(r: Disposable & { addEventListener: BufferGeometry['addEventListener'] }) {
  const fn = vi.fn((e: { target: typeof r }) => {
    (e.target as unknown as BufferGeometry).removeEventListener('dispose', fn as never);
  });
  r.addEventListener('dispose', fn as never);
  return fn;
}

describe('gpuRelease', () => {
  it('collects every module-level shared resource, even with an empty scene', () => {
    const shared = [
      ACTOR_BOX_MATERIAL,
      ACTOR_SOLID_MATERIAL,
      BOX_MATERIAL,
      CYL_MATERIAL,
      BOX_DEPTH_MATERIAL,
      UNIT_PLANE,
      unitBox(2),
      unitCylinder(12),
      unitSphere(12),
      roundedPlate(1, 2, 0.1),
      bracketGeometry(1, 2, 3),
    ];
    const found = collectSceneResources(fakeRenderer(), new Scene());
    for (const r of shared) expect(found.has(r)).toBe(true);
    expect(sharedResourceCount()).toBeGreaterThanOrEqual(shared.length);
  });

  it('collects scene geometry, materials, their maps and the textures the renderer bound', () => {
    const map = new Texture();
    const lut = new DataTexture();
    const geometry = new BufferGeometry();
    const material = new MeshStandardMaterial({ map });
    const depth = new MeshBasicMaterial();
    const scene = new Scene();
    const mesh = new Mesh(geometry, [material]);
    mesh.customDepthMaterial = depth;
    scene.add(mesh);
    const found = collectSceneResources(fakeRenderer({ dfgLUT: { value: lut } }), scene);
    for (const r of [map, lut, geometry, material, depth]) expect(found.has(r)).toBe(true);
  });

  it('disposing the collection fires every listener once and leaves none behind', () => {
    const geometry = new BufferGeometry();
    const scene = new Scene();
    scene.add(new Mesh(geometry, new MeshBasicMaterial()));
    const onShared = listen(ACTOR_SOLID_MATERIAL);
    const onScene = listen(geometry);
    disposeAll(collectSceneResources(fakeRenderer(), scene));
    expect(onShared).toHaveBeenCalledTimes(1);
    expect(onScene).toHaveBeenCalledTimes(1);
    expect(ACTOR_SOLID_MATERIAL.hasEventListener('dispose', onShared as never)).toBe(false);
    expect(geometry.hasEventListener('dispose', onScene as never)).toBe(false);
  });

  it('disposes the full-screen quads of a post pass and nothing else', () => {
    const quad = { render: vi.fn(), dispose: vi.fn(), material: new MeshBasicMaterial() };
    const material = new MeshBasicMaterial();
    const materialDispose = vi.spyOn(material, 'dispose');
    const target = { dispose: vi.fn() };
    disposeFullScreenQuads({ copyQuad: quad, blurQuad: quad, material, target, size: 4 });
    expect(quad.dispose).toHaveBeenCalledTimes(2);
    expect(materialDispose).not.toHaveBeenCalled();
    expect(target.dispose).not.toHaveBeenCalled();
    expect(() => disposeFullScreenQuads(null)).not.toThrow();
  });
});
