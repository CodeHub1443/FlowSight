import { useEffect, useMemo } from 'react';
import { MeshBasicMaterial } from 'three';
import { FadeIn } from '../Appear';
import { UNIT_PLANE } from '../geometry';
import { radialTexture } from '../labels/textures';
import { useSceneEnv } from '../sceneEnv';
import { bracketGeometry } from './brackets';

// docs/06 D8: the selected object gets a wireframe bracket box (an L-tick on each of its 8 corners) and a translucent
// blue floor glow.

/** Peak opacity of the floor glow (docs/06 D8: 18 %), and how far it spreads beyond the box. */
const GLOW_ALPHA = 0.18;
const GLOW_SPREAD = 1.5;

/** Bracket box and floor glow of a selected bay; `center` is the three.js z of the box centre (bay frame origin). */
export function SelectionMarker({
  visible,
  width,
  depth,
  height,
  center,
}: {
  visible: boolean;
  width: number;
  depth: number;
  height: number;
  center: number;
}) {
  const { palette } = useSceneEnv();
  const brackets = useMemo(
    () => new MeshBasicMaterial({ color: palette.brand, transparent: true, opacity: 0 }),
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
      glow.dispose();
    },
    [brackets, glow],
  );
  return (
    <FadeIn visible={visible}>
      <mesh
        geometry={UNIT_PLANE}
        material={glow}
        position={[0, 0.02, center]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[width * GLOW_SPREAD, depth * GLOW_SPREAD, 1]}
      />
      <mesh
        geometry={bracketGeometry(width, height, depth)}
        material={brackets}
        position={[0, 0, center]}
      />
    </FadeIn>
  );
}
