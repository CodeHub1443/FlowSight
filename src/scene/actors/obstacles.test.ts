// @vitest-environment node
import { describe, expect, it } from 'vitest';
import config from '../../../config/sites/dhk-depot.json';
import type { Actor, ActorsFrame } from '@/domain';
import { SiteConfigSchema } from '@/domain/siteConfig';
import { cabinetSpots } from '../bay/bayItems';
import { buildStaging, stagingInput } from '../bay/stagingLayout';
import { buildStorage, storageInput, storageProps } from '../bay/storageLayout';
import { buildSiteLayout } from '../site/layout';
import {
  AT_EDGE_CLEARANCE,
  bayObstacles,
  clearanceFor,
  FORKLIFT_HALF_WIDTH,
  ObstacleField,
  PERSON_CLEARANCE,
  type ObstacleKind,
  type ObstacleRect,
} from './obstacles';
import { ActorTracks } from './tracks';

const layout = buildSiteLayout(SiteConfigSchema.parse(config));
const field = new ObstacleField(layout);
const bays = layout.bays;
const person = { kind: 'PERSON', act: 'STATIONARY', h: 0 } as const;
const forklift = { kind: 'FORKLIFT', act: 'DRIVING', h: Math.PI / 2 } as const;

const middle = (r: ObstacleRect) => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
const inRect = (r: ObstacleRect, x: number, y: number, c = 0) =>
  x > r.x0 - c && x < r.x1 + c && y > r.y0 - c && y < r.y1 + c;

function resolved(
  bay: string,
  x: number,
  y: number,
  actor: Pick<Actor, 'kind' | 'act' | 'h'> = person,
) {
  field.resolve(bay, actor, x, y, x, y);
  return { x: field.outX, y: field.outY };
}

/** The first bay and its first rect of a kind. */
function first(kind: ObstacleKind) {
  const bay = bays[0];
  const rect = bay && bayObstacles(bay).find((r) => r.kind === kind);
  if (!bay || !rect) throw new Error(`no ${kind}`);
  return { bay, rect, m: middle(rect) };
}

describe('obstacle rectangles come from the layout', () => {
  it.each(bays)('$id: every prop that stands on the floor is covered', (bay) => {
    const rects = bayObstacles(bay);
    const staging = buildStaging(stagingInput(bay));
    const covered = (x: number, y: number, kinds: ObstacleKind[]) =>
      rects.some((r) => kinds.includes(r.kind) && inRect(r, x, y, 1e-6));
    for (const p of staging.pallets) expect(covered(p.at[0], p.at[1], ['pallet'])).toBe(true);
    for (const b of staging.cartons) expect(covered(b.at[0], b.at[1], ['pallet'])).toBe(true);
    for (const j of staging.jacks) expect(covered(j.at[0], j.at[1], ['jack'])).toBe(true);
    for (const s of storageProps(buildStorage(storageInput(bay))).pallets) {
      expect(covered(s.at[0] - bay.localX, s.at[1], ['storage'])).toBe(true);
    }
    const c = bay.conveyor;
    expect(covered(0, (c.fixedFrom + c.fixedTo) / 2, ['conveyor'])).toBe(true);
    const cab = cabinetSpots(c);
    for (const x of cab.xs) expect(covered(x, cab.y, ['cabinet'])).toBe(true);
    expect(rects.some((r) => r.kind === 'motor')).toBe(true);
    expect(rects.some((r) => r.kind === 'crate')).toBe(true);
  });

  it('gives one rect per stack, however many levels it has', () => {
    for (const bay of bays) {
      const stacks = new Set(
        buildStaging(stagingInput(bay)).pallets.map((p) => `${p.at[0]},${p.at[1]}`),
      );
      expect(bayObstacles(bay).filter((r) => r.kind === 'pallet').length).toBe(stacks.size);
      expect(bayObstacles(bay).filter((r) => r.kind === 'crate').length).toBe(2);
    }
  });
});

