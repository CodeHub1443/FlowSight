import { Path, Shape, ShapeGeometry, type BufferGeometry } from 'three';
import { sharedAcrossMounts } from './gpuRelease';

// Flat rounded-rectangle geometries lying on the floor (three XZ plane, +Y up), cached by size: work-zone plates
// and selection / hover rings. Rounded in plan, which the thickness-based box rounding cannot do for thin plates.

function roundedRect(path: Path, w: number, h: number, r: number): Path {
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  path.moveTo(x + rr, y);
  path.lineTo(x + w - rr, y);
  path.quadraticCurveTo(x + w, y, x + w, y + rr);
  path.lineTo(x + w, y + h - rr);
  path.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  path.lineTo(x + rr, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - rr);
  path.lineTo(x, y + rr);
  path.quadraticCurveTo(x, y, x + rr, y);
  return path;
}

const cache = new Map<string, BufferGeometry>();

function cached(key: string, make: () => BufferGeometry): BufferGeometry {
  const hit = cache.get(key);
  if (hit) return hit;
  const g = make();
  cache.set(key, sharedAcrossMounts(g));
  return g;
}

/** Filled rounded rectangle `w` (x) by `d` (depth, three -Z = bay +y), centred, on the floor plane. */
export function roundedPlate(w: number, d: number, r: number): BufferGeometry {
  return cached(`plate|${w}|${d}|${r}`, () => {
    const g = new ShapeGeometry(roundedRect(new Shape(), w, d, r) as Shape, 6);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** Rounded rectangular ring of line width `t` whose outer edge is `w` by `d`. */
export function roundedRing(w: number, d: number, r: number, t: number): BufferGeometry {
  return cached(`ring|${w}|${d}|${r}|${t}`, () => {
    const shape = roundedRect(new Shape(), w, d, r) as Shape;
    shape.holes.push(roundedRect(new Path(), w - 2 * t, d - 2 * t, Math.max(0.01, r - t)));
    const g = new ShapeGeometry(shape, 6);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}
