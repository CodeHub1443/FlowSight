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

/** Rows of storage kept at the far edge (docs/06 D6: no giant foreground cartons in the hero view). */
const ROWS = 2;
const ROW_PITCH = 1.7;

/**
 * Low-detail palletised storage behind the aisle (docs/04 section 3), face frame: two low rows against the far edge
 * of the storage range. A pallet base with a darker fork-pocket band, then one rounded carton (or wrapped sack) block
 * with a tape line on top.
 */
export function buildStorage(input: StorageInput): BoxItem[] {
  const r = rng(input.seed);
  const out: BoxItem[] = [];
  const blockW = Math.min(2.5, Math.max(0.8, (input.pitch - 1.0) / 2));
  const offsets = [-(blockW / 2 + 0.25), blockW / 2 + 0.25];
  for (let row = 0; row < ROWS; row++) {
    const y = input.y[1] - 1 - row * ROW_PITCH;
    if (y - 0.7 < input.y[0]) break;
    for (const dx of offsets) {
      if (r() < 0.14) continue;
      const x = input.centerX + dx;
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
      out.push({ at: [x, y, 0.55], size: [blockW - 0.1, 1.1, 0.78], tone, shade, detail: 'lo' });
      if (!wrapped) {
        out.push({
          at: [x, y, 0.942],
          size: [0.1, 1.104, 0.006],
          tone: 'cartonTape',
          shade,
          detail: 'flat',
        });
      }
    }
  }
  return out;
}
