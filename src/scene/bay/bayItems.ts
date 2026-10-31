import type { BoxItem, CylItem } from '../items';
import type { PaletteKey } from '../materials';
import type { BayLayout, FaceLayout } from '../site/layout';
import { WALL_THICKNESS } from '../site/layout';

// Pure item lists for the static parts of a bay, rendered through BoxInstances / CylInstances so a bay stays at a
// handful of draw calls (docs/02 section 6: instancing for repeated meshes).
//
// The telescopic conveyor follows the real EZ machines in docs/reference/cam-*.jpg: a chunky blue body on a low
// chassis, three nested boom sections stepping down towards the door, a dark belt with rounded roller ends, flared
// stainless side guides, a yellow motor housing with grilles and two grey control cabinets with buttons.

type Conveyor = BayLayout['conveyor'];

// Belt top above the dock floor at the retracted boom tip and at the far end of the fixed body (approximate,
// visual only: the real conveyors rise slightly into the shed).
export const TIP_HEIGHT = 0.8;
const FAR_HEIGHT = 1.08;
/** Length of the boom-section stretch in front of the main housing (the visible telescopic steps). */
const SECTION_STEP = 0.42;
const SECTIONS = 3;
/** Main housing side beam: width and depth below the belt (docs/06 D6: 20 % chunkier). */
const BEAM_W = 0.36;
const BEAM_H = 0.6;
/** Spacing of the roller ticks across the belt (docs/06 D4). */
const TICK_PITCH = 0.6;

/** Pivot of the tilted conveyor frame (u along the belt, v above the belt top) in the bay frame. */
export function conveyorFrame(c: Conveyor): { at: [number, number, number]; pitch: number } {
  return {
    at: [0, c.fixedFrom, TIP_HEIGHT],
    pitch: Math.atan2(FAR_HEIGHT - TIP_HEIGHT, c.fixedTo - c.fixedFrom),
  };
}

/** Belt-top height above the dock floor at bay y. */
export function beltTop(c: Conveyor, y: number): number {
  const k = (y - c.fixedFrom) / Math.max(1e-6, c.fixedTo - c.fixedFrom);
  return TIP_HEIGHT + (FAR_HEIGHT - TIP_HEIGHT) * Math.min(1, Math.max(0, k));
}

/** Front of the main (outer) housing, measured from the boom tip. */
const housingFront = SECTION_STEP * SECTIONS;

