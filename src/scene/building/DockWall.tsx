import { useEffect, useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { bayToThree } from '../frame';
import { UNIT_PLANE } from '../geometry';
import type { BoxItem, CylItem } from '../items';
import { stripeTexture } from '../labels/textures';
import { BoxInstances, CylInstances } from '../primitives';
import { WALL_THICKNESS, type FaceLayout, type SiteLayout } from '../site/layout';
import { BAND_HEIGHT } from './bandHeight';

export { BAND_HEIGHT } from './bandHeight';

/**
 * Dock wall of one face, in the face frame (origin at the face midpoint on the footprint edge, floor level):
 * rounded white piers between the door openings, a band above them with the --scene-wall-accent stripe on the shed
 * side (the bay number pills sit on it, docs/06 section 2) and a rounded accent cap. The yard side of the band
 * carries the facade stripes, which are physical paint from config (the one allowed exception to "tokens only").
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
      // accent stripe on the shed side of the band
      {
        at: [0, t + 0.02, doorH + BAND_HEIGHT * 0.58],
        size: [face.length - 0.2, 0.05, BAND_HEIGHT * 0.56],
        tone: 'wallAccent',
        detail: 'lo',
      },
    );
    return out;
  }, [face, half, t, doorH]);

  const cap = useMemo<CylItem[]>(
    () => [
      {
        at: [0, t / 2, top + 0.02],
        radius: t / 2 + 0.03,
        length: face.length,
        axis: 'x',
        tone: 'wallAccent',
      },
    ],
    [face.length, t, top],
  );

  const stripe = useMemo(() => {
    const tex = stripeTexture(layout.facade.colors, layout.facade.stripeWidth, face.length);
    return new MeshStandardMaterial({ map: tex, roughness: 0.7 });
  }, [layout.facade, face.length]);
  useEffect(() => () => stripe.dispose(), [stripe]);

  return (
    <group>
      <BoxInstances items={items} cast />
      <CylInstances items={cap} />
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
