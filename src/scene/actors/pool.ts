import {
  BufferGeometry,
  type Color,
  DoubleSide,
  DynamicDrawUsage,
  FrontSide,
  InstancedBufferAttribute,
  InstancedInterleavedBuffer,
  InstancedMesh,
  InterleavedBufferAttribute,
  type Material,
  type Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
} from 'three';
import { disposeInstancedGeometry, patchStandard } from '../geometry';
import type { Finish } from '../materials';

// Instance pools for actors: a fixed-capacity InstancedMesh refilled from useFrame through its buffers, no React at
// all. `instanceFinish` is [roughness, metalness, rounding, fade]; the fade is a dither (docs/04 section 4: fade out),
// so an actor stays opaque for sorting and ambient occlusion and needs no per-actor material.

/** Actors live on their own layer so the on-demand contact-shadow pass never bakes a moving figure into the floor. */
export const ACTOR_LAYER = 1;

const FADE_FRAGMENT = /* glsl */ `
#include <clipping_planes_fragment>
if ( vFinish.z < 0.999 ) {
	float actorNoise = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
	if ( vFinish.z <= actorNoise ) discard;
}
`;

function actorMaterial(rounded: boolean): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: '#ffffff', side: rounded ? FrontSide : DoubleSide });
  m.onBeforeCompile = (shader) => {
    patchStandard(shader, rounded);
    shader.fragmentShader = shader.fragmentShader
      .replace('totalEmissiveRadiance += vColor.rgb * vFinish.z;', '')
      .replace('#include <clipping_planes_fragment>', FADE_FRAGMENT);
  };
  m.customProgramCacheKey = () => (rounded ? 'actor-rounded' : 'actor-solid');
  return m;
}

/** Rounded boxes (need `rbCorner`). */
export const ACTOR_BOX_MATERIAL = actorMaterial(true);
/** Capsules, spheres, cylinders and GLB parts. Double-sided: the converted forklift has open meshes. */
export const ACTOR_SOLID_MATERIAL = actorMaterial(false);

const holders = new WeakMap<object, number>();

/**
 * Keeps `owner` alive while an effect holds it and disposes it only after the last release, one task later: StrictMode
 * runs every effect's cleanup and setup back to back, and a disposed pool has lost its shared geometry for good.
 */
export function retain(owner: { dispose(): void }): () => void {
  holders.set(owner, (holders.get(owner) ?? 0) + 1);
  return () => {
    holders.set(owner, (holders.get(owner) ?? 1) - 1);
    setTimeout(() => {
      if (holders.get(owner) === 0) {
        holders.delete(owner);
        owner.dispose();
      }
    }, 0);
  };
}

/** Floats per instance: matrix, colour (rgb), finish (roughness, metalness, rounding, fade). */
const ROW = 16 + 3 + 4;
const COLOR_AT = 16;
const FINISH_AT = 19;

/**
 * Every per-instance value of many pools in one interleaved buffer, so a frame costs at most one upload and a frame in
 * which nothing changed costs none. Rewriting a buffer the frame draws from makes that frame wait for the GPU, whatever
 * the upload's size, and that wait is what keeps the frames even: a ring of buffers or a lower redraw rate removes it and
 * then frames bunch up and stall (measured, docs/PROGRESS.md, Task 15).
 */
export class InstanceStore {
  private readonly rows: number;
  private readonly array: Float32Array;
  private readonly buffer: InstancedInterleavedBuffer;
  private used = 0;
  private min = Infinity;
  private max = -1;

  constructor(rows: number) {
    this.rows = rows;
    this.array = new Float32Array(rows * ROW);
    this.buffer = new InstancedInterleavedBuffer(this.array, ROW, 1).setUsage(DynamicDrawUsage);
  }

  /** The first of `count` rows reserved for one pool. */
  alloc(count: number): number {
    const first = this.used;
    if (first + count > this.rows) {
      throw new Error(`InstanceStore: ${first + count} of ${this.rows} rows`);
    }
    this.used = first + count;
    return first;
  }