/** Body, belt, guides and boom sections in the tilted conveyor frame ([x, u, v]: across, along, above belt top). */
export function conveyorBodyItems(c: Conveyor): BoxItem[] {
  const w = c.width;
  const L = c.fixedTo - c.fixedFrom;
  const hl = L - housingFront;
  const hu = housingFront + hl / 2;
  const bx = w / 2 + BEAM_W / 2 + 0.02;
  const out: BoxItem[] = [
    // belt over the housing, its lighter centre stripe
    { at: [0, hu, -0.03], size: [w + 0.04, hl, 0.06], tone: 'belt', detail: 'lo' },
    { at: [0, hu, 0.002], size: [w * 0.24, hl, 0.004], tone: 'beltStripe', detail: 'flat' },
    // far-end drum housing
    {
      at: [0, L - 0.16, -0.3],
      size: [w + 2 * BEAM_W + 0.1, 0.34, 0.66],
      tone: 'conveyor',
      detail: 'hi',
    },
  ];
  for (let u = housingFront + TICK_PITCH / 2; u < L - 0.4; u += TICK_PITCH) {
    out.push({ at: [0, u, 0.003], size: [w, 0.05, 0.004], tone: 'beltTick', detail: 'flat' });
  }
  for (const s of [-1, 1]) {
    out.push(
      // chunky side beam of the main housing
      {
        at: [s * bx, hu, -BEAM_H / 2 - 0.02],
        size: [BEAM_W, hl, BEAM_H],
        tone: 'conveyor',
        detail: 'hi',
      },
      // lighter top face of the beam, outside the guide
      {
        at: [s * (bx + 0.07), hu, -0.018],
        size: [BEAM_W - 0.16, hl - 0.1, 0.01],
        tone: 'conveyorTop',
        detail: 'flat',
      },
      // flared stainless guide and its rolled top edge
      {
        at: [s * (w / 2 + 0.07), hu, 0.09],
        size: [0.05, hl, 0.24],
        roll: s * 0.5,
        tone: 'metal',
        detail: 'lo',
      },
      { at: [s * (w / 2 + 0.135), hu, 0.2], size: [0.08, hl, 0.06], tone: 'metal', detail: 'lo' },
    );
  }
  // telescopic boom sections: each one narrower and lower than the one around it, fronts 0.42 m apart
  for (let i = 0; i < SECTIONS; i++) {
    const depthIn = SECTIONS - i; // 3 = innermost (the tip), 1 = next to the housing
    const front = SECTION_STEP * i;
    const back = housingFront + 1.0;
    const len = back - front;
    const mid = (front + back) / 2;
    const inset = 0.055 * depthIn;
    const drop = 0.03 * depthIn;
    out.push({
      at: [0, mid, -0.03 - drop],
      size: [w - 0.03 * depthIn, len, 0.05],
      tone: 'belt',
      detail: 'lo',
    });
    for (const s of [-1, 1]) {
      out.push(
        {
          at: [s * (bx - inset), mid, -0.2 - drop],
          size: [BEAM_W - 0.08, len, 0.34 - 0.03 * depthIn],
          tone: 'conveyor',
          shade: 1 - 0.035 * depthIn,
          detail: 'hi',
        },
        {
          at: [s * (w / 2 + 0.06 - inset * 0.5), mid, 0.07 - drop],
          size: [0.022, len, 0.2],
          roll: s * 0.5,
          tone: 'metal',
          detail: 'lo',
        },
      );
    }
  }
  // yellow nose bumper of the boom tip
  out.push({
    at: [0, -0.05, -0.24 - 0.03 * SECTIONS],
    size: [w + 0.14, 0.1, 0.16],
    tone: 'palletYellow',
    detail: 'lo',
  });
  return out;
}

/** Status strip along both sides of the main housing (docs/04 section 5, tilted conveyor frame). */
export function conveyorStatusItems(c: Conveyor, tone: PaletteKey): BoxItem[] {
  const hl = c.fixedTo - c.fixedFrom - housingFront;
  const hu = housingFront + hl / 2;
  const x = c.width / 2 + BEAM_W + 0.03;
  return [-1, 1].map((s) => ({
    at: [s * x, hu, -0.14],
    size: [0.03, hl - 0.2, 0.1],
    tone,
    detail: 'flat',
  }));
}

/** Rounded belt ends: rollers at the boom tip and at the far end (tilted conveyor frame). */
export function conveyorRollerItems(c: Conveyor): CylItem[] {
  const w = c.width;
  const L = c.fixedTo - c.fixedFrom;
  return [
    {
      at: [0, 0.03, -0.06 - 0.03 * SECTIONS],
      radius: 0.05,
      length: w - 0.1,
      axis: 'x',
      tone: 'belt',
    },
    { at: [0, L - 0.36, -0.06], radius: 0.06, length: w + 0.02, axis: 'x', tone: 'belt' },
  ];
}

