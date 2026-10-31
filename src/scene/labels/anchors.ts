import { BAND_HEIGHT } from '../building/bandHeight';
import { bayToSite } from '../site/transforms';
import { WALL_THICKNESS, type SiteLayout } from '../site/layout';

// Where the pills sit in the three.js world (pure; tested in labels/anchors.test.ts).

type P = readonly [number, number, number];

/** Bay number pill: on the shed side of the dock-wall band above the bay's door. */
export function bayPillAnchor(layout: SiteLayout, bayId: string): P | null {
  const bay = layout.bays.find((b) => b.id === bayId);
  const face = layout.faces.find((f) => f.face === bay?.face);
  if (!bay || !face) return null;
  const s = bayToSite(
    bay.face,
    bay.door,
    { x: 0, y: WALL_THICKNESS + 0.06, z: face.door.height + BAND_HEIGHT * 0.58 },
    layout.floorLevel,
  );
  return [s.X, s.Y, s.Z];
}

/** Selection pill: above the selection brackets, over the bay's work zone (the belt mouth). */
export function selectionPillAnchor(layout: SiteLayout, bayId: string): P | null {
  const bay = layout.bays.find((b) => b.id === bayId);
  if (!bay) return null;
  const wz = bay.zones.workZone;
  const s = bayToSite(
    bay.face,
    bay.door,
    { x: 0, y: (wz.y[0] + wz.y[1]) / 2, z: 3.4 },
    layout.floorLevel,
  );
  return [s.X, s.Y, s.Z];
}
