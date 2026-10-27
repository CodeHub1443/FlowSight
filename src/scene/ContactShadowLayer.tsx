import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';
import { contactShadows } from './contactShadowController';
import { ContactShadowRenderer, type ContactShadowOptions } from './contactShadowRenderer';

// Soft contact shadows under everything on the shed floor, rendered on demand: on mount and whenever
// `contactShadows.invalidate()` is called (objects finished appearing, actors moved, theme or tier changed), at most
// `maxHz` times per second. A static scene costs nothing per frame; moving actors cost one small render per update.

interface Props extends ContactShadowOptions {
  /** Centre of the shadow plane (three.js), at the floor. */
  position: [number, number, number];
  maxHz: number;
}

export function ContactShadowLayer({
  position,
  maxHz,
  width,
  depth,
  far,
  color,
  opacity,
  blur,
  resolution,
}: Props) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const ref = useRef<Group>(null);
  const rendered = useRef(-1);
  const lastAt = useRef(0);

  const shadows = useMemo(
    () => new ContactShadowRenderer({ width, depth, far, color, opacity, blur, resolution }),
    [width, depth, far, color, opacity, blur, resolution],
  );
  useEffect(() => {
    contactShadows.invalidate();
    return () => shadows.dispose();
  }, [shadows]);

  useFrame(() => {
    const holder = ref.current;
    if (!holder || rendered.current === contactShadows.seq) return;
    const now = performance.now();
    if (now - lastAt.current < 1000 / maxHz) return;
    lastAt.current = now;
    rendered.current = contactShadows.seq;
    shadows.render(gl, scene, holder);
  });

  return (
    // the holder's local -Z (the shadow camera's view direction) points to three +Y: it looks up from the floor
    <group ref={ref} position={position} rotation={[Math.PI / 2, 0, 0]}>
      <mesh
        geometry={shadows.plane}
        material={shadows.material}
        scale={[1, -1, 1]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
    </group>
  );
}
