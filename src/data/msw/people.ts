import type { PeopleResponse } from '@/domain';
import { hashSeed, Rng, round } from '../mock/core/rng';

// Worker idle and phone-use minutes (docs/01 4.1 #3, docs/03 section 2 privacy rule).
// They exist ONLY here, in the answer to GET /analytics/people for DC_MANAGER and ADMIN. The simulator core and every
// live channel know nothing about them; this module derives them from crew presence the core already publishes.

export type PresenceRow = {
  bay: string;
  shift: string;
  trackId: string;
  visitId: string;
  presenceMin: number;
};

export function peopleRows(seed: number, presence: readonly PresenceRow[]): PeopleResponse['rows'] {
  return presence.map((p) => {
    const rng = new Rng(hashSeed('people', seed, p.visitId, p.trackId));
    const idleMin = round(p.presenceMin * rng.range(0.04, 0.14), 1);
    const phoneMin = round(
      Math.min(p.presenceMin - idleMin, p.presenceMin * rng.range(0, 0.05)),
      1,
    );
    return { bay: p.bay, shift: p.shift, trackId: p.trackId, role: 'WORKER', idleMin, phoneMin };
  });
}