/** Chassis, legs, feet, the yellow motor housing (bay frame). */
export function conveyorSupportItems(c: Conveyor): BoxItem[] {
  const w = c.width;
  const bx = w / 2 + BEAM_W / 2 + 0.02;
  const out: BoxItem[] = [];
  // front support under the boom sections
  const fy = c.fixedFrom + housingFront + 0.5;
  const fh = beltTop(c, fy) - 0.5;
  for (const s of [-1, 1]) {
    out.push(
      { at: [s * (bx - 0.06), fy, fh / 2], size: [0.14, 0.14, fh], tone: 'conveyor', detail: 'lo' },
      { at: [s * (bx - 0.06), fy, 0.015], size: [0.28, 0.28, 0.03], tone: 'metal', detail: 'lo' },
    );
  }
  out.push({ at: [0, fy, fh - 0.06], size: [2 * bx, 0.12, 0.12], tone: 'conveyor', detail: 'lo' });

  // low chassis under the rear two thirds (the "machine" body)
  const c0 = c.fixedFrom + housingFront + 1.6;
  const c1 = c.fixedTo - 0.3;
  const ch = beltTop(c, c0) - BEAM_H - 0.06 - 0.16;
  out.push({
    at: [0, (c0 + c1) / 2, 0.16 + ch / 2],
    size: [w + 0.3, c1 - c0, ch],
    tone: 'conveyor',
    shade: 0.86,
    detail: 'hi',
  });
  for (const s of [-1, 1]) {
    for (const y of [c0 + 0.35, c1 - 0.35]) {
      out.push({
        at: [s * (w / 2 + 0.05), y, 0.08],
        size: [0.2, 0.32, 0.16],
        tone: 'seal',
        detail: 'lo',
      });
    }
  }

  // motor housing with grilles on the cabinet side
  const mx = -(bx + BEAM_W / 2 + 0.42);
  const my = c.fixedTo - 2.3;
  out.push(
    { at: [mx, my, 0.43], size: [0.78, 0.95, 0.74], tone: 'motor', detail: 'hi' },
    { at: [mx, my + 0.48, 0.45], size: [0.6, 0.02, 0.52], tone: 'motorGrille', detail: 'flat' },
    { at: [mx, my, 0.805], size: [0.62, 0.8, 0.02], tone: 'motorGrille', detail: 'flat' },
    { at: [mx + 0.28, my, 0.92], size: [0.12, 0.5, 0.2], tone: 'metal', detail: 'lo' },
  );
  return out;
}

/** x of the two control cabinets and their y, shared with the label plates. */
export function cabinetSpots(c: Conveyor): { xs: number[]; y: number } {
  const w = c.width;
  return { xs: [-(w / 2 + 1.5), -(w / 2 + 2.18)], y: c.fixedTo - 0.95 };
}

const CABINET = { w: 0.56, d: 0.3, h: 0.72, z: 1.12 } as const;

/** Grey cabinets with rounded corners on posts, a door seam and a handle (bay frame). */
export function cabinetItems(c: Conveyor): BoxItem[] {
  const { xs, y } = cabinetSpots(c);
  const front = y + CABINET.d / 2;
  return xs.flatMap((x): BoxItem[] => [
    {
      at: [x, y, CABINET.z],
      size: [CABINET.w, CABINET.d, CABINET.h],
      tone: 'cabinet',
      detail: 'hi',
    },
    // rain hood
    {
      at: [x, y + 0.02, CABINET.z + CABINET.h / 2 + 0.02],
      size: [CABINET.w + 0.06, CABINET.d + 0.08, 0.04],
      tone: 'cabinet',
      shade: 1.06,
      detail: 'lo',
    },
    {
      at: [x + CABINET.w * 0.18, front + 0.004, CABINET.z],
      size: [0.008, 0.01, CABINET.h - 0.1],
      tone: 'cabinet',
      shade: 0.82,
      detail: 'flat',
    },
    {
      at: [x + CABINET.w * 0.3, front + 0.02, CABINET.z],
      size: [0.025, 0.03, 0.12],
      tone: 'metal',
      detail: 'lo',
    },
    {
      at: [x - 0.2, y, (CABINET.z - CABINET.h / 2) / 2],
      size: [0.06, 0.06, CABINET.z - CABINET.h / 2],
      tone: 'metal',
    },
    {
      at: [x + 0.2, y, (CABINET.z - CABINET.h / 2) / 2],
      size: [0.06, 0.06, CABINET.z - CABINET.h / 2],
      tone: 'metal',
    },
  ]);
}

