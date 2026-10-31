import { useMemo } from 'react';
import type { ScenePreset } from './presets';

/** A preset name, or a bay id such as `B04`. */
export type FlyTarget = ScenePreset | (string & {});

interface Rig {
  flyTo(target: FlyTarget): void;
  /** Scale the distance to the orbit target (< 1 = closer), within the zoom limits. */
  zoomBy(factor: number): void;
  /** Orbit around the target by `radians` (positive = counter-clockwise from above). */
  orbitBy(radians: number): void;
}

// The camera rig lives inside <SceneRoot/>'s Canvas, while callers (tray rows, search, a preset switcher) live
// elsewhere in the React tree. A tiny module-level registry connects them without any store or React state.
let rig: Rig | null = null;
let pending: FlyTarget | null = null;

export const cameraController = {
  register(r: Rig): () => void {
    rig = r;
    if (pending !== null) {
      const p = pending;
      pending = null;
      r.flyTo(p);
    }
    return () => {
      if (rig === r) rig = null;
    };
  },
  flyTo(target: FlyTarget): void {
    if (rig) rig.flyTo(target);
    else pending = target;
  },
  zoomBy(factor: number): void {
    rig?.zoomBy(factor);
  },
  orbitBy(radians: number): void {
    rig?.orbitBy(radians);
  },
};

/** Stable API for moving the scene camera: `useSceneCamera().flyTo('floorOverview' | 'dockWall' | ... | 'B04')`. */
export function useSceneCamera(): Pick<typeof cameraController, 'flyTo' | 'zoomBy' | 'orbitBy'> {
  return useMemo(
    () => ({
      flyTo: cameraController.flyTo,
      zoomBy: cameraController.zoomBy,
      orbitBy: cameraController.orbitBy,
    }),
    [],
  );
}
