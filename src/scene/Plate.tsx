import { useEffect, useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { bayToThree, type V3 } from './frame';
import { UNIT_PLANE } from './geometry';
import { plateTexture, type PlateStyle } from './labels/textures';

interface PlateProps {
  at: V3;
  /** Width and height in metres. */
  size: readonly [number, number];
  text: string;
  style: PlateStyle;
  /** `in` faces bay +y (into the building), `out` faces bay -y (towards the yard). */
  facing: 'in' | 'out';
}

/** A small painted-on text plate (cabinet name), lit like the surface it sits on. */
export function Plate({ at, size, text, style, facing }: PlateProps) {
  const [sw, sh] = size;
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        map: plateTexture(text, style, 256, Math.round((256 * sh) / sw)),
        roughness: 0.7,
        transparent: true,
      }),
    [text, style, sw, sh],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh
      geometry={UNIT_PLANE}
      material={material}
      position={bayToThree(at)}
      scale={[size[0], size[1], 1]}
      rotation={[0, facing === 'in' ? Math.PI : 0, 0]}
    />
  );
}