/** Push buttons (green, red, yellow) on the cabinet fronts. */
export function cabinetButtonItems(c: Conveyor): CylItem[] {
  const { xs, y } = cabinetSpots(c);
  const front = y + CABINET.d / 2 + 0.012;
  const tones = ['statusOk', 'statusCritical', 'palletYellow'] as const;
  return xs.flatMap((x) =>
    tones.map((tone, i): CylItem => ({
      at: [x - 0.14 + i * 0.1, front, CABINET.z - 0.16],
      radius: 0.028,
      length: 0.025,
      axis: 'y',
      tone,
    })),
  );
}

/** Height of the label plate centre on a cabinet front. */
export const CABINET_LABEL_Z = CABINET.z + 0.16;
export const CABINET_FRONT = CABINET.d / 2;

/** Thickness of the blue door frames (docs/06 D5). */
const DOOR_FRAME = 0.18;

/**
 * Door furniture (bay frame, wall at y 0..t): blue rounded door frames inside and out, shutter rails, the closed
 * shutter or the open shutter hood, dock shelter pads, bumpers and the dock leveller.
 */
export function doorItems(door: FaceLayout['door'], open: boolean): BoxItem[] {
  const t = WALL_THICKNESS;
  const { width: w, height: h } = door;
  const out: BoxItem[] = [];
  const fw = DOOR_FRAME;
  for (const [y, d] of [
    [t + 0.08, 0.16],
    [-0.05, 0.1],
  ] as const) {
    for (const s of [-1, 1]) {
      out.push({
        at: [s * (w / 2 + fw / 2), y, (h + fw) / 2],
        size: [fw, d, h + fw],
        tone: 'doorFrame',
        detail: 'hi',
      });
    }
    out.push({
      at: [0, y, h + fw / 2],
      size: [w + 2 * fw, d, fw],
      tone: 'doorFrame',
      detail: 'hi',
    });
  }
  for (const s of [-1, 1]) {
    out.push(
      {
        at: [s * (w / 2 - 0.03), t / 2, h / 2],
        size: [0.07, 0.07, h],
        tone: 'metal',
        detail: 'lo',
      },
      // dock shelter pads and bumpers on the yard side
      {
        at: [s * (w / 2 + 0.42), -0.32, h / 2 + 0.1],
        size: [0.34, 0.5, h + 0.2],
        tone: 'seal',
        detail: 'lo',
      },
      {
        at: [s * (w / 2 - 0.25), -0.14, -0.42],
        size: [0.3, 0.26, 0.34],
        tone: 'seal',
        detail: 'lo',
      },
    );
  }
  out.push({ at: [0, -0.32, h + 0.42], size: [w + 1.2, 0.5, 0.42], tone: 'seal', detail: 'lo' });
  if (open) {
    // rolled-up shutter in its hood
    out.push({
      at: [0, t + 0.24, h + 0.36],
      size: [w + 0.24, 0.44, 0.5],
      tone: 'shutter',
      detail: 'hi',
    });
  } else {
    out.push({ at: [0, t / 2, h / 2], size: [w, 0.09, h], tone: 'shutter', detail: 'lo' });
    for (let z = 0.28; z < h - 0.1; z += 0.3) {
      out.push({
        at: [0, t / 2 + 0.05, z],
        size: [w - 0.06, 0.012, 0.03],
        tone: 'shutter',
        shade: 0.9,
        detail: 'flat',
      });
    }
  }
  out.push(
    { at: [0, -0.55, -0.03], size: [w - 0.24, 1.1, 0.06], tone: 'leveller', detail: 'lo' },
    { at: [0, -1.06, -0.028], size: [w - 0.24, 0.1, 0.064], tone: 'walkline', detail: 'flat' },
  );
  return out;
}
