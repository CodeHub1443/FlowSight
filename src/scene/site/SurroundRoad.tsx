import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  type InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Euler,
  Vector3,
} from 'three';
import {
  CYL_MATERIAL,
  disposeInstancedGeometry,
  instancedGeometry,
  UNIT_PLANE,
  unitSphere,
} from '../geometry';
import type { BoxItem, CylItem } from '../items';
import { radialTexture } from '../labels/textures';
import { emissiveOf, finishOf, type PaletteKey } from '../materials';
import { BoxInstances, CylInstances } from '../primitives';
import { useSceneEnv } from '../sceneEnv';
import { roundedRing } from '../shapes';
import type { SurroundLayout, SurroundTree } from './layout';

// The ring road and its trees (docs/06 section 7.5, config `view.surround`). Light theme only: the night look is
// frozen. The trees stand outside the key light's shadow frustum, so each gets a soft blob on the ground instead.

const ROAD_Y = 0.02;
const PAINT_Y = 0.03;
const DASH_WIDTH = 0.18;
const TRUNK_RADIUS = 0.22;
const BLOB_OPACITY = 0.3;
/** Share of the tree height the crown starts at, and the crown's height over its width. */
const CROWN_FROM = 0.42;
const CROWN_TALL = 1.2;
const FOLIAGE: readonly PaletteKey[] = ['treeFoliage', 'treeFoliageDeep'];
/** Crown tessellation on every tier: small, far from the camera, and smooth-shaded. */
const CROWN_SEGMENTS = 12;
/**
 * The road is flat and takes no shadow, so PBR shading would give one colour at the cost of a large area of newly shaded
 * pixels. It is unlit instead, at the gain the key rig gives a floor (docs/06 section 7.5), and looks the same.
 */
const ROAD_GAIN = 1.34;

const _m = new Matrix4();
const _q = new Quaternion();
const _flat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const _s = new Vector3();
const _p = new Vector3();
const _c = new Color();

function Crowns({ trees }: { trees: readonly SurroundTree[] }) {
  const { palette, theme } = useSceneEnv();
  const ref = useRef<InstancedMesh>(null);
  const base = unitSphere(CROWN_SEGMENTS);
  const geometry = useMemo(() => instancedGeometry(base, trees.length), [base, trees.length]);
  useLayoutEffect(() => () => disposeInstancedGeometry(geometry, base), [geometry, base]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const finish = geometry.getAttribute('instanceFinish') as InstancedBufferAttribute;
    trees.forEach((t, i) => {
      const r = t.crown;
      const h = r * CROWN_TALL;
      _p.set(t.X, t.height * CROWN_FROM + h, t.Z);
      mesh.setMatrixAt(i, _m.compose(_p, _q.identity(), _s.set(r, h, r)));
      const tone = FOLIAGE[i % FOLIAGE.length] as PaletteKey;
      mesh.setColorAt(i, _c.set(palette[tone]));
      const f = finishOf(tone);
      finish.setXYZW(i, f.roughness, f.metalness, 0, emissiveOf(tone, theme));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    finish.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [trees, palette, theme, geometry]);

  return <instancedMesh ref={ref} args={[geometry, CYL_MATERIAL, trees.length]} />;
}

function Blobs({ trees }: { trees: readonly SurroundTree[] }) {
  const { palette } = useSceneEnv();
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        map: radialTexture(1),
        color: palette.shade,
        transparent: true,
        opacity: BLOB_OPACITY,
        depthWrite: false,
      }),
    [palette.shade],
  );
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    trees.forEach((t, i) => {
      const size = t.crown * 3.2;
      _p.set(t.X, PAINT_Y, t.Z);
      mesh.setMatrixAt(i, _m.compose(_p, _flat, _s.set(size, size, 1)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [trees]);
  return <instancedMesh ref={ref} args={[UNIT_PLANE, material, trees.length]} />;
}

export function SurroundRoad({ surround }: { surround: SurroundLayout }) {
  const { palette } = useSceneEnv();
  const { center, width, depth, road, radius, dashes, trees } = surround;

  const roadMaterial = useMemo(
    () => new MeshBasicMaterial({ color: new Color(palette.road).multiplyScalar(ROAD_GAIN) }),
    [palette.road],
  );
  useEffect(() => () => roadMaterial.dispose(), [roadMaterial]);

  const paint = useMemo(
    () =>
      dashes.map((d): BoxItem => ({
        at: [d.X, PAINT_Y, d.Z],
        size: d.alongX ? [d.length, 0.008, DASH_WIDTH] : [DASH_WIDTH, 0.008, d.length],
        tone: 'paintWhite',
        detail: 'flat',
      })),
    [dashes],
  );
  const trunks = useMemo(
    () =>
      trees.map((t): CylItem => ({
        at: [t.X, (t.height * CROWN_FROM) / 2 + 0.1, t.Z],
        radius: TRUNK_RADIUS,
        length: t.height * CROWN_FROM + 0.2,
        axis: 'z',
        tone: 'treeTrunk',
      })),
    [trees],
  );

  return (
    <group>
      <mesh
        geometry={roundedRing(width, depth, radius, road)}
        material={roadMaterial}
        position={[center.X, ROAD_Y, center.Z]}
      />
      <BoxInstances items={paint} mapping="three" receive={false} />
      <Blobs trees={trees} />
      <CylInstances items={trunks} mapping="three" cast={false} receive={false} />
      <Crowns trees={trees} />
    </group>
  );
}
