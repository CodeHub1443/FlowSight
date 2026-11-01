import type { BeltStatus, CaseTick, PackType } from '@/domain';
import type { PaletteKey } from '../materials';
import { hashString } from '../site/random';
import { itemTone } from './livery';

// Items on the belts (docs/04 section 3): one per CaseTick, travelling boom tip <-> belt mouth in the item's direction.
// Representative, not physically exact. Pure and three-free. The cap keeps 60x mock speed from flooding a belt: a tick
// that finds its belt full is skipped, never queued.

export const MAX_ITEMS_PER_BAY = 24;
/** Metres per second along the belt. */
export const BELT_SPEED = 0.9;
/** Share of the trip at each end over which an item grows in or shrinks out (docs/06 section 2: no popping). */
export const END_RAMP = 0.04;
/** Least distance between two items on a belt, metres. */
export const MIN_ITEM_GAP_M = 0.78;

export const ITEM_SIZE: Record<PackType, readonly [number, number, number]> = {
  CASE: [0.52, 0.42, 0.32],
  SACK: [0.66, 0.44, 0.26],
  SHRINK: [0.58, 0.48, 0.42],
};

export interface BeltItem {
  bay: string;
  dir: CaseTick['dir'];
  pack: PackType;
  tone: PaletteKey;
  flagged: boolean;
  /** Progress along the trip, 0..1. */
  k: number;
  /** Across the belt, metres; yaw, radians: a little untidy, by a per-item seed. */
  x: number;
  yaw: number;
}

export interface BeltSpan {
  tip: number;
  mouth: number;
}

/** Bay y of an item: OUT runs mouth to tip (into the truck), IN tip to mouth. */
export function itemY(item: Pick<BeltItem, 'dir' | 'k'>, span: BeltSpan): number {
  const from = item.dir === 'OUT' ? span.mouth : span.tip;
  const to = item.dir === 'OUT' ? span.tip : span.mouth;
  return from + (to - from) * item.k;
}

/** The trip on a conveyor: boom tip to the end of the belt's working stretch. */
export function beltSpan(c: { fixedFrom: number; fixedTo: number }): BeltSpan {
  return { tip: c.fixedFrom, mouth: c.fixedTo - 0.4 };
}

export function beltTrip(c: { fixedFrom: number; fixedTo: number }): number {
  const s = beltSpan(c);
  return s.mouth - s.tip;
}

export function itemScale(k: number): number {
  return Math.max(0, Math.min(1, Math.min(k, 1 - k) / END_RAMP));
}

/** Everything rides on except on a stopped or unseen belt; once the truck has gone, what is left simply runs off. */
export function beltMoves(status: BeltStatus | undefined): boolean {
  return status !== 'STOPPED' && status !== 'OFFLINE';
}

export class BeltItems {
  readonly items: BeltItem[] = [];
  private readonly perBay = new Map<string, number>();
  private readonly newest = new Map<string, BeltItem>();
  private serial = 0;

  /**
   * False when the bay's belt already carries MAX_ITEMS_PER_BAY, or when its newest item has not yet travelled `gapK` of
   * the trip: items never overlap, whatever the mock's speed.
   */
  spawn(tick: Pick<CaseTick, 'bay' | 'dir' | 'pack' | 'sku' | 'flag'>, gapK = 0): boolean {
    const n = this.perBay.get(tick.bay) ?? 0;
    if (n >= MAX_ITEMS_PER_BAY) return false;
    if (gapK > 0 && (this.newest.get(tick.bay)?.k ?? 1) < gapK) return false;
    const seed = hashString(`${tick.bay}-${this.serial++}`);
    const item: BeltItem = {
      bay: tick.bay,
      dir: tick.dir,
      pack: tick.pack,
      tone: itemTone(tick),
      flagged: tick.flag !== null,
      k: 0,
      x: (((seed >>> 8) % 1000) / 1000 - 0.5) * 0.24,
      yaw: (((seed >>> 18) % 1000) / 1000 - 0.5) * 0.3,
    };
    this.items.push(item);
    this.newest.set(tick.bay, item);
    this.perBay.set(tick.bay, n + 1);
    return true;
  }

  countOf(bay: string): number {
    return this.perBay.get(bay) ?? 0;
  }

  /** `lengthOf` gives the trip length of a bay, `statusOf` its belt status. */
  update(
    dtMs: number,
    lengthOf: (bay: string) => number,
    statusOf: (bay: string) => BeltStatus | undefined,
  ): void {
    const dt = Math.max(0, dtMs) / 1000;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i] as BeltItem;
      if (beltMoves(statusOf(it.bay))) it.k += (dt * BELT_SPEED) / Math.max(0.5, lengthOf(it.bay));
      if (it.k >= 1) {
        this.items.splice(i, 1);
        this.perBay.set(it.bay, Math.max(0, (this.perBay.get(it.bay) ?? 1) - 1));
      }
    }
  }
}