  /** A window onto every row from `firstRow`: `offset` floats into each, `size` floats long. */
  attribute(firstRow: number, offset: number, size: number): InterleavedBufferAttribute {
    return new InterleavedBufferAttribute(this.buffer, size, firstRow * ROW + offset);
  }

  /** Write one instance; a row that did not change costs no upload. */
  write(
    row: number,
    matrix: Matrix4,
    color: Color,
    finish: Finish,
    round: number,
    fade: number,
  ): void {
    const a = this.array;
    const at = row * ROW;
    const e = matrix.elements;
    let changed = false;
    for (let j = 0; j < 16; j++) {
      const v = Math.fround(e[j] as number);
      if (a[at + j] !== v) {
        a[at + j] = v;
        changed = true;
      }
    }
    const set = (i: number, value: number) => {
      const v = Math.fround(value);
      if (a[at + i] !== v) {
        a[at + i] = v;
        changed = true;
      }
    };
    set(COLOR_AT, color.r);
    set(COLOR_AT + 1, color.g);
    set(COLOR_AT + 2, color.b);
    set(FINISH_AT, finish.roughness);
    set(FINISH_AT + 1, finish.metalness);
    set(FINISH_AT + 2, round);
    set(FINISH_AT + 3, fade);
    if (!changed) return;
    if (row < this.min) this.min = row;
    if (row > this.max) this.max = row;
  }

  /** Upload what changed since the last flush, as one range. */
  flush(): void {
    if (this.max < 0) return;
    this.buffer.clearUpdateRanges();
    this.buffer.addUpdateRange(this.min * ROW, (this.max - this.min + 1) * ROW);
    this.buffer.needsUpdate = true;
    this.min = Infinity;
    this.max = -1;
  }
}

export class InstancePool {
  readonly mesh: InstancedMesh;
  readonly capacity: number;
  private readonly base: BufferGeometry;
  private readonly store: InstanceStore;
  private readonly firstRow: number;
  private n = 0;

  constructor(
    base: BufferGeometry,
    material: Material,
    capacity: number,
    store: InstanceStore,
    opts: { cast?: boolean; depth?: MeshDepthMaterial } = {},
  ) {
    this.base = base;
    this.capacity = capacity;
    this.store = store;
    this.firstRow = store.alloc(capacity);
    const geometry = new BufferGeometry();
    for (const [name, attr] of Object.entries(base.attributes)) geometry.setAttribute(name, attr);
    if (base.index) geometry.setIndex(base.index);
    geometry.setAttribute('instanceFinish', store.attribute(this.firstRow, FINISH_AT, 4));
    // its own one-row buffers are replaced at once by windows onto the shared store
    this.mesh = new InstancedMesh(geometry, material, 1);
    this.mesh.instanceMatrix = store.attribute(
      this.firstRow,
      0,
      16,
    ) as unknown as InstancedBufferAttribute;
    this.mesh.instanceColor = store.attribute(
      this.firstRow,
      COLOR_AT,
      3,
    ) as unknown as InstancedBufferAttribute;
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(ACTOR_LAYER);
    this.mesh.count = 0;
    this.mesh.castShadow = opts.cast ?? false;
    this.mesh.receiveShadow = true;
    if (opts.depth) this.mesh.customDepthMaterial = opts.depth;
    // nothing here takes pointer events: a click goes through to the bay
    this.mesh.raycast = () => undefined;
  }

  get count(): number {
    return this.n;
  }

  begin(): void {
    this.n = 0;
  }

  /** Dropped silently beyond the capacity. */
  add(matrix: Matrix4, color: Color, finish: Finish, round: number, fade: number): void {
    const i = this.n;
    if (i >= this.capacity) return;
    this.store.write(this.firstRow + i, matrix, color, finish, round, fade);
    this.n = i + 1;
  }

  /** The values go up with the store's flush. */
  end(): void {
    this.mesh.count = this.n;
  }

  dispose(): void {
    const g = this.mesh.geometry;
    disposeInstancedGeometry(g, this.base);
    this.mesh.dispose();
  }
}
