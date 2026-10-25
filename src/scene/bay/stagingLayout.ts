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

const PALLET: readonly [number, number] = [1.2, 1.0];
const PALLET_H = 0.14;

function pallet(x: number, y: number, z: number, tone: PaletteKey, yaw: number): BoxItem[] {
  // deck + three runners: reads as a plastic pallet from above and from the side
  const out: BoxItem[] = [
    { at: [x, y, z + PALLET_H - 0.025], size: [PALLET[0], PALLET[1], 0.05], yaw, tone },
  ];
  for (const dx of [-0.5, 0, 0.5]) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    out.push({
      at: [x + dx * c, y + dx * s, z + (PALLET_H - 0.05) / 2],
      size: [0.1, PALLET[1], PALLET_H - 0.05],
      yaw,
      tone,
      shade: 0.85,
    });
  }
  return out;
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
    let z = 0;
    let top = 0;
    if (kind < 0.5) {
      // stack of empty plastic pallets
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        boxes.push(...pallet(x, y, z, i === n - 1 ? baseTone : pick(palletTones), yaw));
        z += PALLET_H;
      }
      top = z;
    } else if (kind < 0.8) {
      // pallet of cartons
      boxes.push(...pallet(x, y, 0, baseTone, yaw));
      z = PALLET_H;
      const layers = 2 + Math.floor(r() * 3);
      for (let l = 0; l < layers; l++) {
        for (const dx of [-0.29, 0.29]) {
          for (const dy of [-0.24, 0.24]) {
            const c = Math.cos(yaw);
            const s = Math.sin(yaw);
            boxes.push({
              at: [x + dx * c - dy * s, y + dx * s + dy * c, z + 0.14],
              size: [0.56, 0.46, 0.28],
              yaw,
              tone: 'carton',
              shade: 0.92 + r() * 0.16,
            });
          }
        }
        z += 0.28;
      }
      top = z;
    } else {
      // pallet of white sacks with a coloured band
      boxes.push(...pallet(x, y, 0, baseTone, yaw));
      z = PALLET_H;
      const layers = 3 + Math.floor(r() * 3);
      for (let l = 0; l < layers; l++) {
        for (const dx of [-0.29, 0.29]) {
          const c = Math.cos(yaw);
          const s = Math.sin(yaw);
          boxes.push({
            at: [x + dx * c, y + dx * s, z + 0.08],
            size: [0.56, 0.9, 0.16],
            yaw,
            tone: 'sack',
            shade: 0.96 + r() * 0.06,
          });
          boxes.push({
            at: [x + dx * c, y + dx * s, z + 0.08],
            size: [0.57, 0.14, 0.165],
            yaw,
            tone: 'sackBand',
          });
        }
        z += 0.16;
      }
      top = z;
    }
    if (r() < 0.3) {
      marks.push({
        at: [x, y + PALLET[1] / 2 + 0.006, Math.min(0.09, top / 2)],
        size: [0.34, 0.1],
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

  // blue crate stacks beside the conveyor (as in the overhead frames)
  for (const [cx, cy] of [
    [-(input.beltHalf + 0.95), 3.4],
    [input.beltHalf + 0.95, 5.2],
  ] as const) {
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      boxes.push({
        at: [cx, cy, 0.15 + i * 0.3],
        size: [0.62, 0.42, 0.28],
        yaw: (r() - 0.5) * 0.2,
        tone: 'crate',
        shade: 0.9 + r() * 0.2,
      });
    }
  }
  return { boxes, marks };
}
