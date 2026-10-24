import type { ActorsFrame, BayState } from '@/domain';
import { liveStore } from './liveStore';

// Non-React accessors for the 3D scene (docs/02 section 6, rule 1): read and subscribe without React state,
// so a Canvas component can keep the value in a ref and interpolate it in useFrame.

type Unsub = () => void;

export function getBay(bayId: string): BayState | undefined {
  return liveStore.getState().bays[bayId];
}

/** Calls `cb` whenever this bay's state is replaced. Not called on subscribe; read with getBay first. */
export function subscribeBay(bayId: string, cb: (bay: BayState | undefined) => void): Unsub {
  return liveStore.subscribe((s, prev) => {
    const next = s.bays[bayId];
    if (next !== prev.bays[bayId]) cb(next);
  });
}

export function getActors(bayId: string): ActorsFrame | undefined {
  return liveStore.getState().actors[bayId];
}

/** Calls `cb` whenever this bay's actors frame is replaced (at most once per store flush, 4 Hz). */
export function subscribeActors(
  bayId: string,
  cb: (frame: ActorsFrame | undefined) => void,
): Unsub {
  return liveStore.subscribe((s, prev) => {
    const next = s.actors[bayId];
    if (next !== prev.actors[bayId]) cb(next);
  });
}
