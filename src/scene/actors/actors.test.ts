// @vitest-environment node
import { describe, expect, it } from 'vitest';
import configJson from '../../../config/sites/dhk-depot.json';
import { ActorActSchema } from '@/domain/enums';
import { subscribeCases, publishCase } from '@/stores/caseBus';
import { LIGHT_PALETTE } from '../materials';
import { hashString } from '../site/random';
import {
  beltMoves,
  BeltItems,
  BELT_SPEED,
  CARTON_DIMS,
  CARTON_SIZES,
  CARTON_TONES,
  CARTON_VARIANTS,
  pickCartonVariant,
  MIN_ITEM_GAP_M,
  itemScale,
  itemY,
  MAX_ITEMS_PER_BAY,
} from './beltItems';
import { LIVERIES, liveryOf } from './livery';
import { personPose } from './personPose';
import { clearOfWall, MIN_PLATE_PX, plateLines, plateShown, type WallView } from './plateView';
import {
  BODY,
  DOOR_OPEN_RAD,
  PLATE,
  partTone,
  TRUCK_PARTS,
  TRUCK_WHEELS,
  TRUCK_WHEELS_LOW,
} from './truckParts';
import { TRUCK_LENGTH } from './truckSim';

const tick = {
  bay: 'B01',
  dir: 'OUT',
  pack: 'CASE',
  sku: 'RIN-PB-1KG',
  flag: null,
} as const;

