import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ElementRef } from 'react';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { SiteLayout } from '../site/layout';
import { cameraController, type FlyTarget } from './cameraController';
import {
  MAX_DISTANCE,
  MAX_POLAR,
  MIN_DISTANCE,
  MIN_POLAR,
  presetPose,
  type CameraPose,
} from './presets';
import { applyViewFit, easeInOutCubic, FLY_MS, NO_SAFE_AREA, viewFit, type SafeArea } from './view';

const PAN_MARGIN = 4;

interface Fly {
  t0: number;
  fromPos: Vector3;
  fromTarget: Vector3;
  toPos: Vector3;
  toTarget: Vector3;
}

/**
 * OrbitControls (damped, polar 20-80 deg, zoom 10-120 m, pan bounded to footprint + apron), the safe-area view
 * offset and the 800 ms eased fly-to. Everything per frame runs in refs and useFrame: no React state per frame.
 */
export function CameraRig({
  layout,
  safeArea = NO_SAFE_AREA,
}: {
  layout: SiteLayout;
  safeArea?: Readonly<SafeArea>;
}) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const fly = useRef<Fly | null>(null);
  /** Last preset shown; re-framed on resize until the user moves the camera. */
  const home = useRef<FlyTarget>('floorOverview');
  const userMoved = useRef(false);

  const fit = useMemo(() => viewFit(width, height, safeArea), [width, height, safeArea]);
  const fitRef = useRef(fit);

  const apply = (pose: CameraPose) => {
    camera.position.set(...pose.position);
    controls.current?.target.set(...pose.target);
    controls.current?.update();
  };

  // safe-area view offset; re-applied on every canvas resize (R3F resets aspect, the offset keeps the aspect)
  useLayoutEffect(() => {
    fitRef.current = fit;
    if (camera instanceof PerspectiveCamera) applyViewFit(camera, fit);
    if (!userMoved.current && !fly.current) {
      const pose = presetPose(layout, home.current, fit);
      if (pose) apply(pose);
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply only reads refs and the camera
  }, [fit, camera, layout, invalidate]);

  useEffect(
    () =>
      cameraController.register({
        flyTo(target: FlyTarget) {
          const c = controls.current;
          const pose = presetPose(layout, target, fitRef.current);
          if (!c || !pose) return;
          home.current = target;
          userMoved.current = false;
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
    [layout, camera, invalidate],
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
        userMoved.current = true;
      }}
    />
  );
}
