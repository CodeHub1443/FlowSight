// Keyboard camera motion (docs/04 section 6): which keys count, when they count and how far they move the view.
// Pure, and free of three.js: /live marks its scene region with the selector below from the entry chunk.

/** Marks the focusable scene region: `<div data-scene-keys tabIndex={0}>`. */
export const SCENE_KEYS_SELECTOR = '[data-scene-keys]';

/** OrbitControls' damping factor, per frame at 60 fps. Key motion stops with the same decay, in time rather than frames. */
export const ORBIT_DAMPING = 0.09;

export const KEY_PAN = {
  /** Pan speed per metre of camera distance: about 22% of the view width per second at any zoom (FOV 28, 16:9). */
  speedPerMetre: 0.2,
  fastMultiplier: 3,
  /** Zoom speed: rate of change of the log of the distance, per second (twice as far in one second). */
  zoomRate: Math.LN2,
  /** Below these the motion has stopped. */
  stopSpeed: 0.01,
  stopZoomRate: 0.001,
  /** Longest step of one frame, so one stalled frame cannot throw the view across the floor. */
  maxStepSec: 0.25,
} as const;

/** OrbitControls keeps (1 - damping) of its motion per frame; as a continuous decay at 60 fps, per second. */
const DECAY_PER_SEC = -60 * Math.log(1 - ORBIT_DAMPING);

export type KeyAction = 'left' | 'right' | 'forward' | 'back' | 'zoomIn' | 'zoomOut';

const ACTIONS: ReadonlyMap<string, KeyAction> = new Map([
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
  ['ArrowUp', 'forward'],
  ['ArrowDown', 'back'],
  // the unshifted and the shifted character of each key, and the numeric keypad's
  ['+', 'zoomIn'],
  ['=', 'zoomIn'],
  ['-', 'zoomOut'],
  ['_', 'zoomOut'],
]);

export const keyAction = (key: string): KeyAction | null => ACTIONS.get(key) ?? null;

/**
 * May the focused element give its arrow keys to the camera? An allowlist: the page itself or the scene region and what
 * is inside it. Everything else (the search box, tray, inspector, top bar, dialogs and popovers, which portal outside
 * the region) keeps its keys; the second check covers anything of that kind placed inside the region.
 */
export function focusAllowsSceneKeys(active: Element | null): boolean {
  if (!active) return true;
  const doc = active.ownerDocument;
  if (active === doc.body || active === doc.documentElement) return true;
  if (!active.closest(SCENE_KEYS_SELECTOR)) return false;
  return !active.closest(
    'input,textarea,select,dialog,[contenteditable]:not([contenteditable="false"]),[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"],[role="tablist"]',
  );
}

export interface KeyEventLike {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
}

export interface KeyAxes {
  /** Right is positive. */
  x: -1 | 0 | 1;
  /** Forward is positive. */
  z: -1 | 0 | 1;
  /** Further away is positive. */
  zoom: -1 | 0 | 1;
}

const NO_AXES: Readonly<KeyAxes> = Object.freeze({ x: 0, z: 0, zoom: 0 });

/**
 * Which camera keys are down, from keydown and keyup alone: repeat events start nothing, so holding a key cannot
 * stutter. Held keys are stored by `code` because Shift changes `key` between the press and the release of `+`.
 */
export class KeyInput {
  shift = false;
  private readonly held = new Map<string, KeyAction>();
  /** Last press landed outside the scene with focus left on the page: Chrome then scrolls that panel with the arrows. */
  private pointerOutside = false;

  /** @returns true when the key was consumed, and only then must the caller call preventDefault */
  keydown(e: KeyEventLike, active: Element | null): boolean {
    this.shift = e.shiftKey;
    if (e.ctrlKey || e.altKey || e.metaKey) {
      // a shortcut owns the keyboard now, and it may swallow the keyup (Alt+Left navigates)
      this.clear();
      return false;
    }
    const action = keyAction(e.key);
    if (!action || e.defaultPrevented) return false;
    if (e.repeat) return this.held.has(e.code);
    if (!this.allowed(active)) return false;
    this.held.set(e.code, action);
    return true;
  }

  keyup(e: Pick<KeyEventLike, 'code' | 'shiftKey'>): void {
    this.shift = e.shiftKey;
    this.held.delete(e.code);
  }

  /** A press anywhere on the page, before it moves the focus. */
  pointerdown(target: Element | null): void {
    this.pointerOutside = !target?.closest(SCENE_KEYS_SELECTOR);
    if (this.pointerOutside) this.held.clear();
  }

  /** The focus moved to `active`: the press that may have caused it no longer decides, the focused element does. */
  focusin(active: Element | null): void {
    this.pointerOutside = false;
    if (!focusAllowsSceneKeys(active)) this.held.clear();
  }

  /** The window lost the keyboard: the keyups will never arrive. */
  clear(): void {
    this.held.clear();
    this.shift = false;
  }

