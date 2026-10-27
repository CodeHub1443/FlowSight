import { useMemo } from 'react';
import { BoxInstances } from '../primitives';
import type { FaceLayout } from '../site/layout';
import { doorItems } from './bayItems';

interface DoorProps {
  door: FaceLayout['door'];
  open: boolean;
}

/** Door furniture of one bay (bay frame): rounded blue frames, shutter or hood, shelter pads, leveller. */
export function DoorAssembly({ door, open }: DoorProps) {
  const items = useMemo(() => doorItems(door, open), [door, open]);
  return <BoxInstances items={items} cast />;
}
