import { QUALITY_DEBUG } from '../qualityProbe';
import type { PickKind } from './pick';

// What the pointer handler sees, for the e2e run and the screenshots (nothing on a canvas can be queried). Debug builds
// only, like actorProbe and qualityProbe.

export interface PickPoint {
  kind: PickKind;
  id: string;
  /** Viewport (client) pixels of the middle of the bound. */
  x: number;
  y: number;
}

export interface PickProbe {
  /** Hover looks done (each is one fill of the pick list and one ray test) and the time they took, milliseconds. */
  hoverLooks: number;
  hoverMs: number;
  /** Everything pickable now, with its place on screen (on screen only). */
  points: () => PickPoint[];
  /** The actor under the pointer, as the hover ring shows it. */
  hovered: () => { kind: PickKind; id: string } | null;
}

export const pickProbe: PickProbe = {
  hoverLooks: 0,
  hoverMs: 0,
  points: () => [],
  hovered: () => null,
};

declare global {
  interface Window {
    __pickProbe?: PickProbe;
  }
}

if (QUALITY_DEBUG) window.__pickProbe = pickProbe;
