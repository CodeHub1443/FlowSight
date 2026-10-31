// @vitest-environment node
import { describe, expect, it } from 'vitest';
import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema } from '@/domain';
import { BAND_HEIGHT } from '../building/bandHeight';
import { buildSiteLayout, WALL_THICKNESS } from '../site/layout';
import { bayPillAnchor, selectionPillAnchor } from './anchors';

const layout = buildSiteLayout(SiteConfigSchema.parse(siteConfigJson));

describe('pill anchors', () => {
  it('puts each bay number pill on the shed side of the dock-wall band, above its door', () => {
    for (const bay of layout.bays) {
      const a = bayPillAnchor(layout, bay.id);
      expect(a).not.toBeNull();
      if (!a) continue;
      expect(a[0]).toBeCloseTo(bay.door.X, 6);
      // face S: into the building is -Z
      expect(a[2]).toBeCloseTo(bay.door.Z - (WALL_THICKNESS + 0.06), 6);
      expect(a[1]).toBeGreaterThan(layout.floorLevel + 3.8);
      expect(a[1]).toBeLessThan(layout.floorLevel + 3.8 + BAND_HEIGHT);
    }
  });

  it('floats the selection pill above the belt mouth and ignores unknown bays', () => {
    const b04 = layout.bays.find((b) => b.id === 'B04');
    const a = selectionPillAnchor(layout, 'B04');
    expect(a?.[0]).toBeCloseTo(b04?.door.X ?? NaN, 6);
    expect(a?.[1]).toBeCloseTo(layout.floorLevel + 3.4, 6);
    expect(a?.[2]).toBeCloseTo((b04?.door.Z ?? NaN) - 8, 6);
    expect(selectionPillAnchor(layout, 'B99')).toBeNull();
    expect(bayPillAnchor(layout, 'B99')).toBeNull();
  });
});
