import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MeshBasicMaterial, type Group } from 'three';
import type { BeltStatus } from '@/domain';
import { Appear } from '../Appear';
import { GlbOrProcedural } from '../assets/GlbOrProcedural';
import { PropInstances } from '../assets/PropInstances';
import { bayToThree } from '../frame';
import { isR3fClickDrag } from '../interaction/pick';
import type { BoxItem } from '../items';
import { BoxInstances, CylInstances, MarkInstances } from '../primitives';
import { Plate } from '../Plate';
import { useSceneEnv } from '../sceneEnv';
import { roundedPlate, roundedRing } from '../shapes';
import type { BayLayout, FaceLayout } from '../site/layout';
import {
  beltTickItems,
  beltTickU,
  boomItems,
  boomSectionLength,
  CABINET_FRONT,
  CABINET_LABEL_Z,
  cabinetButtonItems,
  cabinetItems,
  cabinetSpots,
  conveyorFrame,
  conveyorHousingItems,
  conveyorStatusItems,
  conveyorSupportItems,
  endRollerItem,
  tipRollerItem,
  type BoomBox,
} from './bayItems';
import { boomExtendM, boomSectionShift, type BayAnim } from './bayAnim';
import { DoorAssembly } from './DoorAssembly';
import { DynamicBoxes, type DynamicPose } from './DynamicBoxes';
import { SelectionMarker } from './SelectionMarker';
import { buildStaging, stagingInput } from './stagingLayout';
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
  /** Boom, belt surface and shutter state (stepped by the actor layer; a bay nobody steps stays as `anim` was made). */
  anim: BayAnim;
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
export function Bay({ face, bay, selected, anim, status, onSelect }: BayProps) {
  const { palette, materials, shadows, theme } = useSceneEnv();
  const hoverRef = useRef<Group>(null);
  const { conveyor: c, zones } = bay;

  const staging = useMemo(() => buildStaging(stagingInput(bay)), [bay]);

  const ringW = bay.pitch - 0.2;
  const ringY0 = 0.5;
  const ringY1 = zones.staging.y[1];
  const ringD = ringY1 - ringY0;
  const wz = zones.workZone;
  const frame = useMemo(() => conveyorFrame(c), [c]);
  const housing = useMemo(() => conveyorHousingItems(c), [c]);
  const endRoller = useMemo(() => [endRollerItem(c)], [c]);
  const tipRoller = useMemo(() => [tipRollerItem(c)], [c]);
  const tickItems = useMemo(() => beltTickItems(c), [c]);
  // the sections are long enough to stay joined at the full run-out (bayItems boomSectionLength)
  const boom = useMemo(() => boomItems(c, boomSectionLength(c.fixedFrom + c.boomMaxReach)), [c]);
  const boomHi = useMemo(() => boom.filter((b) => b.detail === 'hi'), [boom]);
  const boomLo = useMemo(() => boom.filter((b) => b.detail !== 'hi'), [boom]);
  const extendM = () => boomExtendM(c.fixedFrom, anim.reach, anim.boom);
  const boomPose = (_: number, base: BoxItem, out: DynamicPose) => {
    out.y = base.at[1] + boomSectionShift(extendM(), (base as BoomBox).section);
  };
  const boomStamp = () => anim.boomStamp;
  const tipRef = useRef<Group>(null);
  const tipSeen = useRef(-1);
  useFrame(() => {
    const g = tipRef.current;
    if (!g || tipSeen.current === anim.boomStamp) return;
    tipSeen.current = anim.boomStamp;
    // the tilted frame's +u is three -Z: the tip roller moves with section 0
    g.position.z = -boomSectionShift(extendM(), 0);
  });
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
        // t22b.3 Finding A: e.delta (R3F's own pointer-down-to-click distance, px) is the same drag
        // distance pick.ts's canvas-level actor handler uses (DRAG_PX); a drag that starts on an actor
        // and ends up here (the actor's own handler returns without claiming the click) must not select
        // the bay underneath, so the two handlers share one threshold.
        if (isR3fClickDrag(e.delta)) return;
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

      <DoorAssembly door={face.door} anim={anim} />

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
        <BoxInstances items={housing} transform={frame} cast />
        <DynamicBoxes
          items={boomHi}
          detail="hi"
          transform={frame}
          cast
          stamp={boomStamp}
          pose={boomPose}
        />
        <DynamicBoxes
          items={boomLo}
          detail="lo"
          transform={frame}
          cast
          stamp={boomStamp}
          pose={boomPose}
        />
        <DynamicBoxes
          items={tickItems}
          detail="flat"
          transform={frame}
          stamp={() => anim.phaseStamp}
          pose={(i, _base, out) => {
            out.y = beltTickU(c, i, anim.phase);
          }}
        />
        {dark && <BoxInstances items={statusStrip} transform={frame} />}
        <CylInstances items={endRoller} transform={frame} />
        <group position={bayToThree(frame.at)} rotation={[frame.pitch, 0, 0]}>
          <group ref={tipRef}>
            <CylInstances items={tipRoller} />
          </group>
        </group>
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
        <GlbOrProcedural procedural={staging.procedural}>
          <PropInstances model="pallet_b01" items={staging.pallets} cast />
          <PropInstances model="box_brown_b28" items={staging.cartons} cast />
          <PropInstances model="pallet_jack" items={staging.jacks} cast />
        </GlbOrProcedural>
        <MarkInstances marks={staging.marks} />
      </Appear>
    </group>
  );
}
