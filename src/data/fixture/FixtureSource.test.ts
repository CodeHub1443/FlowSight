import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActorsFrameSchema,
  BayStateSchema,
  HealthFrameSchema,
  setDropHandler,
  SiteStateSchema,
  type ActorsFrame,
  type BayState,
  type HealthFrame,
  type SiteState,
} from '@/domain';
import { createDataSource, NotImplementedError } from '../DataSource';
import { FIXTURE_TICK_MS, FixtureSource } from './FixtureSource';

const opts = { mode: 'mock', siteId: 'dhk-depot', baseUrl: '' } as const;

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-24T14:00:00Z') }));
afterEach(() => {
  setDropHandler(null);
  vi.useRealTimers();
});

describe('FixtureSource', () => {
  it('emits only schema-valid messages for all seven bays, with nothing dropped', async () => {
    const drops: unknown[] = [];
    setDropHandler((d) => drops.push(d));
    const src = new FixtureSource(opts);
    const bays: BayState[] = [];
    const sites: SiteState[] = [];
    const actors: ActorsFrame[] = [];
    const health: HealthFrame[] = [];
    const counts = { case: 0, event: 0, lifecycle: 0 };
    src.onBayState((b) => bays.push(b));
    src.onSiteState((s) => sites.push(s));
    src.onActors((a) => actors.push(a));
    src.onHealth((h) => health.push(h));
    src.onCase(() => counts.case++);
    src.onEvent(() => counts.event++);
    src.onLifecycle(() => counts.lifecycle++);

    await src.connect();
    await vi.advanceTimersByTimeAsync(FIXTURE_TICK_MS * 5);
    await src.disconnect();

    expect(drops).toEqual([]);
    expect(new Set(bays.map((b) => b.bay))).toEqual(
      new Set(['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07']),
    );
    // 1 verbatim fixture + (1 connect sweep + 5 ticks) x 7 bays
    expect(bays).toHaveLength(1 + 6 * 7);
    expect(counts).toEqual({ case: 1, event: 1, lifecycle: 1 });

    // Round-trip: what listeners received still passes the schemas.
    for (const b of bays) expect(BayStateSchema.safeParse(b).success).toBe(true);
    for (const s of sites) expect(SiteStateSchema.safeParse(s).success).toBe(true);
    for (const a of actors) expect(ActorsFrameSchema.safeParse(a).success).toBe(true);
    for (const h of health) expect(HealthFrameSchema.safeParse(h).success).toBe(true);
  });

  it('varies bay id, visit and status deterministically', async () => {
    const run = async () => {
      vi.setSystemTime(new Date('2026-10-24T14:00:00Z'));
      const src = new FixtureSource(opts);
      const last: Record<string, BayState> = {};
      src.onBayState((b) => (last[b.bay] = b));
      await src.connect();
      await src.disconnect();
      return last;
    };
    const a = await run();
    const b = await run();
    expect(a).toEqual(b);

    expect(a.B01?.visit).toBeNull();
    expect(a.B02?.visit?.phase).toBe('LOADING');
    expect(a.B03?.visit?.phase).toBe('ARRIVED');
    expect(a.B04?.visit?.phase).toBe('UNLOADING');
    expect(a.B05?.visit?.phase).toBe('FINISHED');
    expect(a.B06?.belt.status).toBe('RUNNING_EMPTY');
    expect(a.B07?.visit?.phase).toBe('DOCKED');
    const ids = Object.values(a).flatMap((x) => (x.visit ? [x.visit.visitId] : []));
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(a.B06?.health.cams ?? {}).sort()).toEqual([
      'B06-BELT',
      'B06-CREW',
      'B06-DOCK',
    ]);
  });

  it('re-emits with newer timestamps every 2 s', async () => {
    const src = new FixtureSource(opts);
    const ts: string[] = [];
    src.onSiteState((s) => ts.push(s.ts));
    await src.connect();
    await vi.advanceTimersByTimeAsync(FIXTURE_TICK_MS * 2);
    await src.disconnect();
    const swept = ts.slice(1).map((t) => Date.parse(t));
    expect(swept).toHaveLength(3);
    expect(swept.slice(1).map((t, i) => t - (swept[i] ?? 0))).toEqual([
      FIXTURE_TICK_MS,
      FIXTURE_TICK_MS,
    ]);
  });

  it('reports status, stops on disconnect and can reconnect', async () => {
    const src = new FixtureSource(opts);
    const seen: string[] = [];
    src.status.subscribe((s) => seen.push(s));
    expect(src.status.get()).toBe('offline');
    await src.connect();
    expect(src.status.get()).toBe('live');
    await src.disconnect();
    expect(src.status.get()).toBe('offline');
    expect(vi.getTimerCount()).toBe(0);
    await src.connect();
    expect(src.status.get()).toBe('live');
    await src.disconnect();
    expect(seen).toEqual(['connecting', 'live', 'offline', 'connecting', 'live', 'offline']);
  });

  it('a throwing listener does not stop the others', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const src = new FixtureSource(opts);
    let got = 0;
    src.onBayState(() => {
      throw new Error('boom');
    });
    src.onBayState(() => got++);
    await src.connect();
    await src.disconnect();
    expect(got).toBeGreaterThan(0);
    err.mockRestore();
  });
});

describe('createDataSource', () => {
  it('mock mode returns the fixture source', () => {
    const src = createDataSource(opts);
    expect(src).toBeInstanceOf(FixtureSource);
    expect(src.mode).toBe('mock');
  });

  it.each(['live', 'replay'] as const)('%s mode throws a typed NotImplementedError', (mode) => {
    expect(() => createDataSource({ ...opts, mode })).toThrow(NotImplementedError);
    try {
      createDataSource({ ...opts, mode });
    } catch (e) {
      expect(e).toBeInstanceOf(NotImplementedError);
      expect((e as NotImplementedError).feature).toContain(mode);
    }
  });
});
