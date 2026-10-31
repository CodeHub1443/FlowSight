import type { PropItem } from '../assets/PropInstances';
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

/** Distance between pallet rows, rows between cross aisles, and the width of a cross aisle. */
export const ROW_PITCH = 1.4;
export const ROWS_PER_BLOCK = 5;
export const CROSS_AISLE = 2.2;
/** Share of pallet positions left empty. */
const EMPTY_SHARE = 0.14;

/**
 * Low-detail palletised storage across the whole storage zone (docs/04 section 3), face frame: blocks of five rows with
 * cross aisles, two columns per bay with the column aisle between them. Each position is a pallet base with a darker
 * fork-pocket band, then one or two rounded carton (or wrapped sack) blocks with a tape line on top. All tones are the
 * faded `storage*` colours (docs/06 D6, section 7.3), so the zone stays behind the bays. Not interactive: the group
 * has no pointer handlers, so the raycaster never tests these instances.
 */
export function buildStorage(input: StorageInput): BoxItem[] {
  const r = rng(input.seed);
  const out: BoxItem[] = [];
  const blockW = Math.min(2.5, Math.max(0.8, (input.pitch - 1.0) / 2));
  const offsets = [-(blockW / 2 + 0.25), blockW / 2 + 0.25];
  let y = input.y[0] + 1.0;
  let sinceAisle = 0;
  while (y + 0.7 < input.y[1]) {
    if (sinceAisle === ROWS_PER_BLOCK) {
      y += CROSS_AISLE;
      sinceAisle = 0;
      continue;
    }
    for (const dx of offsets) {
      if (r() < EMPTY_SHARE) continue;
      const x = input.centerX + dx;
      const levels = 1 + Math.floor(r() * 2);
      out.push(
        {
          at: [x, y, 0.075],
          size: [blockW, 1.2, 0.15],
          tone: 'storagePallet',
          shade: 0.9,
          detail: 'lo',
        },
        {
          at: [x, y + 0.601, 0.06],
          size: [blockW - 0.3, 0.004, 0.06],
          tone: 'storagePallet',
          shade: 0.7,
          detail: 'flat',
        },
      );
      const wrapped = r() < 0.2;
      const tone: PaletteKey = wrapped ? 'storageSack' : 'storageCarton';
      const shade = wrapped ? 0.98 : 0.94 + r() * 0.08;
      for (let l = 0; l < levels; l++) {
        const z = 0.15 + 0.4 + l * 0.8;
        out.push({ at: [x, y, z], size: [blockW - 0.1, 1.1, 0.78], tone, shade, detail: 'lo' });
        if (!wrapped && l === levels - 1) {
          out.push({
            at: [x, y, z + 0.392],
            size: [0.1, 1.104, 0.006],
            tone: 'storageTape',
            shade,
            detail: 'flat',
          });
        }
      }
    }
    y += ROW_PITCH;
    sinceAisle++;
  }
  return out;
}

export interface StorageProps {
  /** Pallet bases and carton blocks as GLB instances; the far pallet LOD, since there are hundreds of them. */
  pallets: PropItem[];
  cartons: PropItem[];
  /** Wrapped sacks and tape lines stay procedural on every tier. */
  rest: BoxItem[];
  /** What the GLB props replace: the procedural pallets, fork-pocket bands and carton blocks. */
  procedural: BoxItem[];
}

/** The same storage as GLB props (ADR-13). `buildStorage` stays the one layout: Low tier draws it as it is. */
export function storageProps(items: readonly BoxItem[]): StorageProps {
  const out: StorageProps = { pallets: [], cartons: [], rest: [], procedural: [] };
  for (const it of items) {
    const base = {
      at: [it.at[0], it.at[1], it.at[2] - it.size[2] / 2] as const,
      size: it.size,
      tone: it.tone,
      shade: it.shade,
    };
    if (it.tone === 'storagePallet') {
      out.procedural.push(it);
      // the darker fork-pocket band is a painted stand-in for what the model has as geometry
      if (it.detail !== 'flat') out.pallets.push(base);
    } else if (it.tone === 'storageCarton') {
      out.procedural.push(it);
      out.cartons.push(base);
    } else {
      out.rest.push(it);
    }
  }
  return out;
}
