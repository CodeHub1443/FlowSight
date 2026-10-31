import { useEffect, useMemo, useRef } from 'react';
import { MeshBasicMaterial, type Group } from 'three';
import type { BeltStatus } from '@/domain';
import { Appear } from '../Appear';
import { BoxInstances, CylInstances, MarkInstances } from '../primitives';
import { Plate } from '../Plate';
import { useSceneEnv } from '../sceneEnv';
import { roundedPlate, roundedRing } from '../shapes';
import type { BayLayout, FaceLayout } from '../site/layout';
import { hashString } from '../site/random';
import {
  CABINET_FRONT,
  CABINET_LABEL_Z,
  cabinetButtonItems,
  cabinetItems,
  cabinetSpots,
  conveyorBodyItems,
  conveyorFrame,
  conveyorRollerItems,
  conveyorStatusItems,
  conveyorSupportItems,
} from './bayItems';
import { DoorAssembly } from './DoorAssembly';
import { SelectionMarker } from './SelectionMarker';
import { buildStaging } from './stagingLayout';
import { STATUS_TONE } from './status';
import { WorkLight } from './WorkLight';

export interface BaySelection {
  kind: 'bay';
  bayId: string;
}

interface BayProps {
  face: FaceLayout;
  bay: BayLayout;
  selected: boolean;
  doorOpen: boolean;
  /** Belt status: drives the work light, floor plate and belt strip in the dark theme (docs/06 section 8.3). */
  status: BeltStatus;
  onSelect?: (s: BaySelection) => void;
}

const RING_WIDTH = 0.1;
const RING_RADIUS = 0.6;
/** Yellow outline of the bay plate (docs/06 D3). */
const PLATE_LINE = 0.07;
/** Blue outline of the selected bay's plate. */
const SELECTED_LINE = 0.16;
/** Height of the selection bracket box above the floor. */
const BRACKET_HEIGHT = 3;

/**
 * One bay (bay frame, origin at the door centre on the dock floor): door furniture, telescopic conveyor,
 * cabinets, zone plate and staging. The whole group is one selectable object: onSelect is a plain callback prop (no
 * store writes). Hover feedback toggles a lighter ring through a ref, never React state, and is independent of
 * selection: the selection marker (corner brackets, floor glow and blue outline, docs/06 D8) follows `selected` alone
 * and fades in over 200 ms (the selection pill is in the SceneRoot pill layer).
 */
export function Bay({ face, bay, selected, doorOpen, status, onSelect }: BayProps) {
  const { palette, materials, shadows, theme } = useSceneEnv();
  const hoverRef = useRef<Group>(null);
  const { conveyor: c, zones } = bay;
  const w = c.width;

  const staging = useMemo(
    () =>
      buildStaging({
        seed: hashString(bay.id),
        x: zones.staging.x,
        y: zones.staging.y,
        beltHalf: w / 2 + 0.3,
        beltEnd: c.fixedTo,
      }),
    [bay.id, zones.staging, w, c.fixedTo],
  );

  const ringW = bay.pitch - 0.2;
  const ringY0 = 0.5;
  const ringY1 = zones.staging.y[1];
  const ringD = ringY1 - ringY0;
  const wz = zones.workZone;
  const frame = useMemo(() => conveyorFrame(c), [c]);
  const bodyItems = useMemo(() => conveyorBodyItems(c), [c]);
  const rollers = useMemo(() => conveyorRollerItems(c), [c]);
  const cabinets = useMemo(() => cabinetSpots(c), [c]);
  const fixedItems = useMemo(() => [...conveyorSupportItems(c), ...cabinetItems(c)], [c]);
  const buttons = useMemo(() => cabinetButtonItems(c), [c]);
  const labelStyle = useMemo(
    () => ({ bg: palette.card, fg: palette.ink900, radius: 0.2 }),
    [palette.card, palette.ink900],
  );

  const hoverMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: palette.hover,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    [palette.hover],
  );
  useEffect(() => () => hoverMaterial.dispose(), [hoverMaterial]);

  // status reads in the dark theme only until live belt status is bound for both themes (step 8)
  const dark = theme === 'dark';
  const statusTone = STATUS_TONE[status];
  const statusStrip = useMemo(
    () => (dark ? conveyorStatusItems(c, statusTone) : []),
    [dark, c, statusTone],
  );

  const ring = roundedRing(ringW, ringD, RING_RADIUS, RING_WIDTH);
  const ringAt: [number, number, number] = [0, 0.03, -(ringY0 + ringY1) / 2];
  // work zone + staging plate (docs/06 D3)
  const plateX = zones.staging.x;
  const plateW = plateX[1] - plateX[0];
  const plateY0 = wz.y[0];
  const plateY1 = zones.staging.y[1];
  const plateD = plateY1 - plateY0;
  const plateAt = -(plateY0 + plateY1) / 2;

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
      <mesh position={[0, 0.02, -(ringY0 + ringY1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ringW, ringD]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={hoverRef} visible={false}>
        <mesh geometry={ring} material={hoverMaterial} position={ringAt} />
      </group>
      <SelectionMarker
        visible={selected}
        width={ringW}
        depth={ringD}
        height={BRACKET_HEIGHT}
        center={ringAt[2]}
        outline={roundedRing(plateW, plateD, 0.5, SELECTED_LINE)}
        outlineAt={[(plateX[0] + plateX[1]) / 2, 0.025, plateAt]}
      />
      {dark && <WorkLight status={status} y={(wz.y[0] + wz.y[1]) / 2} />}

      <DoorAssembly door={face.door} open={doorOpen} />

      <mesh
        geometry={roundedPlate(plateW, plateD, 0.5)}
        material={materials.zone}
        position={[(plateX[0] + plateX[1]) / 2, 0.006, plateAt]}
        receiveShadow={shadows}
      />
      {/* the painted guide line gives way to the blue selection outline, so yellow never marks the selected bay */}
      <mesh
        visible={!selected}
        geometry={roundedRing(plateW, plateD, 0.5, PLATE_LINE)}
        material={materials.zoneLine}
        position={[(plateX[0] + plateX[1]) / 2, 0.008, plateAt]}
        receiveShadow={shadows}
      />

      {/* belt-mouth plate: the status colour in the dark theme, idle tint until step 8 binds it in light */}
      <mesh
        geometry={roundedPlate(wz.x[1] - wz.x[0] - 1.6, wz.y[1] - wz.y[0] - 0.9, 0.35)}
        material={dark ? materials[statusTone] : materials.workZone}
        position={[(wz.x[0] + wz.x[1]) / 2, 0.012, -(wz.y[0] + wz.y[1]) / 2]}
        receiveShadow={shadows}
      />

      <Appear>
        <BoxInstances items={bodyItems} transform={frame} cast />
        {dark && <BoxInstances items={statusStrip} transform={frame} />}
        <CylInstances items={rollers} transform={frame} />
        <BoxInstances items={fixedItems} cast />
        <CylInstances items={buttons} cast={false} />
        {cabinets.xs.map((x) => (
          <Plate
            key={x}
            at={[x - 0.06, cabinets.y + CABINET_FRONT + 0.006, CABINET_LABEL_Z]}
            size={[0.34, 0.08]}
            text={bay.conveyorName}
            style={labelStyle}
            facing="in"
          />
        ))}
        <BoxInstances items={staging.boxes} cast />
        <MarkInstances marks={staging.marks} />
      </Appear>
    </group>
  );
}
