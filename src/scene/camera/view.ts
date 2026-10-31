// Camera field of view and the screen-space safe area (docs/06 section 2: "default framing shows all 7 bays with
// margins so cards never cover a bay; use camera.setViewOffset / safe-area padding equal to the card columns").
// Pure maths (three.js only as a type), so it is unit-tested directly.

import type { PerspectiveCamera } from 'three';

/** Vertical field of view the canvas shows, in degrees (docs/06: 26 to 30). */
export const CAMERA_FOV = 28;

/** Pixel insets of the region the 2D overlays leave free. */
export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The /live overlay layout (Task 09): top 120 (the KPI row, measured inside the canvas), the right inspector/tray column
 * at most 360 px wide plus a 24 px gap, bottom 88 (the collapsed 56 px visit tracker, its 24 px margin and an 8 px gap), left 24.
 */
export const SCENE_SAFE_AREA: Readonly<SafeArea> = Object.freeze({
  top: 120,
  right: 384,
  bottom: 88,
  left: 24,
});

export const NO_SAFE_AREA: Readonly<SafeArea> = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

/** Below this share of the canvas per axis the insets shrink proportionally (small or embedded canvases). */
const MIN_FREE_SHARE = 0.4;

export interface ViewOffset {
  fullWidth: number;
  fullHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewFit {
  /** Camera fov (deg) to set: wider than CAMERA_FOV by the view-offset enlargement, so the canvas shows CAMERA_FOV. */
  fov: number;
  /** Arguments for `camera.setViewOffset`, or null when the safe area is centred (no offset needed). */
  offset: ViewOffset | null;
  /** Tangents of the half-angles the safe rectangle subtends (horizontal, vertical); used to fit presets. */
  tanX: number;
  tanY: number;
  /** Centre of the safe rectangle in canvas pixels: the camera's optical axis projects here. */
  centre: { x: number; y: number };
  /** The insets actually applied (after shrinking for small canvases). */
  insets: SafeArea;
}

function shrink(a: number, b: number, length: number): [number, number] {
  const max = length * (1 - MIN_FREE_SHARE);
  const sum = a + b;
  if (sum <= max || sum <= 0) return [a, b];
  const k = max / sum;
  return [a * k, b * k];
}

/**
 * Where the scene must be framed on a `width` x `height` canvas with `safe` insets. The optical axis is moved to the
 * safe rectangle's centre with an aspect-preserving view offset: the camera renders a virtual image `k` times the
 * canvas and the canvas shows the window around the safe centre. Keeping the full image at the canvas aspect means
 * React Three Fiber's own resize handling (which sets `aspect = width / height`) never distorts it.
 */
export function viewFit(
  width: number,
  height: number,
  safe: Readonly<SafeArea> = NO_SAFE_AREA,
  fovDeg = CAMERA_FOV,
): ViewFit {
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const [left, right] = shrink(Math.max(0, safe.left), Math.max(0, safe.right), W);
  const [top, bottom] = shrink(Math.max(0, safe.top), Math.max(0, safe.bottom), H);
  const ox = (left - right) / 2;
  const oy = (top - bottom) / 2;
  const k = Math.max(1 + (2 * Math.abs(ox)) / W, 1 + (2 * Math.abs(oy)) / H);
  const cx = left + (W - left - right) / 2;
  const cy = top + (H - top - bottom) / 2;
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const offset: ViewOffset | null =
    ox === 0 && oy === 0
      ? null
      : {
          fullWidth: k * W,
          fullHeight: k * H,
          x: (k * W) / 2 - cx,
          y: (k * H) / 2 - cy,
          width: W,
          height: H,
        };
  return {
    fov: (Math.atan(k * t) * 360) / Math.PI,
    offset,
    tanX: (t * (W - left - right)) / H,
    tanY: (t * (H - top - bottom)) / H,
    centre: { x: cx, y: cy },
    insets: { top, right, bottom, left },
  };
}

/** Apply a view fit to a perspective camera: widened fov plus the view offset that centres the safe rectangle. */
export function applyViewFit(camera: PerspectiveCamera, fit: ViewFit): void {
  camera.fov = fit.fov;
  if (fit.offset) {
    const o = fit.offset;
    camera.setViewOffset(o.fullWidth, o.fullHeight, o.x, o.y, o.width, o.height);
  } else {
    camera.clearViewOffset();
  }
  camera.updateProjectionMatrix();
}

/** Fly-to duration (docs/06 section 2: 700 to 900 ms, easeInOutCubic). */
export const FLY_MS = 800;

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
