import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from 'three';
import { bayToThree, type V3 } from './frame';
import { UNIT_BOX, UNIT_CYL, UNIT_PLANE } from './geometry';
import type { BoxItem, MarkItem } from './items';
import type { PaletteKey } from './materials';
import { useSceneEnv } from './sceneEnv';
import { plateTexture } from './labels/textures';

const INSTANCE_MATERIAL = new MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.9,
  metalness: 0,
});

interface BxProps {
  at: V3;
  /** Extents along bay x, y (into the building), z (up). */
  size: V3;
  tone: PaletteKey;
  yaw?: number;
  cast?: boolean;
  receive?: boolean;
}

/** One box in the bay/face frame, coloured by a shared palette material. */
export function Bx({ at, size, tone, yaw = 0, cast = true, receive = true }: BxProps) {
  const { materials, shadows } = useSceneEnv();
  return (
    <mesh
      geometry={UNIT_BOX}
      material={materials[tone]}
      position={bayToThree(at)}
      scale={[size[0], size[2], size[1]]}
      rotation={[0, yaw, 0]}
      castShadow={shadows && cast}
      receiveShadow={shadows && receive}
    />
  );
}

interface CylProps {
  at: V3;
  radius: number;
  length: number;
  /** Cylinder axis: bay x (rollers, shutter barrel) or bay z (posts). */
  axis: 'x' | 'z';
  tone: PaletteKey;
  cast?: boolean;
}

export function Cyl({ at, radius, length, axis, tone, cast = true }: CylProps) {
  const { materials, shadows } = useSceneEnv();
  return (
    <mesh
      geometry={UNIT_CYL}
      material={materials[tone]}
      position={bayToThree(at)}
      scale={[radius, length, radius]}
      rotation={axis === 'x' ? [0, 0, Math.PI / 2] : [0, 0, 0]}
      castShadow={shadows && cast}
    />
  );
}

interface BoxInstancesProps {
  items: readonly BoxItem[];
  /** `bay`: items in the bay/face frame. `three`: items already in three.js axes (x, y up, z). */
  mapping?: 'bay' | 'three';
  cast?: boolean;
  receive?: boolean;
  /** Parent frame the items live in: a pivot (bay frame) and a pitch about the x axis (e.g. the sloping conveyor). */
  transform?: { at: V3; pitch: number };
}

/** All items in one InstancedMesh (one draw call); colours come from the live palette so theme switches just refill. */
export function BoxInstances({
  items,
  mapping = 'bay',
  cast = false,
  receive = true,
  transform,
}: BoxInstancesProps) {
  const { palette, shadows } = useSceneEnv();
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const s = new Vector3();
    const p = new Vector3();
    const c = new Color();
    const parent = new Matrix4();
    if (transform) {
      const at = bayToThree(transform.at);
      parent.compose(
        p.set(at[0], at[1], at[2]),
        q.setFromEuler(e.set(transform.pitch, 0, 0)),
        s.set(1, 1, 1),
      );
    }
    items.forEach((it, i) => {
      const at = mapping === 'bay' ? bayToThree(it.at) : it.at;
      p.set(at[0], at[1], at[2]);
      if (mapping === 'bay') s.set(it.size[0], it.size[2], it.size[1]);
      else s.set(it.size[0], it.size[1], it.size[2]);
      q.setFromEuler(e.set(0, it.yaw ?? 0, 0));
      m.compose(p, q, s);
      if (transform) m.premultiply(parent);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(palette[it.tone]).multiplyScalar(it.shade ?? 1));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, palette, mapping, transform]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      key={items.length}
      ref={ref}
      args={[UNIT_BOX, INSTANCE_MATERIAL, items.length]}
      castShadow={shadows && cast}
      receiveShadow={shadows && receive}
    />
  );
}

/** FG / DC pallet marks: one instanced quad mesh per text, textured with a canvas plate. */
export function MarkInstances({ marks }: { marks: readonly MarkItem[] }) {
  const { palette } = useSceneEnv();
  const texts = ['FG', 'DC'] as const;
  return (
    <>
      {texts.map((text) => (
        <MarkGroup
          key={text}
          text={text}
          marks={marks.filter((m) => m.text === text)}
          fg={palette.brand}
        />
      ))}
    </>
  );
}

function MarkGroup({
  text,
  marks,
  fg,
}: {
  text: 'FG' | 'DC';
  marks: readonly MarkItem[];
  fg: string;
}) {
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        map: plateTexture(text, { bg: '#F7F8FC', fg }, 128, 48),
        roughness: 0.9,
      }),
    [text, fg],
  );
  useLayoutEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion().setFromEuler(new Euler(0, Math.PI, 0));
    const p = new Vector3();
    const s = new Vector3();
    marks.forEach((mk, i) => {
      // a plane faces three +Z (= bay -y); turn it to face into the building (bay +y)
      p.set(...bayToThree(mk.at));
      s.set(mk.size[0], mk.size[1], 1);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [marks]);
  if (marks.length === 0) return null;
  return <instancedMesh key={marks.length} ref={ref} args={[UNIT_PLANE, material, marks.length]} />;
}
