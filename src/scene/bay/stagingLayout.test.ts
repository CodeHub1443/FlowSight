// @vitest-environment node
import { describe, expect, it } from 'vitest';
import config from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema } from '@/domain/siteConfig';
import { buildSiteLayout } from '../site/layout';
import { hashString } from '../site/random';
import { CRATE_TONES } from '../materials';
import { buildStaging, crateTone, JACK, PALLET, PALLET_H } from './stagingLayout';
import { buildStorage, storageProps } from './storageLayout';

// ADR-13: the GLB props and the procedural ones are two drawings of one layout. Nothing moves between the tiers, and
// each bay's single pallet jack stands on free floor.

const layout = buildSiteLayout(SiteConfigSchema.parse(config));
const inputs = layout.bays.map((bay) => ({
  bay,
  input: {
    seed: hashString(bay.id),
    x: bay.zones.staging.x,
    y: bay.zones.staging.y,
    beltHalf: bay.conveyor.width / 2 + 0.3,
    beltEnd: bay.conveyor.fixedTo,
  },
}));

/** Half extents of a yawed footprint, for an axis-aligned overlap test. */
function reach(size: readonly number[], yaw = 0): [number, number] {
  const [w = 0, d = 0] = size;
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  return [(w * c + d * s) / 2, (w * s + d * c) / 2];
}

describe('buildStaging', () => {
  it.each(inputs)('$bay.id: every GLB pallet sits where its procedural deck sits', ({ input }) => {
    const r = buildStaging(input);
    const decks = r.procedural.filter((b) => b.size[0] === PALLET[0] && b.size[1] === PALLET[1]);
    expect(r.pallets.length).toBeGreaterThan(0);
    expect(decks.length).toBe(r.pallets.length);
    r.pallets.forEach((p, i) => {
      const deck = decks[i];
      expect(p.at[0]).toBeCloseTo(deck?.at[0] ?? NaN, 6);
      expect(p.at[1]).toBeCloseTo(deck?.at[1] ?? NaN, 6);
      expect(p.size[2]).toBe(PALLET_H);
      expect(p.yaw).toBe(deck?.yaw);
      expect(p.tone).toBe(deck?.tone);
    });
  });

  it.each(inputs)('$bay.id: every GLB carton sits where its procedural body sits', ({ input }) => {
    const r = buildStaging(input);
    const bodies = r.procedural.filter((b) => b.tone === 'carton');
    expect(bodies.length).toBe(r.cartons.length);
    r.cartons.forEach((c, i) => {
      const body = bodies[i];
      expect(c.at[0]).toBe(body?.at[0]);
      expect(c.at[1]).toBe(body?.at[1]);
      // a BoxItem's `at` is its centre, a PropItem's its base
      expect(c.at[2]).toBeCloseTo((body?.at[2] ?? NaN) - (body?.size[2] ?? NaN) / 2, 6);
      expect(c.size).toEqual(body?.size);
    });
    // each carton keeps its tape on every tier, so a tape line belongs in the shared list
    expect(r.boxes.filter((b) => b.tone === 'cartonTape')).toHaveLength(r.cartons.length);
    expect(r.procedural.filter((b) => b.tone === 'cartonTape')).toHaveLength(0);
  });

  it.each(inputs)(
    '$bay.id: one pallet jack, on free floor inside the staging zone',
    ({ input }) => {
      const r = buildStaging(input);
      expect(r.jacks).toHaveLength(1);
      const jack = r.jacks[0];
      expect(jack?.size).toEqual(JACK);
      const [jx, jy] = reach(JACK, jack?.yaw);
      const x = jack?.at[0] ?? NaN;
      const y = jack?.at[1] ?? NaN;
      expect(x - jx).toBeGreaterThanOrEqual(input.x[0]);
      expect(x + jx).toBeLessThanOrEqual(input.x[1]);
      expect(y + jy).toBeLessThanOrEqual(input.y[1]);
      // clear of every other thing standing in the bay: stacks, crates, sacks
      for (const b of [...r.procedural, ...r.boxes]) {
        const [bx, by] = reach(b.size, b.yaw);
        const apart = Math.abs(b.at[0] - x) >= jx + bx || Math.abs(b.at[1] - y) >= jy + by;
        expect(apart, `jack hits ${b.tone} at ${b.at[0]}, ${b.at[1]}`).toBe(true);
      }
      // and of the conveyor
      expect(y - jy >= input.beltEnd || Math.abs(x) - jx >= input.beltHalf).toBe(true);
    },
  );

  it("builds every crate of wood, new and old mixed across the bays, the inner rim in its crate's tone", () => {
    const crates = inputs.flatMap(({ input }) =>
      buildStaging(input).boxes.filter((b) => CRATE_TONES.includes(b.tone)),
    );
    const bodies = crates.filter((b) => b.detail === 'lo');
    expect(bodies.length).toBeGreaterThanOrEqual(6 * inputs.length);
    const newWood = bodies.filter((b) => b.tone.startsWith('crateNew')).length / bodies.length;
    expect(newWood).toBeGreaterThan(0.4);
    expect(newWood).toBeLessThan(0.8);
    // more than one tone in a band: the tint jitter
    expect(new Set(bodies.map((b) => b.tone)).size).toBeGreaterThanOrEqual(4);
    for (const rim of crates.filter((b) => b.detail === 'flat')) {
      const body = bodies.find(
        (b) => b.at[0] === rim.at[0] && b.at[1] === rim.at[1] && b.yaw === rim.yaw,
      );
      expect(body?.tone).toBe(rim.tone);
    }
  });

  it('gives each bay a mix of new and old crates', () => {
    for (const { input } of inputs) {
      const tones = buildStaging(input).boxes.filter((b) => CRATE_TONES.includes(b.tone));
      expect(
        tones.some((b) => b.tone.startsWith('crateNew')),
        String(input.seed),
      ).toBe(true);
      expect(
        tones.some((b) => b.tone.startsWith('crateOld')),
        String(input.seed),
      ).toBe(true);
    }
  });

  it('picks a crate tone by index alone', () => {
    expect(crateTone(7, 1, 2)).toBe(crateTone(7, 1, 2));
    expect(CRATE_TONES).toContain(crateTone(7, 1, 2));
  });

  it('is deterministic per seed', () => {
    const first = inputs[0]?.input;
    if (!first) throw new Error('no bays');
    expect(buildStaging(first)).toEqual(buildStaging(first));
  });
});

describe('storageProps', () => {
  const items = buildStorage({ seed: 7, centerX: 0, pitch: 6.5, y: [20, 52] });
  const props = storageProps(items);

  it('takes pallets and cartons, keeps sacks and tape procedural, and loses nothing', () => {
    expect(props.pallets.length).toBeGreaterThan(0);
    expect(props.cartons.length).toBeGreaterThan(0);
    expect(props.rest.map((b) => b.tone).filter((t) => t.startsWith('storageSack'))).not.toEqual(
      [],
    );
    expect(props.rest.some((b) => b.tone === 'storageCarton')).toBe(false);
    expect(props.procedural.length + props.rest.length).toBe(items.length);
  });

  it('leaves every prop at the footprint and height of the block it replaces', () => {
    const bases = items.filter((b) => b.tone === 'storagePallet' && b.detail !== 'flat');
    expect(props.pallets.length).toBe(bases.length);
    props.pallets.forEach((p, i) => {
      expect(p.at[0]).toBe(bases[i]?.at[0]);
      expect(p.at[1]).toBe(bases[i]?.at[1]);
      expect(p.at[2]).toBeCloseTo(0, 6);
      expect(p.size).toEqual(bases[i]?.size);
    });
  });
});
