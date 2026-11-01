import { useMemo } from 'react';
import type { BoxItem } from '../items';
import { BoxInstances } from '../primitives';
import { useSceneEnv } from '../sceneEnv';
import type { SiteLayout } from './layout';
import { SurroundRoad } from './SurroundRoad';

// The ring road and trees (`view.surround`, light theme: docs/06 section 7.5), and the generic road, neighbouring
// building and trees: the builder yields no context items unless view.showExteriorContext is true (docs/04 section 0),
// so for the depot that part renders nothing. Kept for later site views.
export function ExteriorContext({ layout }: { layout: SiteLayout }) {
  const { theme } = useSceneEnv();
  return (
    <>
      {layout.surround && theme === 'light' && <SurroundRoad surround={layout.surround} />}
      <ContextItems layout={layout} />
    </>
  );
}

function ContextItems({ layout }: { layout: SiteLayout }) {
  const items = useMemo(
    () =>
      layout.context.flatMap((c): BoxItem[] => {
        if (c.type === 'road') {
          return [
            {
              at: [c.center.X, -0.04, c.center.Z],
              size: [c.size[0], 0.04, c.size[1]],
              tone: 'apron',
              shade: 0.92,
            },
          ];
        }
        if (c.type === 'building') {
          return [
            {
              at: [c.center.X, c.size[1] / 2, c.center.Z],
              size: [c.size[0], c.size[1], c.size[2]],
              tone: 'slab',
            },
          ];
        }
        return c.positions.map((p) => ({
          at: [p.X, 1.5, p.Z],
          size: [1.6, 3, 1.6],
          tone: 'statusOk',
          shade: 1.15,
        }));
      }),
    [layout.context],
  );
  if (layout.context.length === 0) return null;
  return <BoxInstances items={items} mapping="three" />;
}
