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

// docs/06 D6: chunky toy proportions, slightly oversized on purpose (a real pallet is 1.2 x 1.0 m).
export const PALLET: readonly [number, number] = [1.5, 1.25];
export const PALLET_H = 0.2;
const DECK = 0.07;

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
  for (const fx of [-0.62, 0, 0.62]) {
    out.push({
      at: [...at(fx, 0), z + 0.01],
      size: [0.18, pd, 0.02],
      yaw,
      tone,
      shade: 0.82,
      detail: 'flat',
    });
    for (const fy of [-0.52, 0, 0.52]) {
      out.push({
        at: [...at(fx, fy), z + 0.02 + footH / 2],
        size: [0.2, 0.2, footH],
        yaw,
        tone,
        shade: 0.9,
        // 9 per pallet, 8 cm tall: rounding is invisible there, plain boxes save ~2.6k triangles per pallet
        detail: 'flat',
      });
    }
  }
  if (topVisible) {
    for (let i = 0; i < 5; i++) {
      out.push({
        at: [...at(-0.56 + i * 0.28, 0), z + PALLET_H + 0.001],
        size: [0.11, pd - 0.22, 0.004],
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

/**
 * Static staging content for one bay (docs/04 section 3, docs/06 D6): a receiving pallet at the belt mouth plus two to
 * four more big stacks, so 3-5 per bay with plenty of open floor between them, and two crate stacks by the conveyor.
 */
export function buildStaging(input: StagingInput): StagingResult {
  const r = rng(input.seed);
  const boxes: BoxItem[] = [];
  const marks: MarkItem[] = [];
  const half = Math.min(-input.x[0], input.x[1]);
  const palletTones: PaletteKey[] = [
    'palletBlue',
    'palletBlue',
    'palletBlue',
    'palletYellow',
    'palletOrange',
  ];
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)] as T;

  const place = (x: number, y: number) => {
    const yaw = (r() - 0.5) * 0.1;
    const kind = r();
    const baseTone = pick(palletTones);
    const at = rotator(x, y, yaw);
    let z = 0;
    if (kind < 0.25) {
      // stack of empty plastic pallets
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        boxes.push(
          ...pallet(x, y, z, i === n - 1 ? baseTone : pick(palletTones), yaw, i === n - 1),
        );
        z += PALLET_H;
      }
    } else if (kind < 0.75) {
      // pallet of cartons
      boxes.push(...pallet(x, y, 0, baseTone, yaw, false));
      z = PALLET_H;
      const layers = 2 + Math.floor(r() * 2);
      for (let l = 0; l < layers; l++) {
        for (const dx of [-0.36, 0.36]) {
          for (const dy of [-0.3, 0.3]) {
            boxes.push(
              ...carton([...at(dx, dy), z + 0.18], [0.7, 0.58, 0.36], yaw, 0.94 + r() * 0.1),
            );
          }
        }
        z += 0.36;
      }
    } else {
      // pallet of white sacks with a coloured band: soft pillows, not boxes
      boxes.push(...pallet(x, y, 0, baseTone, yaw, false));
      z = PALLET_H;
      const layers = 3 + Math.floor(r() * 2);
      for (let l = 0; l < layers; l++) {
        for (const dx of [-0.36, 0.36]) {
          const p = at(dx, 0);
          boxes.push({
            at: [...p, z + 0.11],
            size: [0.7, 1.16, 0.22],
            yaw,
            tone: 'sack',
            shade: 0.97 + r() * 0.05,
            round: 0.42,
            detail: 'lo',
          });
          boxes.push({
            at: [...p, z + 0.11],
            size: [0.62, 0.16, 0.225],
            yaw,
            tone: 'sackBand',
            round: 0.35,
            detail: 'lo',
          });
        }
        z += 0.22;
      }
    }
    if (r() < 0.3) {
      marks.push({
        at: [x, y + PALLET[1] / 2 + 0.006, PALLET_H - DECK / 2],
        size: [0.36, 0.1],
        text: r() < 0.5 ? 'FG' : 'DC',
      });
    }
  };

  // receiving pallet at the belt mouth, always there
  place(0, input.beltEnd + PALLET[1]);
  // two to four more from the side slots and the back slot, in a seed-stable order
  const side = half - PALLET[0] / 2 - 0.3;
  const slots: [number, number][] = [
    [-side, input.y[0] + 1.5],
    [side, input.y[0] + 1.5],
    [-side, input.y[0] + 4.4],
    [side, input.y[0] + 4.6],
    [0, input.y[1] - 1.5],
  ];
  const extra = 2 + Math.floor(r() * 3);
  for (let i = 0; i < extra; i++) {
    const [slot] = slots.splice(Math.floor(r() * slots.length), 1);
    if (slot) place(slot[0], slot[1]);
  }

  // blue crate stacks beside the conveyor (as in the overhead frames): open crates with a darker inner rim
  for (const [cx, cy] of [
    [-(input.beltHalf + 0.95), 3.4],
    [input.beltHalf + 0.95, 5.2],
  ] as const) {
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const yaw = (r() - 0.5) * 0.2;
      const shade = 0.92 + r() * 0.14;
      boxes.push({
        at: [cx, cy, 0.18 + i * 0.36],
        size: [0.78, 0.54, 0.34],
        yaw,
        tone: 'crate',
        shade,
        detail: 'lo',
      });
      if (i === n - 1) {
        boxes.push({
          at: [cx, cy, 0.35 + i * 0.36 + 0.002],
          size: [0.64, 0.4, 0.004],
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
