import { useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { bayToThree } from '../frame';
import { UNIT_BOX } from '../geometry';
import { stripeTexture } from '../labels/textures';
import { Bx } from '../primitives';
import { useSceneEnv } from '../sceneEnv';
import { WALL_THICKNESS, type FaceLayout, type SiteLayout } from '../site/layout';

/** Height of the stripe band above the doors (docs/04 section 0: "a thin band"). */
export const BAND_HEIGHT = 1.0;

/**
 * Dock wall of one face, in the face frame (origin at the face midpoint on the footprint edge, floor level):
 * piers between the door openings and a thin blue/white stripe band above them. The facade colours are
 * physical paint from config (the one allowed exception to "tokens only").
 */
export function DockWall({ layout, face }: { layout: SiteLayout; face: FaceLayout }) {
  const { materials } = useSceneEnv();
  const t = WALL_THICKNESS;
  const doorH = face.door.height;
  const half = face.door.width / 2;

  const piers = useMemo(() => {
    const xs = face.bays.map((b) => b.localX).sort((a, b) => a - b);
    const edges: [number, number][] = [];
    let cursor = -face.length / 2;
    for (const x of xs) {
      edges.push([cursor, x - half]);
      cursor = x + half;
    }
    edges.push([cursor, face.length / 2]);
    return edges.filter(([a, b]) => b - a > 0.01);
  }, [face, half]);

  const stripe = useMemo(() => {
    const tex = stripeTexture(layout.facade.colors, layout.facade.stripeWidth, face.length);
    return new MeshStandardMaterial({ map: tex, roughness: 0.9 });
  }, [layout.facade, face.length]);

  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; +z is the yard side, -z the shed side.
  const bandMaterials = useMemo(
    () => [materials.wall, materials.wall, materials.wall, materials.wall, stripe, stripe],
    [materials.wall, stripe],
  );

  return (
    <group>
      {piers.map(([a, b]) => (
        <Bx key={a} at={[(a + b) / 2, t / 2, doorH / 2]} size={[b - a, t, doorH]} tone="wall" />
      ))}
      <mesh
        geometry={UNIT_BOX}
        material={bandMaterials}
        position={bayToThree([0, t / 2, doorH + BAND_HEIGHT / 2])}
        scale={[face.length, BAND_HEIGHT, t]}
        castShadow
      />
    </group>
  );
}
