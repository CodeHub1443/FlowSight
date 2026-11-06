// @vitest-environment node
import { describe, expect, it } from 'vitest';
import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema } from '@/domain';
import { buildSiteLayout } from '../site/layout';
import {
  beltTickCount,
  beltTickItems,
  beltTickU,
  conveyorBodyItems,
  conveyorHousingItems,
  doorFixedItems,
  HOUSING_FRONT,
  shutterSlab,
  shutterSlats,
  boomItems,
} from './bayItems';

const layout = buildSiteLayout(SiteConfigSchema.parse(siteConfigJson));
const bay = layout.bays[3] as (typeof layout.bays)[number];
const c = bay.conveyor;
const door = (layout.faces[0] as (typeof layout.faces)[number]).door;

describe('belt ticks (B4)', () => {
  it('phase 0 is the resting layout the belt always had', () => {
    // the loop the ticks came from: every 0.6 m from the housing front plus half a pitch, short of the drum
    const legacy: number[] = [];
    for (let u = HOUSING_FRONT + 0.3; u < c.fixedTo - c.fixedFrom - 0.4; u += 0.6) legacy.push(u);
    expect(beltTickCount(c)).toBe(legacy.length);
    legacy.forEach((u, k) => {
      expect(beltTickU(c, k, 0)).toBeCloseTo(u, 9);
      expect(beltTickItems(c)[k]?.at[1]).toBeCloseTo(u, 9);
    });
  });

  it('moves every tick by the phase and wraps round the housing belt', () => {
    const n = beltTickCount(c);
    expect(n).toBeGreaterThan(5);
    const first = HOUSING_FRONT + 0.3;
    const span = n * 0.6;
    for (const phase of [0.1, 0.45, 1.3, -0.2, -2.9, 17.77, span, span * 3 + 0.2]) {
      const us = Array.from({ length: n }, (_, k) => beltTickU(c, k, phase));
      for (const u of us) {
        expect(u).toBeGreaterThanOrEqual(first - 1e-9);
        expect(u).toBeLessThan(first + span + 1e-9);
      }
      // still one tick per pitch: the spacing of the sorted ticks is 0.6 m
      const sorted = [...us].sort((a, b) => a - b);
      for (let i = 1; i < n; i++)
        expect((sorted[i] as number) - (sorted[i - 1] as number)).toBeCloseTo(0.6, 6);
    }
    // a whole span is the resting layout again
    for (let k = 0; k < n; k++) expect(beltTickU(c, k, span)).toBeCloseTo(beltTickU(c, k, 0), 9);
  });

  it('advances smoothly: a small phase step moves each tick by that step (except at the wrap)', () => {
    const n = beltTickCount(c);
    const span = n * 0.6;
    let jumps = 0;
    for (let k = 0; k < n; k++) {
      const a = beltTickU(c, k, 1.0);
      const b = beltTickU(c, k, 1.01);
      if (Math.abs(b - a - 0.01) > 1e-9) {
        jumps++;
        expect(Math.abs(b - a)).toBeGreaterThan(span - 0.1);
      }
    }
    expect(jumps).toBeLessThanOrEqual(1);
  });
});

describe('conveyor pieces', () => {
  it('the whole-conveyor list (obstacle footprints) is the housing, the ticks and the retracted boom', () => {
    const all = conveyorBodyItems(c);
    expect(all).toHaveLength(
      conveyorHousingItems(c).length + beltTickItems(c).length + boomItems(c).length,
    );
    // nothing reaches in front of the tip bumper, or past the drum at the far end of the body
    for (const b of all) {
      const front = b.at[1] - b.size[1] / 2;
      const back = b.at[1] + b.size[1] / 2;
      expect(front).toBeGreaterThanOrEqual(-0.11);
      expect(back).toBeLessThanOrEqual(c.fixedTo - c.fixedFrom + 0.02);
    }
  });
});

describe('door pieces (B5)', () => {
  it('the closed curtain covers the whole door, and the hood is always there', () => {
    const slab = shutterSlab(door);
    expect(slab.size[2]).toBe(door.height);
    expect(slab.at[2]).toBe(door.height / 2);
    expect(slab.size[0]).toBe(door.width);
    const hood = doorFixedItems(door).find((i) => i.tone === 'shutter');
    expect(hood).toBeDefined();
    expect((hood?.at[2] ?? 0) > door.height).toBe(true);
  });

  it('has ribs from the sill to just under the lintel', () => {
    const slats = shutterSlats(door);
    expect(slats.length).toBeGreaterThan(8);
    for (const s of slats) {
      expect(s.at[2]).toBeGreaterThan(0.2);
      expect(s.at[2]).toBeLessThan(door.height - 0.1);
    }
  });
});
