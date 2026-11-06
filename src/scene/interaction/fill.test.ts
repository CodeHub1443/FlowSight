// @vitest-environment node
import { describe, expect, it } from 'vitest';
import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema, type Actor } from '@/domain';
import { bayMaps } from '../actors/actorRig';
import { createWorld } from '../actors/world';
import { GlyphBoard } from '../glyphs/cameraGlyph';
import { buildSiteLayout } from '../site/layout';
import { bayToSite } from '../site/transforms';
import { fillPicks, GLYPH_PICK_RADIUS, MIN_PICK_FADE } from './fill';
import { PickList, type Ray } from './pick';

const layout = buildSiteLayout(SiteConfigSchema.parse(siteConfigJson));
const maps = bayMaps(layout);
const bay4 = layout.bays[3] as (typeof layout.bays)[number];

const person = (id: string, x: number, y: number, kind: Actor['kind'] = 'PERSON'): Actor => ({
  id,
  kind,
  role: kind === 'FORKLIFT' ? 'FORKLIFT_OP' : 'WORKER',
  x,
  y,
  h: 0,
  act: kind === 'FORKLIFT' ? 'DRIVING' : 'STATIONARY',
  ppeOk: true,
});

function scene() {
  const world = createWorld(layout);
  world.tracks.applyFrame(
    {
      v: 1,
      ts: '2026-11-06T10:00:00.000+06:00',
      site: 'dhk-depot',
      bay: 'B04',
      actors: [person('t-7', 0, 8), person('f-2', 2, 18, 'FORKLIFT')],
    } as never,
    0,
  );
  world.tracks.update(1000, 16, true);
  world.trucks.sync(
    'B04',
    [
      {
        visitId: 'V-20261106-B04-0001',
        bay: 'B04',
        plate: { bn: 'x', en: 'DHAKA METRO-DA 11-2171' },
        state: 'docked',
        slot: null,
      },
    ],
    0,
    false,
  );
  world.trucks.update(1000, 16, false);
  return world;
}

const rayThrough = (to: [number, number, number], from: [number, number, number]): Ray => {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0] as number, d[1] as number, d[2] as number);
  return {
    ox: from[0],
    oy: from[1],
    oz: from[2],
    dx: (d[0] as number) / len,
    dy: (d[1] as number) / len,
    dz: (d[2] as number) / len,
  };
};

describe('what can be picked', () => {
  it('lists the truck by visit id, the person and the forklift by track id', () => {
    const list = new PickList();
    fillPicks(list, scene(), layout, maps, null);
    const got = Array.from({ length: list.count }, (_, i) => `${list.kinds[i]}:${list.ids[i]}`);
    expect(got.sort()).toEqual(['forklift:f-2', 'person:t-7', 'truck:V-20261106-B04-0001'].sort());
  });

  it('a ray through a drawn person finds that person, at the place the rig draws them', () => {
    const world = scene();
    const list = new PickList();
    fillPicks(list, world, layout, maps, null);
    // where the rig draws it (the obstacle push may have moved it off the reported place)
    const t = world.tracks.tracks.get('t-7');
    const p = bayToSite(
      bay4.face,
      bay4.door,
      { x: (t?.x ?? 0) + (t?.sepX ?? 0), y: (t?.y ?? 0) + (t?.sepY ?? 0), z: 0 },
      layout.floorLevel,
    );
    const hit = list.nearest(rayThrough([p.X, p.Y + 0.9, p.Z], [p.X + 20, 70, p.Z + 70]));
    expect(list.ids[hit]).toBe('t-7');
  });

  it('a ray through the docked truck finds the truck', () => {
    const list = new PickList();
    fillPicks(list, scene(), layout, maps, null);
    const door = bay4.door;
    // the body runs from the rear sill at the door out along the apron (site +Z on the south face)
    const hit = list.nearest(
      rayThrough([door.X, 2.75, door.Z + 4], [door.X + 15, 60, door.Z + 60]),
    );
    expect(list.ids[hit]).toBe('V-20261106-B04-0001');
  });

  it('leaves out an actor that is still fading in or already fading out', () => {
    const world = scene();
    for (const t of world.tracks.tracks.values()) t.fade = MIN_PICK_FADE - 0.01;
    for (const t of world.trucks.trucks.values()) t.fade = MIN_PICK_FADE - 0.01;
    const list = new PickList();
    fillPicks(list, world, layout, maps, null);
    expect(list.count).toBe(0);
  });

  it('adds the camera glyphs that show, and only those', () => {
    const board = new GlyphBoard();
    const ids = layout.bays.flatMap((b) => b.cameras.map((c) => c.id));
    board.update(
      ids,
      (id) => (id === 'B04-CREW' ? 'OFFLINE' : id === 'B02-BELT' ? 'MOVED' : 'OK'),
      false,
    );
    const list = new PickList();
    fillPicks(list, createWorld(layout), layout, maps, board);
    const cams = Array.from({ length: list.count }, (_, i) => list.ids[i]).sort();
    expect(cams).toEqual(['B02-BELT', 'B04-CREW']);
    expect(list.kinds[0]).toBe('camera');
    // and all 21 in X-ray mode
    board.update(ids, () => 'OK', true);
    fillPicks(list, createWorld(layout), layout, maps, board);
    expect(list.count).toBe(21);
  });

  it('a ray at the CREW glyph hits it', () => {
    const board = new GlyphBoard();
    board.update(['B04-CREW'], () => 'OFFLINE', false);
    const list = new PickList();
    fillPicks(list, createWorld(layout), layout, maps, board);
    const cam = bay4.cameras.find((c) => c.role === 'CREW');
    const at = cam?.at ?? { X: 0, Y: 0, Z: 0 };
    expect(GLYPH_PICK_RADIUS).toBeGreaterThan(0.3);
    const hit = list.nearest(
      rayThrough([at.X + 0.2, at.Y, at.Z], [at.X + 30, at.Y + 60, at.Z + 70]),
    );
    expect(list.ids[hit]).toBe('B04-CREW');
  });

  it('is repeatable: a refill gives the same list', () => {
    const world = scene();
    const a = new PickList();
    const b = new PickList();
    fillPicks(a, world, layout, maps, null);
    fillPicks(b, world, layout, maps, null);
    fillPicks(b, world, layout, maps, null);
    expect(b.count).toBe(a.count);
    expect(b.ids.slice(0, b.count)).toEqual(a.ids.slice(0, a.count));
  });
});
