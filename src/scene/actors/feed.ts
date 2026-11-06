import type { ActorsFrame, BayState, CameraStatus, CaseTick } from '@/domain';

// What the actor layer reads. The scene never imports a store or a data source (LiveScene passes this in), so the
// layer runs the same on any feed, and every call here is outside React (docs/02 section 6, rule 1).

type Unsub = () => void;

/** The part of a HealthFrame the scene reads: one status per camera. */
export type CamStatus = { cam: string; status: CameraStatus };

export interface ActorFeed {
  getBay(bayId: string): BayState | undefined;
  subscribeBay(bayId: string, cb: (bay: BayState | undefined) => void): Unsub;
  getActors(bayId: string): ActorsFrame | undefined;
  subscribeActors(bayId: string, cb: (frame: ActorsFrame | undefined) => void): Unsub;
  subscribeCases(cb: (tick: CaseTick) => void): Unsub;
  /** Camera health (HealthFrame.cams), for the camera glyphs. Without it every camera is taken as healthy. */
  getCams?(): readonly CamStatus[] | undefined;
  subscribeCams?(cb: (cams: readonly CamStatus[] | undefined) => void): Unsub;
}
