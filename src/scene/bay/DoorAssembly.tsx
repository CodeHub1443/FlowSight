import { useMemo } from 'react';
import { Cyl } from '../primitives';
import { Plate } from '../Plate';
import { useSceneEnv } from '../sceneEnv';
import { WALL_THICKNESS, type FaceLayout } from '../site/layout';

interface DoorProps {
  bayId: string;
  door: FaceLayout['door'];
  open: boolean;
  bandHeight: number;
}

/** Non-box door parts of one bay (bay frame): the rolled-up shutter barrel when open, and the door number plates. */
export function DoorAssembly({ bayId, door, open, bandHeight }: DoorProps) {
  const { palette } = useSceneEnv();
  const t = WALL_THICKNESS;
  const plateStyle = useMemo(() => ({ bg: palette.plate, fg: '#FFFFFF' }), [palette.plate]);
  const plateAt = door.height + bandHeight / 2;
  return (
    <group>
      {open && (
        <Cyl
          at={[0, t + 0.3, door.height - 0.22]}
          radius={0.22}
          length={door.width}
          axis="x"
          tone="shutter"
        />
      )}
      <Plate
        at={[0, t + 0.006, plateAt]}
        size={[1.3, 0.6]}
        text={bayId}
        style={plateStyle}
        facing="in"
      />
      <Plate
        at={[0, -0.006, plateAt]}
        size={[1.3, 0.6]}
        text={bayId}
        style={plateStyle}
        facing="out"
      />
    </group>
  );
}
