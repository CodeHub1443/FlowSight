import type { BoxItem } from '../items';
import type { BayLayout, FaceLayout } from '../site/layout';
import { WALL_THICKNESS } from '../site/layout';

// Pure box lists for the static parts of a bay. Rendering them through BoxInstances keeps a bay at a handful of
// draw calls instead of ~80 meshes (docs/02 section 6: instancing for repeated meshes).

type Conveyor = BayLayout['conveyor'];

// Deck height (above dock floor) at the retracted boom tip and at the far end of the fixed body. The real
// telescopic conveyors rise slightly into the shed; these are approximate and visual only.
export const TIP_HEIGHT = 0.62;
const FAR_HEIGHT = 1.0;
const FRAME_DROP = 0.34;

/** Retracted telescopic sections: [length from the tip, inset from the fixed frame, raise]. */
const SECTIONS: readonly (readonly [number, number, number])[] = [
  [6.2, 0.045, 0.035],
  [4.3, 0.09, 0.07],
  [2.6, 0.135, 0.105],
];

/** Pivot of the tilted conveyor frame (u along the belt, v above the deck) in the bay frame. */
export function conveyorFrame(c: Conveyor): { at: [number, number, number]; pitch: number } {
  return {
    at: [0, c.fixedFrom, TIP_HEIGHT],
    pitch: Math.atan2(FAR_HEIGHT - TIP_HEIGHT, c.fixedTo - c.fixedFrom),
  };
}

/** Deck, frames, stainless guides and the three retracted boom sections, in the tilted conveyor frame. */
export function conveyorBodyItems(c: Conveyor): BoxItem[] {
  const w = c.width;
  const L = c.fixedTo - c.fixedFrom;
  const fx = w / 2 + 0.11;
  const out: BoxItem[] = [{ at: [0, L / 2, -0.035], size: [w, L, 0.05], tone: 'belt' }];
  for (const s of [-1, 1]) {
    out.push(
      { at: [s * fx, L / 2, -0.12], size: [0.22, L, 0.42], tone: 'conveyor' },
      { at: [s * (w / 2 + 0.005), L / 2, 0.02], size: [0.04, L, 0.2], tone: 'steel' },
      { at: [s * (w / 2 + 0.09), L / 2, 0.075], size: [0.16, L, 0.03], tone: 'steel' },
    );
  }
  for (const [len, inset, raise] of SECTIONS) {
    for (const s of [-1, 1]) {
      out.push(
        {
          at: [s * (w / 2 - 0.03 - inset), len / 2, 0.01 + raise],
          size: [0.1, len, 0.2],
          tone: 'conveyor',
        },
        {
          at: [s * (w / 2 - 0.085 - inset), len / 2, 0.12 + raise],
          size: [0.035, len, 0.17],
          tone: 'steel',
        },
      );
    }
    out.push({
      at: [0, len / 2, -0.01 + raise],
      size: [w - 0.22 - inset * 2, len, 0.03],
      tone: 'belt',
    });
  }
  return out;
}

/** Legs, cross beams, feet, yellow motor housing, control cabinets with posts, in the bay frame. */
export function conveyorSupportItems(c: Conveyor): BoxItem[] {
  const w = c.width;
  const L = c.fixedTo - c.fixedFrom;
  const { pitch } = conveyorFrame(c);
  const fx = w / 2 + 0.11;
  const out: BoxItem[] = [];
  for (const f of [0.12, 0.4, 0.7, 0.96]) {
    const y = c.fixedFrom + f * L;
    const h = TIP_HEIGHT + (y - c.fixedFrom) * Math.tan(pitch) - FRAME_DROP;
    for (const s of [-1, 1]) {
      out.push(
        { at: [s * fx, y, h / 2], size: [0.1, 0.1, h], tone: 'conveyor' },
        { at: [s * fx, y, 0.015], size: [0.24, 0.24, 0.03], tone: 'steel' },
      );
    }
    out.push({ at: [0, y, h - 0.06], size: [w + 0.28, 0.08, 0.08], tone: 'conveyor' });
  }
  const my = c.fixedTo - 1.4;
  out.push(
    { at: [-(w / 2 + 0.62), my, 0.4], size: [0.7, 0.85, 0.7], tone: 'motor' },
    { at: [-(w / 2 + 0.62), my + 0.43, 0.4], size: [0.5, 0.02, 0.48], tone: 'motorGrille' },
  );
  return out;
}

/** x of the two control cabinets and their y, shared with the label plates. */
export function cabinetSpots(c: Conveyor): { xs: number[]; y: number } {
  const w = c.width;
  return { xs: [-(w / 2 + 1.35), -(w / 2 + 2.0)], y: c.fixedTo - 1.8 };
}

export function cabinetItems(c: Conveyor): BoxItem[] {
  const { xs, y } = cabinetSpots(c);
  return xs.flatMap((x, i): BoxItem[] => [
    { at: [x, y, 1.08], size: [0.5, 0.26, 0.64], tone: 'cabinet' },
    { at: [x - 0.18, y, 0.38], size: [0.05, 0.05, 0.76], tone: 'steel' },
    { at: [x + 0.18, y, 0.38], size: [0.05, 0.05, 0.76], tone: 'steel' },
    ...(i === 0
      ? [
          {
            at: [x + 0.14, y + 0.135, 0.9],
            size: [0.1, 0.01, 0.09],
            tone: 'palletOrange',
          } as BoxItem,
        ]
      : []),
  ]);
}

/** Guide rails, closed-shutter panel with grooves, rubber seals, bumpers and the dock leveller (bay frame, wall at y 0..0.35). */
export function doorItems(door: FaceLayout['door'], open: boolean): BoxItem[] {
  const t = WALL_THICKNESS;
  const { width: w, height: h } = door;
  const out: BoxItem[] = [];
  for (const s of [-1, 1]) {
    out.push(
      { at: [s * (w / 2 + 0.05), t + 0.04, h / 2], size: [0.1, 0.08, h], tone: 'steel' },
      { at: [s * (w / 2 + 0.2), -0.3, h / 2], size: [0.4, 0.6, h], tone: 'seal' },
      { at: [s * (w / 2 + 0.1), -0.15, -0.5], size: [0.25, 0.3, 0.3], tone: 'seal' },
    );
  }
  if (!open) {
    out.push({ at: [0, t / 2, h / 2], size: [w, 0.1, h], tone: 'shutter' });
    for (let z = 0.3; z < h; z += 0.36) {
      out.push({ at: [0, t / 2 + 0.06, z], size: [w - 0.04, 0.02, 0.03], tone: 'leveller' });
    }
  }
  out.push(
    { at: [0, -0.3, h - 0.2], size: [w + 0.8, 0.6, 0.4], tone: 'seal' },
    { at: [0, -0.55, -0.04], size: [w - 0.3, 1.1, 0.08], tone: 'leveller' },
    { at: [0, -1.0, -0.04], size: [w - 0.3, 0.2, 0.082], tone: 'walkline' },
  );
  return out;
}
