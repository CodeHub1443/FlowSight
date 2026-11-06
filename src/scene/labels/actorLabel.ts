import type { ActorRole, BayVisit, VisitPhase } from '@/domain';
import { formatNumber } from '@/lib/format';

// The text of the pill that follows a selected truck, person or forklift (docs/04 section 1, t22 spec B2). Pure; the words
// come from the `scene` namespace (SceneRoot builds ActorLabelStrings), so both languages read the same way.
//   truck     B04 · DHAKA METRO-DA 11-2171 · Loading 412
//   person    Captain | Worker   (the role only: no name, no id, privacy rule of docs/03 section 2)
//   forklift  Forklift · B04

/** Separator of the parts of a pill. */
export const PILL_SEP = ' · ';

export interface ActorLabelStrings {
  lang: 'en' | 'bn';
  captain: string;
  worker: string;
  /** A person whose role the camera could not tell. */
  person: string;
  forklift: string;
  phase: Record<VisitPhase, string>;
}

export function personLabel(role: ActorRole, s: ActorLabelStrings): string {
  if (role === 'CAPTAIN') return s.captain;
  if (role === 'WORKER') return s.worker;
  return s.person;
}

export function forkliftLabel(bay: string, s: ActorLabelStrings): string {
  return `${s.forklift}${PILL_SEP}${bay}`;
}

/** Cartons shown after the phase: out while loading, in while unloading, whichever moved once the work is done. */
export function phaseCount(visit: Pick<BayVisit, 'phase' | 'casesIn' | 'casesOut'>): number | null {
  switch (visit.phase) {
    case 'LOADING':
      return visit.casesOut;
    case 'UNLOADING':
      return visit.casesIn;
    case 'FINISHED':
    case 'DEPARTED':
      return visit.casesOut > 0 ? visit.casesOut : visit.casesIn > 0 ? visit.casesIn : null;
    default:
      return null;
  }
}

/** `visit` is the bay's current visit when it is this truck's, else null (a truck waiting on the apron). */
export function truckLabel(
  bay: string,
  plate: { bn: string; en: string },
  visit: Pick<BayVisit, 'phase' | 'casesIn' | 'casesOut'> | null,
  s: ActorLabelStrings,
): string {
  const parts = [bay, s.lang === 'bn' && plate.bn ? plate.bn : plate.en];
  if (visit) {
    const count = phaseCount(visit);
    const word = s.phase[visit.phase];
    parts.push(
      count === null
        ? word
        : `${word} ${formatNumber(count, { lang: s.lang, digits: s.lang === 'bn' ? 'bangla' : 'latin' })}`,
    );
  }
  return parts.join(PILL_SEP);
}
