import { QUALITY_DEBUG } from '../qualityProbe';

// What the actor layer is drawing right now, for the e2e run and the screenshots. Debug builds only, like qualityProbe.

export interface ActorProbe {
  people: number;
  forklifts: number;
  /** Bays with a forklift carrying a pallet. */
  carrying: string[];
  trucks: Record<'waiting' | 'reversing' | 'docked' | 'departing', number>;
  items: number;
  ppeRings: number;
  /** Bays with a truck docked and its rear doors fully open. */
  dockedBays: string[];
  /** Bays with a captain on the floor. */
  crewBays: string[];
  /** Bays with an item on the belt. */
  itemBays: string[];
  /** Per bay, the carton variant ids of the items on its belt (only cartons exist: docs/06 section 7.6). */
  itemVariants: Record<string, string[]>;
  /** Running counts over every sampled person: how often the data, and the drawn figure, stood inside a prop's footprint. */
  personSamples: number;
  dataInProps: number;
  drawnInProps: number;
}

export const actorProbe: ActorProbe = {
  people: 0,
  forklifts: 0,
  carrying: [],
  trucks: { waiting: 0, reversing: 0, docked: 0, departing: 0 },
  items: 0,
  ppeRings: 0,
  dockedBays: [],
  crewBays: [],
  itemBays: [],
  itemVariants: {},
  personSamples: 0,
  dataInProps: 0,
  drawnInProps: 0,
};

declare global {
  interface Window {
    __actorProbe?: ActorProbe;
  }
}

if (QUALITY_DEBUG) window.__actorProbe = actorProbe;
