import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  type BufferGeometry,
  Color,
  Euler,
  type InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { bayToThree, type V3 } from './frame';
import {
  BOX_DEPTH_MATERIAL,
  BOX_MATERIAL,
  CYL_MATERIAL,
  disposeInstancedGeometry,
  instancedGeometry,
  ROUND,
  UNIT_PLANE,
  unitBox,
  unitCylinder,
  type Detail,
} from './geometry';
import type { BoxItem, CylItem, MarkItem } from './items';
import { finishOf, type PaletteKey } from './materials';
import { useSceneEnv } from './sceneEnv';
import { plateTexture } from './labels/textures';

/** Parent frame of a set of items: a pivot (bay frame) and a pitch about the x axis (e.g. the sloping conveyor). */
export interface ItemFrame {
  at: V3;
  pitch: number;
}

interface InstancesProps {
  /** `bay`: items in the bay/face frame. `three`: items already in three.js axes (x, y up, z). */
  mapping?: 'bay' | 'three';
  cast?: boolean;
  receive?: boolean;
  transform?: ItemFrame;
}

const _m = new Matrix4();
const _parent = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();
const _c = new Color();

function parentMatrix(transform: ItemFrame | undefined): Matrix4 | null {
  if (!transform) return null;
  const at = bayToThree(transform.at);
  return _parent.compose(
    _p.set(at[0], at[1], at[2]),
    _q.setFromEuler(_e.set(transform.pitch, 0, 0)),
    _s.set(1, 1, 1),
  );
}

function useInstanceGeometry(base: BufferGeometry, count: number) {
  const geometry = useMemo(() => instancedGeometry(base, count), [base, count]);
  useLayoutEffect(() => () => disposeInstancedGeometry(geometry, base), [geometry, base]);
  return geometry;
}

interface BoxGroupProps extends InstancesProps {
  items: readonly BoxItem[];
  smoothness: number;
  flat: boolean;
}

function BoxGroup({ items, smoothness, flat, mapping, cast, receive, transform }: BoxGroupProps) {
  const { palette, shadows } = useSceneEnv();
  const ref = useRef<InstancedMesh>(null);
  const geometry = useInstanceGeometry(unitBox(flat ? 0 : smoothness), items.length);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const parent = parentMatrix(transform);
    const finish = geometry.getAttribute('instanceFinish') as InstancedBufferAttribute;
    items.forEach((it, i) => {
      const at = mapping === 'bay' ? bayToThree(it.at) : it.at;
      _p.set(at[0], at[1], at[2]);
      if (mapping === 'bay') _s.set(it.size[0], it.size[2], it.size[1]);
      else _s.set(it.size[0], it.size[1], it.size[2]);
      _q.setFromEuler(_e.set(0, it.yaw ?? 0, -(it.roll ?? 0), 'YZX'));
      _m.compose(_p, _q, _s);
      if (parent) _m.premultiply(parent);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(palette[it.tone]).multiplyScalar(it.shade ?? 1));
      const f = finishOf(it.tone);
      finish.setXYZ(i, f.roughness, f.metalness, flat ? 0 : (it.round ?? ROUND));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    finish.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, palette, mapping, transform, geometry, flat]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, BOX_MATERIAL, items.length]}
      customDepthMaterial={BOX_DEPTH_MATERIAL}
      castShadow={shadows && cast}
      receiveShadow={shadows && receive}
    />
  );
}

interface BoxInstancesProps extends InstancesProps {
  items: readonly BoxItem[];
  /** Default detail for items that do not set one. */
  detail?: Detail;
}

/**
 * All items in at most three InstancedMeshes (one per detail level: hi, lo, flat). Colours and finishes come
 * from the live palette, so a theme switch only refills the instance buffers.
 */
