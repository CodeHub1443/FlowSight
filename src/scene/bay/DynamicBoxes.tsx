import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import {
  Color,
  Euler,
  type InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { bayToThree } from '../frame';
import { BOX_DEPTH_MATERIAL, BOX_MATERIAL, ROUND, unitBox, type Detail } from '../geometry';
import { parentMatrix, useInstanceGeometry, type ItemFrame } from '../instancing';
import type { BoxItem } from '../items';
import { emissiveOf, finishOf } from '../materials';
import { useSceneEnv } from '../sceneEnv';

// A small set of instanced boxes whose poses are rewritten from outside while something moves (the telescopic boom, the
// belt ticks, the door shutter). Colours and finishes are written once; the matrices only when `stamp()` changes, so a bay
// at rest costs one number comparison per frame and no upload. No React state: the poses come from bay/bayAnim.ts.

/** Pose of one box in the bay (or conveyor) frame; start from the item's resting pose and change what moves. */
export interface DynamicPose {
  x: number;
  y: number;
  z: number;
  /** Extents along x, y, z. */
  sx: number;
  sy: number;
  sz: number;
  /** False collapses the box to nothing. */
  visible: boolean;
}

interface DynamicBoxesProps {
  items: readonly BoxItem[];
  detail: Detail;
  transform?: ItemFrame;
  cast?: boolean;
  /** A number that changes whenever the poses must be rewritten. Read every frame: keep it a cheap property read. */
  stamp: () => number;
  /** Writes the pose of item `index` into `out` (already filled with the item's resting pose). */
  pose: (index: number, base: BoxItem, out: DynamicPose) => void;
}

const HIDDEN_SCALE = 1e-5;
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();
const _c = new Color();
const _out: DynamicPose = { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, visible: true };

function DynamicGroup({ items, detail, transform, cast, stamp, pose }: DynamicBoxesProps) {
  const { palette, shadows, theme, quality } = useSceneEnv();
  const flat = detail === 'flat';
  const ref = useRef<InstancedMesh>(null);
  const geometry = useInstanceGeometry(
    unitBox(flat ? 0 : quality.smoothness[detail as 'hi' | 'lo']),
    items.length,
  );
  const latest = useRef({ stamp, pose, items, transform });
  const written = useRef<number | null>(null);

  const write = () => {
    const mesh = ref.current;
    if (!mesh) return;
    const { pose: poseOf, items: list, transform: frame } = latest.current;
    const parent = parentMatrix(frame);
    for (let i = 0; i < list.length; i++) {
      const it = list[i] as BoxItem;
      _out.x = it.at[0];
      _out.y = it.at[1];
      _out.z = it.at[2];
      _out.sx = it.size[0];
      _out.sy = it.size[1];
      _out.sz = it.size[2];
      _out.visible = true;
      poseOf(i, it, _out);
      const at = bayToThree([_out.x, _out.y, _out.z]);
      _p.set(at[0], at[1], at[2]);
      if (_out.visible) _s.set(_out.sx, _out.sz, _out.sy);
      else _s.set(HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE);
      _q.setFromEuler(_e.set(0, it.yaw ?? 0, -(it.roll ?? 0), 'YZX'));
      _m.compose(_p, _q, _s);
      if (parent) _m.premultiply(parent);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  useLayoutEffect(() => {
    latest.current = { stamp, pose, items, transform };
  });

  // colours and finishes: once per palette, never per frame
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const finish = geometry.getAttribute('instanceFinish') as InstancedBufferAttribute;
    items.forEach((it, i) => {
      mesh.setColorAt(i, _c.set(palette[it.tone]).multiplyScalar(it.shade ?? 1));
      const f = finishOf(it.tone);
      finish.setXYZW(
        i,
        f.roughness,
        f.metalness,
        flat ? 0 : (it.round ?? ROUND),
        emissiveOf(it.tone, theme),
      );
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    finish.needsUpdate = true;
    write();
    written.current = latest.current.stamp();
  }, [items, palette, theme, geometry, flat, transform]);

  useFrame(() => {
    const s = latest.current.stamp();
    if (s === written.current) return;
    written.current = s;
    write();
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, BOX_MATERIAL, items.length]}
      customDepthMaterial={BOX_DEPTH_MATERIAL}
      castShadow={shadows && cast}
      receiveShadow={shadows}
    />
  );
}

/** See the file comment. Nothing is drawn for an empty list. */
export function DynamicBoxes(props: DynamicBoxesProps) {
  if (props.items.length === 0) return null;
  // a count change needs a new InstancedMesh
  return <DynamicGroup key={`${props.detail}-${props.items.length}`} {...props} />;
}
