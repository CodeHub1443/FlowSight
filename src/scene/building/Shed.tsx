import { useMemo } from 'react';
import type { BoxItem } from '../items';
import { BoxInstances } from '../primitives';
import { useSceneEnv } from '../sceneEnv';
import { COLUMN_SIZE, WALL_THICKNESS, type SiteLayout } from '../site/layout';

// The shed in the site frame (X east, Y up, Z south). Items use mapping "three": at = [X, Y, Z], size = [x, y, z].

/** Slab, pale floor, rounded columns and the cutaway walls with a lighter top. No roof (docs/04 section 0). */
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
          size: [COLUMN_SIZE, layout.columnHeight, COLUMN_SIZE],
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
      // lighter top face: reads as 3D in both themes (docs/06 section 8.1)
      out.push({
        at: [X, fl + h + 0.002, Z],
        size: alongX ? [len - 0.1, 0.004, t - 0.04] : [t - 0.04, 0.004, len - 0.1],
        tone: 'wallTop',
        detail: 'flat',
      });
    }
    return out;
  }, [layout, width, depth, fl, t, h]);

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
    </group>
  );
}
