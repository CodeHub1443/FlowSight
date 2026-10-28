import type { SiteLayout } from '../site/layout';
import { bayToSite, type Vec3 } from '../site/transforms';
import { CAMERA_FOV, type ViewFit } from './view';

// Camera presets (docs/04 section 6) as pure functions of the layout and the view fit (the safe rectangle the
// overlays leave free), defined in the primary dock face's bay frame so they work for any face. Each preset names
// a region of the face frame and an orbit direction; the distance is the smallest one at which every corner of the
// region projects inside the safe rectangle, with a margin.

export const SCENE_PRESETS = ['floorOverview', 'dockWall', 'stagingAisle', 'apron'] as const;
export type ScenePreset = (typeof SCENE_PRESETS)[number];

export { CAMERA_FOV };
export const MIN_DISTANCE = 10;
export const MAX_DISTANCE = 120;
export const MIN_POLAR = (20 * Math.PI) / 180;
export const MAX_POLAR = (80 * Math.PI) / 180;

export type Triple = [number, number, number];
export interface CameraPose {
  position: Triple;
  target: Triple;
}

/** The part of a ViewFit the presets need. */
export type FitView = Pick<ViewFit, 'tanX' | 'tanY'>;

const rad = (d: number) => (d * Math.PI) / 180;

/** Fit for a plain canvas of `aspect` with no safe area. */
export function plainFit(aspect: number): FitView {
  const t = Math.tan(rad(CAMERA_FOV) / 2);
  return { tanX: t * aspect, tanY: t };
}

export function isScenePreset(v: string): v is ScenePreset {
  return (SCENE_PRESETS as readonly string[]).includes(v);
}

const sub = (a: Triple, b: Triple): Triple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Triple, b: Triple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Triple, b: Triple): Triple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Triple): Triple => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Smallest distance from `target` along `dir` (unit, target -> camera) at which every point projects inside the
 * fitted view, shrunk by `margin` (> 1 leaves space). Monotonic in the distance, so a bisection is exact enough.
 */
export function fitDistance(
  points: readonly Triple[],
  target: Triple,
  dir: Triple,
  fit: FitView,
  margin = 1.06,
): number {
  const forward: Triple = [-dir[0], -dir[1], -dir[2]];
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const fits = (d: number) =>
    points.every((p) => {
      const rel = sub(p, [target[0] + dir[0] * d, target[1] + dir[1] * d, target[2] + dir[2] * d]);
      const z = dot(rel, forward);
      if (z <= 0.1) return false;
      return (
        Math.abs(dot(rel, right)) * margin <= fit.tanX * z &&
        Math.abs(dot(rel, up)) * margin <= fit.tanY * z
      );
    });
  let lo = MIN_DISTANCE;
  let hi = MAX_DISTANCE * 0.98;
  if (fits(lo)) return lo;
  if (!fits(hi)) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Move a fitted camera along its own up axis until the highest point touches the top of the fitted view (shrunk by
 * `margin`), then slide the orbit target along the new view ray back to the target's height. Depths are unchanged,
 * so the horizontal fit still holds and every point stays inside; the target still projects to the view centre.
 * Width-bound framings then spend their vertical slack below the region instead of above it.
 */
export function alignTop(
  points: readonly Triple[],
  pose: CameraPose,
  fit: FitView,
  margin = 1.06,
): CameraPose {
  const { position: c, target: t } = pose;
  const forward = norm(sub(t, c));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const rel = points.map((p) => sub(p, c));
  const top = (d: number) =>
    Math.max(...rel.map((r) => (dot(r, up) - d) / dot(r, forward))) * margin - fit.tanY;
  // top(0) <= 0 for a fitted pose; moving down (d < 0) raises every point
  let lo = -MAX_DISTANCE;
  let hi = 0;
  if (top(lo) < 0) return pose;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (top(mid) >= 0) lo = mid;
    else hi = mid;
  }
  const p: Triple = [c[0] + up[0] * hi, c[1] + up[1] * hi, c[2] + up[2] * hi];
  const s = forward[1] < -1e-6 ? (t[1] - p[1]) / forward[1] : dist3(t, c);
  return {
    position: p,
    target: [p[0] + forward[0] * s, p[1] + forward[1] * s, p[2] + forward[2] * s],
  };
}

const dist3 = (a: Triple, b: Triple) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Default /live framing (docs/06 section 2, Task 08), face-frame metres: all bays across, from the top of the dock
 * wall band (`wall`, just outside the wall line, `wallHeight` up) to the forklift aisle behind staging (`back`, with
 * stacks up to `backHeight`), top-aligned so the dock wall sits at the top of the safe area.
 */
