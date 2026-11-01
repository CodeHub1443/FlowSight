import { ROUND } from '../geometry';
import type { PaletteKey } from '../materials';
import type { Livery } from './livery';
import { TRUCK_LENGTH } from './truckSim';

// The Bangladesh covered van (docs/04 section 4), procedural: box body 7.4 x 2.4 x 3.2 m with a rounded shell (docs/06
// D6), a hollow rear with swing doors, a rounded cab and six wheels. Coordinates: x across, l from the rear sill towards
// the cab, z above yard grade. The body floor stands at dock height, so the rear meets the door sill.

export const BODY = { length: 7.4, width: 2.4, height: 3.2, floor: 1.15 } as const;
const TOP = BODY.floor + BODY.height;
const HALF = BODY.width / 2;
/** How deep the open rear is. The solid shell closes it behind the cargo, where the eye stops anyway. */
const HOLLOW = 1.6;
const SHELL_FROM = HOLLOW - 0.05;
const CAB_FROM = BODY.length + 0.05;

/** The door plate's centre, used by the plate's DOM element too. */
export const PLATE = { l: -0.03, z: TOP - 0.33, width: 0.92, height: 0.44 } as const;

export type PartPool = 'shell' | 'solid' | 'flat';

export interface TruckPart {
  pool: PartPool;
  at: readonly [number, number, number];
  size: readonly [number, number, number];
  /** Tone, or a slot of the truck's livery. */
  tone: PaletteKey | keyof Pick<Livery, 'body' | 'band' | 'cab'>;
  round?: number;
  /** -1 / +1: part of the left or right rear door, swinging about its hinge. */
  door?: -1 | 1;
  /** Only drawn with the doors open: cargo and the inside of the box. */
  inside?: boolean;
  /** Also drawn on the Low tier. */
  low?: boolean;
  /** Drawn on the Low tier only: stands in for what the tier leaves out. */
  lowOnly?: boolean;
}

export interface TruckWheel {
  x: number;
  l: number;
  radius: number;
  width: number;
}

const WHEEL_R = 0.52;
const WHEEL_W = 0.32;

/** Front axle and two rear axles. */
export const TRUCK_WHEELS: readonly TruckWheel[] = [
  ...[-1, 1].flatMap((s) =>
    [1.75, 2.95, 7.95].map((l) => ({
      x: s * 0.98,
      l,
      radius: WHEEL_R,
      width: WHEEL_W,
    })),
  ),
];

/** Wheels of the Low tier: a van reads with four. */
export const TRUCK_WHEELS_LOW: readonly TruckWheel[] = TRUCK_WHEELS.filter((w) => w.l !== 2.95);

/** Hinge x of a rear door. */
export const doorHingeX = (side: -1 | 1): number => side * HALF;
export const DOOR_OPEN_RAD = 4.5;

function rearSection(): TruckPart[] {
  const parts: TruckPart[] = [];
  const length = SHELL_FROM + 0.1;
  const midL = length / 2;
  const z = BODY.floor + BODY.height / 2;
  for (const s of [-1, 1]) {
    parts.push({
      pool: 'solid',
      at: [s * (HALF - 0.11), midL, z],
      size: [0.22, length, BODY.height],
      tone: 'body',
      round: 0.5,
    });
  }
  parts.push(
    // roof and floor of the hollow rear
    {
      pool: 'solid',
      at: [0, midL, TOP - 0.1],
      size: [BODY.width, length, 0.2],
      tone: 'body',
      round: 0.45,
    },
    {
      pool: 'solid',
      at: [0, midL, BODY.floor - 0.08],
      size: [BODY.width, length, 0.16],
      tone: 'body',
      round: 0.2,
    },
    // the inside of the box, deliberately paler than its paint would be in shade (docs/06 D4: no heavy darks)
    {
      pool: 'flat',
      at: [0, midL, BODY.floor + 0.002],
      size: [BODY.width - 0.44, length, 0.01],
      tone: 'truckInterior',
      inside: true,
    },
    {
      pool: 'flat',
      at: [0, HOLLOW + 0.0, z],
      size: [BODY.width - 0.44, 0.02, BODY.height - 0.4],
      tone: 'truckInterior',
      inside: true,
    },
    // header panel over the door opening, carrying the plate
    {
      pool: 'solid',
      at: [0, 0.05, PLATE.z],
      size: [BODY.width - 0.1, 0.1, 0.62],
      tone: 'body',
      round: 0.3,
    },
    {
      pool: 'flat',
      at: [0, PLATE.l + 0.008, PLATE.z],
      size: [PLATE.width, 0.012, PLATE.height],
      tone: 'plateGreen',
      low: true,
    },
  );
  return parts;
}

function cargo(): TruckPart[] {
  const parts: TruckPart[] = [];
  const w = 0.6;
  const h = 0.5;
  const d = 0.52;
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    const cols = row === rows - 1 ? 2 : 3;
    for (let c = 0; c < cols; c++) {
      const tone: PaletteKey = (row + c) % 3 === 1 ? 'cartonTape' : 'carton';
      parts.push({
        pool: 'solid',
        at: [
          (c - (cols - 1) / 2) * (w + 0.03),
          1.2 - (row % 2) * 0.05,
          BODY.floor + h / 2 + row * (h + 0.01),
        ],
        size: [w, d, h],
        tone,
        inside: true,
      });
    }
  }
  return parts;
}

