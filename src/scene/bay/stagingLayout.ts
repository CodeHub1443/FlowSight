import type { BoxItem, MarkItem } from '../items';
import type { PaletteKey } from '../materials';
import { rng } from '../site/random';

export interface StagingInput {
  seed: number;
  /** x range of the staging zone, bay-local. */
  x: readonly [number, number];
  y: readonly [number, number];
  /** Belt body x half width (kept clear of the conveyor itself). */
  beltHalf: number;
  /** Where the belt body ends (y); the receiving pallet sits just beyond it. */
  beltEnd: number;
}

export interface StagingResult {
  boxes: BoxItem[];
  marks: MarkItem[];
}

export const PALLET: readonly [number, number] = [1.2, 1.0];
export const PALLET_H = 0.15;
const DECK = 0.045;

type Rot = (dx: number, dy: number) => [number, number];

const rotator = (x: number, y: number, yaw: number): Rot => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (dx, dy) => [x + dx * c - dy * s, y + dx * s + dy * c];
};

/**
 * A plastic pallet (docs/06: "pallets get slots"): rounded deck, nine feet with fork pockets between them, three
 * bottom runners and, when the top is visible, darker slots across the deck.
 */
export function pallet(
  x: number,
  y: number,
  z: number,
  tone: PaletteKey,
  yaw: number,
  topVisible: boolean,
): BoxItem[] {
  const at = rotator(x, y, yaw);
  const [pw, pd] = PALLET;
  const out: BoxItem[] = [
    { at: [...at(0, 0), z + PALLET_H - DECK / 2], size: [pw, pd, DECK], yaw, tone, detail: 'lo' },
  ];
  const footH = PALLET_H - DECK - 0.02;
  for (const fx of [-0.5, 0, 0.5]) {
    out.push({
      at: [...at(fx, 0), z + 0.01],
      size: [0.14, pd, 0.02],
      yaw,
      tone,
      shade: 0.82,
      detail: 'flat',
    });
    for (const fy of [-0.42, 0, 0.42]) {
      out.push({
        at: [...at(fx, fy), z + 0.02 + footH / 2],
        size: [0.15, 0.15, footH],
        yaw,
        tone,
        shade: 0.9,
        // 9 per pallet, 8 cm tall: rounding is invisible there, plain boxes save ~2.6k triangles per pallet
        detail: 'flat',
      });
    }
  }
  if (topVisible) {
    for (let i = 0; i < 6; i++) {
      out.push({
        at: [...at(-0.475 + i * 0.19, 0), z + PALLET_H + 0.001],
        size: [0.07, pd - 0.16, 0.004],
        yaw,
        tone,
        shade: 0.7,
        detail: 'flat',
      });
    }
  }
  return out;
}

/** A carton with a tape strip over the top and down both ends (docs/06: "cartons get a tape strip"). */
export function carton(
  at: readonly [number, number, number],
  size: readonly [number, number, number],
  yaw: number,
  shade: number,
): BoxItem[] {
  const [w, d, h] = size;
  return [
    { at, size, yaw, tone: 'carton', shade, detail: 'lo' },
    {
      at: [at[0], at[1], at[2] + h * 0.3 + 0.002],
      size: [w * 0.16, d + 0.006, h * 0.4 + 0.004],
      yaw,
      tone: 'cartonTape',
      shade,
      detail: 'flat',
    },
  ];
}

