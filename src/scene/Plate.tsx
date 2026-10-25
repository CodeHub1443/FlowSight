import { useMemo } from 'react';
import { MeshBasicMaterial } from 'three';
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

/** A small textured text plate (door number, cabinet label) standing on a wall or box face. */
export function Plate({ at, size, text, style, facing }: PlateProps) {
  const [sw, sh] = size;
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        map: plateTexture(text, style, 256, Math.round((256 * sh) / sw)),
        toneMapped: false,
      }),
    [text, style, sw, sh],
  );
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
