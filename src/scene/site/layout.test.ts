// @vitest-environment node
import { describe, expect, it } from 'vitest';
import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema, type SiteConfig } from '@/domain';
import { buildSiteLayout } from './layout';

const dhk: SiteConfig = SiteConfigSchema.parse(siteConfigJson);
const dock = dhk.dockFaces[0] as SiteConfig['dockFaces'][number];

describe('buildSiteLayout: dhk-depot', () => {
  const layout = buildSiteLayout(dhk);

  it('yields 7 doors and 7 conveyors, W to E', () => {
    expect(layout.faces).toHaveLength(1);
    expect(layout.faces[0]?.face).toBe('S');
    expect(layout.bays.map((b) => b.id)).toEqual(['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07']);
    expect(layout.bays.map((b) => b.conveyorName)).toEqual(
      Array.from({ length: 7 }, (_, i) => `Conveyor-0${i + 1}`),
    );
  });

  it('puts doors on the south edge at pitch 6.5 centred on X = 0', () => {
    expect(layout.bays.map((b) => b.door.X)).toEqual([-19.5, -13, -6.5, 0, 6.5, 13, 19.5]);
    for (const b of layout.bays) expect(b.door.Z).toBe(38);
  });

  it('places the conveyor body at the expected site positions', () => {
    expect(layout.bays[3]?.conveyor.start).toEqual({ X: 0, Y: 1.2, Z: 37.5 });
    expect(layout.bays[3]?.conveyor.end).toEqual({ X: 0, Y: 1.2, Z: 29 });
    expect(layout.bays[0]?.conveyor.start.X).toBe(-19.5);
    expect(layout.bays[6]?.conveyor.end).toEqual({ X: 19.5, Y: 1.2, Z: 29 });
  });

  it('has apron depth from config, holding slots, no context and cutaway N/E/W', () => {
    const f = layout.faces[0];
    expect(f?.apron.depth).toBe(12);
    expect(f?.apron.slots).toHaveLength(4);
    expect(layout.context).toEqual([]);
    expect([...layout.cutawayFaces].sort()).toEqual(['E', 'N', 'W']);
    expect(layout.bounds).toEqual({ minX: -27, maxX: 27, minZ: -38, maxZ: 50 });
  });

  it('keeps every column off the conveyor corridors and out of the doorways', () => {
    expect(layout.columns.length).toBeGreaterThan(8);
    for (const c of layout.columns) {
      for (const b of layout.bays) {
        // columns within the conveyor depth (bay y < 9.5) must not sit on a belt / door
        if (c.Z > 38 - 9.5) expect(Math.abs(c.X - b.door.X)).toBeGreaterThan(1.2);
      }
    }
  });

  it('rings the footprint and apron with a road, keeping clear of everything built', () => {
    const s = buildSiteLayout(dhk).surround;
    const view = dhk.view.surround;
    if (!s || !view) throw new Error('no surround');
    const { bounds } = buildSiteLayout(dhk);
    const innerX = s.width / 2 - s.road;
    const innerZ = s.depth / 2 - s.road;
    expect(s.center.X - innerX).toBeCloseTo(bounds.minX - view.clearance, 6);
    expect(s.center.X + innerX).toBeCloseTo(bounds.maxX + view.clearance, 6);
    expect(s.center.Z - innerZ).toBeCloseTo(bounds.minZ - view.clearance, 6);
    expect(s.center.Z + innerZ).toBeCloseTo(bounds.maxZ + view.clearance, 6);
    expect(s.dashes.length).toBeGreaterThan(20);
    // the frozen pan limits do not grow with the road
    expect(bounds.maxZ).toBe(dhk.building.footprint.depthNS / 2 + dhk.view.apronDepth);
  });

  it('stands the trees beside the road: never on it, never on the site, deterministically', () => {
    const { surround: s, bounds } = buildSiteLayout(dhk);
    if (!s) throw new Error('no surround');
    expect(s.trees.length).toBeGreaterThan(15);
    const innerX = s.width / 2 - s.road;
    const innerZ = s.depth / 2 - s.road;
    let inside = 0;
    for (const t of s.trees) {
      const dx = Math.abs(t.X - s.center.X);
      const dz = Math.abs(t.Z - s.center.Z);
      const beyond = dx > s.width / 2 || dz > s.depth / 2;
      if (beyond) continue;
      inside++;
      // on the inner verge: clear of the road and of the footprint + apron
      expect(dx < innerX && dz < innerZ, `${t.X}, ${t.Z}`).toBe(true);
      const onSite =
        t.X > bounds.minX && t.X < bounds.maxX && t.Z > bounds.minZ && t.Z < bounds.maxZ;
      expect(onSite, `${t.X}, ${t.Z}`).toBe(false);
      // only on the configured sides (S and W): nothing between the near walls and the hero camera
      expect(t.X < bounds.minX || t.Z > bounds.maxZ, `${t.X}, ${t.Z}`).toBe(true);
    }
    expect(inside).toBeGreaterThan(5);
    expect(buildSiteLayout(dhk).surround).toEqual(s);
  });

  it('has no ring road unless configured', () => {
    const { surround, ...view } = dhk.view;
    expect(surround).toBeDefined();
    expect(buildSiteLayout({ ...dhk, view }).surround).toBeNull();
  });

  it('builds exterior context only when asked', () => {
    const withCtx = buildSiteLayout({ ...dhk, view: { ...dhk.view, showExteriorContext: true } });
    expect(withCtx.context.map((c) => c.type).sort()).toEqual([
      'building',
      'road',
      'trees',
      'trees',
    ]);
  });
});

describe('buildSiteLayout: generic faces and bay counts', () => {
  it('builds 3 bays on face E without error', () => {
    const l = buildSiteLayout({
      ...dhk,
      id: 'test-east',
      dockFaces: [{ ...dock, face: 'E', bayOrder: 'N_TO_S', bays: dock.bays.slice(0, 3) }],
    });
    expect(l.bays).toHaveLength(3);
    expect(l.faces[0]?.face).toBe('E');
    expect([...l.cutawayFaces].sort()).toEqual(['N', 'S', 'W']);
    expect(l.bays.map((b) => [b.door.X, b.door.Z])).toEqual([
      [27, -6.5],
      [27, 0],
      [27, 6.5],
    ]);
    // interior depth along bay y is the footprint width (54); zones are clipped to it
    expect(l.bays[0]?.zones.storage[1]).toBeLessThan(54);
    // the conveyor runs west (-X) from the east wall
    expect(l.bays[1]?.conveyor.end).toEqual({ X: 27 - 9, Y: 1.2, Z: 0 });
    expect(l.bounds.maxX).toBe(39);
  });

  it('supports other bay counts and faces', () => {
    const n = buildSiteLayout({
      ...dhk,
      dockFaces: [{ ...dock, face: 'N', bays: dock.bays.slice(0, 5) }],
    });
    expect(n.bays).toHaveLength(5);
    expect(n.bays[0]?.door.Z).toBe(-38);
    expect(n.bays[0]?.conveyor.end.Z).toBe(-29);
  });
});
