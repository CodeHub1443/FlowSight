import type { BayState, VisitPhase } from '@/domain';
import { hashString } from '../site/random';
import { type Livery, liveryOf } from './livery';

// The truck states of docs/04 section 4, derived only from BayState (`visit.phase`, `queue`), and the motion between
// them. Pure and three-free: poses are in the face frame (x along the face, y into the building, h as in the contract).
// A truck is modelled with its origin at the middle of its rear sill and its cab along its heading.

export type TruckState = 'waiting' | 'reversing' | 'docked' | 'departing';

/** docs/04 section 3: the rear stops just outside the door. */
export const DOCKED_REAR_Y = -0.2;
/** Rear sill to front bumper. Short of the holding slots, so a cab never stands in a parked truck (see `slotPose`). */
export const TRUCK_LENGTH = 8.9;
export const REVERSE_MIN_MS = 6000;
export const REVERSE_MAX_MS = 8000;
export const DOOR_MS = 1100;
export const DEPART_MS = 6000;
export const FADE_IN_MS = 300;
/** A parked truck stands this far beyond the middle of its slot, clear of the docked cabs. */
const SLOT_OUTWARD = 0.45;

export function stateOfPhase(phase: VisitPhase): TruckState {
  switch (phase) {
    case 'ARRIVED':
      return 'reversing';
    case 'DOCKED':
    case 'LOADING':
    case 'UNLOADING':
    case 'FINISHED':
      return 'docked';
    case 'DEPARTED':
      return 'departing';
  }
}

export interface TruckTarget {
  visitId: string;
  bay: string;
  plate: { bn: string; en: string };
  state: TruckState;
  /** 1-based apron holding slot, when the message gives one. */
  slot: number | null;
}

/**
 * Every truck one BayState describes. A visit is either `visit` or queued (docs/03 section 3.2); the mock also keeps a
 * reversing truck at the head of the queue so it holds its slot, so `visit` wins and only its slot is read from there.
 */
export function truckTargets(bay: BayState): TruckTarget[] {
  const out: TruckTarget[] = [];
  const v = bay.visit;
  if (v) {
    const queued = bay.queue.find((q) => q.visitId === v.visitId);
    out.push({
      visitId: v.visitId,
      bay: bay.bay,
      plate: v.plate,
      state: stateOfPhase(v.phase),
      slot: queued?.slot ?? null,
    });
  }
  for (const q of bay.queue) {
    if (q.visitId === v?.visitId) continue;
    out.push({
      visitId: q.visitId,
      bay: bay.bay,
      plate: q.plate,
      state: 'waiting',
      slot: q.slot,
    });
  }
  return out;
}

export interface TruckGeometry {
  /** Face-frame x of a bay's door; null when the bay is unknown. */
  doorX(bay: string): number | null;
  /** The holding slot, or null when the site has no such slot. */
  slot(bay: string, slot: number): { x: number; y: number; w: number } | null;
  /** How far the apron reaches from the wall. */
  apronDepth: number;
}

export interface TruckPose {
  x: number;
  y: number;
  h: number;
}

/** Parked along the wall in the slot, rear towards the door it is assigned to. */
export function slotPose(slot: { x: number; y: number }, doorX: number): TruckPose {
  const dir = doorX >= slot.x ? 1 : -1;
  return { x: slot.x + (dir * TRUCK_LENGTH) / 2, y: slot.y - SLOT_OUTWARD, h: (dir * Math.PI) / 2 };
}

export function dockedPose(doorX: number): TruckPose {
  return { x: doorX, y: DOCKED_REAR_Y, h: Math.PI };
}

