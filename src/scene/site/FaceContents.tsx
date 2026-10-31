import { useMemo } from 'react';
import { buildStorage } from '../bay/storageLayout';
import { DockWall } from '../building/DockWall';
import type { BoxItem } from '../items';
import { Appear } from '../Appear';
import { BoxInstances, Bx } from '../primitives';
import { useSceneEnv } from '../sceneEnv';
import { roundedPlate } from '../shapes';
import { hashString } from './random';
import type { FaceLayout, SiteLayout } from './layout';

const LINE = 0.12;
const PAINT_Z = 0.006;

function strip(
  x: number,
  y: number,
  sx: number,
  sy: number,
  z: number,
  tone: BoxItem['tone'] = 'walkline',
): BoxItem {
  return { at: [x, y, z], size: [sx, sy, 0.008], tone, detail: 'flat' };
}

function dashes(
  x: number,
  y0: number,
  y1: number,
  z: number,
  dash = 0.9,
  gap = 0.7,
  tone: BoxItem['tone'] = 'walkline',
): BoxItem[] {
  const out: BoxItem[] = [];
  for (let y = y0; y - dash >= y1 - 1e-6; y -= dash + gap)
    out.push(strip(x, y - dash / 2, LINE, dash, z, tone));
  return out;
}

/** Everything attached to one dock face, in the face frame: dock wall, apron, painted lines, storage. */
export function FaceContents({ layout, face }: { layout: SiteLayout; face: FaceLayout }) {
  const { materials, shadows, theme } = useSceneEnv();
  const yardZ = -layout.floorLevel;

  const apronPaint = useMemo(() => {
    const out: BoxItem[] = [];
    const z = yardZ + PAINT_Z;
    for (const b of face.bays) {
      for (const s of [-1, 1]) {
        out.push(
          ...dashes(
            b.localX + s * (face.door.width / 2 + 0.35),
            -1.3,
            -face.apron.guideLineLength,
            z,
          ),
        );
      }
    }
    for (const s of face.apron.slots) {
      out.push(
        strip(s.x, s.y + s.d / 2, s.w, LINE, z),
        strip(s.x, s.y - s.d / 2, s.w, LINE, z),
        strip(s.x - s.w / 2, s.y, LINE, s.d, z),
        strip(s.x + s.w / 2, s.y, LINE, s.d, z),
      );
    }
    return out;
  }, [face, yardZ]);

  const aisleBox = useMemo(() => {
    const first = face.bays[0];
    const last = face.bays[face.bays.length - 1];
    if (!first || !last) return null;
    const x0 = first.localX - first.pitch / 2;
    const x1 = last.localX + last.pitch / 2;
    const [a0, a1] = first.zones.aisle;
    return a1 - a0 < 0.5 ? null : { x0, x1, a0, a1 };
  }, [face]);

  // thin outline (docs/06 D3), dashed in the dark theme (section 8.1), with a white dashed centre line
  const aisle = useMemo(() => {
    if (!aisleBox) return [];
    const { x0, x1, a0, a1 } = aisleBox;
    const len = x1 - x0;
    const mid = (x0 + x1) / 2;
    const out: BoxItem[] = [];
    for (const y of [a0, a1]) {
      if (theme === 'dark') {
        for (let x = x0; x + 1 < x1; x += 1.8) {
          out.push(strip(x + 0.5, y, 1, LINE * 0.7, PAINT_Z, 'aisleLine'));
        }
      } else {
        out.push(strip(mid, y, len, LINE * 0.7, PAINT_Z, 'aisleLine'));
      }
    }
    for (let x = x0 + 0.8; x + 1.2 < x1; x += 2.4) {
      out.push(strip(x + 0.6, (a0 + a1) / 2, 1.2, LINE * 0.8, PAINT_Z, 'paintWhite'));
    }
    return out;
  }, [aisleBox, theme]);

  const storage = useMemo(
    () =>
      face.bays.flatMap((b) =>
        buildStorage({
          seed: hashString(`${b.id}-storage`),
          centerX: b.localX,
          pitch: b.pitch,
          y: b.zones.storage,
        }),
      ),
    [face],
  );

  return (
    <group>
      <DockWall layout={layout} face={face} />
      {/* apron strip at yard grade, flush with the dock-height slab edge */}
      <Bx
        at={[0, -face.apron.depth / 2, yardZ - 0.15]}
        size={[face.apron.length, face.apron.depth, 0.3]}
        tone="apron"
        round={0.1}
        cast={false}
      />
      <BoxInstances items={apronPaint} />
      {aisleBox && (
        <mesh
          geometry={roundedPlate(aisleBox.x1 - aisleBox.x0, aisleBox.a1 - aisleBox.a0, 0.5)}
          material={materials.aisle}
          position={[(aisleBox.x0 + aisleBox.x1) / 2, 0.004, -(aisleBox.a0 + aisleBox.a1) / 2]}
          receiveShadow={shadows}
        />
      )}
      <BoxInstances items={aisle} />
      <Appear>
        <BoxInstances items={storage} cast />
      </Appear>
    </group>
  );
}
