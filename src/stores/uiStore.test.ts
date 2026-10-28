import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREF_KEYS, readPref, writePref } from './prefs';
import { createSessionStore, MOCK_USERS } from './sessionStore';
import { createUiStore } from './uiStore';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('uiStore', () => {
  it('has sensible defaults', () => {
    const s = createUiStore().getState();
    expect(s).toMatchObject({
      selection: null,
      cameraTarget: null,
      xray: false,
      labels: true,
      quality: 'auto',
      language: 'en',
      theme: 'light',
      trayTab: 'bays',
    });
  });

  it('selection, x-ray, labels, quality and tray tab are plain state', () => {
    const store = createUiStore();
    store.getState().select({ kind: 'bay', id: 'B02' });
    store.getState().setXray(true);
    store.getState().setLabels(false);
    store.getState().setQuality('low');
    store.getState().setTrayTab('alerts');
    expect(store.getState()).toMatchObject({
      selection: { kind: 'bay', id: 'B02' },
      xray: true,
      labels: false,
      quality: 'low',
      trayTab: 'alerts',
    });
  });

  it('flying to the same target twice produces a new request each time', () => {
    const store = createUiStore();
    store.getState().flyTo('bay', 'B02');
    const first = store.getState().cameraTarget;
    store.getState().flyTo('bay', 'B02');
    expect(store.getState().cameraTarget).toEqual({ ...first, seq: (first?.seq ?? 0) + 1 });
  });

  it('persists language and theme, and a new store reads them back', () => {
    const a = createUiStore();
    a.getState().setLanguage('bn');
    a.getState().setTheme('dark');
    expect(localStorage.getItem(PREF_KEYS.language)).toBe('bn');
    expect(localStorage.getItem(PREF_KEYS.theme)).toBe('dark');
    const b = createUiStore().getState();
    expect(b.language).toBe('bn');
    expect(b.theme).toBe('dark');
  });

  it('persists nothing else', () => {
    const store = createUiStore();
    store.getState().select({ kind: 'bay', id: 'B02' });
    store.getState().setQuality('high');
    expect(localStorage.length).toBe(0);
  });

  it('ignores garbage in storage', () => {
    localStorage.setItem(PREF_KEYS.language, 'klingon');
    localStorage.setItem(PREF_KEYS.theme, 'neon');
    const s = createUiStore().getState();
    expect([s.language, s.theme]).toEqual(['en', 'light']);
  });

  it('works when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readPref('x')).toBeNull();
    expect(() => writePref('x', 'y')).not.toThrow();
    const store = createUiStore();
    expect(() => store.getState().setLanguage('bn')).not.toThrow();
    expect(store.getState().language).toBe('bn');
  });
});

describe('sessionStore', () => {
  it('defaults to a mock DC manager and switches user with the role', () => {
    const store = createSessionStore();
    expect(store.getState().role).toBe('DC_MANAGER');
    store.getState().setMockRole('KIOSK');
    expect(store.getState().user).toBe(MOCK_USERS.KIOSK);
    expect(store.getState().role).toBe('KIOSK');
  });

  it('has one mock user per role and stores nothing in localStorage', () => {
    expect(Object.keys(MOCK_USERS)).toHaveLength(6);
    for (const [role, user] of Object.entries(MOCK_USERS)) expect(user.role).toBe(role);
    createSessionStore().getState().setMockRole('ADMIN');
    expect(localStorage.length).toBe(0);
  });
});
