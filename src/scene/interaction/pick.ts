// Picking by ray against the bounds of what is drawn (docs/04 section 1, t22 spec B1). Trucks, people and forklifts are
// instances in shared pools and take no pointer events of their own (pool.ts): one canvas-level handler (interaction/
// ActorInteraction.tsx) casts a ray and asks this module which bound it meets first. Pure and three-free; the list is
// refilled in place from the rig's current poses and never allocates while picking.

export type PickKind = 'truck' | 'person' | 'forklift' | 'camera';

/** A movement of more than this many CSS pixels between pointer down and up is a drag, not a click. */
export const DRAG_PX = 4;
/** Hover is looked at no more often than every this many milliseconds (10 Hz). */
export const HOVER_INTERVAL_MS = 100;
/**
 * Smallest angle a pick bound subtends, radians. A figure at the hero distance (about 90 m, 28 degree lens) is a dozen
 * pixels wide: bounds grow with distance so it stays about 13 px at 1080p and can still be hit.
 */
export const PICK_MIN_ANGLE = 0.006;

export interface Ray {
  ox: number;
  oy: number;
  oz: number;
  /** Unit direction. */
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Distance along the ray (from its origin) where it comes closest to the capsule (segment a-b, radius r), or -1 when it
 * stays further than `r` away or the capsule is behind the origin. A sphere is the capsule with a = b.
 */
export function rayCapsule(
  ray: Ray,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const vz = bz - az;
  const wx = ray.ox - ax;
  const wy = ray.oy - ay;
  const wz = ray.oz - az;
  const b = ray.dx * vx + ray.dy * vy + ray.dz * vz;
  const c = vx * vx + vy * vy + vz * vz;
  const d = ray.dx * wx + ray.dy * wy + ray.dz * wz;
  const e = vx * wx + vy * wy + vz * wz;
  let s = 0;
  let t: number;
  if (c > 1e-12) {
    const denom = c - b * b;
    s = denom > 1e-12 ? (e - b * d) / denom : 0;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    t = s * b - d;
    if (t < 0) {
      t = 0;
      s = e / c;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
    }
  } else {
    t = -d;
    if (t < 0) t = 0;
  }
  const px = wx + t * ray.dx - s * vx;
  const py = wy + t * ray.dy - s * vy;
  const pz = wz + t * ray.dz - s * vz;
  return px * px + py * py + pz * pz <= r * r ? t : -1;
}

/** The pick bounds of the moment: spheres and capsules, refilled from the poses before each pick. */
export class PickList {
  count = 0;
  readonly kinds: PickKind[] = [];
  readonly ids: string[] = [];
  private cap: number;
  private seg: Float64Array;
  private rad: Float64Array;

  constructor(capacity = 160) {
    this.cap = capacity;
    this.seg = new Float64Array(capacity * 6);
    this.rad = new Float64Array(capacity);
  }

  begin(): void {
    this.count = 0;
  }

  private grow(): void {
    this.cap *= 2;
    const seg = new Float64Array(this.cap * 6);
    seg.set(this.seg);
    this.seg = seg;
    const rad = new Float64Array(this.cap);
    rad.set(this.rad);
    this.rad = rad;
  }

  addCapsule(
    kind: PickKind,
    id: string,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    r: number,
  ): void {
    if (this.count === this.cap) this.grow();
    const i = this.count++;
    this.kinds[i] = kind;
    this.ids[i] = id;
    const o = i * 6;
    this.seg[o] = ax;
    this.seg[o + 1] = ay;
    this.seg[o + 2] = az;
    this.seg[o + 3] = bx;
    this.seg[o + 4] = by;
    this.seg[o + 5] = bz;
    this.rad[i] = r;
  }

  addSphere(kind: PickKind, id: string, x: number, y: number, z: number, r: number): void {
    this.addCapsule(kind, id, x, y, z, x, y, z, r);
  }

  /** The middle of bound `i` (the debug probe puts it on screen). */
  center(i: number, out: [number, number, number]): void {
    const o = i * 6;
    out[0] = ((this.seg[o] as number) + (this.seg[o + 3] as number)) / 2;
    out[1] = ((this.seg[o + 1] as number) + (this.seg[o + 4] as number)) / 2;
    out[2] = ((this.seg[o + 2] as number) + (this.seg[o + 5] as number)) / 2;
  }

