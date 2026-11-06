import { useEffect, useRef, type RefObject } from 'react';
import type { Object3D, WebGLRenderer } from 'three';
import { collectSceneResources, disposeAll } from './gpuRelease';

export interface CreatedScene {
  gl: WebGLRenderer;
  scene: Object3D;
}

/**
 * Releases what the scene's renderer still listens on when the scene unmounts (gpuRelease.ts). Set the returned ref
 * once the canvas is created. The resources are collected in the cleanup, while the scene graph is still whole, and
 * disposed a task later, and only if this was a real unmount and not StrictMode's cleanup-and-setup.
 */
export function useReleaseOnUnmount(): RefObject<CreatedScene | null> {
  const created = useRef<CreatedScene | null>(null);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const c = created.current;
      if (!c) return;
      const resources = collectSceneResources(c.gl, c.scene);
      setTimeout(() => {
        if (alive.current) return;
        created.current = null;
        disposeAll(resources);
      }, 0);
    };
  }, []);
  return created;
}
