import type { PaletteKey } from './materials';

/** A unit box placed in the bay (or face) frame: x right, y into the building, z up (docs/04 section 2.1). */
export interface BoxItem {
  at: readonly [number, number, number];
  /** Extents along x, y, z. */
  size: readonly [number, number, number];
  /** Rotation about the vertical axis, CCW from above (like the contract heading). */
  yaw?: number;
  tone: PaletteKey;
  /** Brightness multiplier around 1 for subtle per-instance variation. */
  shade?: number;
}

/** A flat painted marking (text atlas quad) standing on a surface facing bay +y. */
export interface MarkItem {
  at: readonly [number, number, number];
  size: readonly [number, number];
  text: 'FG' | 'DC';
}
