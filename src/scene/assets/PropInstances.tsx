import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  Euler,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { contactShadows } from '../contactShadowController';
import { bayToThree } from '../frame';
import { finishOf, type PaletteKey } from '../materials';
import { useSceneEnv } from '../sceneEnv';
import { useModel, type ModelPart } from './loader';
import { MODELS, type ModelName } from './models';

/** A model placed in the bay (or face) frame. Unlike a BoxItem, `at` is the centre of the footprint on its base. */
export interface PropItem {
  at: readonly [number, number, number];
  /** Extents along bay x, y, z: the model is scaled to them, so docs/06 keeps its chunky proportions. */
  size: readonly [number, number, number];
  yaw?: number;
  /** Colour of a one-tone model; a multi-tone model keeps the tone of each part. */
  tone?: PaletteKey;
  shade?: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();
const _c = new Color();

function PartInstances({
  model,
  part,
  items,
  recolour,
  cast,
}: {
  model: ModelName;
  part: ModelPart;
  items: readonly PropItem[];
  recolour: boolean;
  cast: boolean;
}) {
  const { palette, shadows } = useSceneEnv();
  const ref = useRef<InstancedMesh>(null);
  const first = items[0]?.tone;
  const finish = finishOf(recolour && first ? first : part.tone);
  // white base: the palette colour is per instance, so a theme switch only refills the buffers
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#ffffff', ...finish }),
    [finish],
  );
  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const [mx, my, mz] = MODELS[model].sizeM;
    items.forEach((it, i) => {
      _p.set(...bayToThree(it.at));
      _q.setFromEuler(_e.set(0, it.yaw ?? 0, 0));
      _s.set(it.size[0] / mx, it.size[2] / my, it.size[1] / mz);
      _m.compose(_p, _q, _s).multiply(part.matrix);
      mesh.setMatrixAt(i, _m);
      const tone = recolour ? (it.tone ?? part.tone) : part.tone;
      mesh.setColorAt(i, _c.set(palette[tone]).multiplyScalar(it.shade ?? 1));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    contactShadows.invalidate();
  }, [model, part, items, recolour, palette]);

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, material, items.length]}
      castShadow={shadows && cast}
      receiveShadow={shadows}
    />
  );
}

/**
 * Every instance of one GLB model in one InstancedMesh per part (docs/02 section 6). Suspends while the file loads;
 * callers wrap it in a Suspense whose fallback is the procedural prop (see StagingProps, StorageProps).
 */
export function PropInstances({
  model,
  items,
  cast = false,
}: {
  model: ModelName;
  items: readonly PropItem[];
  cast?: boolean;
}) {
  const parts = useModel(model);
  if (items.length === 0) return null;
  return (
    <>
      {parts.map((part) => (
        <PartInstances
          // a count change needs a new InstancedMesh
          key={`${part.tone}-${items.length}`}
          model={model}
          part={part}
          items={items}
          recolour={parts.length === 1}
          cast={cast}
        />
      ))}
    </>
  );
}
