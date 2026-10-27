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

/**
 * Low-detail palletised storage blocks behind the aisle (docs/04 section 3), face frame: a pallet base with a
 * darker fork-pocket band, then one or two rounded carton (or wrapped sack) blocks with a tape line on top.
 */
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
      const x = input.centerX + dx;
      const levels = 1 + Math.floor(r() * 2);
      out.push(
        {
          at: [x, y, 0.075],
          size: [blockW, 1.2, 0.15],
          tone: 'palletBlue',
          shade: 0.9,
          detail: 'lo',
        },
        {
          at: [x, y + 0.601, 0.06],
          size: [blockW - 0.3, 0.004, 0.06],
          tone: 'palletBlue',
          shade: 0.55,
          detail: 'flat',
        },
      );
      const wrapped = r() < 0.2;
      const tone: PaletteKey = wrapped ? 'sack' : 'carton';
      const shade = wrapped ? 0.98 : 0.9 + r() * 0.14;
      for (let l = 0; l < levels; l++) {
        const z = 0.15 + 0.4 + l * 0.8;
        out.push({ at: [x, y, z], size: [blockW - 0.1, 1.1, 0.78], tone, shade, detail: 'lo' });
        if (!wrapped && l === levels - 1) {
          out.push({
            at: [x, y, z + 0.392],
            size: [0.1, 1.104, 0.006],
            tone: 'cartonTape',
            shade,
            detail: 'flat',
          });
        }
      }
    }
    y += rowPitch;
    sinceAisle++;
  }
  return out;
}
