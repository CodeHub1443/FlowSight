// @vitest-environment node
import { describe, expect, it } from 'vitest';
import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema } from '@/domain';
import {
  BELT_FULL_CPM,
  BELT_MIN_FRACTION,
  BELT_SPEED,
  BeltItems,
  beltSpeedFor,
} from '../actors/beltItems';
import { BODY } from '../actors/truckParts';
import { buildSiteLayout } from '../site/layout';
import {
  BayAnim,
  BayAnimRegistry,
  BOOM_CARGO_FILL,
  BOOM_MS,
  boomExtendM,
  boomOut,
  boomReach,
  boomSectionShift,
  collectBayFacts,
  scrollVelocity,
  SHUTTER_MS,
  SHUTTER_OPEN_DISTANCE,
  shutterOpen,
  shutterPose,
  stepProgress,
  TRUCK_CARGO_DEPTH,
  type BayFacts,
  type TruckFacts,
} from './bayAnim';
import { boomItems, boomSectionLength, HOUSING_FRONT } from './bayItems';

const layout = buildSiteLayout(SiteConfigSchema.parse(siteConfigJson));
const conveyor = (layout.bays[3] as (typeof layout.bays)[number]).conveyor;

const truck = (over: Partial<TruckFacts> = {}): TruckFacts => ({
  bay: 'B04',
  state: 'docked',
  x: 0,
  y: -0.2,
  door: 1,
  reverse: null,
  ...over,
});

