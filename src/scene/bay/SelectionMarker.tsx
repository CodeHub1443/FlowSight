import { useEffect, useMemo } from 'react';
import { MeshBasicMaterial, type BufferGeometry } from 'three';
import { FadeIn } from '../Appear';
import { UNIT_PLANE } from '../geometry';
import { radialTexture } from '../labels/textures';
import { useSceneEnv } from '../sceneEnv';
import { bracketGeometry } from './brackets';

// docs/06 D8 and section 7.3: the selected object gets a wireframe bracket box (an L-tick on each of its 8 corners), a
// translucent blue floor glow and a blue outline over its painted floor line. The marker depends only on `visible`;
// hover is drawn separately on top of it (Bay.tsx).

/** Peak opacity of the floor glow (docs/06 section 7.3), and how far it spreads beyond the box. */
const GLOW_ALPHA = 0.3;
const GLOW_SPREAD = 1.5;

/** Bracket box, floor glow and outline of a selected bay; `center` is the three.js z of the box centre (bay frame origin). */
export function SelectionMarker({
  visible,
  width,
  depth,
  height,
  center,
  outline,
  outlineAt,
}: {
  visible: boolean;
  width: number;
  depth: number;
  height: number;
  center: number;
  outline: BufferGeometry;
  outlineAt: readonly [number, number, number];
}) {
  const { palette } = useSceneEnv();
  const brackets = useMemo(
    () => new MeshBasicMaterial({ color: palette.brand, transparent: true, opacity: 0 }),
    [palette.brand],
  );
  const line = useMemo(
    () =>
      new MeshBasicMaterial({
        color: palette.brand,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [palette.brand],
  );
  const glow = useMemo(
    () =>
      new MeshBasicMaterial({
        map: radialTexture(GLOW_ALPHA),
        color: palette.brand,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [palette.brand],
  );
  useEffect(
    () => () => {
      brackets.dispose();
      line.dispose();
      glow.dispose();
    },
    [brackets, line, glow],
  );
  // New materials start at opacity 0 and FadeIn only writes opacity while animating: restart it when they change, or a
  // theme switch leaves the selected bay with an invisible marker.
  return (
    <FadeIn key={palette.brand} visible={visible}>
      <mesh
        geometry={UNIT_PLANE}
        material={glow}
        position={[0, 0.02, center]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[width * GLOW_SPREAD, depth * GLOW_SPREAD, 1]}
      />
      <mesh geometry={outline} material={line} position={[...outlineAt]} />
      <mesh
        geometry={bracketGeometry(width, height, depth)}
        material={brackets}
        position={[0, 0, center]}
      />
    </FadeIn>
  );
}
