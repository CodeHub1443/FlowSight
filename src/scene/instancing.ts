import { useLayoutEffect, useMemo } from 'react';
import { type BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { bayToThree, type V3 } from './frame';
import { disposeInstancedGeometry, instancedGeometry } from './geometry';

// Helpers shared by the instanced box components (primitives.tsx, bay/DynamicBoxes.tsx).

/** Parent frame of a set of items: a pivot (bay frame) and a pitch about the x axis (e.g. the sloping conveyor). */
export interface ItemFrame {
  at: V3;
  pitch: number;
}

const _parent = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();

/** The matrix of `transform` (a shared scratch matrix: use it before the next call). */
export function parentMatrix(transform: ItemFrame | undefined): Matrix4 | null {
  if (!transform) return null;
  const at = bayToThree(transform.at);
  return _parent.compose(
    _p.set(at[0], at[1], at[2]),
    _q.setFromEuler(_e.set(transform.pitch, 0, 0)),
    _s.set(1, 1, 1),
  );
}

/** A per-mesh geometry with its own `instanceFinish`, released when the mesh goes (geometry.ts instancedGeometry). */
export function useInstanceGeometry(base: BufferGeometry, count: number): BufferGeometry {
  const geometry = useMemo(() => instancedGeometry(base, count), [base, count]);
  useLayoutEffect(() => () => disposeInstancedGeometry(geometry, base), [geometry, base]);
  return geometry;
}
