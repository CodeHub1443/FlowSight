import { useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { BoxItem } from '../items';
import { BoxInstances, Bx } from '../primitives';
import { useSceneEnv } from '../sceneEnv';
import { rng } from '../site/random';
import { WALL_THICKNESS, type SiteLayout } from '../site/layout';
import type { Face } from '../site/transforms';

// The shed in the site frame (X east, Y up, Z south). Bx takes (x, y-into-building, z-up), so a site point
// (X, Z, Y) is written at = [X, -Z, Y].
const S = (X: number, Z: number, Y: number): [number, number, number] => [X, -Z, Y];

function gridGeometry(width: number, depth: number, y: number): BufferGeometry {
  const pts: number[] = [];
  for (let x = Math.ceil(-width / 2); x <= width / 2; x++)
    pts.push(x, y, -depth / 2, x, y, depth / 2);
  for (let z = Math.ceil(-depth / 2); z <= depth / 2; z++)
    pts.push(-width / 2, y, z, width / 2, y, z);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return g;
}

function wornPatches(layout: SiteLayout): BoxItem[] {
  const r = rng(7);
  const { width, depth } = layout.footprint;
  const y = layout.floorLevel + 0.004;
  return Array.from({ length: 70 }, (_, i): BoxItem => {
    const sx = 1.5 + r() * 6;
    const sz = 1.5 + r() * 6;
    return {
      at: [(r() - 0.5) * (width - sx), y + (i % 4) * 0.0012, (r() - 0.5) * (depth - sz)],
      size: [sx, 0.003, sz],
      tone: r() < 0.6 ? 'floorPatchDark' : 'floorPatchLight',
      shade: 0.96 + r() * 0.08,
    };
  });
}

function CutawayWall({ layout, face }: { layout: SiteLayout; face: Face }) {
  const { width, depth } = layout.footprint;
  const t = WALL_THICKNESS;
  const h = layout.view.cutawayWallHeight;
  const y0 = layout.floorLevel;
  const alongX = face === 'N' || face === 'S';
  const len = alongX ? width : depth - 2 * t;
  const sign = face === 'S' || face === 'E' ? 1 : -1;
  const cx = alongX ? 0 : sign * (width / 2 - t / 2);
  const cz = alongX ? sign * (depth / 2 - t / 2) : 0;
  const size = (thick: number, height: number): [number, number, number] =>
    alongX ? [len, thick, height] : [thick, len, height];
  return (
    <>
      <Bx at={S(cx, cz, y0 + h / 2)} size={size(t, h)} tone="wall" />
      <Bx at={S(cx, cz, y0 + h + 0.06)} size={size(t + 0.1, 0.12)} tone="wallCap" cast={false} />
    </>
  );
}

/** Floor, slab, grid, worn patches, column grid and cutaway walls. No roof (view.showRoof is not rendered). */
export function Shed({ layout }: { layout: SiteLayout }) {
  const { palette } = useSceneEnv();
  const { width, depth } = layout.footprint;
  const fl = layout.floorLevel;
  const grid = useMemo(() => gridGeometry(width, depth, fl + 0.003), [width, depth, fl]);
  const patches = useMemo(() => wornPatches(layout), [layout]);
  const columns = useMemo(
    () =>
      layout.columns.flatMap((c): BoxItem[] => [
        {
          at: [c.X, fl + layout.columnHeight / 2, c.Z],
          size: [0.3, layout.columnHeight, 0.3],
          tone: 'column',
        },
        { at: [c.X, fl + 0.03, c.Z], size: [0.6, 0.06, 0.6], tone: 'steel' },
      ]),
    [layout, fl],
  );

  return (
    <group>
      {/* dock-height slab (platform) */}
      <Bx at={S(0, 0, (fl - 0.01) / 2)} size={[width, depth, fl - 0.01]} tone="slab" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, fl, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={palette.floor} roughness={0.9} />
      </mesh>
      <BoxInstances items={patches} mapping="three" />
      <lineSegments geometry={grid}>
        <lineBasicMaterial
          color={palette.floorGrid}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </lineSegments>
      <BoxInstances items={columns} mapping="three" cast />
      {layout.cutawayFaces.map((f) => (
        <CutawayWall key={f} layout={layout} face={f} />
      ))}
    </group>
  );
}
