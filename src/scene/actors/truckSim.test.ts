// @vitest-environment node
import { describe, expect, it } from 'vitest';
import bayJson from '@/domain/fixtures/bay-state.json';
import type { BayState, VisitPhase } from '@/domain';
import {
  curvePose,
  departFade,
  DEPART_MS,
  DOCKED_REAR_Y,
  DOOR_MS,
  dockedPose,
  easeInOutCubic,
  reverseCurve,
  reverseMs,
  REVERSE_MAX_MS,
  REVERSE_MIN_MS,
  slotPose,
  stateOfPhase,
  TRUCK_LENGTH,
  truckTargets,
  TruckSim,
  type TruckTarget,
} from './truckSim';

const base = bayJson as unknown as BayState;

function bay(over: Partial<BayState>): BayState {
  return { ...base, ...over };
}

const geometry = {
  doorX: (id: string) => (id === 'B01' ? -19.5 : id === 'B02' ? -13 : null),
  slot: (_: string, n: number) =>
    n === 1 ? { x: -15.45, y: -9.9, w: 9.5 } : n === 2 ? { x: -5.15, y: -9.9, w: 9.5 } : null,
  apronDepth: 12,
};

const target = (over: Partial<TruckTarget>): TruckTarget => ({
  visitId: 'V-1',
  bay: 'B02',
  plate: { bn: 'ঢাকা মেট্রো-ড ১১-২১৭১', en: 'DHAKA METRO-DA 11-2171' },
  state: 'waiting',
  slot: 1,
  ...over,
});

describe('state mapping (docs/03 section 3.2, docs/04 section 4)', () => {
  it('maps every contract phase and only those', () => {
    const map: Record<VisitPhase, string> = {
      ARRIVED: 'reversing',
      DOCKED: 'docked',
      LOADING: 'docked',
      UNLOADING: 'docked',
      FINISHED: 'docked',
      DEPARTED: 'departing',
    };
    for (const [phase, state] of Object.entries(map))
      expect(stateOfPhase(phase as VisitPhase)).toBe(state);
  });

  it('reads the fixture: the visit is docked, the queue waits in its slot', () => {
    const t = truckTargets(base);
    expect(t.map((x) => x.state)).toEqual(['docked', 'waiting']);
    expect(t[1]?.slot).toBe(1);
    expect(t[0]?.plate.bn).toBe(base.visit?.plate.bn);
  });

  it('no truck at all when the bay is empty', () => {
    expect(truckTargets(bay({ visit: null, queue: [] }))).toEqual([]);
  });

  it('a visit also listed in the queue is one truck, reversing, keeping its slot', () => {
    const v = base.visit;
    if (!v) throw new Error('fixture');
    const t = truckTargets(
      bay({
        visit: { ...v, phase: 'ARRIVED' },
        queue: [{ visitId: v.visitId, plate: v.plate, arrivedAt: v.arrivedAt, slot: 2 }],
      }),
    );
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ state: 'reversing', slot: 2 });
  });
});

describe('poses', () => {
  it('docks with the rear at the door and the cab away from it', () => {
    expect(dockedPose(-13)).toEqual({ x: -13, y: DOCKED_REAR_Y, h: Math.PI });
    expect(TRUCK_LENGTH + Math.abs(DOCKED_REAR_Y)).toBeLessThanOrEqual(9.5);
  });

  it('parks along the wall, rear towards its door, clear of the docked cabs', () => {
    const towardsEast = slotPose({ x: -15.45, y: -9.9 }, -13);
    expect(towardsEast.x).toBeCloseTo(-15.45 + TRUCK_LENGTH / 2, 5);
    expect(towardsEast.h).toBeCloseTo(Math.PI / 2, 5);
    const towardsWest = slotPose({ x: -5.15, y: -9.9 }, -13);
    expect(towardsWest.x).toBeCloseTo(-5.15 - TRUCK_LENGTH / 2, 5);
    expect(towardsWest.h).toBeCloseTo(-Math.PI / 2, 5);
    // half the 2.4 m width towards the wall: the parked side stays beyond the nose of a docked truck
    expect(towardsEast.y + 1.2).toBeLessThanOrEqual(DOCKED_REAR_Y - TRUCK_LENGTH);
  });

  it('reverses within 6-8 s, deterministic per visit', () => {
    for (const id of ['V-1', 'V-2', 'V-20261024-B02-0007', 'x']) {
      const ms = reverseMs(id);
      expect(ms).toBeGreaterThanOrEqual(REVERSE_MIN_MS);
      expect(ms).toBeLessThanOrEqual(REVERSE_MAX_MS);
      expect(reverseMs(id)).toBe(ms);
    }
  });

  it('follows the curve rear first: starts as parked, ends square to the door', () => {
    const from = slotPose({ x: -15.45, y: -9.9 }, -13);
    const to = dockedPose(-13);
    const c = reverseCurve(from, to);
    const start = curvePose(c, 0);
    const end = curvePose(c, 1);
    expect(start.x).toBeCloseTo(from.x, 5);
    expect(start.y).toBeCloseTo(from.y, 5);
    expect(start.h).toBeCloseTo(from.h, 5);
    expect(end.x).toBeCloseTo(to.x, 5);
    expect(end.y).toBeCloseTo(to.y, 5);
    expect(Math.abs(end.h)).toBeCloseTo(Math.PI, 5);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });
});

