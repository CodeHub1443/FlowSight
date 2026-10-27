import { useMemo } from 'react';
import type { BoxItem, CylItem } from '../items';
import { BoxInstances, CylInstances } from '../primitives';
import { useSceneEnv } from '../sceneEnv';
import { WALL_THICKNESS, type SiteLayout } from '../site/layout';

// The shed in the site frame (X east, Y up, Z south). Items use mapping "three": at = [X, Y, Z], size = [x, y, z].

/** Slab, pale floor, rounded columns and the cutaway walls with a rounded accent cap. No roof (docs/04 section 0). */
export function Shed({ layout }: { layout: SiteLayout }) {
  const { materials, shadows } = useSceneEnv();
  const { width, depth } = layout.footprint;
  const fl = layout.floorLevel;
  const t = WALL_THICKNESS;
  const h = layout.view.cutawayWallHeight;

  const boxes = useMemo(() => {
    const out: BoxItem[] = [
      // dock-height slab (platform); its top sits just under the floor plane
      { at: [0, (fl - 0.01) / 2, 0], size: [width, fl - 0.01, depth], tone: 'slab', round: 0.04 },
    ];
    for (const c of layout.columns) {
      out.push(
        {
          at: [c.X, fl + layout.columnHeight / 2, c.Z],
          size: [0.34, layout.columnHeight, 0.34],
          tone: 'column',
        },
        { at: [c.X, fl + 0.03, c.Z], size: [0.62, 0.06, 0.62], tone: 'metal' },
      );
    }
    for (const f of layout.cutawayFaces) {
      const alongX = f === 'N' || f === 'S';
      const len = alongX ? width : depth - 2 * t;
      const sign = f === 'S' || f === 'E' ? 1 : -1;
      const X = alongX ? 0 : sign * (width / 2 - t / 2);
      const Z = alongX ? sign * (depth / 2 - t / 2) : 0;
      out.push({
        at: [X, fl + h / 2, Z],
        size: alongX ? [len, h, t] : [t, h, len],
        tone: 'wall',
        round: 0.05,
      });
    }
    return out;
  }, [layout, width, depth, fl, t, h]);

  // a rounded accent rail on every cutaway wall top (docs/06 section 1: --scene-wall-accent "cap line")
  const caps = useMemo(
    () =>
      layout.cutawayFaces.map((f): CylItem => {
        const alongX = f === 'N' || f === 'S';
        const sign = f === 'S' || f === 'E' ? 1 : -1;
        return {
          at: alongX
            ? [0, fl + h, sign * (depth / 2 - t / 2)]
            : [sign * (width / 2 - t / 2), fl + h, 0],
          radius: t / 2 + 0.03,
          length: alongX ? width : depth,
          axis: alongX ? 'x' : 'y',
          tone: 'wallAccent',
        };
      }),
    [layout.cutawayFaces, width, depth, fl, t, h],
  );

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, fl, 0]}
        material={materials.floor}
        receiveShadow={shadows}
      >
        <planeGeometry args={[width - 0.02, depth - 0.02]} />
      </mesh>
      <BoxInstances items={boxes} mapping="three" cast />
      <CylInstances items={caps} mapping="three" />
    </group>
  );
}
