import { useMemo } from 'react';
import { DynamicBoxes } from './DynamicBoxes';
import { BoxInstances } from '../primitives';
import type { FaceLayout } from '../site/layout';
import { shutterPose, type BayAnim } from './bayAnim';
import { doorFixedItems, shutterSlab, shutterSlats } from './bayItems';

interface DoorProps {
  door: FaceLayout['door'];
  anim: BayAnim;
}

/**
 * Door furniture of one bay (bay frame): rounded blue frames, hood, shelter pads, leveller, and the roller shutter, whose
 * curtain rolls up and down with `anim.shutter` (a truck at or near the door, bay/bayAnim.ts).
 */
export function DoorAssembly({ door, anim }: DoorProps) {
  const fixed = useMemo(() => doorFixedItems(door), [door]);
  const slab = useMemo(() => [shutterSlab(door)], [door]);
  const slats = useMemo(() => shutterSlats(door), [door]);
  const stamp = () => anim.shutterStamp;
  return (
    <>
      <BoxInstances items={fixed} cast />
      <DynamicBoxes
        items={slab}
        detail="lo"
        cast
        stamp={stamp}
        pose={(_i, _base, out) => {
          const p = shutterPose(door.height, anim.shutter);
          out.z = p.slabZ;
          out.sz = p.slabH;
          out.visible = p.visible;
        }}
      />
      <DynamicBoxes
        items={slats}
        detail="flat"
        stamp={stamp}
        pose={(_i, base, out) => {
          const p = shutterPose(door.height, anim.shutter);
          out.z = base.at[2] + p.slatShift;
          out.visible = p.visible && out.z < p.slatLimit;
        }}
      />
    </>
  );
}
