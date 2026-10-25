// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Unsub } from '../DataSource';
import type { MessageKind } from '@/domain';
import type { Cmd, Evt } from './core/controller';
import { PEAK } from './core/testing';
import { MIN } from './core/clock';
import { MockSource } from './MockSource';
import { InlineHost, SimRuntime, type SimHost } from './runtime';

const OPTS = { mode: 'mock', siteId: 'dhk-depot', baseUrl: '' } as const;
const INIT = { seed: 1, scenario: 'peak', speed: 1, startMs: PEAK } as const;

function tally(source: MockSource) {
  const counts: Record<MessageKind, number> = {
    siteState: 0,
    bayState: 0,
    actors: 0,
    case: 0,
    event: 0,
    lifecycle: 0,
    health: 0,
  };
  const unsubs: Unsub[] = [
    source.onSiteState(() => counts.siteState++),
    source.onBayState(() => counts.bayState++),
    source.onActors(() => counts.actors++),
    source.onCase(() => counts.case++),
    source.onEvent(() => counts.event++),
    source.onLifecycle(() => counts.lifecycle++),
    source.onHealth(() => counts.health++),
  ];
  return { counts, off: () => unsubs.forEach((u) => u()) };
}

describe('MockSource (manual clock)', { timeout: 60_000 }, () => {
  let host: InlineHost;
  let runtime: SimRuntime;
  let source: MockSource;

  beforeEach(() => {
    host = new InlineHost({ autoTick: false, now: () => PEAK });
    runtime = new SimRuntime(host);
    source = new MockSource(OPTS, runtime);
  });
  afterEach(async () => {
    await source.disconnect();
    runtime.dispose();
  });

  it('goes connecting -> live, then delivers the snapshot and the live feed, all validated', async () => {
    await runtime.ensure(INIT);
    const seen: string[] = [];
    source.status.subscribe((s) => seen.push(s));
    expect(source.status.get()).toBe('offline');
    const { counts } = tally(source);
    await source.connect();
    expect(seen).toEqual(['connecting', 'live']);
    // snapshot burst: 1 site, 7 bays, 7 actor frames, 1 health
    expect(counts).toMatchObject({ siteState: 1, bayState: 7, actors: 7, health: 1, case: 0 });
    host.controller.advance(3 * MIN);
    expect(counts.case).toBeGreaterThan(20);
    expect(counts.bayState).toBeGreaterThan(50);
    expect(counts.siteState).toBeGreaterThan(50);
    expect(source.control.get().dropped).toBe(0);
    expect(source.control.get().ready).toBe(true);
    expect(source.control.get().simNow).toBeGreaterThan(PEAK);
    expect(source.control.get().historyMs).toBeGreaterThan(0);
    expect(source.mode).toBe('mock');
  });

  it('is idempotent to connect twice and stops delivering after disconnect', async () => {
    await runtime.ensure(INIT);
    const { counts } = tally(source);
    await Promise.all([source.connect(), source.connect()]);
    expect(counts.siteState).toBe(1);
    await source.disconnect();
    expect(source.status.get()).toBe('offline');
    host.controller.advance(MIN);
    expect(counts.bayState).toBe(7);
  });

  it('trigger() emits a valid event of the category', async () => {
    await runtime.ensure(INIT);
    const events: { category: string; type: string }[] = [];
    source.onEvent((e) => events.push(e));
    await source.connect();
    for (const c of [
      'truck',
      'belt',
      'hygiene',
      'handling',
      'ppe',
      'compliance',
      'roster',
      'staging',
      'security',
      'system',
    ]) {
      const before = events.length;
      source.trigger(c);
      expect(events.length, c).toBeGreaterThan(before);
      expect(events.at(-1)?.category, c).toBe(c);
    }
    expect(source.control.get().dropped).toBe(0);
  });

  it('setSeed restarts the depot with a new history and re-sends the snapshot', async () => {
    await runtime.ensure(INIT);
    const plates: string[] = [];
    source.onBayState((b) => b.visit && plates.push(b.visit.plate.en));
    const { counts } = tally(source);
    await source.connect();
    const first = [...plates];
    expect(first.length).toBeGreaterThan(0);
    await source.setSeed(99);
    expect(source.control.get()).toMatchObject({ seed: 99, ready: true });
    expect(runtime.info?.seed).toBe(99);
    expect(counts.siteState).toBe(2);
    expect(plates.slice(first.length)).not.toEqual(first);
  });

  it('setScenario switches the start day', async () => {
    await runtime.ensure(INIT);
    await source.connect();
    await source.setScenario('now');
    expect(runtime.info?.scenario).toBe('now');
    expect(runtime.info?.startMs).toBe(Math.floor(PEAK / 5000) * 5000);
  });
});

