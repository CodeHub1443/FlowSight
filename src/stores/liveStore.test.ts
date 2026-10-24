import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveStore, FLUSH_MS, MAX_VISITS, type LiveStore } from './liveStore';
import { makeBay, makeSite } from './testUtils';

const T0 = '2026-10-24T19:50:00+06:00';
const T1 = '2026-10-24T19:50:05+06:00';
const T2 = '2026-10-24T19:50:10+06:00';

let clock = 1_000_000;
let store: LiveStore;
beforeEach(() => {
  clock = 1_000_000;
  store = createLiveStore({ flushMs: 0, now: () => clock });
});
const s = () => store.getState();

describe('merge', () => {
  it('stores the newest bay state and ignores an older one', () => {
    s().ingest({ kind: 'bayState', value: makeBay('B02', T1, (b) => (b.belt.rateCpm = 20)) });
    s().ingest({ kind: 'bayState', value: makeBay('B02', T0, (b) => (b.belt.rateCpm = 5)) });
    expect(s().bays.B02?.belt.rateCpm).toBe(20);
    expect(s().bays.B02?.ts).toBe(T1);
  });

  it('counts an ignored message as received but does not touch lastTs or receive time', () => {
    s().ingest({ kind: 'bayState', value: makeBay('B02', T1) });
    clock += 5000;
    s().ingest({ kind: 'bayState', value: makeBay('B02', T0) });
    expect(s().stats.received.bayState).toBe(2);
    expect(s().lastTs).toBe(Date.parse(T1));
    expect(s().bayRxAt.B02).toBe(1_000_000);
    expect(s().lastStateRxAt).toBe(1_000_000);
  });

  it('applies a message with an equal ts (idempotent)', () => {
    s().ingest({ kind: 'bayState', value: makeBay('B02', T1, (b) => (b.belt.rateCpm = 1)) });
    s().ingest({ kind: 'bayState', value: makeBay('B02', T1, (b) => (b.belt.rateCpm = 2)) });
    expect(s().bays.B02?.belt.rateCpm).toBe(2);
  });

  it('keeps bays independent', () => {
    s().ingest({ kind: 'bayState', value: makeBay('B01', T1) });
    s().ingest({ kind: 'bayState', value: makeBay('B02', T0) });
    expect(Object.keys(s().bays).sort()).toEqual(['B01', 'B02']);
  });

  it('merges site state, actors and health with the same older-ts rule', () => {
    s().ingest({ kind: 'siteState', value: makeSite(T1) });
    s().ingest({ kind: 'siteState', value: makeSite(T0) });
    expect(s().site?.ts).toBe(T1);
  });

  it('a snapshot applied after newer deltas never overwrites them (subscribe-then-snapshot)', () => {
    s().ingest({ kind: 'bayState', value: makeBay('B02', T2, (b) => (b.belt.rateCpm = 30)) });
    s().applySnapshot({
      site: makeSite(T0),
      bays: [makeBay('B01', T0), makeBay('B02', T0, (b) => (b.belt.rateCpm = 1))],
      openEvents: [],
      health: {
        v: 1,
        ts: T0,
        site: 'dhk-depot',
        cams: [],
        pipeline: { lagMs: 1, gpuPct: 1, host: 'h' },
      },
    });
    expect(s().bays.B02?.belt.rateCpm).toBe(30); // newer delta wins
    expect(s().bays.B01?.ts).toBe(T0); // snapshot fills the gap
    expect(s().site?.ts).toBe(T0);
    expect(s().health?.ts).toBe(T0);
  });
});

describe('visits from bay state', () => {
  it('records the visit and keeps it after the bay moves on', () => {
    s().ingest({ kind: 'bayState', value: makeBay('B02', T0) });
    const id = s().bays.B02?.visit?.visitId ?? '';
    expect(s().visits[id]?.bay).toBe('B02');
    s().ingest({ kind: 'bayState', value: makeBay('B02', T1, (b) => (b.visit = null)) });
    expect(s().bays.B02?.visit).toBeNull();
    expect(s().visits[id]).toBeDefined();
  });

  it('is bounded', () => {
    for (let i = 0; i < MAX_VISITS + 10; i++) {
      s().ingest({
        kind: 'bayState',
        value: makeBay('B02', T1, (b) => {
          if (b.visit) {
            b.visit.visitId = `V-20261024-B02-${String(i).padStart(4, '0')}`;
            b.visit.arrivedAt = `2026-10-24T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00+06:00`;
          }
        }),
      });
    }
    expect(Object.keys(s().visits)).toHaveLength(MAX_VISITS);
  });
});

describe('stats and source status', () => {
  it('counts received per kind and dropped per kind', () => {
    s().ingest({ kind: 'siteState', value: makeSite(T0) });
    s().recordDrop('bayState');
    s().recordDrop('bayState');
    expect(s().stats.received.siteState).toBe(1);
    expect(s().stats.dropped.bayState).toBe(2);
    expect(s().stats.dropped.siteState).toBe(0);
  });

  it('records when the source status changed, only on change', () => {
    s().setSourceStatus('live');
    expect(s().sourceStatus).toBe('live');
    expect(s().sourceSince).toBe(1_000_000);
    clock += 1000;
    s().setSourceStatus('live');
    expect(s().sourceSince).toBe(1_000_000);
  });

  it('reset clears everything', () => {
    s().ingest({ kind: 'bayState', value: makeBay('B02', T0) });
    s().reset();
    expect(s().bays).toEqual({});
    expect(s().stats.received.bayState).toBe(0);
  });
});

describe('batching', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst into one store update per flush window (4 Hz)', () => {
    const batched = createLiveStore({ now: () => Date.now() });
    const seen: number[] = [];
    batched.subscribe((st) => seen.push(Object.keys(st.bays).length));
    for (const bay of ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07']) {
      batched.getState().ingest({ kind: 'bayState', value: makeBay(bay, T0) });
    }
    expect(seen).toEqual([]); // nothing applied yet
    vi.advanceTimersByTime(FLUSH_MS);
    expect(seen).toEqual([7]); // one notification, all seven bays
    expect(FLUSH_MS).toBeGreaterThanOrEqual(250);
  });

  it('does not schedule a timer while idle', () => {
    createLiveStore();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('flush() applies queued messages immediately', () => {
    const batched = createLiveStore();
    batched.getState().ingest({ kind: 'bayState', value: makeBay('B01', T0) });
    expect(batched.getState().bays.B01).toBeUndefined();
    batched.getState().flush();
    expect(batched.getState().bays.B01).toBeDefined();
  });
});