export const FLOOR_OVERVIEW = Object.freeze({
  wall: -0.6,
  wallHeight: 5,
  back: 17,
  backHeight: 1.2,
  // steeper than the bay presets: at 16:9 the 45 m wide face is width-bound, and 60 deg lets the 17 m of depth
  // fill more of the height (staging then ends about 60 % down; only the first storage rows remain in view)
  elevation: 60,
  lean: 0,
  margin: 1.03,
});

/** Pose for a preset or a bay id; `undefined` for an unknown bay id. */
export function presetPose(
  layout: SiteLayout,
  preset: ScenePreset | string,
  fit: FitView,
): CameraPose | undefined {
  const face = layout.faces[0];
  if (!face) {
    const d = Math.max(layout.footprint.width, layout.footprint.depth);
    return { position: [0, d, d * 0.6], target: [0, 0, 0] };
  }
  const fl = layout.floorLevel;
  const site = (p: Vec3): Triple => {
    const s = bayToSite(face.face, face.origin, p, fl);
    return [s.X, s.Y, s.Z];
  };
  // directions: the horizontal part of the face -> site mapping is a rotation (floor level 0, y >= 0)
  const siteDir = (v: Vec3): Triple => {
    const o = bayToSite(face.face, { X: 0, Z: 0 }, { x: 0, y: 0, z: 0 }, 0);
    const s = bayToSite(face.face, { X: 0, Z: 0 }, v, 0);
    // bayToSite puts y < 0 at yard grade; for a direction only the rotation matters
    return norm([s.X - o.X, v.z, s.Z - o.Z]);
  };
  const xs = face.bays.map((b) => b.localX);
  const x0 = xs.length ? Math.min(...xs) - face.pitch / 2 : -face.length / 2;
  const x1 = xs.length ? Math.max(...xs) + face.pitch / 2 : face.length / 2;
  const cx = (x0 + x1) / 2;

  /** The eight corners of the face-frame box [x0,x1] x [y0,y1] x [z0,z1]. */
  const box = (region: readonly [number, number, number, number, number, number]): Vec3[] => {
    const [rx0, rx1, ry0, ry1, rz0, rz1] = region;
    const out: Vec3[] = [];
    for (const x of [rx0, rx1])
      for (const y of [ry0, ry1]) for (const z of [rz0, rz1]) out.push({ x, y, z });
    return out;
  };

  /** Face-frame points, viewed from the interior side at elevation `el`. */
  const frame = (
    points: readonly Vec3[],
    target: Vec3,
    el: number,
    lean: number,
    margin: number,
    topAligned = false,
  ): CameraPose => {
    const corners = points.map(site);
    const t = site(target);
    const h = Math.cos(rad(el));
    const dir = siteDir({ x: lean * h, y: Math.sqrt(1 - lean * lean) * h, z: Math.sin(rad(el)) });
    const d = fitDistance(corners, t, dir, fit, margin);
    const pose: CameraPose = {
      target: t,
      position: [t[0] + dir[0] * d, t[1] + dir[1] * d, t[2] + dir[2] * d],
    };
    return topAligned ? alignTop(corners, pose, fit, margin) : pose;
  };

  switch (preset) {
    case 'floorOverview': {
      const o = FLOOR_OVERVIEW;
      // the dock wall band and the low stacks at the back of staging (a full-height box would let its tall back
      // corners, closest to the camera, set the distance)
      const points: Vec3[] = [x0, x1].flatMap((x) => [
        { x, y: o.wall, z: 0 },
        { x, y: o.wall, z: o.wallHeight },
        { x, y: o.back, z: 0 },
        { x, y: o.back, z: o.backHeight },
      ]);
      return frame(
        points,
        { x: cx, y: (o.wall + o.back) / 2, z: 0.4 },
        o.elevation,
        o.lean,
        o.margin,
        true,
      );
    }
    case 'dockWall':
      return frame(box([x0, x1, 0, 2, 0, 5]), { x: cx, y: 0.8, z: 1.9 }, 16, 0, 1.03);
    case 'stagingAisle': {
      const w = Math.min(x1 - x0, 3 * face.pitch) / 2;
      return frame(
        box([cx - w, cx + w, 8.5, 21, 0, 1.5]),
        { x: cx, y: 14.5, z: 0.3 },
        42,
        0.25,
        1.04,
      );
    }
    case 'apron':
      return frame(
        box([x0, x1, -face.apron.depth, 0, 0, 4]),
        { x: cx, y: -6, z: 0.5 },
        56,
        0,
        1.03,
      );
    default: {
      const bay = layout.bays.find((b) => b.id === preset);
      if (!bay) return undefined;
      const hw = bay.pitch / 2;
      return frame(
        // belt mouth to the truck rear: the door, the conveyor and the receiving pallet
        box([bay.localX - hw, bay.localX + hw, -1.5, 10.5, 0, 1.2]),
        { x: bay.localX, y: 4.5, z: 0.6 },
        42,
        0.05,
        1.04,
      );
    }
  }
}
