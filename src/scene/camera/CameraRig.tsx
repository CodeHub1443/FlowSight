import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, type ElementRef } from 'react';
import { MathUtils, Vector3 } from 'three';
import type { SiteLayout } from '../site/layout';
import { cameraController, type FlyTarget } from './cameraController';
import {
  MAX_DISTANCE,
  MAX_POLAR,
  MIN_DISTANCE,
  MIN_POLAR,
  presetPose,
  type Triple,
} from './presets';

const FLY_MS = 800;
const aspectOf = (s: { width: number; height: number }) => s.width / Math.max(1, s.height);
const PAN_MARGIN = 4;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Fly {
  t0: number;
  fromPos: Vector3;
  fromTarget: Vector3;
  toPos: Vector3;
  toTarget: Vector3;
}

/**
 * OrbitControls (damped, polar 20-80 deg, zoom 10-120 m, pan bounded to footprint + apron) plus the 800 ms eased
 * fly-to. Everything runs in refs and useFrame: no React state per frame.
 */
export function CameraRig({ layout }: { layout: SiteLayout }) {
  const camera = useThree((s) => s.camera);
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const fly = useRef<Fly | null>(null);

  const apply = (pose: { position: Triple; target: Triple }) => {
    camera.position.set(...pose.position);
    controls.current?.target.set(...pose.target);
    controls.current?.update();
  };

  // initial pose
  useLayoutEffect(() => {
    const pose = presetPose(layout, 'floorOverview', aspectOf(get().size));
    if (pose) apply(pose);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on layout change
  }, [layout]);

  useEffect(
    () =>
      cameraController.register({
        flyTo(target: FlyTarget) {
          const c = controls.current;
          const pose = presetPose(layout, target, aspectOf(get().size));
          if (!c || !pose) return;
          fly.current = {
            t0: performance.now(),
            fromPos: camera.position.clone(),
            fromTarget: c.target.clone(),
            toPos: new Vector3(...pose.position),
            toTarget: new Vector3(...pose.target),
          };
          invalidate();
        },
      }),
    [layout, camera, invalidate, get],
  );

  const tmp = useRef(new Vector3());
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const f = fly.current;
    if (f) {
      const k = MathUtils.clamp((performance.now() - f.t0) / FLY_MS, 0, 1);
      const e = easeInOutCubic(k);
      camera.position.lerpVectors(f.fromPos, f.toPos, e);
      c.target.lerpVectors(f.fromTarget, f.toTarget, e);
      if (k >= 1) fly.current = null;
      c.update();
      return;
    }
    // pan bounds: keep the orbit target over the footprint + apron, moving the camera with it
    const b = layout.bounds;
    const t = c.target;
    const x = MathUtils.clamp(t.x, b.minX - PAN_MARGIN, b.maxX + PAN_MARGIN);
    const y = MathUtils.clamp(t.y, 0, 8);
    const z = MathUtils.clamp(t.z, b.minZ - PAN_MARGIN, b.maxZ + PAN_MARGIN);
    if (x !== t.x || y !== t.y || z !== t.z) {
      tmp.current.set(x - t.x, y - t.y, z - t.z);
      camera.position.add(tmp.current);
      t.set(x, y, z);
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      screenSpacePanning={false}
      onStart={() => {
        fly.current = null;
      }}
    />
  );
}