  axes(): Readonly<KeyAxes> {
    if (this.held.size === 0) return NO_AXES;
    let left = 0;
    let right = 0;
    let forward = 0;
    let back = 0;
    let zoomIn = 0;
    let zoomOut = 0;
    for (const action of this.held.values()) {
      if (action === 'left') left = 1;
      else if (action === 'right') right = 1;
      else if (action === 'forward') forward = 1;
      else if (action === 'back') back = 1;
      else if (action === 'zoomIn') zoomIn = 1;
      else zoomOut = 1;
    }
    return {
      x: (right - left) as KeyAxes['x'],
      z: (forward - back) as KeyAxes['z'],
      zoom: (zoomOut - zoomIn) as KeyAxes['zoom'],
    };
  }

  private allowed(active: Element | null): boolean {
    if (!focusAllowsSceneKeys(active)) return false;
    const onPage =
      !active ||
      active === active.ownerDocument.body ||
      active === active.ownerDocument.documentElement;
    return !(onPage && this.pointerOutside);
  }
}

export interface PanLimits {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** How far the orbit target may go past the footprint and apron bounds, in metres. */
export const PAN_MARGIN = 4;

export function panLimits(bounds: Readonly<PanLimits>, margin: number): Readonly<PanLimits> {
  return {
    minX: bounds.minX - margin,
    maxX: bounds.maxX + margin,
    minZ: bounds.minZ - margin,
    maxZ: bounds.maxZ + margin,
  };
}

/** Pan speed for a camera `distance` from its target, in metres per second. */
export function panSpeed(distance: number, fast: boolean): number {
  return distance * KEY_PAN.speedPerMetre * (fast ? KEY_PAN.fastMultiplier : 1);
}

export interface GroundVelocity {
  x: number;
  z: number;
}

/**
 * Velocity over the floor for the held keys, relative to where the camera looks. `offsetX` and `offsetZ` are the
 * horizontal part of camera position minus orbit target. Diagonals keep the same speed.
 */
export function panVelocity(
  axes: Readonly<Pick<KeyAxes, 'x' | 'z'>>,
  offsetX: number,
  offsetZ: number,
  speed: number,
): GroundVelocity {
  const horizontal = Math.hypot(offsetX, offsetZ);
  const length = Math.hypot(axes.x, axes.z);
  // the polar limit keeps the camera off the vertical, so `horizontal` is 0 only for a degenerate pose
  if (horizontal === 0 || length === 0) return { x: 0, z: 0 };
  const forwardX = -offsetX / horizontal;
  const forwardZ = -offsetZ / horizontal;
  // three.js is right-handed with y up: looking along -z, right is +x
  const rightX = -forwardZ;
  const rightZ = forwardX;
  const scale = speed / length;
  return {
    x: (axes.x * rightX + axes.z * forwardX) * scale,
    z: (axes.x * rightZ + axes.z * forwardZ) * scale,
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Eases `v` towards `want` for `dt` with the orbit decay. `moved` is the exact integral, so frame rate changes nothing. */
function ease(v: number, want: number, dt: number): { v: number; moved: number } {
  const keep = Math.exp(-DECAY_PER_SEC * dt);
  return {
    v: want + (v - want) * keep,
    moved: want * dt + ((v - want) * (1 - keep)) / DECAY_PER_SEC,
  };
}

export interface PanState {
  /** Velocity in metres per second. */
  vx: number;
  vz: number;
  /** Orbit target on the floor. */
  x: number;
  z: number;
}

/**
 * One step of the pan. The target is clamped before it is used, so the camera never goes past a limit to be pulled
 * back, and the velocity into a limit is dropped: pressed against an edge the view rests or slides along it, never jitters.
 */
export function stepPan(
  state: Readonly<PanState>,
  want: Readonly<GroundVelocity>,
  limits: Readonly<PanLimits>,
  dt: number,
): PanState {
  const ex = ease(state.vx, want.x, dt);
  const ez = ease(state.vz, want.z, dt);
  const rawX = state.x + ex.moved;
  const rawZ = state.z + ez.moved;
  const x = clamp(rawX, limits.minX, limits.maxX);
  const z = clamp(rawZ, limits.minZ, limits.maxZ);
  let vx = x === rawX ? ex.v : 0;
  let vz = z === rawZ ? ez.v : 0;
  if (want.x === 0 && want.z === 0 && Math.hypot(vx, vz) < KEY_PAN.stopSpeed) {
    vx = 0;
    vz = 0;
  }
  return { vx, vz, x, z };
}

export interface ZoomState {
  /** Rate of change of the log of the distance, per second. */
  rate: number;
  distance: number;
}

/** One step of the keyboard zoom, with the same easing and the same clamp-first rule as the pan. */
export function stepZoom(
  state: Readonly<ZoomState>,
  axis: KeyAxes['zoom'],
  minDistance: number,
  maxDistance: number,
  dt: number,
): ZoomState {
  const e = ease(state.rate, axis * KEY_PAN.zoomRate, dt);
  const raw = state.distance * Math.exp(e.moved);
  const distance = clamp(raw, minDistance, maxDistance);
  const stopped = axis === 0 && Math.abs(e.v) < KEY_PAN.stopZoomRate;
  return { rate: distance === raw && !stopped ? e.v : 0, distance };
}