describe('MockSource (real-time loop)', { timeout: 60_000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(PEAK);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs at 1x / 10x / 60x, pauses and resumes, and reports message rates', async () => {
    const host = new InlineHost({ now: () => Date.now() });
    const runtime = new SimRuntime(host);
    const source = new MockSource(OPTS, runtime);
    await runtime.ensure(INIT);
    await source.connect();
    const sim = () => source.control.get().simNow;
    const t0 = sim();

    vi.advanceTimersByTime(10_000);
    const at1x = sim() - t0;
    expect(at1x).toBeGreaterThanOrEqual(9000);
    expect(at1x).toBeLessThanOrEqual(10_500);

    source.setSpeed(10);
    const t1 = sim();
    vi.advanceTimersByTime(10_000);
    expect(sim() - t1).toBeGreaterThanOrEqual(90_000);

    source.setSpeed(60);
    const t2 = sim();
    vi.advanceTimersByTime(5000);
    expect(sim() - t2).toBeGreaterThanOrEqual(290_000);

    // message rates are per wall-clock second, so 60x does not flood the main thread
    const r = source.control.get().rates;
    expect(r.bayState).toBeGreaterThan(0);
    expect(r.actors).toBeGreaterThan(0);
    expect(r.actors).toBeLessThan(200);

    source.setPaused(true);
    const tp = sim();
    vi.advanceTimersByTime(10_000);
    expect(sim()).toBe(tp);
    expect(source.control.get().paused).toBe(true);
    source.play(1);
    expect(source.control.get()).toMatchObject({ paused: false, speed: 1 });
    vi.advanceTimersByTime(5000);
    expect(sim()).toBeGreaterThan(tp);

    await source.disconnect();
    runtime.dispose();
  });
});

describe('MockSource validation at the boundary', () => {
  class BadHost implements SimHost {
    private readonly subs = new Set<(e: Evt) => void>();
    post(cmd: Cmd): void {
      const emit = (e: Evt) => this.subs.forEach((cb) => cb(e));
      if (cmd.t === 'init') {
        emit({
          t: 'ready',
          info: { seed: 1, scenario: 'peak', startMs: PEAK, historyMs: 1, visits: 0, events: 0 },
        });
      }
      if (cmd.t === 'connect') {
        const tick = {
          v: 1,
          ts: '2026-10-24T19:20:00.000+06:00',
          site: 'dhk-depot',
          bay: 'B01',
          dir: 'OUT',
          sku: 'RIN-PB-1KG',
          pack: 'SACK',
          conf: 0.9,
          flag: null,
        };
        emit({
          t: 'msgs',
          simNow: PEAK,
          items: [
            { kind: 'case', value: tick },
            { kind: 'case', value: { ...tick, pack: 'PALLET' } }, // closed enum
            { kind: 'case', value: { ...tick, ts: '2026-10-24T19:20:00' } }, // no offset
            { kind: 'bayState', value: { v: 1 } },
          ] as never,
        });
      }
    }
    subscribe(cb: (e: Evt) => void): Unsub {
      this.subs.add(cb);
      return () => this.subs.delete(cb);
    }
    terminate(): void {}
  }

  it('drops and counts invalid messages instead of throwing them into the UI', async () => {
    const source = new MockSource(OPTS, new SimRuntime(new BadHost()));
    const { counts } = tally(source);
    await source.connect();
    expect(counts.case).toBe(1);
    expect(counts.bayState).toBe(0);
    expect(source.control.get().dropped).toBe(3);
    await source.disconnect();
  });
});
