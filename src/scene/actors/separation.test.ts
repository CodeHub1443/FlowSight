// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Actor } from '@/domain';
import { CrewSeparation, MAX_DISPLACEMENT_M, MIN_SEPARATION_M, Separator } from './separation';
import { ActorTracks, type ActorTrack } from './tracks';

function run(points: readonly [number, number][], seeds?: number[]) {
  const n = points.length;
  const x = points.map((p) => p[0]);
  const y = points.map((p) => p[1]);
  const seed = seeds ?? points.map((_, i) => 1000 + i * 7919);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const s = new Separator();
  s.separate(n, x, y, seed, dx, dy);
  const out = points.map((p, i) => [p[0] + (dx[i] as number), p[1] + (dy[i] as number)] as const);
  return { dx, dy, out, s };
}

const minDistance = (pts: readonly (readonly [number, number])[]) => {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      m = Math.min(
        m,
        Math.hypot(
          (pts[i] ?? [0, 0])[0] - (pts[j] ?? [0, 0])[0],
          (pts[i] ?? [0, 0])[1] - (pts[j] ?? [0, 0])[1],
        ),
      );
  return m;
};

describe('separation of crew figures', () => {
  it('leaves figures that are already apart exactly where they are', () => {
    const { dx, dy } = run([
      [0, 5],
      [0.6, 5],
      [3, 9],
    ]);
    expect([...dx, ...dy].every((v) => v === 0)).toBe(true);
  });

  it('a single figure, or none, is never moved', () => {
    expect(run([[1, 1]]).dx[0]).toBe(0);
    expect(() => run([])).not.toThrow();
  });

  it('parts two figures that stand on one spot to the minimum distance', () => {
    const { out, dx, dy } = run([
      [2, 8],
      [2, 8],
    ]);
    expect(minDistance(out)).toBeGreaterThanOrEqual(MIN_SEPARATION_M - 1e-9);
    for (let i = 0; i < 2; i++)
      expect(Math.hypot(dx[i] as number, dy[i] as number)).toBeLessThanOrEqual(MAX_DISPLACEMENT_M);
  });

  it('parts two close figures along the line between them, each by half the overlap', () => {
    const { dx, dy } = run([
      [0, 0],
      [0.3, 0],
    ]);
    expect(dx[0]).toBeCloseTo(-0.125, 6);
    expect(dx[1]).toBeCloseTo(0.125, 6);
    expect(dy[0]).toBeCloseTo(0, 9);
    expect(dy[1]).toBeCloseTo(0, 9);
  });

  it('never moves a figure more than 0.6 m from where it was reported, in the worst crowd', () => {
    // ten figures on a 0.3 m disc: they cannot all fit at 0.55 m, so the bound must hold instead
    const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => [
      Math.cos(i) * 0.3,
      Math.sin(i) * 0.3,
    ]);
    const { dx, dy } = run(pts);
    for (let i = 0; i < pts.length; i++) {
      expect(Math.hypot(dx[i] as number, dy[i] as number)).toBeLessThanOrEqual(
        MAX_DISPLACEMENT_M + 1e-9,
      );
    }
  });

  it('opens a crowd up: the closest pair gets further apart', () => {
    const pts: [number, number][] = Array.from({ length: 8 }, (_, i) => [
      (i % 4) * 0.25,
      Math.floor(i / 4) * 0.25,
    ]);
    const before = minDistance(pts);
    const { out } = run(pts);
    expect(minDistance(out)).toBeGreaterThan(before * 1.5);
  });

  it('three on one spot end up at least 0.5 m apart', () => {
    const { out } = run([
      [4, 4],
      [4, 4],
      [4, 4],
    ]);
    expect(minDistance(out)).toBeGreaterThan(0.5);
  });

  it('is deterministic: the same input gives bit-identical offsets, and the same pair splits the same way', () => {
    const pts: [number, number][] = [
      [1, 1],
      [1, 1],
      [1.2, 1.1],
      [5, 5],
    ];
    const a = run(pts);
    const b = run(pts);
    expect([...a.dx]).toEqual([...b.dx]);
    expect([...a.dy]).toEqual([...b.dy]);
    // two on one spot: the direction comes from the seeds, not from chance
    const c = run(
      [
        [0, 0],
        [0, 0],
      ],
      [11, 22],
    );
    const d = run(
      [
        [0, 0],
        [0, 0],
      ],
      [11, 22],
    );
    expect(c.dx[0]).toBe(d.dx[0]);
    expect(c.dy[0]).toBe(d.dy[0]);
  });

  it('does not depend on the order the figures are listed in', () => {
    const pts: [number, number][] = [
      [0, 0],
      [0.2, 0.1],
      [0.1, 0.4],
      [3, 3],
    ];
    const seeds = [5, 6, 7, 8];
    const fwd = run(pts, seeds);
    const order = [3, 2, 1, 0];
    const rev = run(
      order.map((i) => pts[i] ?? ([0, 0] as [number, number])),
      order.map((i) => seeds[i] as number),
    );
    order.forEach((src, k) => {
      expect(rev.dx[k]).toBeCloseTo(fwd.dx[src] as number, 9);
      expect(rev.dy[k]).toBeCloseTo(fwd.dy[src] as number, 9);
    });
  });

  it('the spatial hash finds every overlapping pair a brute-force scan finds', () => {
    let seedState = 12345;
    const rnd = () => (seedState = (seedState * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let round = 0; round < 25; round++) {
      const n = 2 + Math.floor(rnd() * 10);
      const pts: [number, number][] = Array.from({ length: n }, () => [rnd() * 4 - 2, rnd() * 6]);
      let brute = 0;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          if (
            Math.hypot(
              (pts[i] ?? [0, 0])[0] - (pts[j] ?? [0, 0])[0],
              (pts[i] ?? [0, 0])[1] - (pts[j] ?? [0, 0])[1],
            ) < MIN_SEPARATION_M
          )
            brute++;
      expect(run(pts).s.firstPassOverlaps).toBe(brute);
    }
  });

  it('works for places away from the origin, including negative coordinates (the apron)', () => {
    const { out } = run([
      [-3.1, -4.2],
      [-3.1, -4.2],
    ]);
    expect(minDistance(out)).toBeGreaterThanOrEqual(MIN_SEPARATION_M - 1e-9);
  });
});

