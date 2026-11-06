import type { BayMaps } from '../actors/actorRig';
import { TRUCK_LENGTH } from '../actors/truckSim';
import type { World } from '../actors/world';
import type { GlyphBoard } from '../glyphs/cameraGlyph';
import type { SiteLayout } from '../site/layout';
import { addForklift, addPerson, addTruck, type PickList } from './pick';
import { newWorldPose, trackWorldPose, truckWorldPose } from './poses';

/** An actor still fading in or out is not picked: it is not really there yet, or no longer. */
export const MIN_PICK_FADE = 0.3;
/** Radius of a camera glyph's pick sphere, metres (it grows with distance like every bound, pick.ts). */
export const GLYPH_PICK_RADIUS = 0.7;

const pose = newWorldPose();

/**
 * Refill `list` with the bounds of everything pickable right now: the trucks (id = visit id), the people and forklifts
 * (id = track id) at their drawn places, and the camera glyphs that are showing. Allocation-free after the first call.
 */
export function fillPicks(
  list: PickList,
  world: World,
  layout: SiteLayout,
  maps: BayMaps,
  board: GlyphBoard | null,
): void {
  list.begin();
  const floor = layout.floorLevel;
  for (const t of world.trucks.trucks.values()) {
    if (t.fade < MIN_PICK_FADE || !truckWorldPose(floor, maps, t, pose)) continue;
    addTruck(list, t.visitId, pose.X, pose.Y, pose.Z, pose.rotY, TRUCK_LENGTH);
  }
  for (const t of world.tracks.tracks.values()) {
    if (t.fade < MIN_PICK_FADE || !trackWorldPose(floor, maps, t, pose)) continue;
    if (t.actor.kind === 'FORKLIFT') addForklift(list, t.id, pose.X, pose.Y, pose.Z, pose.rotY);
    else addPerson(list, t.id, pose.X, pose.Y, pose.Z);
  }
  if (!board) return;
  for (const bay of layout.bays) {
    for (const cam of bay.cameras) {
      if (board.isVisible(cam.id)) {
        list.addSphere('camera', cam.id, cam.at.X, cam.at.Y, cam.at.Z, GLYPH_PICK_RADIUS);
      }
    }
  }
}
