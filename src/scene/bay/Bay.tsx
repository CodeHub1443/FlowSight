import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { BAND_HEIGHT } from '../building/DockWall';
import { bayToThree } from '../frame';
import { BoxInstances, Bx, Cyl, MarkInstances } from '../primitives';
import { Plate } from '../Plate';
import type { BayLayout, FaceLayout } from '../site/layout';
import { hashString } from '../site/random';
import {
  cabinetItems,
  cabinetSpots,
  conveyorBodyItems,
  conveyorFrame,
  conveyorSupportItems,
  doorItems,
} from './bayItems';
import { DoorAssembly } from './DoorAssembly';
import { buildStaging } from './stagingLayout';

export interface BaySelection {
  kind: 'bay';
  bayId: string;
}

interface BayProps {
  face: FaceLayout;
  bay: BayLayout;
  selected: boolean;
  doorOpen: boolean;
  onSelect?: (s: BaySelection) => void;
}

/** Four thin strips outlining the bay's floor zone (selection / hover ring). */
function Ring({
  x,
  y0,
  y1,
  tone,
}: {
  x: number;
  y0: number;
  y1: number;
  tone: 'statusInfo' | 'hover';
}) {
  const t = 0.12;
  const cy = (y0 + y1) / 2;
  const z = 0.025;
  return (
    <>
      <Bx at={[0, y0, z]} size={[2 * x, t, 0.02]} tone={tone} cast={false} receive={false} />
      <Bx at={[0, y1, z]} size={[2 * x, t, 0.02]} tone={tone} cast={false} receive={false} />
      <Bx at={[-x, cy, z]} size={[t, y1 - y0, 0.02]} tone={tone} cast={false} receive={false} />
      <Bx at={[x, cy, z]} size={[t, y1 - y0, 0.02]} tone={tone} cast={false} receive={false} />
    </>
  );
}

/**
 * One bay (bay frame, origin at the door centre on the dock floor): door furniture, telescopic conveyor,
 * cabinets, work-zone plate and staging. The whole group is one selectable object: onSelect is a plain
 * callback prop (no store writes). Hover feedback toggles a ring through a ref, never React state.
 */
export function Bay({ face, bay, selected, doorOpen, onSelect }: BayProps) {
  const hoverRef = useRef<Group>(null);
  const { conveyor: c, zones } = bay;
  const w = c.width;

  const staging = useMemo(
    () =>
      buildStaging({
        seed: hashString(bay.id),
        x: zones.staging.x,
        y: zones.staging.y,
        beltHalf: w / 2 + 0.15,
        beltEnd: c.fixedTo,
      }),
    [bay.id, zones.staging, w, c.fixedTo],
  );

  const ringX = bay.pitch / 2 - 0.1;
  const ringY1 = zones.staging.y[1];
  const wz = zones.workZone;
  const frame = useMemo(() => conveyorFrame(c), [c]);
  const bodyItems = useMemo(() => conveyorBodyItems(c), [c]);
  const cabinets = useMemo(() => cabinetSpots(c), [c]);
  const fixedItems = useMemo(
    () => [...conveyorSupportItems(c), ...cabinetItems(c), ...doorItems(face.door, doorOpen)],
    [c, face.door, doorOpen],
  );
  const labelStyle = useMemo(() => ({ bg: '#F7F8FC', fg: '#1E293B' }), []);

  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.({ kind: 'bay', bayId: bay.id });
      }}
      onPointerEnter={() => {
        if (hoverRef.current) hoverRef.current.visible = true;
        document.body.style.cursor = 'pointer';
      }}
      onPointerLeave={() => {
        if (hoverRef.current) hoverRef.current.visible = false;
        document.body.style.cursor = '';
      }}
    >
      {/* invisible hit area over the bay's floor zone so clicks on bare floor select the bay */}
      <mesh position={[0, 0.02, -(0.4 + ringY1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2 * ringX, ringY1 - 0.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={hoverRef} visible={false}>
        <Ring x={ringX} y0={0.5} y1={ringY1} tone="hover" />
      </group>
      <group visible={selected}>
        <Ring x={ringX} y0={0.5} y1={ringY1} tone="statusInfo" />
      </group>

      <DoorAssembly bayId={bay.id} door={face.door} open={doorOpen} bandHeight={BAND_HEIGHT} />

      {/* work-zone floor plate: status-neutral tint until live belt status is bound (step 8) */}
      <Bx
        at={[(wz.x[0] + wz.x[1]) / 2, (wz.y[0] + wz.y[1]) / 2, 0.012]}
        size={[wz.x[1] - wz.x[0], wz.y[1] - wz.y[0], 0.024]}
        tone="workZone"
        cast={false}
      />

      <BoxInstances items={bodyItems} transform={frame} cast />
      <group position={bayToThree(frame.at)} rotation={[frame.pitch, 0, 0]}>
        <Cyl at={[0, 0.02, -0.04]} radius={0.1} length={w + 0.2} axis="x" tone="belt" />
      </group>
      <BoxInstances items={fixedItems} cast />
      {cabinets.xs.map((x) => (
        <Plate
          key={x}
          at={[x, cabinets.y + 0.135, 1.2]}
          size={[0.44, 0.11]}
          text={bay.conveyorName}
          style={labelStyle}
          facing="in"
        />
      ))}

      <BoxInstances items={staging.boxes} cast />
      <MarkInstances marks={staging.marks} />
    </group>
  );
}
