import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  SphereGeometry,
  InstancedBufferAttribute,
  MeshDepthMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBADepthPacking,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { sharedAcrossMounts } from './gpuRelease';

// Shared geometries and the two instancing materials every box and cylinder in the scene is drawn with.
//
// Rounded boxes (docs/06 section 2: "no sharp boxes"): one unit RoundedBoxGeometry per smoothness level is shared
// by every InstancedMesh. Scaling a rounded unit cube non-uniformly would stretch its corners (a 9 m conveyor beam
// would get 0.9 m "rounded" ends), so the vertex shader rebuilds each vertex from its corner sign (`rbCorner`) and
// its corner-sphere direction (the geometry's normal): position = corner * (size / 2 - r) + normal * r, with r a
// per-instance fraction of the instance's smallest side. Radii are therefore true metres on any instance size.
//
// Each instance also carries its finish (roughness, metalness, rounding, emissive) in `instanceFinish`, so steel
// guides, matte paint, plastic pallets and glowing status strips share one draw call per geometry.

export type Detail = 'hi' | 'lo' | 'flat';

/** Rounding as a fraction of the smallest side (docs/06 D6: 10 to 15 %, overriding section 2). */
export const ROUND = 0.13;

/** Plane facing +Z, 1 x 1. */
export const UNIT_PLANE = sharedAcrossMounts(new PlaneGeometry(1, 1));

function withCorners<T extends BufferGeometry>(g: T): T {
  const pos = g.getAttribute('position');
  const corner = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    corner[i * 3] = Math.sign(pos.getX(i)) || 1;
    corner[i * 3 + 1] = Math.sign(pos.getY(i)) || 1;
    corner[i * 3 + 2] = Math.sign(pos.getZ(i)) || 1;
  }
  g.setAttribute('rbCorner', new BufferAttribute(corner, 3));
  return g;
}

const boxCache = new Map<number, BufferGeometry>();

/** Unit box for `smoothness` (0 = sharp box; the shader then needs rounding 0). */
export function unitBox(smoothness: number): BufferGeometry {
  const hit = boxCache.get(smoothness);
  if (hit) return hit;
  const g =
    smoothness <= 0
      ? withCorners(new BoxGeometry(1, 1, 1))
      : withCorners(new RoundedBoxGeometry(1, 1, 1, smoothness, 0.12));
  boxCache.set(smoothness, sharedAcrossMounts(g));
  return g;
}

const cylCache = new Map<number, BufferGeometry>();

/** Unit cylinder along three Y (radius 1, length 1). */
export function unitCylinder(radialSegments: number): BufferGeometry {
  const hit = cylCache.get(radialSegments);
  if (hit) return hit;
  const g = new CylinderGeometry(1, 1, 1, radialSegments);
  cylCache.set(radialSegments, sharedAcrossMounts(g));
  return g;
}

const sphereCache = new Map<number, BufferGeometry>();

/** Unit sphere (radius 1), as round as the tier's cylinders. */
export function unitSphere(segments: number): BufferGeometry {
  const hit = sphereCache.get(segments);
  if (hit) return hit;
  const g = new SphereGeometry(1, segments, Math.max(6, Math.round(segments * 0.7)));
  sphereCache.set(segments, sharedAcrossMounts(g));
  return g;
}

/**
 * A per-mesh geometry that shares the unit geometry's attributes and adds its own `instanceFinish`. Instanced
 * attributes must not live on the shared geometry, which several InstancedMeshes use at once.
 */
export function instancedGeometry(base: BufferGeometry, count: number): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, attr] of Object.entries(base.attributes)) g.setAttribute(name, attr);
  if (base.index) g.setIndex(base.index);
  g.setAttribute('instanceFinish', new InstancedBufferAttribute(new Float32Array(count * 4), 4));
  return g;
}

/**
 * Dispose a geometry from {@link instancedGeometry}. The renderer deletes the GPU buffer of every attribute of a
 * disposed geometry, so the shared attributes are detached first; only `instanceFinish` is released.
 */
export function disposeInstancedGeometry(g: BufferGeometry, base: BufferGeometry): void {
  for (const name of Object.keys(base.attributes)) g.deleteAttribute(name);
  g.setIndex(null);
  g.dispose();
}

const ROUNDED_HEAD = /* glsl */ `
attribute vec3 rbCorner;
attribute vec4 instanceFinish;
varying vec3 vFinish;
`;

// Instance scale from the matrix columns; radius = rounding fraction x smallest side.
const ROUNDED_SCALE = /* glsl */ `
vec3 rbScale = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
float rbR = instanceFinish.z * min( rbScale.x, min( rbScale.y, rbScale.z ) );
`;

// The instancing normal transform divides by scale^2 and multiplies by the matrix (R S^-1 n), so the object
// normal is pre-multiplied by S to come out as the corner-sphere direction in world space.
const ROUNDED_NORMAL = /* glsl */ `
${ROUNDED_SCALE}
vec3 objectNormal = normal * rbScale;
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif
`;

const ROUNDED_POSITION = /* glsl */ `
vec3 transformed = ( rbCorner * ( 0.5 * rbScale - rbR ) + normal * rbR ) / rbScale;
vFinish = instanceFinish.xyw;
`;

const FINISH_HEAD = /* glsl */ `
attribute vec4 instanceFinish;
varying vec3 vFinish;
`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vFinish;
`;

// The instance colour glows by its own emissive share (status strips, dock band in the dark theme).
const FRAGMENT_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
#ifdef USE_COLOR
	totalEmissiveRadiance += vColor.rgb * vFinish.z;
#endif
`;

export function patchStandard(shader: WebGLProgramParametersWithUniforms, rounded: boolean): void {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>\n${rounded ? ROUNDED_HEAD : FINISH_HEAD}`,
  );
  if (rounded) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', ROUNDED_NORMAL)
      .replace('#include <begin_vertex>', ROUNDED_POSITION);
  } else {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvFinish = instanceFinish.xyw;',
    );
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vFinish.x;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vFinish.y;')
    .replace('#include <emissivemap_fragment>', FRAGMENT_EMISSIVE);
}

function standard(rounded: boolean): MeshStandardMaterial {
  // white base: the colour comes from instanceColor (palette tone x shade)
  const m = new MeshStandardMaterial({ color: '#ffffff' });
  m.onBeforeCompile = (shader) => patchStandard(shader, rounded);
  m.customProgramCacheKey = () => (rounded ? 'scene-rounded-box' : 'scene-finish');
  return m;
}

/** Material for every rounded/flat box InstancedMesh (needs `rbCorner` and `instanceFinish`). */
export const BOX_MATERIAL = sharedAcrossMounts(standard(true));
/** Material for cylinder InstancedMeshes (needs `instanceFinish`). */
export const CYL_MATERIAL = sharedAcrossMounts(standard(false));

/** Shadow-map depth for rounded boxes: the same vertex rebuild, so shadows have true rounded corners too. */
export const BOX_DEPTH_MATERIAL = (() => {
  const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ROUNDED_HEAD}`)
      .replace('#include <begin_vertex>', `${ROUNDED_SCALE}\n${ROUNDED_POSITION}`);
  };
  m.customProgramCacheKey = () => 'scene-rounded-depth';
  return sharedAcrossMounts(m);
})();
