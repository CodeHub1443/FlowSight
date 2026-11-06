import type { BeltStatus, CaseTick } from '@/domain';
import { hashString } from '../site/random';

// Items on the belts (docs/04 section 3): one per CaseTick, travelling boom tip <-> belt mouth in the item's direction.
// Representative, not physically exact. Pure and three-free. The cap keeps 60x mock speed from flooding a belt: a tick
// that finds its belt full is skipped, never queued.

export const MAX_ITEMS_PER_BAY = 24;
/** Metres per second along the belt at full speed. */
export const BELT_SPEED = 0.9;
/** Carton rate (per minute) at and above which the belt runs at BELT_SPEED. Below it the speed is proportional to the rate. */
export const BELT_FULL_CPM = 6;
/** Least share of BELT_SPEED a moving belt runs at, so a nearly empty belt still carries its first cartons off. */
export const BELT_MIN_FRACTION = 0.25;

/**
 * Speed of a moving belt for its reported rate (docs/04 section 3: surface scroll proportional to `rateCpm`). The item
 * travel in `BeltItems.update` and the surface scroll of the bay (bay/bayAnim.ts) both use this one function, so a carton
 * never slides on the belt that carries it. Proportional up to BELT_FULL_CPM, then saturated: a real belt runs at a fixed
 * speed, the rate only says how often a carton is placed on it.
 */
export function beltSpeedFor(rateCpm: number | undefined): number {
  const rate = rateCpm !== undefined && Number.isFinite(rateCpm) ? Math.max(0, rateCpm) : 0;
  return BELT_SPEED * Math.min(1, Math.max(BELT_MIN_FRACTION, rate / BELT_FULL_CPM));
}
/** Share of the trip at each end over which an item grows in or shrinks out (docs/06 section 2: no popping). */
export const END_RAMP = 0.04;
/** Least distance between two items on a belt, metres. */
export const MIN_ITEM_GAP_M = 0.78;

// Belt items are cartons and nothing else (docs/06 section 7.6): kraft body, lighter tape strip. The only variation is
// the size and a light/medium kraft tone, both picked from the item's seed.
export const CARTON_SIZES = ['small', 'medium', 'large'] as const;
export const CARTON_TONES = ['light', 'medium'] as const;
export type CartonSize = (typeof CARTON_SIZES)[number];
export type CartonTone = (typeof CARTON_TONES)[number];
export type CartonVariant = `${CartonSize}-${CartonTone}`;

export const CARTON_VARIANTS: readonly CartonVariant[] = CARTON_SIZES.flatMap((z) =>
  CARTON_TONES.map((t): CartonVariant => `${z}-${t}`),
);

/** Width (across the belt), length (along it) and height in metres. */
export const CARTON_DIMS: Record<CartonSize, readonly [number, number, number]> = {
  small: [0.4, 0.32, 0.26],
  medium: [0.52, 0.42, 0.32],
  large: [0.62, 0.48, 0.4],
};
/** The kraft body colour is the palette's carton colour times this: the pallet cartons' look, a touch darker. */
export const CARTON_TONE_FACTOR: Record<CartonTone, number> = { light: 1, medium: 0.9 };

export function cartonSizeOf(variant: CartonVariant): CartonSize {
  return variant.split('-')[0] as CartonSize;
}
export function cartonToneOf(variant: CartonVariant): CartonTone {
  return variant.split('-')[1] as CartonTone;
}

/** Deterministic: the same seed always gives the same carton. */
export function pickCartonVariant(seed: number): CartonVariant {
  return CARTON_VARIANTS[(seed >>> 4) % CARTON_VARIANTS.length] as CartonVariant;
}

export interface BeltItem {
  bay: string;
  dir: CaseTick['dir'];
  variant: CartonVariant;
  flagged: boolean;
  /** Progress along the trip, 0..1. */
  k: number;
  /** Across the belt, metres; yaw, radians (at most ~3.4 degrees): a little untidy, by a per-item seed. */
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

/**
 * The trip on a conveyor: boom tip to the end of the belt's working stretch. `extend` is how far the boom has run out
 * past `fixedFrom` (metres, 0 retracted): the tip, and with it the start of the trip, moves into the truck.
 */
export function beltSpan(c: { fixedFrom: number; fixedTo: number }, extend = 0): BeltSpan {
  return { tip: c.fixedFrom - Math.max(0, extend), mouth: c.fixedTo - 0.4 };
}

export function beltTrip(c: { fixedFrom: number; fixedTo: number }, extend = 0): number {
  const s = beltSpan(c, extend);
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
  spawn(tick: Pick<CaseTick, 'bay' | 'dir' | 'flag'>, gapK = 0): boolean {
    const n = this.perBay.get(tick.bay) ?? 0;
    if (n >= MAX_ITEMS_PER_BAY) return false;
    if (gapK > 0 && (this.newest.get(tick.bay)?.k ?? 1) < gapK) return false;
    const seed = hashString(`${tick.bay}-${this.serial++}`);
    const item: BeltItem = {
      bay: tick.bay,
      dir: tick.dir,
      variant: pickCartonVariant(seed),
      flagged: tick.flag !== null,
      k: 0,
      x: (((seed >>> 8) % 1000) / 1000 - 0.5) * 0.24,
      yaw: (((seed >>> 18) % 1000) / 1000 - 0.5) * 0.12,
    };
    this.items.push(item);
    this.newest.set(tick.bay, item);
    this.perBay.set(tick.bay, n + 1);
    return true;
  }

  countOf(bay: string): number {
    return this.perBay.get(bay) ?? 0;
  }

  /**
   * `lengthOf` gives the trip length of a bay, `statusOf` its belt status. With `rateOf` the items travel at
   * `beltSpeedFor(rate)`, the speed the belt surface scrolls at; without it at BELT_SPEED.
   */
  update(
    dtMs: number,
    lengthOf: (bay: string) => number,
    statusOf: (bay: string) => BeltStatus | undefined,
    rateOf?: (bay: string) => number | undefined,
  ): void {
    const dt = Math.max(0, dtMs) / 1000;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i] as BeltItem;
      if (beltMoves(statusOf(it.bay))) {
        const speed = rateOf ? beltSpeedFor(rateOf(it.bay)) : BELT_SPEED;
        it.k += (dt * speed) / Math.max(0.5, lengthOf(it.bay));
      }
      if (it.k >= 1) {
        this.items.splice(i, 1);
        this.perBay.set(it.bay, Math.max(0, (this.perBay.get(it.bay) ?? 1) - 1));
      }
    }
  }
}
