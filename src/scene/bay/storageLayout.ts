import type { BoxItem } from '../items';
import type { PaletteKey } from '../materials';
import { rng } from '../site/random';

export interface StorageInput {
  seed: number;
  /** Face-frame x of the bay centre. */
  centerX: number;
  pitch: number;
  y: readonly [number, number];
}

/** Low-detail palletised storage blocks behind the aisle (docs/04 section 3), face frame. */
export function buildStorage(input: StorageInput): BoxItem[] {
  const r = rng(input.seed);
  const out: BoxItem[] = [];
  const blockW = Math.min(2.5, Math.max(0.8, (input.pitch - 1.0) / 2));
  const offsets = [-(blockW / 2 + 0.25), blockW / 2 + 0.25];
  const rowPitch = 1.4;
  let y = input.y[0] + 1.0;
  let sinceAisle = 0;
  while (y + 0.7 < input.y[1]) {
    if (sinceAisle === 5) {
      y += 2.2; // cross aisle
      sinceAisle = 0;
      continue;
    }
    for (const dx of offsets) {
      if (r() < 0.14) continue;
      const levels = 1 + Math.floor(r() * 2);
      out.push({
        at: [input.centerX + dx, y, 0.07],
        size: [blockW, 1.2, 0.14],
        tone: 'palletBlue',
        shade: 0.8,
      });
      const wrapped = r() < 0.2;
      const tone: PaletteKey = wrapped ? 'sack' : r() < 0.5 ? 'carton' : 'cartonDark';
      for (let l = 0; l < levels; l++) {
        out.push({
          at: [input.centerX + dx, y, 0.14 + 0.4 + l * 0.8],
          size: [blockW - 0.1, 1.1, 0.78],
          tone,
          shade: 0.93 + r() * 0.14,
        });
      }
    }
    y += rowPitch;
    sinceAisle++;
  }
  return out;
}
