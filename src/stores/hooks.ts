import { useMemo, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import type { ConnStatus } from '@/data/DataSource';
import type { BayState, EventStatus, SiteState, WhEventWithStatus } from '@/domain';
import { filterAlerts, type AlertFilter, type EventCategory } from './alertFilter';
import { alertStore, selectUnreadCount, type AlertState } from './alertStore';
import { clockNow, subscribeClock } from './clock';
import { liveStore, type LiveState } from './liveStore';
import { sessionStore, type SessionState } from './sessionStore';
import { deriveConnStatus, isBayStale } from './staleness';
import { uiStore, type UiState } from './uiStore';

export const useLiveStore = <T>(selector: (s: LiveState) => T): T => useStore(liveStore, selector);
export const useAlertStore = <T>(selector: (s: AlertState) => T): T =>
  useStore(alertStore, selector);
export const useUiStore = <T>(selector: (s: UiState) => T): T => useStore(uiStore, selector);
export const useKpiRowBottom = (): number | null => useUiStore((s) => s.kpiRowBottom);
export const useSessionStore = <T>(selector: (s: SessionState) => T): T =>
  useStore(sessionStore, selector);

export function useBay(bayId: string): BayState | undefined {
  return useLiveStore((s) => s.bays[bayId]);
}

/** All bays, ordered by id. Re-renders when any bay changes (at most 4 Hz). */
export function useBays(): BayState[] {
  const bays = useLiveStore((s) => s.bays);
  return useMemo(() => Object.values(bays).sort((a, b) => a.bay.localeCompare(b.bay)), [bays]);
}

export function useSiteState(): SiteState | null {
  return useLiveStore((s) => s.site);
}

export function useSiteKpi(): SiteState['kpi'] | null {
  return useLiveStore((s) => s.site?.kpi ?? null);
}

/** Open (not closed) alerts, newest first. `role` defaults to the session role. */
export function useOpenAlerts(filter: AlertFilter = {}): WhEventWithStatus[] {
  const events = useAlertStore((s) => s.events);
  const sessionRole = useSessionStore((s) => s.role);
  const role = filter.role ?? sessionRole;
  const categories = filter.categories?.join(',');
  const statuses = filter.statuses?.join(',');
  const { bay } = filter;
  return useMemo(
    () =>
      filterAlerts(Object.values(events), {
        role,
        bay,
        ...(categories === undefined
          ? {}
          : { categories: categories.split(',').filter(Boolean) as EventCategory[] }),
        ...(statuses === undefined
          ? {}
          : { statuses: statuses.split(',').filter(Boolean) as EventStatus[] }),
      }),
    [events, role, bay, categories, statuses],
  );
}

/** Unread alerts the session role is allowed to see. */
export function useUnreadAlertCount(): number {
  const unread = useAlertStore((s) => s.unreadIds);
  const events = useAlertStore((s) => s.events);
  const role = useSessionStore((s) => s.role);
  return useMemo(
    () => selectUnreadCount({ unreadIds: unread, events }, { role }),
    [unread, events, role],
  );
}

// Staleness is a ticking selector: the store changes at most 4 Hz and a shared 1 Hz clock re-evaluates the
// derived value. useSyncExternalStore only re-renders when the primitive result changes.
function subscribeLiveAndClock(cb: () => void): () => void {
  const a = liveStore.subscribe(cb);
  const b = subscribeClock(cb);
  return () => {
    a();
    b();
  };
}

function connSnapshot(): ConnStatus {
  const s = liveStore.getState();
  return deriveConnStatus(s.sourceStatus, s.lastStateRxAt, s.sourceSince, clockNow());
}

/** connecting | live | degraded (no state for 10 s) | offline (no state for 30 s, or source offline). */
export function useConnStatus(): ConnStatus {
  return useSyncExternalStore(subscribeLiveAndClock, connSnapshot, connSnapshot);
}

/** True when this bay has had no update for more than 15 s (or never). */
export function useBayStale(bayId: string): boolean {
  return useSyncExternalStore(
    subscribeLiveAndClock,
    () => isBayStale(liveStore.getState().bayRxAt[bayId], clockNow()),
    () => true,
  );
}

const SEC_MS = 1000;
const floorSec = (ms: number) => Math.floor(ms / SEC_MS) * SEC_MS;
const wallSecSnapshot = () => floorSec(clockNow());
const noWall = () => 0;

/**
 * "Now" for elapsed counters (truck timeline "so far"), epoch ms floored to the whole second, so a component
 * re-renders at most once per second. Stream time: the newest message timestamp (correct under replay and mock
 * speed-up); before the first message it falls back to the shared 1 Hz wall clock. No per-component timers.
 * It stands still while the stream is silent (the data is stale then; the staleness badge says so).
 */
export function useNow1Hz(): number {
  const streamSec = useLiveStore((s) => (s.lastTs === null ? null : floorSec(s.lastTs)));
  const snapshot = streamSec === null ? wallSecSnapshot : noWall;
  const wall = useSyncExternalStore(subscribeClock, snapshot, snapshot);
  return streamSec ?? wall;
}
