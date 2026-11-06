import type { BeltStatus } from '@/domain';
import { beltSpeedFor } from '../actors/beltItems';
import { easeInOutCubic, type Truck } from '../actors/truckSim';

// What moves on a bay once live state is bound to it (docs/04 section 3): the telescopic boom, the belt surface and the
// door shutter. Pure and three-free; ActorsLayer steps one `BayAnim` per bay inside its useFrame, and the bay's instanced
// meshes read the result (bay/DynamicBoxes.tsx). Nothing here is React state.

/** The boom runs out or in over this long (eased). */
export const BOOM_MS = 1200;
/** The shutter rolls up or down over this long (eased). */
export const SHUTTER_MS = 800;
/** A reversing or departing truck with its rear this close to the door keeps the shutter open, metres. */
export const SHUTTER_OPEN_DISTANCE = 12;
/** Cargo depth of the covered van (truckParts BODY.length): how far a boom can reach into a truck. */
export const TRUCK_CARGO_DEPTH = 7.4;
/** Share of the cargo depth the boom tip may reach, so it stops short of the bulkhead. */
export const BOOM_CARGO_FILL = 0.9;
/** Rear doors must be this open before the boom runs out (they open over about a second once the truck stands). */
export const BOOM_DOOR_OPEN = 0.95;

/**
 * How far the tip reaches into the truck (metres from the door), scaled to the truck's cargo depth and never past the
 * conveyor's `boomMaxReach`.
 */
export function boomReach(boomMaxReach: number, cargoDepth: number = TRUCK_CARGO_DEPTH): number {
  const reach = Math.max(0, cargoDepth) * BOOM_CARGO_FILL;
  return Math.max(0, Math.min(Math.max(0, boomMaxReach), reach));
}

/** How far the boom tip has moved from its retracted place (y = fixedFrom) at eased progress `e`, metres. */
export function boomExtendM(fixedFrom: number, reach: number, e: number): number {
  return (Math.max(0, fixedFrom) + Math.max(0, reach)) * Math.min(1, Math.max(0, e));
}

/**
 * Shift along the belt (tilted frame u, negative = towards the truck) of boom section `section` (0 = tip) when the tip has
 * moved `extendM`. Sections share the run-out equally: the tip moves all of it, the one next to the housing a third.
 */
export function boomSectionShift(extendM: number, section: number, sections = 3): number {
  return (-extendM * (sections - section)) / sections;
}

/** Move `p` towards `target` (0..1) in a straight line that takes `durationMs` end to end. */
export function stepProgress(p: number, target: number, dtMs: number, durationMs: number): number {
  const step = Math.max(0, dtMs) / durationMs;
  if (p < target) return Math.min(target, p + step);
  if (p > target) return Math.max(target, p - step);
  return p;
}

/** The slice of a truck the bay animation reads. */
export type TruckFacts = Pick<Truck, 'bay' | 'state' | 'x' | 'y' | 'door' | 'reverse'>;

/** Boom out while a truck stands at the door with its rear doors open, through loading and finish; in otherwise. */
export function boomOut(t: TruckFacts): boolean {
  return t.state === 'docked' && t.reverse === null && t.door >= BOOM_DOOR_OPEN;
}

/** Shutter open for a docked truck and for one reversing in or driving out within SHUTTER_OPEN_DISTANCE of the door. */
export function shutterOpen(t: TruckFacts, doorX: number): boolean {
  if (t.state === 'docked') return true;
  if (t.state === 'waiting') return false;
  return Math.hypot(t.x - doorX, t.y) <= SHUTTER_OPEN_DISTANCE;
}

export interface BayFacts {
  boomOut: boolean;
  shutterOpen: boolean;
}

/** One pass over the trucks: the facts of each bay (written into `facts`, which holds an entry per bay id). */
export function collectBayFacts(
  trucks: Iterable<TruckFacts>,
  doorX: (bay: string) => number | null,
  facts: ReadonlyMap<string, BayFacts>,
): void {
  for (const f of facts.values()) {
    f.boomOut = false;
    f.shutterOpen = false;
  }
  for (const t of trucks) {
    const f = facts.get(t.bay);
    const x = doorX(t.bay);
    if (!f || x === null) continue;
    if (boomOut(t)) f.boomOut = true;
    if (shutterOpen(t, x)) f.shutterOpen = true;
  }
}

/**
 * Speed of the belt surface along the bay's +y, metres per second: zero unless the belt runs loaded with a rate, then the
 * item travel speed for that rate (`beltSpeedFor`, so a carton never slides on its belt). OUT runs towards the truck
 * (-y), IN towards the mouth (+y); a direction the backend does not know (NONE) does not scroll.
 */
