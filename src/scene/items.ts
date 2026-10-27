import type { Detail } from './geometry';
import type { PaletteKey } from './materials';

/** A box placed in the bay (or face) frame: x right, y into the building, z up (docs/04 section 2.1). */
export interface BoxItem {
  at: readonly [number, number, number];
  /** Extents along x, y, z. */
  size: readonly [number, number, number];
  /** Rotation about the vertical axis, CCW from above (like the contract heading). */
  yaw?: number;
  /** Rotation about the box's own y (length) axis; positive tips its top towards +x. */
  roll?: number;
  tone: PaletteKey;
  /** Brightness multiplier around 1 for subtle per-instance variation. */
  shade?: number;
  /** Corner radius as a fraction of the smallest side (default ROUND; 0 = sharp). Ignored for `flat`. */
  round?: number;
  /** Geometry detail (default: the BoxInstances `detail`). `flat` = plain box for paint and hidden parts. */
  detail?: Detail;
}

/** A cylinder in the bay (or face) frame, along bay x (rollers), y (buttons, facing into the building) or z (posts). */
export interface CylItem {
  at: readonly [number, number, number];
  radius: number;
  length: number;
  axis: 'x' | 'y' | 'z';
  tone: PaletteKey;
  shade?: number;
}

/** A flat painted marking (text atlas quad) standing on a surface facing bay +y. */
export interface MarkItem {
  at: readonly [number, number, number];
  size: readonly [number, number];
  text: 'FG' | 'DC';
}
