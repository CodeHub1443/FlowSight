import type { CaseTick, PackType } from '@/domain';
import type { PaletteKey } from '../materials';
import { hashString } from '../site/random';

// Deterministic colours from identifiers. The contract has no truck id: the plate is the one thing that stays with a
// truck across visits, so the same van keeps its paint. Hand-painted, no company names (docs/04 section 4).

export interface Livery {
  name: 'yellow-blue' | 'blue-yellow' | 'green' | 'teal';
  body: PaletteKey;
  /** The painted bands on the box. */
  band: PaletteKey;
  cab: PaletteKey;
}

export const LIVERIES: readonly Livery[] = [
  { name: 'yellow-blue', body: 'truckYellow', band: 'truckBlue', cab: 'truckBlue' },
  { name: 'blue-yellow', body: 'truckBlue', band: 'truckYellow', cab: 'truckYellow' },
  { name: 'green', body: 'truckGreen', band: 'truckCanvas', cab: 'truckGreen' },
  { name: 'teal', body: 'truckTeal', band: 'truckCanvas', cab: 'truckTeal' },
];

export function liveryOf(plateEn: string): Livery {
  // the top bits: FNV's low bits barely vary between plates that differ in their last digits
  const l = LIVERIES[(hashString(plateEn) >>> 16) % LIVERIES.length];
  return l ?? (LIVERIES[0] as Livery);
}

const PACK_TONES: Record<PackType, readonly PaletteKey[]> = {
  CASE: ['carton', 'cartonTape', 'crateNew', 'palletOrange', 'palletYellow', 'brandLight'],
  SACK: ['sack', 'sackBand', 'palletYellow', 'carton'],
  SHRINK: ['sack', 'brandTint', 'zone', 'metal'],
};

/** Colour of an item on a belt: by SKU within its pack family; damaged, torn or wet items are red (docs/04 section 3). */
export function itemTone(tick: Pick<CaseTick, 'sku' | 'pack' | 'flag'>): PaletteKey {
  if (tick.flag !== null) return 'statusCritical';
  if (tick.sku === 'UNKNOWN') return 'statusNeutral';
  const list = PACK_TONES[tick.pack];
  return list[(hashString(tick.sku) >>> 16) % list.length] ?? 'carton';
}