describe('a person is pushed out of what stands on the floor', () => {
  const cases = bays.flatMap((bay) => bayObstacles(bay).map((rect) => ({ bay: bay.id, rect })));

  it.each(['pallet', 'crate', 'jack', 'conveyor', 'motor', 'cabinet', 'storage'] as const)(
    'from the middle and the corners of every %s',
    (kind) => {
      const own = cases.filter((c) => c.rect.kind === kind);
      expect(own.length).toBeGreaterThan(0);
      for (const { bay, rect } of own) {
        const m = middle(rect);
        const points = [
          m,
          { x: rect.x0 + 0.02, y: rect.y0 + 0.02 },
          { x: rect.x1 - 0.02, y: rect.y1 - 0.02 },
        ];
        for (const p of points) {
          const out = resolved(bay, p.x, p.y);
          expect(field.isInside(bay, out.x, out.y, PERSON_CLEARANCE), `${bay} ${kind}`).toBe(false);
        }
      }
    },
  );

  it('from a shed column', () => {
    const bay = bays[3];
    if (!bay) throw new Error('no bay');
    const x = bay.pitch / 2;
    let found = 0;
    for (let y = 0.5; y < 70; y += 0.1) {
      if (!field.isInside(bay.id, x, y, 0)) continue;
      found++;
      const out = resolved(bay.id, x, y);
      expect(field.isInside(bay.id, out.x, out.y, PERSON_CLEARANCE)).toBe(false);
    }
    expect(found).toBeGreaterThan(0);
  });

  it('lands free from anywhere on the floor of every bay, near the prop it left', () => {
    for (const bay of bays) {
      for (let x = -bay.pitch / 2; x <= bay.pitch / 2; x += 0.23) {
        for (let y = 0.5; y < bay.zones.storage[1]; y += 0.31) {
          const out = resolved(bay.id, x, y);
          expect(
            field.isInside(bay.id, out.x, out.y, PERSON_CLEARANCE),
            `${bay.id} ${x} ${y}`,
          ).toBe(false);
          expect(Math.hypot(out.x - x, out.y - y)).toBeLessThan(5);
        }
      }
    }
  });

  it('takes the shortest way out', () => {
    const { bay, rect } = first('conveyor');
    const y = 3;
    const out = resolved(bay.id, rect.x1 - 0.1, y);
    expect(out.x).toBeCloseTo(rect.x1 + PERSON_CLEARANCE, 2);
    expect(out.y).toBe(y);
  });

  it('does not move a point in the open', () => {
    let free = 0;
    for (const bay of bays) {
      for (let x = -3; x <= 3; x += 0.37) {
        for (let y = 0.5; y < 25; y += 0.41) {
          if (field.isInside(bay.id, x, y, PERSON_CLEARANCE)) continue;
          free++;
          expect(resolved(bay.id, x, y)).toEqual({ x, y });
        }
      }
    }
    expect(free).toBeGreaterThan(500);
  });

  it('leaves a truck interior and an unknown bay alone', () => {
    expect(resolved('B01', 0.2, -3)).toEqual({ x: 0.2, y: -3 });
    expect(resolved('B99', 0, 3)).toEqual({ x: 0, y: 3 });
  });

  it('keeps someone handling or carrying at the edge of a stack: not inside it, not off from it', () => {
    expect(clearanceFor('HANDLING')).toBe(AT_EDGE_CLEARANCE);
    expect(clearanceFor('CARRYING')).toBe(AT_EDGE_CLEARANCE);
    expect(clearanceFor('WALKING')).toBe(PERSON_CLEARANCE);
    // a stack with free floor on its right: the middle stack's neighbours may stand too close to get out that way
    const spot = cases.find(({ bay, rect: r }) => {
      const y = middle(r).y;
      return r.kind === 'pallet' && !field.isInside(bay, r.x1 + AT_EDGE_CLEARANCE + 0.01, y, 0.36);
    });
    if (!spot) throw new Error('no stack with free floor beside it');
    const { rect } = spot;
    const out = resolved(spot.bay, rect.x1 - 0.05, middle(rect).y, { ...person, act: 'HANDLING' });
    expect(out.x).toBeCloseTo(rect.x1 + AT_EDGE_CLEARANCE, 2);
    expect(inRect(rect, out.x, out.y)).toBe(false);
  });

  it('stays on its side of a stack until the data is clearly past the middle', () => {
    const { bay, rect } = first('conveyor');
    const y = 3;
    const left = rect.x0 - PERSON_CLEARANCE;
    // just past the middle, seen from the left: stays on the left
    field.resolve(bay.id, person, 0.05, y, left, y);
    expect(field.outX).toBeCloseTo(left, 2);
    // well past it: goes round
    field.resolve(bay.id, person, rect.x1 - 0.05, y, left, y);
    expect(field.outX).toBeCloseTo(rect.x1 + PERSON_CLEARANCE, 2);
  });
});