  /** Index of the bound the ray meets first (nearest along the ray), or -1. */
  nearest(ray: Ray, minAngle = PICK_MIN_ANGLE): number {
    let best = -1;
    let bestT = Infinity;
    for (let i = 0; i < this.count; i++) {
      const o = i * 6;
      const s = this.seg;
      // grow the bound with distance so a far figure keeps a hittable size
      const cx = ((s[o] as number) + (s[o + 3] as number)) / 2 - ray.ox;
      const cy = ((s[o + 1] as number) + (s[o + 4] as number)) / 2 - ray.oy;
      const cz = ((s[o + 2] as number) + (s[o + 5] as number)) / 2 - ray.oz;
      const r = Math.max(this.rad[i] as number, Math.sqrt(cx * cx + cy * cy + cz * cz) * minAngle);
      const t = rayCapsule(
        ray,
        s[o] as number,
        s[o + 1] as number,
        s[o + 2] as number,
        s[o + 3] as number,
        s[o + 4] as number,
        s[o + 5] as number,
        r,
      );
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = i;
      }
    }
    return best;
  }
}

// ---- shapes of what is drawn (site frame: X east, Y up, Z south; rotY as three's rotation.y) ------------------------

/** A standing figure: 1.7 m tall, a capsule a little fatter than the body. */
export function addPerson(list: PickList, id: string, X: number, Y: number, Z: number): void {
  list.addCapsule('person', id, X, Y + 0.45, Z, X, Y + 1.35, Z, 0.42);
}

/** A forklift (forward = local -Z): body, mast and forks along its heading. */
export function addForklift(
  list: PickList,
  id: string,
  X: number,
  Y: number,
  Z: number,
  rotY: number,
): void {
  const sin = Math.sin(rotY);
  const cos = Math.cos(rotY);
  // local z -1.2 (forks) .. +1.0 (counterweight) at 1.0 m up
  list.addCapsule(
    'forklift',
    id,
    X + -1.2 * sin,
    Y + 1.0,
    Z + -1.2 * cos,
    X + 1.0 * sin,
    Y + 1.0,
    Z + 1.0 * cos,
    0.95,
  );
}

/**
 * A covered van: origin at the middle of the rear sill, body towards local -Z, `length` rear to bumper, box 2.4 wide and
 * 3.2 high standing on the 1.15 m floor (truckParts BODY). A capsule along the body.
 */
export function addTruck(
  list: PickList,
  id: string,
  X: number,
  Y: number,
  Z: number,
  rotY: number,
  length: number,
): void {
  const sin = Math.sin(rotY);
  const cos = Math.cos(rotY);
  const from = 1.5;
  const to = Math.max(from, length - 1.4);
  list.addCapsule(
    'truck',
    id,
    X - from * sin,
    Y + 2.75,
    Z - from * cos,
    X - to * sin,
    Y + 2.75,
    Z - to * cos,
    1.45,
  );
}

// ---- click and hover rules ---------------------------------------------------------------------------------------

export function isDrag(downX: number, downY: number, upX: number, upY: number): boolean {
  return Math.hypot(upX - downX, upY - downY) > DRAG_PX;
}

/**
 * Same threshold as `isDrag`, for R3F's own click handlers (bays, belts, staging): R3F's `ThreeEvent.delta`
 * ("Delta between first click and this event", `@react-three/fiber`'s `events.d.ts`) is already the rounded
 * pointer-down-to-click distance in CSS pixels, computed the same way regardless of what pointerdown hit
 * (t22b.3 Finding A: a drag starting on an actor still reaches here when the actor's own canvas-level handler
 * declines to claim it) — so no separate down/up coordinates are needed, only this one comparison.
 */
export function isR3fClickDrag(delta: number): boolean {
  return delta > DRAG_PX;
}

export type ClickDecision =
  /** Not a click: the camera was dragged. Leave it to the controls. */
  | { type: 'ignore' }
  /** A bound was hit: select it and keep the click from reaching the bay behind it (an actor beats the floor plate). */
  | { type: 'select'; index: number }
  /** Nothing of ours under the pointer: bays, belts and staging handle the click as before. */
  | { type: 'passthrough' };

/** `hit` is the index `PickList.nearest` returned for the ray under the pointer-up position (-1 for none). */
export function decideClick(
  downX: number,
  downY: number,
  upX: number,
  upY: number,
  hit: number,
): ClickDecision {
  if (isDrag(downX, downY, upX, upY)) return { type: 'ignore' };
  return hit >= 0 ? { type: 'select', index: hit } : { type: 'passthrough' };
}

/**
 * Throttle for hover: it is looked at only while the pointer moves, at most once per interval, and never while a button
 * is held (the camera is being dragged, or a click is under way).
 */
export class HoverGate {
  private last = -Infinity;

  constructor(private readonly intervalMs = HOVER_INTERVAL_MS) {}

  ready(now: number, buttons: number): boolean {
    if (buttons !== 0) return false;
    if (now - this.last < this.intervalMs) return false;
    this.last = now;
    return true;
  }
}