describe('TruckSim', () => {
  it('walks a truck through waiting, reversing, docked and departing', () => {
    const s = new TruckSim(geometry, 6);
    s.sync('B02', [target({ state: 'waiting' })], 0, true);
    const t = s.trucks.get('V-1');
    if (!t) throw new Error('no truck');
    expect(t.state).toBe('waiting');
    expect(t.y).toBeCloseTo(-10.35, 5);

    s.sync('B02', [target({ state: 'reversing' })], 1000, true);
    expect(t.state).toBe('reversing');
    s.update(1000 + REVERSE_MIN_MS / 2, 16, true);
    expect(t.y).toBeGreaterThan(-10.35);
    expect(t.door).toBe(0);

    // the data can say docked before the 6-8 s are up: the truck still finishes the move, doors shut
    s.sync('B02', [target({ state: 'docked' })], 1000 + REVERSE_MIN_MS / 2 + 1, true);
    expect(t.state).toBe('docked');
    s.update(1000 + REVERSE_MIN_MS / 2 + 2, 16, true);
    expect(t.door).toBe(0);
    s.update(1000 + REVERSE_MAX_MS + 10, 16, true);
    expect(t.x).toBeCloseTo(-13, 5);
    expect(t.y).toBeCloseTo(DOCKED_REAR_Y, 5);
    expect(t.door).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) s.update(10000 + i * 50, 50, true);
    expect(t.door).toBe(1);

    s.sync('B02', [target({ state: 'departing' })], 20000, true);
    expect(t.state).toBe('departing');
    // doors first, then the drive
    s.update(20000 + DOOR_MS / 2, 16, true);
    expect(t.y).toBeCloseTo(DOCKED_REAR_Y, 5);
    s.update(20000 + DOOR_MS + DEPART_MS / 2, 16, true);
    expect(t.door).toBe(0);
    expect(t.y).toBeLessThan(DOCKED_REAR_Y);
    expect(t.h).toBeCloseTo(Math.PI, 5);
    expect(t.fade).toBeLessThan(1);
    s.update(20000 + DOOR_MS + DEPART_MS + 1, 16, true);
    expect(s.trucks.has('V-1')).toBe(false);
  });

  it('a truck first seen docked (page load) just stands there, doors open', () => {
    const s = new TruckSim(geometry, 6);
    s.sync('B02', [target({ state: 'docked', slot: null })], 0, true);
    const t = s.trucks.get('V-1');
    expect(t).toMatchObject({ state: 'docked', door: 1, x: -13, y: DOCKED_REAR_Y });
  });

  it('never creates a truck for a visit first seen departed, nor a waiting truck without a slot', () => {
    const s = new TruckSim(geometry, 6);
    s.sync('B02', [target({ state: 'departing' })], 0, true);
    s.sync('B01', [target({ visitId: 'V-2', bay: 'B01', state: 'waiting', slot: null })], 0, true);
    expect(s.trucks.size).toBe(0);
  });

  it('a truck gone from the messages drives off if at the door, fades if on the apron', () => {
    const s = new TruckSim(geometry, 6);
    s.sync(
      'B02',
      [target({ state: 'docked', slot: null }), target({ visitId: 'V-2', state: 'waiting' })],
      0,
      true,
    );
    s.sync('B02', [], 1000, true);
    expect(s.trucks.get('V-1')?.state).toBe('departing');
    expect(s.trucks.has('V-2')).toBe(false);
  });

  it('reuses plate slots and refuses trucks beyond its capacity', () => {
    const s = new TruckSim(geometry, 1);
    s.sync('B02', [target({ state: 'docked', slot: null })], 0, true);
    const slot = s.trucks.get('V-1')?.plateSlot;
    expect(slot).toBe(0);
    s.sync('B01', [target({ visitId: 'V-2', bay: 'B01', state: 'docked', slot: null })], 0, true);
    expect(s.trucks.has('V-2')).toBe(false);
    s.sync('B02', [target({ state: 'departing', slot: null })], 0, true);
    s.update(DOOR_MS + DEPART_MS + 1, 16, true);
    s.sync('B01', [target({ visitId: 'V-3', bay: 'B01', state: 'docked', slot: null })], 0, true);
    expect(s.trucks.get('V-3')?.plateSlot).toBe(0);
  });

  it('has no motion and no fade on the Low tier: end poses only', () => {
    const s = new TruckSim(geometry, 6);
    s.sync('B02', [target({ state: 'waiting' })], 0, false);
    const t = s.trucks.get('V-1');
    s.update(1, 16, false);
    expect(t?.fade).toBe(1);
    s.sync('B02', [target({ state: 'reversing' })], 2, false);
    expect(t).toMatchObject({ x: -13, y: DOCKED_REAR_Y, reverse: null });
    s.sync('B02', [target({ state: 'docked' })], 3, false);
    expect(t?.door).toBe(1);
    s.sync('B02', [target({ state: 'departing' })], 4, false);
    expect(s.trucks.size).toBe(0);
  });

  it('fades a departing truck out before it has gone far', () => {
    expect(departFade(0)).toBe(1);
    expect(departFade(0.15)).toBe(1);
    expect(departFade(0.7)).toBeCloseTo(0, 5);
    expect(departFade(1)).toBe(0);
  });
});
