// @vitest-environment node
import { describe, expect, it } from 'vitest';
import config from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema } from '@/domain/siteConfig';
import { buildSiteLayout } from '../site/layout';
import { hashString } from '../site/random';
import { bayToSite } from '../site/transforms';
import { buildStorage, CROSS_AISLE, ROW_PITCH, ROWS_PER_BLOCK } from './storageLayout';

// docs/04 section 3: instanced blocks of palletised cartons across the storage zone, with aisles, low detail. Task 09
// reduced this to two rows at the far edge, which took the zone out of the hero view altogether.

const INPUT = { seed: 7, centerX: 0, pitch: 6.5, y: [20, 52] } as const;
const items = buildStorage(INPUT);
/** y of every pallet row that holds at least one pallet. */
const rows = [...new Set(items.filter((i) => i.size[2] === 0.15).map((i) => i.at[1]))].sort(
  (a, b) => a - b,
);

describe('buildStorage', () => {
  it('fills the zone from its near edge to its far edge', () => {
    // a row can be empty by chance, so the first filled one may be the second
    expect(rows[0]).toBeLessThan(INPUT.y[0] + 1 + 2 * ROW_PITCH);
    expect(rows.at(-1)).toBeGreaterThan(INPUT.y[1] - 3);
    for (const it of items) {
      expect(it.at[1] + it.size[1] / 2).toBeLessThanOrEqual(INPUT.y[1]);
      expect(it.at[1] - it.size[1] / 2).toBeGreaterThanOrEqual(INPUT.y[0]);
    }
  });

  it('leaves a cross aisle after every block of rows', () => {
    const gaps = rows.slice(1).map((y, i) => y - (rows[i] ?? 0));
    const aisles = gaps.filter((g) => g > ROW_PITCH + 0.1);
    expect(aisles.length).toBeGreaterThanOrEqual(2);
    for (const g of aisles) expect(g).toBeCloseTo(ROW_PITCH + CROSS_AISLE, 5);
    expect(rows.length).toBeGreaterThan(ROWS_PER_BLOCK * 2);
  });

  it('leaves the column aisle between the two pallet columns', () => {
    const near = items.filter((i) => i.size[2] === 0.15);
    for (const it of near) expect(Math.abs(it.at[0]) - it.size[0] / 2).toBeGreaterThan(0.2);
  });

  it('is low detail and uses only the faded storage tones', () => {
    for (const it of items) {
      expect(['lo', 'flat']).toContain(it.detail);
      expect(it.tone).toMatch(/^storage/);
    }
  });

  it('is deterministic per seed and differs between seeds', () => {
    expect(buildStorage(INPUT)).toEqual(items);
    expect(buildStorage({ ...INPUT, seed: 8 })).not.toEqual(items);
  });

  it('stays within the per-bay instance budget', () => {
    expect(items.length).toBeLessThan(160);
  });

  it('no pallet stands in a building column on the real site', () => {
    const layout = buildSiteLayout(SiteConfigSchema.parse(config));
    const COLUMN_FOOT = 0.31;
    let checked = 0;
    for (const bay of layout.bays) {
      const stored = buildStorage({
        seed: hashString(`${bay.id}-storage`),
        centerX: 0,
        pitch: bay.pitch,
        y: bay.zones.storage,
      });
      for (const it of stored) {
        const s = bayToSite(bay.face, bay.door, { x: it.at[0], y: it.at[1], z: 0 }, 0);
        for (const c of layout.columns) {
          checked++;
          const clear =
            Math.abs(s.X - c.X) > it.size[0] / 2 + COLUMN_FOOT ||
            Math.abs(s.Z - c.Z) > it.size[1] / 2 + COLUMN_FOOT;
          expect(clear, `${bay.id} item at ${it.at[0]},${it.at[1]} vs column ${c.X},${c.Z}`).toBe(
            true,
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