export function BoxInstances({
  items,
  detail = 'lo',
  mapping = 'bay',
  cast = false,
  receive = true,
  transform,
}: BoxInstancesProps) {
  const { quality } = useSceneEnv();
  const groups = useMemo(() => {
    const by: Record<Detail, BoxItem[]> = { hi: [], lo: [], flat: [] };
    for (const it of items) by[it.detail ?? detail].push(it);
    return by;
  }, [items, detail]);
  return (
    <>
      {(['hi', 'lo', 'flat'] as const).map((d) => {
        const list = groups[d];
        if (list.length === 0) return null;
        return (
          <BoxGroup
            // a count change needs a new InstancedMesh
            key={`${d}-${list.length}`}
            items={list}
            smoothness={d === 'flat' ? 0 : quality.smoothness[d]}
            flat={d === 'flat'}
            mapping={mapping}
            cast={cast && d !== 'flat'}
            receive={receive}
            transform={transform}
          />
        );
      })}
    </>
  );
}

interface CylInstancesProps extends InstancesProps {
  items: readonly CylItem[];
}

const AXIS_EULER: Record<CylItem['axis'], readonly [number, number, number]> = {
  // unit cylinder runs along three Y (= bay z)
  x: [0, 0, Math.PI / 2],
  y: [Math.PI / 2, 0, 0],
  z: [0, 0, 0],
};

/** Cylinders (rollers, shutter barrels, wall caps, buttons) in one InstancedMesh. */
export function CylInstances({
  items,
  mapping = 'bay',
  cast = true,
  receive = true,
  transform,
}: CylInstancesProps) {
  const { palette, shadows, quality } = useSceneEnv();
  const ref = useRef<InstancedMesh>(null);
  const geometry = useInstanceGeometry(unitCylinder(quality.cylinderSegments), items.length);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const parent = parentMatrix(transform);
    const finish = geometry.getAttribute('instanceFinish') as InstancedBufferAttribute;
    items.forEach((it, i) => {
      const at = mapping === 'bay' ? bayToThree(it.at) : it.at;
      _p.set(at[0], at[1], at[2]);
      _s.set(it.radius, it.length, it.radius);
      _q.setFromEuler(_e.set(...AXIS_EULER[it.axis]));
      _m.compose(_p, _q, _s);
      if (parent) _m.premultiply(parent);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(palette[it.tone]).multiplyScalar(it.shade ?? 1));
      const f = finishOf(it.tone);
      finish.setXYZ(i, f.roughness, f.metalness, 0);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    finish.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, palette, mapping, transform, geometry]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      key={items.length}
      ref={ref}
      args={[geometry, CYL_MATERIAL, items.length]}
      castShadow={shadows && cast}
      receiveShadow={shadows && receive}
    />
  );
}

interface BxProps {
  at: V3;
  /** Extents along bay x, y (into the building), z (up). */
  size: V3;
  tone: PaletteKey;
  yaw?: number;
  cast?: boolean;
  receive?: boolean;
  detail?: Detail;
  round?: number;
}

/**
 * One rounded box in the bay/face frame (an InstancedMesh of one, so it shares the rounded-box shader). For the few
 * large static boxes only; anything repeated belongs in a BoxInstances list.
 */
export function Bx({ at, size, tone, yaw, cast = true, receive = true, detail, round }: BxProps) {
  const items: BoxItem[] = [{ at, size, tone, yaw, round, detail }];
  return <BoxInstances items={items} detail={detail ?? 'lo'} cast={cast} receive={receive} />;
}

/** FG / DC pallet marks: one instanced quad mesh per text, textured with a canvas plate in palette colours. */
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
          bg={palette.card}
          fg={palette.brand}
        />
      ))}
    </>
  );
}

function MarkGroup({
  text,
  marks,
  bg,
  fg,
}: {
  text: 'FG' | 'DC';
  marks: readonly MarkItem[];
  bg: string;
  fg: string;
}) {
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        map: plateTexture(text, { bg, fg, radius: 0.3 }, 128, 48),
        roughness: 0.7,
        transparent: true,
      }),
    [text, bg, fg],
  );
  useLayoutEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const q = new Quaternion().setFromEuler(new Euler(0, Math.PI, 0));
    marks.forEach((mk, i) => {
      // a plane faces three +Z (= bay -y); turn it to face into the building (bay +y)
      _p.set(...bayToThree(mk.at));
      _s.set(mk.size[0], mk.size[1], 1);
      mesh.setMatrixAt(i, _m.compose(_p, q, _s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [marks]);
  if (marks.length === 0) return null;
  return <instancedMesh key={marks.length} ref={ref} args={[UNIT_PLANE, material, marks.length]} />;
}
