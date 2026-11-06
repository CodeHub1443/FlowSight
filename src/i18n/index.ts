import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { BRAND } from '@/brand';
import { PREF_KEYS, readPref } from '@/stores/prefs';
import bnAdmin from './locales/bn/admin.json';
import bnAnalytics from './locales/bn/analytics.json';
import bnBaypanel from './locales/bn/baypanel.json';
import bnCommon from './locales/bn/common.json';
import bnKpidetail from './locales/bn/kpidetail.json';
import bnLive from './locales/bn/live.json';
import bnMock from './locales/bn/mock.json';
import bnPerfindex from './locales/bn/perfindex.json';
import bnPerftrend from './locales/bn/perftrend.json';
import bnScene from './locales/bn/scene.json';
import enAdmin from './locales/en/admin.json';
import enAnalytics from './locales/en/analytics.json';
import enBaypanel from './locales/en/baypanel.json';
import enCommon from './locales/en/common.json';
import enKpidetail from './locales/en/kpidetail.json';
import enLive from './locales/en/live.json';
import enMock from './locales/en/mock.json';
import enPerfindex from './locales/en/perfindex.json';
import enPerftrend from './locales/en/perftrend.json';
import enScene from './locales/en/scene.json';

import { LAZY_NAMESPACES } from './lazy';

export const LANGUAGES = ['en', 'bn'] as const;
export type Language = (typeof LANGUAGES)[number];

// `events` and `reports` are listed here (i18n-check) but load with their route chunks, see ./lazy.ts.
// Namespaces are separate files so parallel sessions never touch the same JSON (see docs/progress/README.md).
// scripts/i18n-check.mjs fails when this list and the locale files disagree.
export const NAMESPACES = [
  'common',
  'live',
  'scene',
  'mock',
  'admin',
  'kpidetail',
  'baypanel',
  'analytics',
  'perfindex',
  'perftrend',
  'events',
  'reports',
  'about',
] as const;
export type Namespace = (typeof NAMESPACES)[number];

function initialLanguage(): Language {
  const stored = readPref(PREF_KEYS.language);
  return LANGUAGES.find((l) => l === stored) ?? 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      live: enLive,
      scene: enScene,
      mock: enMock,
      admin: enAdmin,
      kpidetail: enKpidetail,
      baypanel: enBaypanel,
      analytics: enAnalytics,
      perfindex: enPerfindex,
      perftrend: enPerftrend,
    },
    bn: {
      common: bnCommon,
      live: bnLive,
      scene: bnScene,
      mock: bnMock,
      admin: bnAdmin,
      kpidetail: bnKpidetail,
      baypanel: bnBaypanel,
      analytics: bnAnalytics,
      perfindex: bnPerfindex,
      perftrend: bnPerftrend,
    },
  },
  ns: NAMESPACES.filter((n) => !LAZY_NAMESPACES.some((l) => l === n)),
  defaultNS: 'common',
  lng: initialLanguage(),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  // {{company}} in common:app.developedBy comes from src/brand.ts, so a caller never has to pass it
  interpolation: { escapeValue: false, defaultVariables: { company: BRAND.developer } },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
