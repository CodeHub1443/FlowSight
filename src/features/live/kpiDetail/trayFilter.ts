import { createStore, useStore } from 'zustand';
import { uiStore } from '@/stores';
import type { AlertGroupId } from './selectors';

// The Alerts tray's group filter (Task 19 spec 5A). Minimal UI state shared by the alerts popover (writer) and
// Tray.tsx (reader); deliberately not in src/stores (spec 5A, section 6). It lives here, not in Tray.tsx, because
// Tray.tsx may only export components (react-refresh/only-export-components).
//
// AlertFilter.categories cannot express a group: groups split categories by type (idle = belt.empty_run +
// security.door_open_idle; security = the rest of security.*). The tray keeps its role-filtered useOpenAlerts()
// list and narrows it with the 19.0 predicate matchesAlertGroup.

interface TrayFilterState {
  /** Active group, or null for every open alert. */
  group: AlertGroupId | null;
  /** Bumped on every "open the tray for a group" request; the tray uses it to re-open a collapsed panel. */
  openRequest: number;
}

export const trayFilterStore = createStore<TrayFilterState>(() => ({
  group: null,
  openRequest: 0,
}));

/** Show the Alerts tab of the tray, expanded, narrowed to one alert group. */
export function openAlertsTrayForGroup(group: AlertGroupId): void {
  uiStore.getState().setTrayTab('alerts');
  trayFilterStore.setState((s) => ({ group, openRequest: s.openRequest + 1 }));
}

export function clearTrayAlertGroup(): void {
  if (trayFilterStore.getState().group !== null) trayFilterStore.setState({ group: null });
}

export const useTrayAlertGroup = (): AlertGroupId | null =>
  useStore(trayFilterStore, (s) => s.group);

export const useTrayOpenRequest = (): number => useStore(trayFilterStore, (s) => s.openRequest);

/** Test helper: back to no filter. */
export function resetTrayFilter(): void {
  trayFilterStore.setState({ group: null, openRequest: 0 });
}