describe('boom reach (B3)', () => {
  it('is scaled to the truck cargo depth and never past boomMaxReach', () => {
    expect(TRUCK_CARGO_DEPTH).toBe(BODY.length);
    expect(boomReach(conveyor.boomMaxReach)).toBeCloseTo(BODY.length * BOOM_CARGO_FILL, 9);
    for (const depth of [0, 1, 3, 7.4, 20, 100]) {
      expect(boomReach(conveyor.boomMaxReach, depth)).toBeLessThanOrEqual(conveyor.boomMaxReach);
      expect(boomReach(conveyor.boomMaxReach, depth)).toBeGreaterThanOrEqual(0);
    }
    // a deeper cargo space reaches further, until the conveyor's own limit
    expect(boomReach(7.5, 4)).toBeLessThan(boomReach(7.5, 6));
    expect(boomReach(7.5, 100)).toBe(7.5);
    // a shorter conveyor wins over a deeper truck
    expect(boomReach(3, 7.4)).toBe(3);
    expect(boomReach(-2, 7.4)).toBe(0);
  });

  it('runs the tip from y = fixedFrom out to y = -reach', () => {
    const reach = boomReach(conveyor.boomMaxReach);
    expect(boomExtendM(conveyor.fixedFrom, reach, 0)).toBe(0);
    // the tip stands at fixedFrom - extend
    expect(conveyor.fixedFrom - boomExtendM(conveyor.fixedFrom, reach, 1)).toBeCloseTo(-reach, 9);
    expect(boomExtendM(conveyor.fixedFrom, reach, 2)).toBe(
      boomExtendM(conveyor.fixedFrom, reach, 1),
    );
    expect(boomExtendM(conveyor.fixedFrom, reach, -1)).toBe(0);
  });

  it('shares the run-out between the sections: the tip moves all of it, the one at the housing a third', () => {
    expect(boomSectionShift(9, 0)).toBe(-9);
    expect(boomSectionShift(9, 1)).toBeCloseTo(-6, 9);
    expect(boomSectionShift(9, 2)).toBeCloseTo(-3, 9);
    expect(boomSectionShift(0, 0)).toBeCloseTo(0, 12);
  });

  it('keeps the sections joined to each other and to the housing at every run-out', () => {
    const max = conveyor.fixedFrom + conveyor.boomMaxReach;
    const items = boomItems(conveyor, boomSectionLength(max));
    // one belt plate per section tells its front and back
    const plate = (section: number) => {
      const b = items.find((i) => i.section === section && i.tone === 'belt');
      if (!b) throw new Error('no plate');
      return { front: b.at[1] - b.size[1] / 2, back: b.at[1] + b.size[1] / 2 };
    };
    for (let e = 0; e <= 1.0001; e += 0.05) {
      const extend = max * Math.min(1, e);
      const span = (s: number) => {
        const p = plate(s);
        const shift = boomSectionShift(extend, s);
        return { front: p.front + shift, back: p.back + shift };
      };
      for (let s = 0; s < 2; s++) {
        // the section behind starts before this one ends (an overlap, not a gap)
        expect(span(s).back - span(s + 1).front, `e=${e} s=${s}`).toBeGreaterThanOrEqual(0.4);
      }
      expect(span(2).back - HOUSING_FRONT, `e=${e} housing`).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('draws the retracted boom as it always was: same fronts and the same count', () => {
    const legacy = boomItems(conveyor);
    const sliding = boomItems(
      conveyor,
      boomSectionLength(conveyor.fixedFrom + conveyor.boomMaxReach),
    );
    expect(legacy).toHaveLength(16);
    expect(sliding).toHaveLength(16);
    legacy.forEach((l, i) => {
      const s = sliding[i];
      expect(s?.tone).toBe(l.tone);
      expect(s?.section).toBe(l.section);
      expect((s?.at[1] ?? 0) - (s?.size[1] ?? 0) / 2).toBeCloseTo(l.at[1] - l.size[1] / 2, 9);
    });
    // legacy sections end one metre inside the housing
    const belt0 = legacy.find((i) => i.section === 2 && i.tone === 'belt');
    expect((belt0?.at[1] ?? 0) + (belt0?.size[1] ?? 0) / 2).toBeCloseTo(HOUSING_FRONT + 1, 9);
  });
});

describe('easing', () => {
  it('moves linearly in progress and arrives in exactly the stated time', () => {
    let p = 0;
    for (let t = 0; t < BOOM_MS; t += 16) p = stepProgress(p, 1, 16, BOOM_MS);
    expect(p).toBeLessThan(1);
    p = stepProgress(p, 1, 16, BOOM_MS);
    expect(p).toBe(1);
    expect(stepProgress(0.3, 1, 600, BOOM_MS)).toBeCloseTo(0.8, 9);
    expect(stepProgress(0.8, 0, 600, SHUTTER_MS)).toBeCloseTo(0.05, 9);
    expect(stepProgress(0.5, 0.5, 100, 1000)).toBe(0.5);
    expect(stepProgress(0, 1, -50, 1000)).toBe(0);
  });

  it('boom takes about 1.2 s and the shutter about 0.8 s', () => {
    expect(BOOM_MS).toBe(1200);
    expect(SHUTTER_MS).toBe(800);
  });
});

describe('what drives the boom and the shutter (B3, B5)', () => {
  it('the boom runs out for a docked truck with its doors open, and not otherwise', () => {
    expect(boomOut(truck())).toBe(true);
    expect(boomOut(truck({ door: 0.5 }))).toBe(false);
    expect(boomOut(truck({ state: 'reversing' }))).toBe(false);
    expect(boomOut(truck({ state: 'departing' }))).toBe(false);
    expect(boomOut(truck({ state: 'waiting' }))).toBe(false);
    // docked, but still backing in: the doors are not open and the truck is not at the door yet
    expect(boomOut(truck({ reverse: { start: 0, ms: 1, curve: {} as never } }))).toBe(false);
  });

  it('the shutter is open for a docked truck and for one reversing or departing near the door', () => {
    expect(shutterOpen(truck(), 0)).toBe(true);
    expect(shutterOpen(truck({ state: 'reversing', x: 3, y: -4 }), 0)).toBe(true);
    expect(
      shutterOpen(truck({ state: 'reversing', x: 0, y: -(SHUTTER_OPEN_DISTANCE + 2) }), 0),
    ).toBe(false);
    expect(shutterOpen(truck({ state: 'departing', x: 0, y: -6 }), 0)).toBe(true);
    expect(shutterOpen(truck({ state: 'departing', x: 0, y: -30 }), 0)).toBe(false);
    expect(shutterOpen(truck({ state: 'waiting', x: 0, y: -1 }), 0)).toBe(false);
  });

  it('a lateral distance counts: a truck beside the door is not at it', () => {
    expect(shutterOpen(truck({ state: 'reversing', x: 20, y: -3 }), 0)).toBe(false);
  });

  it('collects the facts per bay in one pass and clears them when the trucks go', () => {
    const facts = new Map<string, BayFacts>([
      ['B04', { boomOut: true, shutterOpen: true }],
      ['B05', { boomOut: true, shutterOpen: true }],
    ]);
    const doorX = (b: string) => (b === 'B04' ? 0 : b === 'B05' ? 6.5 : null);
    collectBayFacts(
      [truck(), truck({ bay: 'B05', state: 'reversing', x: 6.5, y: -5 }), truck({ bay: 'B99' })],
      doorX,
      facts,
    );
    expect(facts.get('B04')).toEqual({ boomOut: true, shutterOpen: true });
    expect(facts.get('B05')).toEqual({ boomOut: false, shutterOpen: true });
    collectBayFacts([], doorX, facts);
    expect(facts.get('B04')).toEqual({ boomOut: false, shutterOpen: false });
  });
});

describe('BayAnim', () => {
  const out: BayFacts = { boomOut: true, shutterOpen: true };
  const idle: BayFacts = { boomOut: false, shutterOpen: false };

  it('starts retracted with the shutter as given', () => {
    const a = new BayAnim(true);
    expect([a.boom, a.shutter, a.phase]).toEqual([0, 1, 0]);
    expect(new BayAnim(false).shutter).toBe(0);
    expect(a.driven).toBe(false);
  });

  it('extends over 1.2 s, eased, and settles once', () => {
    const a = new BayAnim(true);
    let settled = 0;
    let frames = 0;
    for (let t = 0; t < 2000; t += 16) {
      const s = a.step(out, undefined, 16, true);
      if (s.settled) settled++;
      frames++;
      if (t < BOOM_MS - 32) expect(a.boom).toBeLessThan(1);
    }
    expect(a.boom).toBe(1);
    expect(settled).toBe(1);
    expect(frames).toBeGreaterThan(100);
    expect(a.driven).toBe(true);
  });

  it('is slow at both ends and fast in the middle', () => {
    const a = new BayAnim(true);
    a.step(out, undefined, 120, true);
    const early = a.boom;
    const b = new BayAnim(true);
    b.step(out, undefined, 600, true);
    expect(early).toBeLessThan(0.02);
    expect(b.boom).toBeCloseTo(0.5, 6);
  });

  it('retracts again when the truck leaves, and can turn round in mid-run', () => {
    const a = new BayAnim(true);
    a.step(out, undefined, 600, true);
    const mid = a.boom;
    a.step(idle, undefined, 300, true);
    expect(a.boom).toBeLessThan(mid);
    expect(a.boom).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) a.step(idle, undefined, 16, true);
    expect(a.boom).toBe(0);
  });

  it('closes the shutter over 0.8 s once nothing is near', () => {
    const a = new BayAnim(true);
    for (let t = 0; t < SHUTTER_MS - 32; t += 16) a.step(idle, undefined, 16, true);
    expect(a.shutter).toBeGreaterThan(0);
    for (let t = 0; t < 100; t += 16) a.step(idle, undefined, 16, true);
    expect(a.shutter).toBe(0);
  });

  it('jumps to the targets when not animated (Low tier) and never scrolls', () => {
    const a = new BayAnim(false);
    a.step(out, { status: 'RUNNING_LOADED', direction: 'OUT', rateCpm: 12 }, 16, false);
    expect([a.boom, a.shutter, a.velocity, a.phase]).toEqual([1, 1, 0, 0]);
  });

  it('bumps a stamp only when the value a mesh shows has changed', () => {
    const a = new BayAnim(true);
    // open shutter, boom in: what an open bay without a truck at the door looks like
    const open: BayFacts = { boomOut: false, shutterOpen: true };
    a.step(open, undefined, 16, true);
    expect(a.boomStamp).toBe(0);
    expect(a.shutterStamp).toBe(0);
    expect(a.phaseStamp).toBe(0);
    a.step(out, undefined, 16, true);
    expect(a.boomStamp).toBe(1);
    expect(a.shutterStamp).toBe(0);
    a.step(out, { status: 'RUNNING_LOADED', direction: 'IN', rateCpm: 12 }, 16, true);
    expect(a.phaseStamp).toBe(1);
    a.step(out, { status: 'STOPPED', direction: 'IN', rateCpm: 0 }, 16, true);
    expect(a.phaseStamp).toBe(1);
  });

  it('the registry holds one per bay', () => {
    const r = new BayAnimRegistry(['B01', 'B02'], (id) => id === 'B01');
    expect(r.get('B01')?.shutter).toBe(1);
    expect(r.get('B02')?.shutter).toBe(0);
    expect(r.get('B03')).toBeUndefined();
    expect([...r.entries()].map(([id]) => id)).toEqual(['B01', 'B02']);
  });
});

describe('belt surface scroll (B4)', () => {
  type Belt = NonNullable<Parameters<typeof scrollVelocity>[0]>;
  const belt = (
    status: Belt['status'],
    rateCpm: number,
    direction: Belt['direction'] = 'OUT',
  ): Belt => ({ status, direction, rateCpm });

  it('is zero when the belt is stopped, empty, without a truck, offline, unknown, or without a rate', () => {
    for (const status of ['STOPPED', 'RUNNING_EMPTY', 'NO_TRUCK', 'OFFLINE'] as const) {
      expect(scrollVelocity(belt(status, 14))).toBe(0);
    }
    expect(scrollVelocity(undefined)).toBe(0);
    expect(scrollVelocity(belt('RUNNING_LOADED', 0))).toBe(0);
    expect(scrollVelocity(belt('RUNNING_LOADED', 14, 'NONE'))).toBe(0);
  });

  it('runs towards the truck for OUT (negative y) and towards the mouth for IN', () => {
    expect(scrollVelocity(belt('RUNNING_LOADED', 14, 'OUT'))).toBeLessThan(0);
    expect(scrollVelocity(belt('RUNNING_LOADED', 14, 'IN'))).toBeGreaterThan(0);
  });

  it('is proportional to the rate up to the full-speed rate, then constant', () => {
    const speed = (r: number) => Math.abs(scrollVelocity(belt('RUNNING_LOADED', r)));
    expect(speed(4.5) / speed(3)).toBeCloseTo(1.5, 9);
    expect(speed(3) / speed(2)).toBeCloseTo(1.5, 9);
    expect(speed(BELT_FULL_CPM)).toBeCloseTo(BELT_SPEED, 9);
    expect(speed(BELT_FULL_CPM * 3)).toBeCloseTo(BELT_SPEED, 9);
    // a trickle still moves, by the floor
    expect(speed(0.1)).toBeCloseTo(BELT_SPEED * BELT_MIN_FRACTION, 9);
  });

  it('equals the item travel speed of beltItems.ts for the same rate', () => {
    // the constants
    expect(beltSpeedFor(BELT_FULL_CPM)).toBe(BELT_SPEED);
    expect(beltSpeedFor(1000)).toBe(BELT_SPEED);
    // and the rate-for-rate speed an item is moved at
    for (const rate of [0.5, 1, 2.5, 4, 6, 9, 14.2, 40]) {
      const items = new BeltItems();
      items.spawn({ bay: 'B01', dir: 'OUT', flag: null });
      const length = 10;
      items.update(
        1000,
        () => length,
        () => 'RUNNING_LOADED',
        () => rate,
      );
      const itemSpeed = (items.items[0]?.k ?? 0) * length; // metres in one second
      expect(itemSpeed, `rate ${rate}`).toBeCloseTo(
        Math.abs(scrollVelocity(belt('RUNNING_LOADED', rate))),
        9,
      );
    }
  });

  it('items keep BELT_SPEED when no rate is given (the older callers)', () => {
    const items = new BeltItems();
    items.spawn({ bay: 'B01', dir: 'OUT', flag: null });
    items.update(
      1000,
      () => 10,
      () => 'RUNNING_LOADED',
    );
    expect((items.items[0]?.k ?? 0) * 10).toBeCloseTo(BELT_SPEED, 9);
  });
});

describe('door shutter (B5)', () => {
  it('rolls the curtain up from below: its lower edge is at h * openness', () => {
    const h = 3.8;
    const closed = shutterPose(h, 0);
    expect(closed.visible).toBe(true);
    expect(closed.slabH).toBe(h);
    expect(closed.slabZ).toBe(h / 2);
    const half = shutterPose(h, 0.5);
    expect(half.slabH).toBeCloseTo(h / 2, 9);
    expect(half.slabZ - half.slabH / 2).toBeCloseTo(h * 0.5, 9);
    expect(half.slabZ + half.slabH / 2).toBeCloseTo(h, 9);
    const open = shutterPose(h, 1);
    expect(open.visible).toBe(false);
    expect(shutterPose(h, 2).visible).toBe(false);
    expect(shutterPose(h, -1).slabH).toBe(h);
  });

  it('carries the ribs up with the lower edge and hides those above the hood line', () => {
    const h = 3.8;
    for (const o of [0, 0.25, 0.5, 0.75]) {
      const p = shutterPose(h, o);
      // the lowest rib (0.28 m) stays just above the edge
      expect(0.28 + p.slatShift).toBeCloseTo(0.28 + h * o, 9);
      expect(p.slatLimit).toBeLessThan(h);
    }
    expect(0.28 + shutterPose(h, 1).slatShift).toBeGreaterThan(shutterPose(h, 1).slatLimit);
  });
});