export function scrollVelocity(
  belt: { status: BeltStatus; direction: 'OUT' | 'IN' | 'NONE'; rateCpm: number } | undefined,
): number {
  if (!belt || belt.status !== 'RUNNING_LOADED' || !(belt.rateCpm > 0)) return 0;
  if (belt.direction === 'NONE') return 0;
  const speed = beltSpeedFor(belt.rateCpm);
  return belt.direction === 'OUT' ? -speed : speed;
}

export interface ShutterPose {
  /** False once the curtain is fully rolled up into its hood. */
  visible: boolean;
  /** Centre height and height of the curtain slab above the door sill. */
  slabZ: number;
  slabH: number;
  /** The ribs ride up with the curtain's lower edge by this much and are hidden above `slatLimit`. */
  slatShift: number;
  slatLimit: number;
}

/** The roller shutter of a door `h` high at eased openness `o` (0 closed, 1 open): the curtain rolls up from below. */
export function shutterPose(h: number, o: number): ShutterPose {
  const open = Math.min(1, Math.max(0, o));
  const slabH = h * (1 - open);
  return {
    visible: slabH > 0.002,
    slabZ: h - slabH / 2,
    slabH,
    slatShift: h * open,
    slatLimit: h - 0.05,
  };
}

/** Phases of the animation a frame reports back, so the owner can refresh the baked contact shadows once it settles. */
export interface AnimStep {
  moved: boolean;
  settled: boolean;
}

/** The animated state of one bay. */
export class BayAnim {
  /** Linear progress of the boom and the shutter (0..1) and the eased values the meshes show. */
  boomP = 0;
  shutterP: number;
  boom = 0;
  shutter: number;
  /** Metres the belt surface has moved along +y, and its current speed. */
  phase = 0;
  velocity = 0;
  /** Where the tip may reach, metres from the door (boomReach). */
  reach = 0;
  /** True once an owner steps this state; before that the bay shows its static `shutter`. */
  driven = false;
  /** Bumped whenever the value a mesh draws has changed. */
  boomStamp = 0;
  shutterStamp = 0;
  phaseStamp = 0;
  private wasMoving = false;

  constructor(shutterOpenAtStart: boolean) {
    this.shutterP = shutterOpenAtStart ? 1 : 0;
    this.shutter = this.shutterP;
  }

  /** Advance by `dtMs`. `animate` false (Low tier) jumps straight to the targets and does not scroll the belt. */
  step(
    facts: BayFacts,
    belt: Parameters<typeof scrollVelocity>[0],
    dtMs: number,
    animate: boolean,
  ): AnimStep {
    this.driven = true;
    const boomTarget = facts.boomOut ? 1 : 0;
    const shutterTarget = facts.shutterOpen ? 1 : 0;
    this.boomP = animate ? stepProgress(this.boomP, boomTarget, dtMs, BOOM_MS) : boomTarget;
    this.shutterP = animate
      ? stepProgress(this.shutterP, shutterTarget, dtMs, SHUTTER_MS)
      : shutterTarget;
    let moved = false;
    const boom = easeInOutCubic(this.boomP);
    if (boom !== this.boom) {
      this.boom = boom;
      this.boomStamp++;
      moved = true;
    }
    const shutter = easeInOutCubic(this.shutterP);
    if (shutter !== this.shutter) {
      this.shutter = shutter;
      this.shutterStamp++;
      moved = true;
    }
    this.velocity = animate ? scrollVelocity(belt) : 0;
    if (this.velocity !== 0 && dtMs > 0) {
      this.phase += (this.velocity * dtMs) / 1000;
      this.phaseStamp++;
    }
    const settled = this.wasMoving && !moved;
    this.wasMoving = moved;
    return { moved, settled };
  }
}

/** One BayAnim per bay id, shared by the actor layer (which steps them) and the bays (which draw them). */
export class BayAnimRegistry {
  private readonly bays = new Map<string, BayAnim>();

  constructor(
    bayIds: readonly string[],
    shutterOpenAtStart: (bay: string) => boolean = () => true,
  ) {
    for (const id of bayIds) this.bays.set(id, new BayAnim(shutterOpenAtStart(id)));
  }

  get(bay: string): BayAnim | undefined {
    return this.bays.get(bay);
  }

  entries(): IterableIterator<[string, BayAnim]> {
    return this.bays.entries();
  }
}