/** Static staging content for one bay: pallets, crate stacks, cartons and sacks (docs/04 section 3). */
export function buildStaging(input: StagingInput): StagingResult {
  const r = rng(input.seed);
  const boxes: BoxItem[] = [];
  const marks: MarkItem[] = [];
  const half = Math.min(-input.x[0], input.x[1]);
  const cols = [-2.3, -1.0, 1.0, 2.3].filter((c) => Math.abs(c) <= half - 0.62);
  const palletTones: PaletteKey[] = [
    'palletBlue',
    'palletBlue',
    'palletBlue',
    'palletYellow',
    'palletOrange',
  ];
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)] as T;

  const place = (x: number, y: number) => {
    const yaw = (r() - 0.5) * 0.12;
    const kind = r();
    if (kind < 0.22) return; // empty slot
    const baseTone = pick(palletTones);
    const at = rotator(x, y, yaw);
    let z = 0;
    let top = 0;
    if (kind < 0.5) {
      // stack of empty plastic pallets
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        boxes.push(
          ...pallet(x, y, z, i === n - 1 ? baseTone : pick(palletTones), yaw, i === n - 1),
        );
        z += PALLET_H;
      }
      top = z;
    } else if (kind < 0.8) {
      // pallet of cartons
      boxes.push(...pallet(x, y, 0, baseTone, yaw, false));
      z = PALLET_H;
      const layers = 2 + Math.floor(r() * 3);
      for (let l = 0; l < layers; l++) {
        for (const dx of [-0.29, 0.29]) {
          for (const dy of [-0.24, 0.24]) {
            boxes.push(
              ...carton([...at(dx, dy), z + 0.14], [0.56, 0.46, 0.28], yaw, 0.94 + r() * 0.1),
            );
          }
        }
        z += 0.28;
      }
      top = z;
    } else {
      // pallet of white sacks with a coloured band: soft pillows, not boxes
      boxes.push(...pallet(x, y, 0, baseTone, yaw, false));
      z = PALLET_H;
      const layers = 3 + Math.floor(r() * 3);
      for (let l = 0; l < layers; l++) {
        for (const dx of [-0.29, 0.29]) {
          const p = at(dx, 0);
          boxes.push({
            at: [...p, z + 0.08],
            size: [0.56, 0.9, 0.16],
            yaw,
            tone: 'sack',
            shade: 0.97 + r() * 0.05,
            round: 0.42,
            detail: 'lo',
          });
          boxes.push({
            at: [...p, z + 0.08],
            size: [0.5, 0.12, 0.165],
            yaw,
            tone: 'sackBand',
            round: 0.35,
            detail: 'lo',
          });
        }
        z += 0.16;
      }
      top = z;
    }
    if (r() < 0.3) {
      marks.push({
        at: [x, y + PALLET[1] / 2 + 0.006, Math.min(PALLET_H - DECK / 2, top / 2)],
        size: [0.3, 0.09],
        text: r() < 0.5 ? 'FG' : 'DC',
      });
    }
  };

  const rows = Math.max(0, Math.floor((input.y[1] - input.y[0] - 0.3) / 1.35));
  for (let row = 0; row < rows; row++) {
    const y = input.y[0] + 1.0 + row * 1.35;
    for (const x of cols) {
      // keep the corridor in front of the belt mouth clear except for the receiving pallet
      if (Math.abs(x) < input.beltHalf + 0.6 && row > 0) continue;
      place(x, y);
    }
  }
  // receiving pallet at the belt mouth
  place(0, input.beltEnd + 1.0);

  // blue crate stacks beside the conveyor (as in the overhead frames): open crates with a darker inner rim
  for (const [cx, cy] of [
    [-(input.beltHalf + 0.95), 3.4],
    [input.beltHalf + 0.95, 5.2],
  ] as const) {
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const yaw = (r() - 0.5) * 0.2;
      const shade = 0.92 + r() * 0.14;
      boxes.push({
        at: [cx, cy, 0.15 + i * 0.3],
        size: [0.62, 0.42, 0.28],
        yaw,
        tone: 'crate',
        shade,
        detail: 'lo',
      });
      if (i === n - 1) {
        boxes.push({
          at: [cx, cy, 0.29 + i * 0.3 + 0.002],
          size: [0.52, 0.32, 0.004],
          yaw,
          tone: 'crate',
          shade: shade * 0.62,
          detail: 'flat',
        });
      }
    }
  }
  return { boxes, marks };
}
