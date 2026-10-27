import { useEffect, useMemo, useRef } from 'react';
import { MeshBasicMaterial, type Group } from 'three';
import { Appear, FadeIn } from '../Appear';
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
  conveyorSupportItems,
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

const RING_WIDTH = 0.14;
const RING_RADIUS = 0.6;

/**
 * One bay (bay frame, origin at the door centre on the dock floor): door furniture, telescopic conveyor,
 * cabinets, work-zone plate and staging. The whole group is one selectable object: onSelect is a plain
 * callback prop (no store writes). Hover feedback toggles a ring through a ref, never React state; the selection
 * ring fades in over 200 ms (the selection pill is in the SceneRoot pill layer).
 */
export function Bay({ face, bay, selected, doorOpen, onSelect }: BayProps) {
  const { palette, materials, shadows } = useSceneEnv();
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

  const ringMaterials = useMemo(
    () => ({
      selected: new MeshBasicMaterial({
        color: palette.selection,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
      hover: new MeshBasicMaterial({
        color: palette.hover,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    }),
    [palette.selection, palette.hover],
  );
  useEffect(
    () => () => {
      ringMaterials.selected.dispose();
      ringMaterials.hover.dispose();
    },
    [ringMaterials],
  );

  const ring = roundedRing(ringW, ringD, RING_RADIUS, RING_WIDTH);
  const ringAt: [number, number, number] = [0, 0.03, -(ringY0 + ringY1) / 2];

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
        <mesh geometry={ring} material={ringMaterials.hover} position={ringAt} />
      </group>
      <FadeIn visible={selected}>
        <mesh geometry={ring} material={ringMaterials.selected} position={ringAt} />
      </FadeIn>

      <DoorAssembly door={face.door} open={doorOpen} />

      {/* staging zone outline (--scene-floor-line) */}
      <mesh
        geometry={roundedRing(
          zones.staging.x[1] - zones.staging.x[0] - 0.1,
          zones.staging.y[1] - zones.staging.y[0] - 0.1,
          0.5,
          0.08,
        )}
        material={materials.floorLine}
        position={[
          (zones.staging.x[0] + zones.staging.x[1]) / 2,
          0.006,
          -(zones.staging.y[0] + zones.staging.y[1]) / 2,
        ]}
        receiveShadow={shadows}
      />

      {/* work-zone floor plate: idle tint until live belt status is bound (step 8) */}
      <mesh
        geometry={roundedPlate(wz.x[1] - wz.x[0], wz.y[1] - wz.y[0], 0.4)}
        material={materials.workZone}
        position={[(wz.x[0] + wz.x[1]) / 2, 0.012, -(wz.y[0] + wz.y[1]) / 2]}
        receiveShadow={shadows}
      />

      <Appear>
        <BoxInstances items={bodyItems} transform={frame} cast />
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
