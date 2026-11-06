import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { LatheGeometry, MeshBasicMaterial, SphereGeometry, type Group } from 'three';
import { UNIT_PLANE } from '../geometry';
import { sharedAcrossMounts } from '../gpuRelease';
import type { PaletteKey } from '../materials';
import { useSceneEnv } from '../sceneEnv';
import { HEAD_RADIUS, PIN_HEIGHT, teardropProfile } from './pinShape';
import { radialTexture } from './textures';

// docs/06 D9: a tall teardrop map pin with a white core and a soft shadow, gently bobbing. Bound to live events in
// step 9 (docs/04 section 5: colour by severity, default brand blue).

const BOB_PERIOD_S = 1.2;
const BOB_AMPLITUDE = 0.07;
/** The tip hovers this far above the base, so the bob never touches the floor. */
const HOVER = 0.14;
const SHADOW_SIZE = 1.1;
const SHADOW_ALPHA = 0.5;
const SEGMENTS = 24;

const BODY = sharedAcrossMounts(new LatheGeometry(teardropProfile(SEGMENTS), SEGMENTS));
BODY.computeVertexNormals();
const CORE = sharedAcrossMounts(new SphereGeometry(HEAD_RADIUS * 0.46, SEGMENTS, 16));

/** One event pin; `at` is the three.js world position of its base on the floor. */
export function EventPin({
  at,
  tone = 'brand',
}: {
  at: readonly [number, number, number];
  tone?: PaletteKey;
}) {
  const { materials, palette } = useSceneEnv();
  const pin = useRef<Group>(null);
  const shadow = useMemo(
    () =>
      new MeshBasicMaterial({
        map: radialTexture(SHADOW_ALPHA),
        color: palette.contactShade,
        transparent: true,
        depthWrite: false,
      }),
    [palette.contactShade],
  );
  useEffect(() => () => shadow.dispose(), [shadow]);
  useFrame(({ clock }) => {
    const g = pin.current;
    if (!g) return;
    const k = Math.sin((clock.elapsedTime * 2 * Math.PI) / BOB_PERIOD_S);
    g.position.y = HOVER + BOB_AMPLITUDE * k;
  });
  return (
    <group position={[at[0], at[1], at[2]]}>
      <mesh
        geometry={UNIT_PLANE}
        material={shadow}
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[SHADOW_SIZE, SHADOW_SIZE, 1]}
      />
      <group ref={pin} position={[0, HOVER, 0]}>
        <mesh geometry={BODY} material={materials[tone]} />
        <mesh
          geometry={CORE}
          material={materials.paintWhite}
          position={[0, PIN_HEIGHT - HEAD_RADIUS, 0]}
          scale={[1.02, 1.02, 1.02]}
        />
      </group>
    </group>
  );
}
