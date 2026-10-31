import { useEffect, useMemo } from 'react';
import { AdditiveBlending, MeshBasicMaterial, Object3D } from 'three';
import type { BeltStatus } from '@/domain';
import { bayToThree } from '../frame';
import { UNIT_PLANE } from '../geometry';
import { radialTexture } from '../labels/textures';
import { useSceneEnv } from '../sceneEnv';
import { WORK_LIGHT_LEVEL } from './status';

/** Height of the lamp above the belt mouth, and its candela at full level. */
const LAMP_HEIGHT = 7;
const LAMP_CANDELA = 170;
/** Diameter of the floor pool, and its additive strength at full level. */
const POOL_SIZE = 15;
const POOL_ALPHA = 0.3;

/**
 * The warm work-light pool of one bay in the dark theme (docs/06 section 8.3), at bay-frame `y`; the level follows the
 * belt status, so active bays glow and idle bays dim. A floor decal draws the pool on every tier, because a warm lamp
 * hardly shows on the blue floor; High and Med add a soft spot light that warms the props standing in it.
 */
export function WorkLight({ status, y }: { status: BeltStatus; y: number }) {
  const { palette, quality } = useSceneEnv();
  const level = WORK_LIGHT_LEVEL[status];
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(...bayToThree([0, y, 0]));
    return o;
  }, [y]);
  const pool = useMemo(
    () =>
      new MeshBasicMaterial({
        map: radialTexture(POOL_ALPHA),
        color: palette.workLight,
        blending: AdditiveBlending,
        opacity: level,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    [palette.workLight, level],
  );
  useEffect(() => () => pool.dispose(), [pool]);

  return (
    <>
      <mesh
        geometry={UNIT_PLANE}
        material={pool}
        position={bayToThree([0, y, 0.016])}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[POOL_SIZE, POOL_SIZE, 1]}
        visible={level > 0}
      />
      {quality.workLights === 'spot' && (
        <>
          <primitive object={target} />
          <spotLight
            position={bayToThree([0, y, LAMP_HEIGHT])}
            target={target}
            color={palette.workLight}
            intensity={LAMP_CANDELA * level}
            angle={0.72}
            penumbra={1}
            decay={2}
            distance={18}
          />
        </>
      )}
    </>
  );
}
