import type { SiteLayout } from '../site/layout';
import { bayToSite, type Vec3 } from '../site/transforms';

// Camera presets (docs/04 section 6) as pure functions of the layout and the viewport aspect, defined in the
// primary dock face's bay frame so they work for any face.

export const SCENE_PRESETS = ['floorOverview', 'dockWall', 'stagingAisle', 'apron'] as const;
export type ScenePreset = (typeof SCENE_PRESETS)[number];

export const CAMERA_FOV = 30;
export const MIN_DISTANCE = 10;
export const MAX_DISTANCE = 120;
export const MIN_POLAR = (20 * Math.PI) / 180;
export const MAX_POLAR = (80 * Math.PI) / 180;

export type Triple = [number, number, number];
export interface CameraPose {
  position: Triple;
  target: Triple;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Distance at which a `width` x `height` metre rectangle fills the view, with margin. */
export function fitDistance(width: number, height: number, aspect: number, margin = 1.08): number {
  const t = Math.tan(rad(CAMERA_FOV) / 2);
  return Math.min(
    MAX_DISTANCE * 0.98,
    Math.max(MIN_DISTANCE, margin * Math.max(height / 2 / t, width / 2 / (t * aspect))),
  );
}

export function isScenePreset(v: string): v is ScenePreset {
  return (SCENE_PRESETS as readonly string[]).includes(v);
}

/** Pose for a preset or a bay id; `undefined` for an unknown bay id. */
export function presetPose(
  layout: SiteLayout,
  preset: ScenePreset | string,
  aspect: number,
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
  const xs = face.bays.map((b) => b.localX);
  const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const span = xs.length ? Math.max(...xs) - Math.min(...xs) + face.pitch : face.length;
  /** Camera on the interior side of `target` (local), at elevation `el`, distance `d`, lateral lean `lean`. */
  const orbit = (
    tx: number,
    ty: number,
    tz: number,
    el: number,
    d: number,
    lean: number,
  ): CameraPose => {
    const dh = d * Math.cos(rad(el));
    const dz = d * Math.sin(rad(el));
    return {
      target: site({ x: tx, y: ty, z: tz }),
      position: site({ x: tx + lean * dh, y: ty + Math.sqrt(1 - lean * lean) * dh, z: tz + dz }),
    };
  };

  switch (preset) {
    case 'floorOverview': {
      const d = fitDistance(span + 4, 34, aspect, 1.1);
      return orbit(cx + 1, 5.5, 0.5, 55, d, 0.06);
    }
    case 'dockWall': {
      const d = fitDistance(span + 3, 6, aspect, 1.02);
      return orbit(cx, 0, 1.2, 18, d, 0);
    }
    case 'stagingAisle': {
      const d = fitDistance(Math.min(span, 3 * face.pitch) + 2, 16, aspect);
      return orbit(cx, 14, 0.3, 42, d, 0.25);
    }
    case 'apron': {
      const d = fitDistance(span + 4, (face.apron.depth + 2) * Math.sin(rad(56)), aspect);
      return orbit(cx, -6, 0.5, 56, d, 0);
    }
    default: {
      const bay = layout.bays.find((b) => b.id === preset);
      if (!bay) return undefined;
      return orbit(bay.localX, 2.5, 0.6, 48, 19, 0.05);
    }
  }
}
