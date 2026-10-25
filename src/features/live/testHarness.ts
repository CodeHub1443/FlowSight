import { render } from '@testing-library/react';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import i18n from '@/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { alertStore, liveStore, sessionStore, uiStore, type LiveMessage } from '@/stores';
import type { Role } from '@/domain';

// Test-only helpers for the live screen (no runtime use).

export const T0 = '2026-10-24T19:50:00+06:00';

/** Radix popper/dropdowns need a few browser APIs jsdom lacks. Call once per test file that opens a menu. */
export function stubBrowserApis(): void {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}

/** Reset every store the live screen reads, and pin the language. */
export async function resetStores(role: Role = 'DC_MANAGER', lang: 'en' | 'bn' = 'en') {
  liveStore.getState().reset();
  alertStore.getState().reset();
  sessionStore.getState().setMockRole(role);
  uiStore.setState({ selection: null, cameraTarget: null, trayTab: 'bays' });
  await i18n.changeLanguage(lang);
}

/** Ingest messages and apply them immediately. */
export function push(...msgs: LiveMessage[]): void {
  for (const m of msgs) liveStore.getState().ingest(m);
  liveStore.getState().flush();
}

export function renderWithProviders(ui: ReactElement, path = '/live') {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(TooltipProvider, null, children),
    );
  return render(ui, { wrapper });
}