function door(side: -1 | 1): TruckPart[] {
  const hinge = doorHingeX(side);
  const leaf = HALF - 0.02;
  const cx = hinge - side * (leaf / 2);
  const z = BODY.floor + (BODY.height - 0.62) / 2 + 0.02;
  const h = BODY.height - 0.66;
  return [
    {
      pool: 'solid',
      at: [cx, -0.03, z],
      size: [leaf, 0.06, h],
      tone: 'body',
      round: 0.3,
      door: side,
    },
    {
      pool: 'flat',
      at: [cx, -0.065, z - 0.32],
      size: [leaf - 0.1, 0.012, 0.42],
      tone: 'band',
      door: side,
    },
    {
      pool: 'flat',
      at: [cx - side * (leaf / 2 - 0.1), -0.07, z],
      size: [0.04, 0.03, h - 0.3],
      tone: 'metal',
      door: side,
    },
  ];
}

function shell(): TruckPart[] {
  const length = BODY.length - SHELL_FROM;
  const mid = SHELL_FROM + length / 2;
  const z = BODY.floor + BODY.height / 2;
  const parts: TruckPart[] = [
    {
      pool: 'shell',
      at: [0, mid, z],
      size: [BODY.width, length, BODY.height],
      tone: 'body',
      round: ROUND * 0.8,
    },
    // Low tier: the whole box in one, with no hollow rear to show
    {
      pool: 'shell',
      at: [0, BODY.length / 2, z],
      size: [BODY.width, BODY.length, BODY.height],
      tone: 'body',
      round: ROUND * 0.8,
      low: true,
      lowOnly: true,
    },
    // canvas top, faded by the sun
    {
      pool: 'flat',
      at: [0, BODY.length / 2 + 0.02, TOP + 0.012],
      size: [BODY.width - 0.7, BODY.length - 0.8, 0.012],
      tone: 'truckCanvas',
    },
  ];
  for (const s of [-1, 1]) {
    for (const [dz, dh] of [
      [1.0, 0.42],
      [2.25, 0.28],
    ] as const) {
      parts.push({
        pool: 'flat',
        at: [s * (HALF + 0.004), BODY.length / 2 + 0.05, BODY.floor + dz],
        size: [0.012, BODY.length - 0.5, dh],
        tone: 'band',
      });
    }
  }
  return parts;
}

function cab(): TruckPart[] {
  const len = TRUCK_LENGTH - CAB_FROM;
  const mid = CAB_FROM + len / 2;
  const front = TRUCK_LENGTH;
  const parts: TruckPart[] = [
    {
      pool: 'shell',
      at: [0, mid, 1.62],
      size: [2.3, len, 1.28],
      tone: 'cab',
      round: ROUND,
      low: true,
    },
    {
      pool: 'shell',
      at: [0, mid - 0.06, 2.72],
      size: [2.18, len - 0.14, 1.0],
      tone: 'cab',
      round: ROUND,
      low: true,
    },
    // glass and grille
    {
      pool: 'flat',
      at: [0, front - 0.08, 2.74],
      size: [1.82, 0.012, 0.66],
      tone: 'truckGlass',
    },
    { pool: 'flat', at: [0, front + 0.004, 1.6], size: [1.5, 0.012, 0.34], tone: 'metal' },
    // bumper
    {
      pool: 'solid',
      at: [0, front - 0.04, 1.02],
      size: [2.36, 0.2, 0.26],
      tone: 'metal',
      round: 0.3,
    },
  ];
  for (const s of [-1, 1]) {
    parts.push(
      {
        pool: 'flat',
        at: [s * 1.09, mid - 0.04, 2.76],
        size: [0.012, 0.92, 0.6],
        tone: 'truckGlass',
      },
      {
        pool: 'flat',
        at: [s * 0.82, front + 0.004, 1.28],
        size: [0.34, 0.012, 0.18],
        tone: 'card',
      },
      // mirror
      { pool: 'solid', at: [s * 1.32, front - 0.5, 2.6], size: [0.1, 0.1, 0.34], tone: 'belt' },
      // mudguard over the front wheel
      { pool: 'solid', at: [s * 0.98, 7.95, 1.14], size: [0.44, 1.34, 0.1], tone: 'belt' },
    );
  }
  return parts;
}

function chassis(): TruckPart[] {
  return [
    {
      pool: 'solid',
      at: [0, TRUCK_LENGTH / 2, 0.88],
      size: [1.8, TRUCK_LENGTH - 0.2, 0.36],
      tone: 'belt',
      low: true,
    },
    // rear bumper, painted
    { pool: 'solid', at: [0, 0.1, 0.78], size: [2.3, 0.14, 0.2], tone: 'palletYellow', round: 0.3 },
    // diesel tank
    { pool: 'solid', at: [1.12, 5.6, 0.78], size: [0.42, 1.1, 0.42], tone: 'metal' },
    // mudguards over the rear wheels
    ...[-1, 1].map((s): TruckPart => ({
      pool: 'solid',
      at: [s * 0.98, 2.35, 1.0],
      size: [0.44, 2.6, 0.08],
      tone: 'belt',
    })),
  ];
}

/** Every part of a van, for all liveries; `tone` names a livery slot where the paint varies. */
export const TRUCK_PARTS: readonly TruckPart[] = [
  ...chassis(),
  ...shell(),
  ...rearSection(),
  ...cargo(),
  ...door(-1),
  ...door(1),
  ...cab(),
];

export const partTone = (part: TruckPart, livery: Livery): PaletteKey =>
  part.tone === 'body' || part.tone === 'band' || part.tone === 'cab'
    ? livery[part.tone]
    : part.tone;
