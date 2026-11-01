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
};

declare global {
  interface Window {
    __actorProbe?: ActorProbe;
  }
}

if (QUALITY_DEBUG) window.__actorProbe = actorProbe;
