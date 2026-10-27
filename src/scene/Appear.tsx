import { useFrame } from '@react-three/fiber';
import { useRef, type ReactNode } from 'react';
import { MathUtils, type Group, type Material, type Mesh } from 'three';
import { contactShadows } from './contactShadowController';

// docs/06 section 2 "Motion: no popping, objects fade/scale in over 200 ms". Everything is ref-driven inside
// useFrame (no React state per frame); a finished animation costs one boolean check per frame.

export const APPEAR_MS = 200;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Children rise from the floor (scale along three Y from ~0 to 1) over 200 ms after mount. The group origin must be
 * on the floor. Contact shadows are re-rendered once the objects stand at full height.
 */
export function Appear({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  const start = useRef<number | null>(null);
  const done = useRef(false);
  useFrame(() => {
    const g = ref.current;
    if (!g || done.current) return;
    const now = performance.now();
    start.current ??= now;
    const k = MathUtils.clamp((now - start.current) / APPEAR_MS, 0, 1);
    g.scale.y = Math.max(1e-3, easeOutCubic(k));
    if (k >= 1) {
      done.current = true;
      contactShadows.invalidate();
    }
  });
  return (
    <group ref={ref} scale={[1, 1e-3, 1]}>
      {children}
    </group>
  );
}

function setOpacity(g: Group, opacity: number) {
  g.traverse((o) => {
    const m = (o as Mesh).material as Material | Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) mat.opacity = opacity;
  });
}

/**
 * Shows children while `visible`, fading and scaling them in over 200 ms (scale 0.96 -> 1 about the group origin)
 * and out over 120 ms. Child materials must be `transparent` and owned by the children (not shared).
 */
export function FadeIn({ visible, children }: { visible: boolean; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const k = useRef(0);
  const last = useRef<number | null>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const target = visible ? 1 : 0;
    const now = performance.now();
    const dt = last.current === null ? 0 : now - last.current;
    last.current = now;
    if (k.current === target) {
      g.visible = visible;
      return;
    }
    const step = dt / (visible ? APPEAR_MS : 120);
    k.current = visible ? Math.min(1, k.current + step) : Math.max(0, k.current - step);
    const e = easeOutCubic(k.current);
    g.visible = k.current > 0;
    g.scale.setScalar(0.96 + 0.04 * e);
    setOpacity(g, e);
  });
  return (
    <group ref={ref} visible={false}>
      {children}
    </group>
  );
}
