import { BoxGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The selection bracket box (docs/06 D8): thin world-space boxes, because WebGL lines are always 1 px.

/** Bar thickness in metres: about 2 px at the default hero distance. */
const THICKNESS = 0.11;
/** Tick length as a share of the shortest side of the box. */
const TICK_SHARE = 0.3;

const cache = new Map<string, BufferGeometry>();

/**
 * Three ticks on each of the 8 corners of a `w` x `h` x `d` box standing on the floor, merged into one geometry and
 * centred on x and z.
 */
export function bracketGeometry(w: number, h: number, d: number): BufferGeometry {
  const key = `${w}|${h}|${d}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tick = Math.min(w, h, d) * TICK_SHARE;
  const parts: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const top of [false, true]) {
        const cx = (sx * w) / 2;
        const cy = top ? h : 0;
        const cz = (sz * d) / 2;
        const up = top ? -1 : 1;
        parts.push(
          new BoxGeometry(tick, THICKNESS, THICKNESS).translate(cx - (sx * tick) / 2, cy, cz),
          new BoxGeometry(THICKNESS, tick, THICKNESS).translate(cx, cy + (up * tick) / 2, cz),
          new BoxGeometry(THICKNESS, THICKNESS, tick).translate(cx, cy, cz - (sz * tick) / 2),
        );
      }
    }
  }
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  cache.set(key, merged);
  return merged;
}
