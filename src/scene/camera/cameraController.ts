import { useMemo } from 'react';
import type { ScenePreset } from './presets';

/** A preset name, or a bay id such as `B04`. */
export type FlyTarget = ScenePreset | (string & {});

interface Rig {
  flyTo(target: FlyTarget): void;
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
};

/** Stable API for moving the scene camera: `useSceneCamera().flyTo('floorOverview' | 'dockWall' | ... | 'B04')`. */
export function useSceneCamera(): { flyTo: (target: FlyTarget) => void } {
  return useMemo(() => ({ flyTo: cameraController.flyTo }), []);
}