describe('a forklift keeps to the aisle', () => {
  it('stays inside the aisle whatever the data says, and clear of what borders it', () => {
    for (const bay of bays) {
      const [a0, a1] = bay.zones.aisle;
      for (const y of [a0 - 8, a0, (a0 + a1) / 2, a1, a1 + 8]) {
        const out = resolved(bay.id, 0, y, forklift);
        expect(out.y - FORKLIFT_HALF_WIDTH).toBeGreaterThanOrEqual(a0 - 1e-6);
        expect(out.y + FORKLIFT_HALF_WIDTH).toBeLessThanOrEqual(a1 + 1e-6);
        for (const r of bayObstacles(bay)) {
          expect(r.y1 <= out.y - FORKLIFT_HALF_WIDTH || r.y0 >= out.y + FORKLIFT_HALF_WIDTH).toBe(
            true,
          );
        }
      }
    }
  });

  it('does not move on its own run along the middle of the aisle', () => {
    const bay = bays[3];
    if (!bay) throw new Error('no bay');
    const y = (bay.zones.aisle[0] + bay.zones.aisle[1]) / 2;
    expect(resolved(bay.id, 0.4, y, forklift)).toEqual({ x: 0.4, y });
  });
});

describe('between frames', () => {
  const frame = (
    bay: string,
    x: number,
    y: number,
    act: Actor['act'] = 'WALKING',
  ): ActorsFrame => ({
    v: 1,
    ts: '2026-10-24T19:50:45.310+06:00',
    site: 'dhk-depot',
    bay,
    actors: [{ id: 't-1', kind: 'PERSON', role: 'WORKER', x, y, h: 0, act, ppeOk: true }],
  });
  const FRAME_MS = 1000 / 60;

  /** Runs a walk along `path` at 2 Hz frames and 60 Hz updates; returns every drawn point. */
  function walk(bay: string, path: readonly (readonly [number, number])[], tailMs = 1000) {
    const tracks = new ActorTracks(field);
    const drawn: { x: number; y: number }[] = [];
    let now = 1000;
    const advance = (ms: number) => {
      for (let done = 0; done < ms; done += FRAME_MS) {
        now += FRAME_MS;
        tracks.update(now, FRAME_MS, true);
        const t = tracks.tracks.get('t-1');
        if (t) drawn.push({ x: t.x, y: t.y });
      }
    };
    for (const [x, y] of path) {
      tracks.applyFrame(frame(bay, x, y), now);
      advance(500);
    }
    advance(tailMs);
    return drawn;
  }

  const steps = (drawn: readonly { x: number; y: number }[]) =>
    drawn.slice(1).map((p, i) => {
      const q = drawn[i] ?? p;
      return Math.hypot(p.x - q.x, p.y - q.y);
    });

  it('a figure placed inside a stack is never drawn inside it, and stands still', () => {
    const { bay, rect, m } = first('pallet');
    const drawn = walk(bay.id, [
      [m.x, m.y],
      [m.x, m.y],
      [m.x, m.y],
    ]);
    for (const p of drawn) expect(inRect(rect, p.x, p.y)).toBe(false);
    for (const s of steps(drawn)) expect(s).toBeLessThan(0.05);
  });

  it('walking straight through a stack, it goes round with no step above 30 cm a frame', () => {
    const { bay, rect, m } = first('pallet');
    const path: [number, number][] = [];
    for (let i = -6; i <= 6; i++) path.push([m.x + i * 0.5, m.y]);
    const drawn = walk(bay.id, path);
    for (const s of steps(drawn)) expect(s).toBeLessThan(0.3);
    const end = drawn.at(-1);
    expect(end && field.isInside(bay.id, end.x, end.y, PERSON_CLEARANCE - 0.01)).toBe(false);
    // only the blend may touch the prop, and never for long
    const within = drawn.filter((p) => inRect(rect, p.x, p.y));
    expect(within.length).toBeLessThan(drawn.length * 0.1);
  });

  it('does not cross back and forth when the data wobbles around the middle of a stack', () => {
    const { bay, m } = first('conveyor');
    const path: [number, number][] = [];
    for (let i = 0; i < 24; i++) path.push([m.x + (i % 2 ? 0.1 : -0.1), m.y]);
    const drawn = walk(bay.id, path);
    let crossings = 0;
    for (const [i, p] of drawn.entries()) {
      const q = drawn[i - 1];
      if (q && Math.sign(p.x - m.x) !== Math.sign(q.x - m.x)) crossings++;
    }
    expect(crossings).toBe(0);
  });

  it('blends a push over about 150 ms, with no pop', () => {
    const { bay, rect } = first('conveyor');
    const y = 2;
    const tracks = new ActorTracks(field);
    tracks.applyFrame(frame(bay.id, rect.x0 - 1, y), 1000);
    tracks.update(1000, 16, true);
    // a burst: the next frame arrives early and just inside the conveyor, its leg takes the shortest time
    tracks.applyFrame(frame(bay.id, rect.x0 + 0.1, y), 1100);
    let prev = rect.x0 - 1;
    let top = 0;
    for (let now = 1100; now < 1100 + 120 + 150; now += FRAME_MS) {
      tracks.update(now, FRAME_MS, true);
      const x = tracks.tracks.get('t-1')?.x ?? 0;
      top = Math.max(top, Math.abs(x - prev));
      prev = x;
    }
    expect(prev).toBeCloseTo(rect.x0 - PERSON_CLEARANCE, 1);
    expect(top).toBeLessThan(0.3);
  });

  it('a long push, across a whole stack, has settled within 400 ms', () => {
    const { bay, rect, m } = first('pallet');
    const tracks = new ActorTracks(field);
    tracks.applyFrame(frame(bay.id, rect.x0 - 1, m.y), 1000);
    tracks.update(1000, 16, true);
    tracks.applyFrame(frame(bay.id, m.x, m.y), 1100);
    for (let now = 1100; now < 1100 + 400; now += FRAME_MS) tracks.update(now, FRAME_MS, true);
    const t = tracks.tracks.get('t-1');
    expect(field.isInside(bay.id, t?.x ?? 0, t?.y ?? 0, PERSON_CLEARANCE - 0.02)).toBe(false);
  });

  it('places at once on the tier that draws no motion (Low)', () => {
    const { bay, m } = first('pallet');
    const tracks = new ActorTracks(field);
    tracks.applyFrame(frame(bay.id, m.x, m.y, 'STATIONARY'), 1000);
    tracks.update(1016, 16, false);
    const t = tracks.tracks.get('t-1');
    expect(field.isInside(bay.id, t?.x ?? 0, t?.y ?? 0, PERSON_CLEARANCE)).toBe(false);
  });

  it('never writes the pose back into the data', () => {
    const { bay, m } = first('pallet');
    const f = frame(bay.id, m.x, m.y);
    const tracks = new ActorTracks(field);
    tracks.applyFrame(f, 1000);
    tracks.update(1016, 16, true);
    expect(f.actors[0]?.x).toBe(m.x);
    expect(tracks.tracks.get('t-1')?.actor.x).toBe(m.x);
  });
});

describe('cost', () => {
  it('is hundreds of calls per ms on the worst bay, inside and outside obstacles', () => {
    let worst = bays[0];
    let most = 0;
    for (const b of bays) {
      const n = bayObstacles(b).length;
      if (n > most) {
        most = n;
        worst = b;
      }
    }
    if (!worst) throw new Error('no bay');
    const id = worst.id;
    const points: [number, number][] = [];
    for (let x = -3; x <= 3; x += 0.5) {
      for (let y = 1; y < 60; y += 1.3) points.push([x, y]);
    }
    const inside = points.filter(([x, y]) => field.isInside(id, x, y, PERSON_CLEARANCE)).length;
    expect(inside).toBeGreaterThan(points.length / 3);
    const run = () => {
      const t0 = performance.now();
      let calls = 0;
      while (performance.now() - t0 < 40) {
        for (const [x, y] of points) {
          field.resolve(id, person, x, y, x, y);
          calls++;
        }
      }
      return calls / (performance.now() - t0);
    };
    run();
    expect(run()).toBeGreaterThan(300);
  });
});
