import { createStore, type StoreApi } from 'zustand';
import type { UiLang } from '@/domain';
import { PREF_KEYS, readPref, writePref } from './prefs';

export type SelectionKind =
  'site' | 'bay' | 'belt' | 'truck' | 'person' | 'forklift' | 'staging' | 'event';
export interface Selection {
  kind: SelectionKind;
  id: string;
}

/** Where the 3D camera should fly. `seq` changes on every request so flying to the same target twice still fires. */
export interface CameraTarget {
  kind: SelectionKind | 'home';
  id: string | null;
  seq: number;
}

export type QualityTier = 'high' | 'med' | 'low';
/** 'auto' lets the scene step tiers itself (TierGovernor); a tier pins it. */
export type QualitySetting = QualityTier | 'auto';
export type Theme = 'light' | 'dark';
export type TrayTab = 'bays' | 'trucks' | 'alerts' | 'captains';

export interface UiData {
  selection: Selection | null;
  cameraTarget: CameraTarget | null;
  xray: boolean;
  labels: boolean;
  quality: QualitySetting;
  /** Persisted (UI preference only). */
  language: UiLang;
  /** Persisted (UI preference only). */
  theme: Theme;
  trayTab: TrayTab;
  /** Viewport-relative bottom edge (px) of the /live KPI row, or null when it is not mounted (t22b.4). */
  kpiRowBottom: number | null;
}

export interface UiActions {
  select(selection: Selection | null): void;
  flyTo(kind: CameraTarget['kind'], id?: string | null): void;
  setXray(on: boolean): void;
  setLabels(on: boolean): void;
  setQuality(quality: QualitySetting): void;
  setLanguage(lang: UiLang): void;
  setTheme(theme: Theme): void;
  setTrayTab(tab: TrayTab): void;
  setKpiRowBottom(bottom: number | null): void;
}

export type UiState = UiData & UiActions;
export type UiStore = StoreApi<UiState>;

function storedLanguage(): UiLang {
  const v = readPref(PREF_KEYS.language);
  return v === 'bn' ? 'bn' : 'en';
}

function storedTheme(): Theme {
  return readPref(PREF_KEYS.theme) === 'dark' ? 'dark' : 'light';
}

export function createUiStore(): UiStore {
  let seq = 0;
  return createStore<UiState>()((set, get) => ({
    selection: null,
    cameraTarget: null,
    xray: false,
    labels: true,
    quality: 'auto',
    language: storedLanguage(),
    theme: storedTheme(),
    trayTab: 'bays',
    kpiRowBottom: null,

    select: (selection) => set({ selection }),
    flyTo: (kind, id = null) => set({ cameraTarget: { kind, id, seq: ++seq } }),
    setXray: (xray) => set({ xray }),
    setLabels: (labels) => set({ labels }),
    setQuality: (quality) => set({ quality }),
    setLanguage: (language) => {
      if (get().language === language) return;
      writePref(PREF_KEYS.language, language);
      set({ language });
    },
    setTheme: (theme) => {
      if (get().theme === theme) return;
      writePref(PREF_KEYS.theme, theme);
      set({ theme });
    },
    setTrayTab: (trayTab) => set({ trayTab }),
    setKpiRowBottom: (kpiRowBottom) => set({ kpiRowBottom }),
  }));
}

export const uiStore: UiStore = createUiStore();
