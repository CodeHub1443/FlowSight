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