describe('livery', () => {
  it('is deterministic per truck', () => {
    expect(liveryOf('DHAKA METRO-DA 11-2171')).toBe(liveryOf('DHAKA METRO-DA 11-2171'));
  });

  it('reaches all four liveries across ordinary plates', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(liveryOf(`DHAKA METRO-TA ${10 + i}-${1000 + i}`).name);
    expect([...seen].sort()).toEqual(['blue-yellow', 'green', 'teal', 'yellow-blue']);
  });

  it('paints from the palette only', () => {
    for (const l of LIVERIES) {
      for (const tone of [l.body, l.band, l.cab]) expect(LIGHT_PALETTE[tone]).toMatch(/^#/);
    }
    for (const part of TRUCK_PARTS) {
      expect(
        LIGHT_PALETTE[partTone(part, LIVERIES[0] ?? liveryOf('x'))],
        String(part.tone),
      ).toMatch(/^#/);
    }
  });
});

describe('van', () => {
  it('has the box body of docs/04 section 4 with its floor at dock height', () => {
    expect(BODY.length).toBeCloseTo(7.5, 0);
    expect(BODY.width).toBe(2.4);
    expect(BODY.height).toBe(3.2);
    expect(Math.abs(BODY.floor - configJson.building.floorLevel)).toBeLessThan(0.1);
  });

  it('fits through the door', () => {
    const { door } = configJson.dockFaces[0] as { door: { width: number; height: number } };
    expect(BODY.width).toBeLessThan(door.width);
    expect(BODY.height).toBeLessThan(door.height);
  });

  it('has two rear doors that swing back past the side, and cargo only behind them', () => {
    expect(DOOR_OPEN_RAD).toBeGreaterThan(Math.PI);
    expect(TRUCK_PARTS.some((p) => p.door === -1)).toBe(true);
    expect(TRUCK_PARTS.some((p) => p.door === 1)).toBe(true);
    const cargo = TRUCK_PARTS.filter((p) => p.inside);
    expect(cargo.length).toBeGreaterThan(5);
    for (const p of cargo) expect(p.at[1]).toBeLessThan(2);
  });

  it('keeps every part within the truck length', () => {
    for (const p of TRUCK_PARTS)
      expect(p.at[1] + p.size[1] / 2).toBeLessThanOrEqual(TRUCK_LENGTH + 0.1);
  });

  it('carries the plate on the header over the door, below the top of the dock door', () => {
    const { door } = configJson.dockFaces[0] as { door: { width: number; height: number } };
    expect(PLATE.z - configJson.building.floorLevel).toBeLessThan(door.height);
    expect(PLATE.l).toBeLessThan(0);
  });

  it('is simple on the Low tier', () => {
    const low = TRUCK_PARTS.filter((p) => p.low);
    expect(low.length).toBeGreaterThanOrEqual(3);
    expect(low.length).toBeLessThanOrEqual(5);
    expect(TRUCK_WHEELS_LOW.length).toBeLessThan(TRUCK_WHEELS.length);
  });
});

describe('items on belts', () => {
  const span = { tip: 0.5, mouth: 8.6 };

  it('travels mouth to boom tip when going OUT, tip to mouth when coming IN', () => {
    expect(itemY({ dir: 'OUT', k: 0 }, span)).toBe(span.mouth);
    expect(itemY({ dir: 'OUT', k: 1 }, span)).toBe(span.tip);
    expect(itemY({ dir: 'IN', k: 0 }, span)).toBe(span.tip);
    expect(itemY({ dir: 'IN', k: 1 }, span)).toBe(span.mouth);
  });

  it('caps the count per bay and skips what does not fit, bay by bay', () => {
    const b = new BeltItems();
    for (let i = 0; i < MAX_ITEMS_PER_BAY; i++) expect(b.spawn(tick)).toBe(true);
    expect(b.spawn(tick)).toBe(false);
    expect(b.countOf('B01')).toBe(MAX_ITEMS_PER_BAY);
    expect(b.spawn({ ...tick, bay: 'B02' })).toBe(true);
    expect(b.items.length).toBe(MAX_ITEMS_PER_BAY + 1);
  });

  it('never lets two items overlap on a belt, whatever the speed of the ticks', () => {
    const b = new BeltItems();
    expect(b.spawn(tick, 0.1)).toBe(true);
    expect(b.spawn(tick, 0.1)).toBe(false);
    b.update(
      1000,
      () => 8.1,
      () => 'RUNNING_LOADED',
    );
    expect(b.spawn(tick, 0.1)).toBe(true);
    expect(MIN_ITEM_GAP_M).toBeGreaterThan(
      Math.max(...Object.values(CARTON_DIMS).map((s) => s[0])),
    );
  });

  it('frees the slot when an item leaves the belt', () => {
    const b = new BeltItems();
    for (let i = 0; i < MAX_ITEMS_PER_BAY; i++) b.spawn(tick);
    const ms = (8.1 / BELT_SPEED) * 1000 + 50;
    b.update(
      ms,
      () => 8.1,
      () => 'RUNNING_LOADED',
    );
    expect(b.items.length).toBe(0);
    expect(b.countOf('B01')).toBe(0);
    expect(b.spawn(tick)).toBe(true);
  });

  it('holds items on a stopped or offline belt, lets them run off otherwise', () => {
    expect(beltMoves('STOPPED')).toBe(false);
    expect(beltMoves('OFFLINE')).toBe(false);
    expect(beltMoves('RUNNING_LOADED')).toBe(true);
    expect(beltMoves('RUNNING_EMPTY')).toBe(true);
    expect(beltMoves('NO_TRUCK')).toBe(true);
    const b = new BeltItems();
    b.spawn(tick);
    b.update(
      1000,
      () => 8,
      () => 'STOPPED',
    );
    expect(b.items[0]?.k).toBe(0);
  });

  it('grows in and shrinks out at the ends of the trip', () => {
    expect(itemScale(0)).toBe(0);
    expect(itemScale(0.5)).toBe(1);
    expect(itemScale(1)).toBe(0);
  });

  it('has only carton variants: 3 sizes x 2 kraft tones, picked deterministically', () => {
    expect(CARTON_SIZES).toHaveLength(3);
    expect(CARTON_TONES).toHaveLength(2);
    expect([...CARTON_VARIANTS].sort()).toEqual(
      [
        'large-light',
        'large-medium',
        'medium-light',
        'medium-medium',
        'small-light',
        'small-medium',
      ].sort(),
    );
    expect(Object.keys(CARTON_DIMS).sort()).toEqual([...CARTON_SIZES].sort());
    for (let i = 0; i < 200; i++) expect(pickCartonVariant(i)).toBe(pickCartonVariant(i));
    expect(new Set(Array.from({ length: 200 }, (_, i) => pickCartonVariant(i * 7919))).size).toBe(
      CARTON_VARIANTS.length,
    );
    // whatever the pack, SKU or flag of the tick, a spawned item is one of the carton variants
    const b = new BeltItems();
    for (const pack of ['CASE', 'SACK', 'SHRINK'] as const) {
      for (const flag of [null, 'DAMAGED'] as const) {
        b.spawn({ ...tick, bay: `B0${b.items.length}`, pack, flag } as unknown as typeof tick);
      }
    }
    for (const it of b.items) {
      expect(CARTON_VARIANTS).toContain(it.variant);
      expect(Math.abs(it.yaw)).toBeLessThan(0.07);
    }
    expect(hashString('a')).toBe(hashString('a'));
  });
});

describe('person animation', () => {
  it('has a pose for every act in the contract, and none is a phone or idle pose', () => {
    for (const act of ActorActSchema.options) {
      const p = personPose(act, 1.3, 7);
      expect(Object.keys(p).sort()).toEqual(
        ['armL', 'armR', 'bob', 'carrying', 'lean', 'legL', 'legR'].sort(),
      );
    }
    expect(ActorActSchema.options).not.toContain('PHONE');
    expect(ActorActSchema.options).not.toContain('IDLE');
  });

  it('stands still when STATIONARY, whatever the time', () => {
    expect(personPose('STATIONARY', 1, 7)).toEqual(personPose('STATIONARY', 9, 3));
    expect(personPose('STATIONARY', 1, 7).legL).toBe(0);
  });

  it('swings opposite legs when WALKING and moves them over time', () => {
    const a = personPose('WALKING', 0.2, 0);
    expect(a.legL).toBeCloseTo(-a.legR, 5);
    expect(a.legL).not.toBe(personPose('WALKING', 0.35, 0).legL);
  });

  it('holds a carton only when CARRYING, raises the scanner arm when SCANNING, works when HANDLING', () => {
    expect(personPose('CARRYING', 0, 0).carrying).toBe(true);
    expect(personPose('WALKING', 0, 0).carrying).toBe(false);
    expect(personPose('SCANNING', 0, 0).armR).toBeGreaterThan(1);
    expect(personPose('HANDLING', 0, 0).armL).toBeGreaterThan(0.4);
  });

  it('keeps people off-step through the seed', () => {
    expect(personPose('WALKING', 1, 100).legL).not.toBe(personPose('WALKING', 1, 600).legL);
  });
});

describe('plate text', () => {
  it('splits a Bangla plate into two lines at the last space', () => {
    expect(plateLines('ঢাকা মেট্রো-ড ১১-২১৭১')).toEqual(['ঢাকা মেট্রো-ড', '১১-২১৭১']);
    expect(plateLines('১১-২১৭১')).toEqual(['১১-২১৭১', '']);
  });
});

describe('plate visibility', () => {
  const wall: WallView = { doors: [0, 6.5], doorWidth: 3.2, doorTop: 5, wallTop: 6.3 };

  it('sees the plate through a door', () => {
    expect(clearOfWall({ x: 0, y: 8, h: 4 }, { x: 0, y: -0.2, h: 4 }, wall)).toBe(true);
  });

  it('does not see it through a pier', () => {
    expect(clearOfWall({ x: 3.25, y: 8, h: 4 }, { x: 3.25, y: -0.2, h: 4 }, wall)).toBe(false);
  });

  it('sees it over the wall, and always from the yard', () => {
    expect(clearOfWall({ x: 3.25, y: 8, h: 60 }, { x: 3.25, y: -8, h: 4 }, wall)).toBe(true);
    expect(clearOfWall({ x: 3.25, y: -30, h: 4 }, { x: 3.25, y: -0.2, h: 4 }, wall)).toBe(true);
  });

  it('hides a plate turned away, too small, or behind the wall', () => {
    expect(plateShown(0.6, MIN_PLATE_PX, true)).toBe(true);
    expect(plateShown(-0.2, 100, true)).toBe(false);
    expect(plateShown(0.6, MIN_PLATE_PX - 1, true)).toBe(false);
    expect(plateShown(0.6, 100, false)).toBe(false);
  });
});

describe('case bus', () => {
  it('passes a tick to subscribers until they leave', () => {
    const got: string[] = [];
    const un = subscribeCases((c) => got.push(c.sku));
    const value = {
      v: 1,
      ts: '2026-10-24T19:50:45.310+06:00',
      site: 'dhk-depot',
      bay: 'B02',
      dir: 'OUT',
      sku: 'RIN-PB-1KG',
      pack: 'SACK',
      conf: 0.91,
      flag: null,
    } as const;
    publishCase(value);
    un();
    publishCase(value);
    expect(got).toEqual(['RIN-PB-1KG']);
  });
});