describe('CrewSeparation over tracks', () => {
  const person = (id: string, x: number, y: number): Actor => ({
    id,
    kind: 'PERSON',
    role: 'WORKER',
    x,
    y,
    h: 0,
    act: 'STATIONARY',
    ppeOk: true,
  });
  const frame = (bay: string, actors: Actor[]) => ({
    v: 1 as const,
    ts: '2026-11-06T10:00:00.000+06:00',
    site: 'dhk-depot',
    bay,
    actors,
  });

  function make(bayActors: Record<string, Actor[]>) {
    const tracks = new ActorTracks();
    for (const [bay, actors] of Object.entries(bayActors)) tracks.applyFrame(frame(bay, actors), 0);
    tracks.update(1000, 16, true);
    return tracks;
  }

  it('offsets only people of the same bay, and never forklifts', () => {
    const lift: Actor = {
      ...person('f-1', 1, 1),
      kind: 'FORKLIFT',
      role: 'FORKLIFT_OP',
      act: 'DRIVING',
    };
    const tracks = make({
      B01: [person('t-1', 1, 1), person('t-2', 1, 1), lift],
      B02: [person('t-3', 1, 1)],
    });
    new CrewSeparation().apply(tracks.tracks);
    const t = (id: string) => tracks.tracks.get(id) as ActorTrack;
    expect(
      Math.hypot(t('t-1').sepX - t('t-2').sepX, t('t-1').sepY - t('t-2').sepY),
    ).toBeGreaterThanOrEqual(MIN_SEPARATION_M - 1e-9);
    expect(t('t-3').sepX).toBe(0);
    expect(t('t-3').sepY).toBe(0);
    expect(t('f-1').sepX).toBe(0);
    expect(t('f-1').sepY).toBe(0);
  });

  it('drops an offset that would put a figure into a prop', () => {
    const tracks = make({ B01: [person('t-1', 1, 1), person('t-2', 1, 1)] });
    new CrewSeparation().apply(tracks.tracks, () => true);
    for (const t of tracks.tracks.values()) {
      expect(t.sepX).toBe(0);
      expect(t.sepY).toBe(0);
    }
  });

  it('clears the offset of a figure that has since gone off alone', () => {
    const tracks = make({ B01: [person('t-1', 1, 1), person('t-2', 1, 1)] });
    const sep = new CrewSeparation();
    sep.apply(tracks.tracks);
    expect(tracks.tracks.get('t-1')?.sepX !== 0 || tracks.tracks.get('t-1')?.sepY !== 0).toBe(true);
    tracks.tracks.delete('t-2');
    sep.apply(tracks.tracks);
    expect(tracks.tracks.get('t-1')?.sepX).toBe(0);
    expect(tracks.tracks.get('t-1')?.sepY).toBe(0);
  });
});

describe('speed', () => {
  // budget: 0.2 ms a frame at 40 figures. Thresholds are generous because these machines are load-sensitive; the
  // observed rate is recorded in docs/progress/t22b.md
  function crowd(perBay: number, bays: number) {
    const tracks = new ActorTracks();
    for (let b = 0; b < bays; b++) {
      const actors = Array.from({ length: perBay }, (_, i) =>
        person(`t-${b}-${i}`, (i % 4) * 0.35 - 0.5, 8 + Math.floor(i / 4) * 0.4),
      );
      tracks.applyFrame(frame(`B0${b + 1}`, actors), 0);
    }
    tracks.update(1000, 16, true);
    return tracks;
  }
  const person = (id: string, x: number, y: number): Actor => ({
    id,
    kind: 'PERSON',
    role: 'WORKER',
    x,
    y,
    h: 0,
    act: 'WALKING',
    ppeOk: true,
  });
  const frame = (bay: string, actors: Actor[]) => ({
    v: 1 as const,
    ts: '2026-11-06T10:00:00.000+06:00',
    site: 'dhk-depot',
    bay,
    actors,
  });
  const rate = (tracks: ActorTracks) => {
    const sep = new CrewSeparation();
    const once = () => {
      const t0 = performance.now();
      let calls = 0;
      while (performance.now() - t0 < 40) {
        sep.apply(tracks.tracks);
        calls++;
      }
      return calls / (performance.now() - t0);
    };
    once();
    return once();
  };

  it('40 figures in crowded bays (the 0.2 ms budget is 5 passes a millisecond; the floor here is 1)', () => {
    const calls = rate(crowd(10, 4));
    expect(calls).toBeGreaterThan(1);
  });

  it('40 figures spread over seven bays', () => {
    const calls = rate(crowd(6, 7));
    expect(calls).toBeGreaterThan(1);
  });
});
