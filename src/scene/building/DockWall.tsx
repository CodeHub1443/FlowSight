import { useEffect, useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { bayToThree } from '../frame';
import { UNIT_PLANE } from '../geometry';
import type { BoxItem } from '../items';
import { stripeTexture } from '../labels/textures';
import { BoxInstances } from '../primitives';
import { WALL_THICKNESS, type FaceLayout, type SiteLayout } from '../site/layout';
import { BAND_HEIGHT } from './bandHeight';

export { BAND_HEIGHT } from './bandHeight';

/** Spacing of the vertical panel ribs (docs/06 D5). */
const RIB_PITCH = 1.2;
/** Eave above the band: height and overhang beyond the wall on each side. */
const EAVE_H = 0.42;
const EAVE_OVERHANG = 0.14;

/**
 * Dock wall of one face, in the face frame (origin at the face midpoint on the footprint edge, floor level): pale
 * piers between the door openings and a band above them (the bay number pills sit on it, docs/06 section 2), both
 * with vertical panel ribs on the shed side, then a saturated blue eave with a lighter top face (docs/06 D5). The
 * yard side of the band carries the facade stripes, which are physical paint from config (the one allowed exception
 * to "tokens only").
 */
export function DockWall({ layout, face }: { layout: SiteLayout; face: FaceLayout }) {
  const t = WALL_THICKNESS;
  const doorH = face.door.height;
  const half = face.door.width / 2;
  const top = doorH + BAND_HEIGHT;

  const items = useMemo(() => {
    const xs = face.bays.map((b) => b.localX).sort((a, b) => a - b);
    const edges: [number, number][] = [];
    let cursor = -face.length / 2;
    for (const x of xs) {
      edges.push([cursor, x - half]);
      cursor = x + half;
    }
    edges.push([cursor, face.length / 2]);
    const out: BoxItem[] = edges
      .filter(([a, b]) => b - a > 0.01)
      .map(([a, b]) => ({
        at: [(a + b) / 2, t / 2, doorH / 2],
        size: [b - a, t, doorH],
        tone: 'wall',
        round: 0.05,
      }));
    out.push(
      {
        at: [0, t / 2, doorH + BAND_HEIGHT / 2],
        size: [face.length, t, BAND_HEIGHT],
        tone: 'wall',
        round: 0.05,
      },
      {
        at: [0, t / 2, top + EAVE_H / 2],
        size: [face.length + 0.1, t + 2 * EAVE_OVERHANG, EAVE_H],
        tone: 'wallAccent',
        round: 0.14,
        detail: 'hi',
      },
      {
        at: [0, t / 2, top + EAVE_H + 0.003],
        size: [face.length - 0.1, t + 2 * EAVE_OVERHANG - 0.12, 0.006],
        tone: 'eaveTop',
        detail: 'flat',
      },
    );
    // panel ribs on the shed side: down to the floor between the doors, band height over them
    for (let x = -face.length / 2 + RIB_PITCH / 2; x < face.length / 2; x += RIB_PITCH) {
      const overDoor = xs.some((d) => Math.abs(x - d) < half + 0.2);
      const z0 = overDoor ? doorH + 0.2 : 0;
      out.push({
        at: [x, t + 0.008, (z0 + top) / 2],
        size: [0.06, 0.016, top - z0],
        tone: 'wallRib',
        detail: 'flat',
      });
    }
    return out;
  }, [face, half, t, doorH, top]);

  const stripe = useMemo(() => {
    const tex = stripeTexture(layout.facade.colors, layout.facade.stripeWidth, face.length);
    return new MeshStandardMaterial({ map: tex, roughness: 0.7 });
  }, [layout.facade, face.length]);
  useEffect(() => () => stripe.dispose(), [stripe]);

  return (
    <group>
      <BoxInstances items={items} cast />
      {/* facade paint on the yard face of the band (a plane faces three +Z = bay -y, the yard) */}
      <mesh
        geometry={UNIT_PLANE}
        material={stripe}
        position={bayToThree([0, -0.012, doorH + BAND_HEIGHT / 2])}
        scale={[face.length - 0.1, BAND_HEIGHT - 0.12, 1]}
      />
    </group>
  );
}
