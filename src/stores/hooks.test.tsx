import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeBay, subscribeActors, getBay, getActors } from './accessors';
import { alertStore } from './alertStore';
import { liveStore } from './liveStore';
import { sessionStore } from './sessionStore';
import { useBay, useBays, useBayStale, useConnStatus, useOpenAlerts, useSiteKpi } from './hooks';
import { makeBay, makeEvent, makeSite, ulid } from './testUtils';

const T0 = '2026-10-24T19:50:00+06:00';
const T1 = '2026-10-24T19:50:05+06:00';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-24T14:00:00Z') });
  liveStore.getState().reset();
  alertStore.getState().reset();
  sessionStore.getState().setMockRole('DC_MANAGER');
});
afterEach(() => vi.useRealTimers());

const push = (fn: () => void) =>
  act(() => {
    fn();
    liveStore.getState().flush();
  });

describe('hooks', () => {
  it('useBay / useBays / useSiteKpi follow the store', () => {
    const bay = renderHook(() => useBay('B02'));
    const bays = renderHook(() => useBays());
    const kpi = renderHook(() => useSiteKpi());
    expect(bay.result.current).toBeUndefined();
    expect(kpi.result.current).toBeNull();

    push(() => {
      liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B02', T0) });
      liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B01', T0) });
      liveStore.getState().ingest({ kind: 'siteState', value: makeSite(T0) });
    });
    expect(bay.result.current?.bay).toBe('B02');
    expect(bays.result.current.map((b) => b.bay)).toEqual(['B01', 'B02']);
    expect(kpi.result.current?.baysTotal).toBe(7);
  });

  it('useBay does not re-render when another bay changes', () => {
    push(() => liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B02', T0) }));
    let renders = 0;
    renderHook(() => {
      renders++;
      return useBay('B02');
    });
    const before = renders;
    push(() => liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B03', T1) }));
    expect(renders).toBe(before);
  });

  it('useOpenAlerts defaults to the session role and honours an explicit filter', () => {
    act(() => {
      alertStore.getState().ingestEvent(makeEvent(ulid(1)));
      alertStore.getState().ingestEvent(
        makeEvent(ulid(2), {
          category: 'roster',
          type: 'captain_absent',
          data: { employeeId: null, minutes: 3 },
        }),
      );
    });
    const all = renderHook(() => useOpenAlerts());
    const bayOnly = renderHook(() => useOpenAlerts({ categories: ['roster'] }));
    expect(all.result.current).toHaveLength(2);
    expect(bayOnly.result.current).toHaveLength(1);
    act(() => sessionStore.getState().setMockRole('KIOSK'));
    expect(all.result.current.map((e) => e.category)).toEqual(['hygiene']);
    expect(bayOnly.result.current).toHaveLength(0);
  });

  it('returns a stable array while nothing changed', () => {
    act(() => alertStore.getState().ingestEvent(makeEvent(ulid(1))));
    const { result, rerender } = renderHook(() => useOpenAlerts({ categories: ['hygiene'] }));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('staleness (ticking selector)', () => {
  it('goes live -> degraded after 10 s -> offline after 30 s with no state message', () => {
    const conn = renderHook(() => useConnStatus());
    expect(conn.result.current).toBe('offline');
    push(() => {
      liveStore.getState().setSourceStatus('live');
      liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B02', T0) });
    });
    expect(conn.result.current).toBe('live');

    act(() => vi.advanceTimersByTime(9_000));
    expect(conn.result.current).toBe('live');
    act(() => vi.advanceTimersByTime(2_000));
    expect(conn.result.current).toBe('degraded');
    act(() => vi.advanceTimersByTime(20_000));
    expect(conn.result.current).toBe('offline');

    push(() => liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B02', T1) }));
    expect(conn.result.current).toBe('live');
  });

  it('marks a bay stale after 15 s without an update, other bays unaffected', () => {
    push(() => {
      liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B01', T0) });
      liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B02', T0) });
    });
    const b1 = renderHook(() => useBayStale('B01'));
    const b2 = renderHook(() => useBayStale('B02'));
    const b9 = renderHook(() => useBayStale('B09'));
    expect([b1.result.current, b2.result.current, b9.result.current]).toEqual([false, false, true]);
    act(() => vi.advanceTimersByTime(10_000));
    push(() => liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B02', T1) }));
    act(() => vi.advanceTimersByTime(6_000));
    expect(b1.result.current).toBe(true);
    expect(b2.result.current).toBe(false);
  });

  it('runs no timer once nothing is subscribed', () => {
    const { unmount } = renderHook(() => useConnStatus());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('non-React accessors for the 3D', () => {
  it('getBay / subscribeBay fire only for that bay', () => {
    const seen: (string | undefined)[] = [];
    const unsub = subscribeBay('B02', (b) => seen.push(b?.ts));
    push(() => liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B01', T0) }));
    expect(seen).toEqual([]);
    push(() => liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B02', T0) }));
    expect(seen).toEqual([T0]);
    expect(getBay('B02')?.ts).toBe(T0);
    unsub();
    push(() => liveStore.getState().ingest({ kind: 'bayState', value: makeBay('B02', T1) }));
    expect(seen).toEqual([T0]);
  });

  it('getActors / subscribeActors fire only for that bay', () => {
    const seen: (string | undefined)[] = [];
    subscribeActors('B02', (f) => seen.push(f?.ts));
    const frame = (bay: string, ts: string) => ({
      v: 1 as const,
      ts,
      site: 'dhk-depot',
      bay,
      actors: [],
    });
    push(() => liveStore.getState().ingest({ kind: 'actors', value: frame('B03', T0) }));
    push(() => liveStore.getState().ingest({ kind: 'actors', value: frame('B02', T0) }));
    expect(seen).toEqual([T0]);
    expect(getActors('B02')?.ts).toBe(T0);
  });
});