/** Deterministic per visit, within docs/04 section 4's 6-8 s. */
export function reverseMs(visitId: string): number {
  return (
    REVERSE_MIN_MS +
    ((hashString(visitId) >>> 12) % 1001) * ((REVERSE_MAX_MS - REVERSE_MIN_MS) / 1000)
  );
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

type Vec2 = readonly [number, number];

interface Curve {
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
}

/** A cubic that leaves `from` backwards along its heading and enters the door straight, rear first. */
export function reverseCurve(from: TruckPose, to: TruckPose): Curve {
  const backX = Math.sin(from.h);
  const backY = -Math.cos(from.h);
  const reach = Math.max(3, Math.hypot(to.x - from.x, to.y - from.y) * 0.5);
  return {
    p0: [from.x, from.y],
    p1: [from.x + backX * reach, from.y + backY * reach],
    p2: [to.x, to.y - 6],
    p3: [to.x, to.y],
  };
}

/** Pose at `u` (0..1 along the curve): the rear leads, so the cab points against the direction of travel. */
export function curvePose(c: Curve, u: number): TruckPose {
  const v = 1 - u;
  const b = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u] as const;
  const x = b[0] * c.p0[0] + b[1] * c.p1[0] + b[2] * c.p2[0] + b[3] * c.p3[0];
  const y = b[0] * c.p0[1] + b[1] * c.p1[1] + b[2] * c.p2[1] + b[3] * c.p3[1];
  const dx =
    3 * v * v * (c.p1[0] - c.p0[0]) +
    6 * v * u * (c.p2[0] - c.p1[0]) +
    3 * u * u * (c.p3[0] - c.p2[0]);
  const dy =
    3 * v * v * (c.p1[1] - c.p0[1]) +
    6 * v * u * (c.p2[1] - c.p1[1]) +
    3 * u * u * (c.p3[1] - c.p2[1]);
  // cab vector = -(dx, dy); the contract's heading of (fx, fy) is atan2(-fx, fy)
  return { x, y, h: Math.atan2(dx, -dy) };
}

export interface Truck extends TruckPose {
  visitId: string;
  bay: string;
  plate: { bn: string; en: string };
  state: TruckState;
  livery: Livery;
  /** Rear doors: 0 shut, 1 fully swung back. */
  door: number;
  /** Opacity, 0..1. */
  fade: number;
  /** Index into a fixed set of plate elements. */
  plateSlot: number;
  bornAt: number;
  reverse: { start: number; ms: number; curve: Curve } | null;
  depart: { start: number; fromY: number; fromX: number } | null;
}

/** Fade of a departing truck: gone before it has driven far (docs/04 section 4). */
export function departFade(k: number): number {
  return Math.max(0, Math.min(1, 1 - (k - 0.15) / 0.55));
}

export class TruckSim {
  readonly trucks = new Map<string, Truck>();
  /** Bumped whenever something a renderer must redraw has changed. */
  seq = 0;
  /** Trucks that would need a pose but have no slot (docs/03: `slot` null), not drawn. */
  private readonly geometry: TruckGeometry;
  private readonly plateSlots: number[];

  constructor(geometry: TruckGeometry, maxTrucks: number) {
    this.geometry = geometry;
    this.plateSlots = Array.from({ length: maxTrucks }, (_, i) => maxTrucks - 1 - i);
  }

  private create(t: TruckTarget, pose: TruckPose, now: number): Truck | null {
    const plateSlot = this.plateSlots.pop();
    if (plateSlot === undefined) return null;
    const truck: Truck = {
      ...pose,
      visitId: t.visitId,
      bay: t.bay,
      plate: t.plate,
      state: t.state,
      livery: liveryOf(t.plate.en),
      door: 0,
      fade: 0,
      plateSlot,
      bornAt: now,
      reverse: null,
      depart: null,
    };
    this.trucks.set(t.visitId, truck);
    this.seq++;
    return truck;
  }

  private remove(truck: Truck): void {
    this.trucks.delete(truck.visitId);
    this.plateSlots.push(truck.plateSlot);
    this.seq++;
  }

  private startDeparture(truck: Truck, now: number, doorX: number): void {
    const docked = dockedPose(doorX);
    truck.reverse = null;
    truck.x = docked.x;
    truck.y = docked.y;
    truck.h = docked.h;
    truck.state = 'departing';
    truck.depart = {
      start: now + (truck.door > 0 ? DOOR_MS : 0),
      fromX: docked.x,
      fromY: docked.y,
    };
    this.seq++;
  }

