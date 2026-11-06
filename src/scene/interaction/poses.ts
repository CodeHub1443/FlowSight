import type { BayMaps } from '../actors/actorRig';
import type { ActorTrack } from '../actors/tracks';
import type { Truck } from '../actors/truckSim';
import { bayToSite, headingToRotationY } from '../site/transforms';

// Where an actor is drawn right now, in the site (three.js world) frame: the same arithmetic as ActorRig (actorBase,
// drawTrucks), so picking and markers agree with the picture. Three-free.

export interface WorldPose {
  X: number;
  Y: number;
  Z: number;
  /** three.js rotation.y of the actor (its forward is local -Z). */
  rotY: number;
  bay: string;
  /** Opacity, 0..1: a figure still fading in or out is not picked. */
  fade: number;
}

/** A truck's pose; false when its bay is unknown. */
export function truckWorldPose(
  floorLevel: number,
  maps: BayMaps,
  t: Pick<Truck, 'bay' | 'x' | 'y' | 'h' | 'fade'>,
  out: WorldPose,
): boolean {
  const face = maps.face.get(t.bay);
  if (!face) return false;
  const p = bayToSite(face.face, face.origin, { x: t.x, y: t.y, z: 0 }, floorLevel);
  out.X = p.X;
  out.Y = p.Y;
  out.Z = p.Z;
  out.rotY = headingToRotationY(face.face, t.h);
  out.bay = t.bay;
  out.fade = t.fade;
  return true;
}

/** A person's or forklift's pose, including the visual separation offset; false when its bay is unknown. */
export function trackWorldPose(
  floorLevel: number,
  maps: BayMaps,
  t: Pick<ActorTrack, 'bay' | 'x' | 'y' | 'h' | 'fade' | 'sepX' | 'sepY'>,
  out: WorldPose,
): boolean {
  const bay = maps.bay.get(t.bay);
  if (!bay) return false;
  const p = bayToSite(bay.face, bay.door, { x: t.x + t.sepX, y: t.y + t.sepY, z: 0 }, floorLevel);
  out.X = p.X;
  out.Y = p.Y;
  out.Z = p.Z;
  out.rotY = headingToRotationY(bay.face, t.h);
  out.bay = t.bay;
  out.fade = t.fade;
  return true;
}

export function newWorldPose(): WorldPose {
  return { X: 0, Y: 0, Z: 0, rotY: 0, bay: '', fade: 1 };
}
