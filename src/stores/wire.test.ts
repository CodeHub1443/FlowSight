import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_TICK_MS, FixtureSource } from '@/data/fixture/FixtureSource';
import { safeParseMessage } from '@/domain';
import { createAlertStore, type AlertStore } from './alertStore';
import { createLiveStore, type LiveStore } from './liveStore';
import { wireDataSource } from './wire';

let live: LiveStore;
let alerts: AlertStore;
beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-24T14:00:00Z') });
  live = createLiveStore({ flushMs: 0 });
  alerts = createAlertStore();
});
afterEach(() => vi.useRealTimers());

describe('wireDataSource', () => {
  it('feeds the fixture source into the stores', async () => {
    const src = new FixtureSource({ mode: 'mock', siteId: 'dhk-depot', baseUrl: '' });
    const unwire = wireDataSource(src, { live, alerts });
    await src.connect();
    await vi.advanceTimersByTimeAsync(FIXTURE_TICK_MS);

    const l = live.getState();
    expect(l.sourceStatus).toBe('live');
    expect(Object.keys(l.bays).sort()).toEqual(['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07']);
    expect(Object.keys(l.actors)).toHaveLength(7);
    expect(l.site).not.toBeNull();
    expect(l.health).not.toBeNull();
    expect(l.stats.received.bayState).toBe(1 + 7 * 2);
    expect(l.stats.received.event).toBe(1);
    expect(Object.values(l.stats.dropped).reduce((a, b) => a + b, 0)).toBe(0);
    expect(Object.keys(alerts.getState().events)).toHaveLength(1);
    // The lifecycle fixture ACKs the fixture event.
    expect(Object.values(alerts.getState().events)[0]?.status).toBe('ACK');

    unwire();
    await src.disconnect();
  });

  it('counts messages dropped at the validation boundary', () => {
    const src = new FixtureSource({ mode: 'mock', siteId: 'dhk-depot', baseUrl: '' });
    const unwire = wireDataSource(src, { live, alerts });
    expect(safeParseMessage('bayState', { v: 2 }).ok).toBe(false);
    expect(safeParseMessage('bayState', null).ok).toBe(false);
    expect(live.getState().stats.dropped.bayState).toBe(2);
    unwire();
    expect(safeParseMessage('bayState', { v: 2 }).ok).toBe(false);
    expect(live.getState().stats.dropped.bayState).toBe(2); // handler removed
  });

  it('stops delivering after unwire', async () => {
    const src = new FixtureSource({ mode: 'mock', siteId: 'dhk-depot', baseUrl: '' });
    const unwire = wireDataSource(src, { live, alerts });
    unwire();
    await src.connect();
    expect(live.getState().stats.received.bayState).toBe(0);
    await src.disconnect();
  });
});