  /**
   * Apply the trucks of one bay. `animate` false (Low tier) places each truck in its end pose at once and has no motion.
   * A truck seen for the first time after load, already docked, simply appears there with its doors open.
   */
  sync(bay: string, targets: readonly TruckTarget[], now: number, animate: boolean): void {
    const doorX = this.geometry.doorX(bay);
    if (doorX === null) return;
    const seen = new Set<string>();
    for (const t of targets) {
      seen.add(t.visitId);
      const truck = this.trucks.get(t.visitId);
      const slot = t.slot === null ? null : this.geometry.slot(bay, t.slot);
      const parked = slot ? slotPose(slot, doorX) : null;
      if (!truck) {
        if (t.state === 'departing') continue;
        if (t.state === 'waiting') {
          if (parked) this.create(t, parked, now);
          continue;
        }
        const dock = dockedPose(doorX);
        if (t.state === 'docked' || !animate) {
          const made = this.create(t, dock, now);
          if (made && t.state === 'docked') made.door = 1;
          continue;
        }
        // a reversing truck never seen parked comes in from the end of the apron, straight back
        const start: TruckPose = parked ?? {
          x: doorX,
          y: -this.geometry.apronDepth - 1,
          h: Math.PI,
        };
        const made = this.create(t, start, now);
        if (made)
          made.reverse = { start: now, ms: reverseMs(t.visitId), curve: reverseCurve(start, dock) };
        continue;
      }
      if (truck.state === t.state) continue;
      if (t.state === 'departing') {
        if (animate) this.startDeparture(truck, now, doorX);
        else this.remove(truck);
        continue;
      }
      if (t.state === 'reversing') {
        const dock = dockedPose(doorX);
        truck.state = 'reversing';
        if (animate) {
          truck.reverse = {
            start: now,
            ms: reverseMs(t.visitId),
            curve: reverseCurve(truck, dock),
          };
        } else {
          truck.x = dock.x;
          truck.y = dock.y;
          truck.h = dock.h;
        }
        this.seq++;
        continue;
      }
      if (t.state === 'docked') {
        const dock = dockedPose(doorX);
        truck.state = 'docked';
        // a waiting truck that skipped reversing (a message lost, or Low): at the door now
        if (!truck.reverse) {
          truck.x = dock.x;
          truck.y = dock.y;
          truck.h = dock.h;
        }
        if (!animate) truck.door = 1;
        this.seq++;
      }
    }
    // gone from the bay's messages: a truck at the door drives away, one still on the apron fades where it stands
    for (const truck of [...this.trucks.values()]) {
      if (truck.bay !== bay || seen.has(truck.visitId) || truck.state === 'departing') continue;
      if (!animate || (truck.state !== 'docked' && truck.state !== 'reversing')) this.remove(truck);
      else this.startDeparture(truck, now, doorX);
    }
  }

  /** Advance motion and fades. Returns true when any pose or opacity changed. */
  update(now: number, dtMs: number, animate: boolean): boolean {
    let changed = false;
    for (const truck of [...this.trucks.values()]) {
      if (!animate) {
        if (truck.fade !== 1) {
          truck.fade = 1;
          changed = true;
        }
        continue;
      }
      if (truck.depart) {
        const k = (now - truck.depart.start) / DEPART_MS;
        if (k < 0) {
          truck.door = Math.max(0, truck.door - dtMs / DOOR_MS);
          changed = true;
          continue;
        }
        if (k >= 1) {
          this.remove(truck);
          changed = true;
          continue;
        }
        truck.door = 0;
        // ease in, cab first, out of the apron
        const distance = this.geometry.apronDepth + TRUCK_LENGTH;
        truck.y = truck.depart.fromY - distance * k * k;
        truck.fade = departFade(k);
        changed = true;
        continue;
      }
      if (truck.reverse) {
        const k = Math.min(1, (now - truck.reverse.start) / truck.reverse.ms);
        const p = curvePose(truck.reverse.curve, easeInOutCubic(k));
        truck.x = p.x;
        truck.y = p.y;
        truck.h = p.h;
        if (k >= 1) truck.reverse = null;
        changed = true;
      }
      const fade = Math.min(1, (now - truck.bornAt) / FADE_IN_MS);
      if (fade !== truck.fade) {
        truck.fade = fade;
        changed = true;
      }
      // the rear doors open once it stands at the door, and only then
      if (truck.state === 'docked' && !truck.reverse && truck.door < 1) {
        truck.door = Math.min(1, truck.door + dtMs / DOOR_MS);
        changed = true;
      }
    }
    return changed;
  }
}
