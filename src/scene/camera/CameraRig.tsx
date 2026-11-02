import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ElementRef } from 'react';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { SiteLayout } from '../site/layout';
import { cameraController, type FlyTarget } from './cameraController';
import {
  KEY_PAN,
  KeyInput,
  ORBIT_DAMPING,
  PAN_MARGIN,
  panLimits,
  panSpeed,
  panVelocity,
  stepPan,
  stepZoom,
} from './keyboardPan';
import {
  MAX_DISTANCE,
  MAX_POLAR,
  MIN_DISTANCE,
  MIN_POLAR,
  presetPose,
  type CameraPose,
} from './presets';
import { applyViewFit, easeInOutCubic, FLY_MS, NO_SAFE_AREA, viewFit, type SafeArea } from './view';

/** Map-control steps (docs/06 D10) ease quicker than a fly-to. */
const NUDGE_MS = 280;
const UP = new Vector3(0, 1, 0);

interface Fly {
  t0: number;
  ms: number;
  fromPos: Vector3;
  fromTarget: Vector3;
  toPos: Vector3;
  toTarget: Vector3;
}

/**
 * OrbitControls (damped, polar 20-80 deg, zoom 10-120 m, pan bounded to footprint + apron), the safe-area view
 * offset, the 800 ms eased fly-to and the keyboard motion (keyboardPan.ts). Everything per frame runs in refs and
 * useFrame: no React state per frame.
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
  const limits = useMemo(() => panLimits(layout.bounds, PAN_MARGIN), [layout]);
  const keys = useRef<KeyInput | null>(null);
  /** Key motion in progress: pan velocity over the floor (m/s) and zoom rate (log distance per second). */
  const keyMotion = useRef({ vx: 0, vz: 0, rate: 0 });

  const stopKeyMotion = () => {
    const m = keyMotion.current;
    m.vx = 0;
    m.vz = 0;
    m.rate = 0;
  };

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

  /** Ease the camera to a changed offset from the orbit target; it then counts as moved by the user. */
  const nudge = (change: (offset: Vector3) => void) => {
    const c = controls.current;
    if (!c) return;
    const offset = camera.position.clone().sub(c.target);
    change(offset);
    userMoved.current = true;
    stopKeyMotion();
    fly.current = {
      t0: performance.now(),
      ms: NUDGE_MS,
      fromPos: camera.position.clone(),
      fromTarget: c.target.clone(),
      toPos: offset.add(c.target),
      toTarget: c.target.clone(),
    };
    invalidate();
  };

  useEffect(
    () =>
      cameraController.register({
        flyTo(target: FlyTarget) {
          const c = controls.current;
          const pose = presetPose(layout, target, fitRef.current);
          if (!c || !pose) return;
          home.current = target;
          userMoved.current = false;
          stopKeyMotion();
          fly.current = {
            t0: performance.now(),
            ms: FLY_MS,
            fromPos: camera.position.clone(),
            fromTarget: c.target.clone(),
            toPos: new Vector3(...pose.position),
            toTarget: new Vector3(...pose.target),
          };
          invalidate();
        },
        zoomBy(factor) {
          nudge((offset) =>
            offset.setLength(MathUtils.clamp(offset.length() * factor, MIN_DISTANCE, MAX_DISTANCE)),
          );
        },
        orbitBy(radians) {
          nudge((offset) => offset.applyAxisAngle(UP, radians));
        },
        pose() {
          const c = controls.current;
          if (!c) return null;
          return {
            position: [camera.position.x, camera.position.y, camera.position.z],
            target: [c.target.x, c.target.y, c.target.z],
          };
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nudge only reads refs and the camera
    [layout, camera, invalidate],
  );

  // On the window, because the keys also work with nothing focused. Input state only: useFrame does the moving.
  useEffect(() => {
    const input = new KeyInput();
    keys.current = input;
    const onKeyDown = (e: KeyboardEvent) => {
      if (input.keydown(e, document.activeElement)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => input.keyup(e);
    const onPointerDown = (e: PointerEvent) =>
      input.pointerdown(e.target instanceof Element ? e.target : null);
    const onFocusIn = (e: FocusEvent) =>
      input.focusin(e.target instanceof Element ? e.target : null);
    const onBlur = () => input.clear();
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') input.clear();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // capture: it must run before a card or OrbitControls can stop the event
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      keys.current = null;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const tmp = useRef(new Vector3());
  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    const f = fly.current;
    if (f) {
      const k = MathUtils.clamp((performance.now() - f.t0) / f.ms, 0, 1);
      const e = easeInOutCubic(k);
      camera.position.lerpVectors(f.fromPos, f.toPos, e);
      c.target.lerpVectors(f.fromTarget, f.toTarget, e);
      if (k >= 1) fly.current = null;
      c.update();
      return;
    }
    const t = c.target;
    // keyboard motion: a translation (and a slide along the view for zoom), so the view direction stays valid
    const input = keys.current;
    const m = keyMotion.current;
    const axes = input?.axes();
    if (axes && (axes.x || axes.z || axes.zoom || m.vx || m.vz || m.rate)) {
      const dt = Math.min(delta, KEY_PAN.maxStepSec);
      const offset = tmp.current.copy(camera.position).sub(t);
      const distance = offset.length();
      const speed = panSpeed(distance, input?.shift ?? false);
      const want = panVelocity(axes, offset.x, offset.z, speed);
      const pan = stepPan({ vx: m.vx, vz: m.vz, x: t.x, z: t.z }, want, limits, dt);
      const zoom = stepZoom({ rate: m.rate, distance }, axes.zoom, MIN_DISTANCE, MAX_DISTANCE, dt);
      m.vx = pan.vx;
      m.vz = pan.vz;
      m.rate = zoom.rate;
      if (pan.x !== t.x || pan.z !== t.z || zoom.distance !== distance) {
        userMoved.current = true;
        offset.multiplyScalar(zoom.distance / distance);
        t.x = pan.x;
        t.z = pan.z;
        camera.position.copy(t).add(offset);
      }
    }
    // pan bounds: keep the orbit target over the footprint + apron, moving the camera with it
    const x = MathUtils.clamp(t.x, limits.minX, limits.maxX);
    const y = MathUtils.clamp(t.y, 0, 8);
    const z = MathUtils.clamp(t.z, limits.minZ, limits.maxZ);
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
      dampingFactor={ORBIT_DAMPING}
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
