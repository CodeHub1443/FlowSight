import { BAND_HEIGHT } from '../building/bandHeight';
import type { SiteLayout } from '../site/layout';
import { bayMaps, maxTrucks } from './actorRig';
import { BeltItems } from './beltItems';
import { CrewSeparation } from './separation';
import { ObstacleField } from './obstacles';
import type { WallView } from './plateView';
import { ActorTracks } from './tracks';
import { TruckSim } from './truckSim';

// Everything the actor layer simulates between live messages, built once per site layout.

export interface World {
  tracks: ActorTracks;
  /** Visual-only offsets that keep crew figures apart (separation.ts). */
  crew: CrewSeparation;
  trucks: TruckSim;
  items: BeltItems;
  obstacles: ObstacleField;
  /** Dock wall per face, for the plates. */
  walls: Map<string, WallView>;
}

export function createWorld(layout: SiteLayout): World {
  const { bay, face } = bayMaps(layout);
  const walls = new Map<string, WallView>();
  for (const f of layout.faces) {
    walls.set(f.face, {
      doors: f.bays.map((b) => b.localX),
      doorWidth: f.door.width,
      doorTop: layout.floorLevel + f.door.height,
      wallTop: layout.floorLevel + f.door.height + BAND_HEIGHT,
    });
  }
  const trucks = new TruckSim(
    {
      doorX: (id) => bay.get(id)?.localX ?? null,
      slot: (id, n) => face.get(id)?.apron.slots[n - 1] ?? null,
      apronDepth: layout.view.apronDepth,
    },
    maxTrucks(layout),
  );
  const obstacles = new ObstacleField(layout);
  return {
    tracks: new ActorTracks(obstacles),
    crew: new CrewSeparation(),
    trucks,
    items: new BeltItems(),
    obstacles,
    walls,
  };
}
