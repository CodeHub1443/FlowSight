import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { PREF_KEYS, readPref } from '@/stores/prefs';
import bnAdmin from './locales/bn/admin.json';
import bnCommon from './locales/bn/common.json';
import bnLive from './locales/bn/live.json';
import bnMock from './locales/bn/mock.json';
import bnScene from './locales/bn/scene.json';
import enAdmin from './locales/en/admin.json';
import enCommon from './locales/en/common.json';
import enLive from './locales/en/live.json';
import enMock from './locales/en/mock.json';
import enScene from './locales/en/scene.json';

export const LANGUAGES = ['en', 'bn'] as const;
export type Language = (typeof LANGUAGES)[number];

// Namespaces are separate files so parallel sessions never touch the same JSON (see docs/progress/README.md).
export const NAMESPACES = ['common', 'live', 'scene', 'mock', 'admin'] as const;
export type Namespace = (typeof NAMESPACES)[number];

function initialLanguage(): Language {
  const stored = readPref(PREF_KEYS.language);
  return LANGUAGES.find((l) => l === stored) ?? 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, live: enLive, scene: enScene, mock: enMock, admin: enAdmin },
    bn: { common: bnCommon, live: bnLive, scene: bnScene, mock: bnMock, admin: bnAdmin },
  },
  ns: NAMESPACES,
  defaultNS: 'common',
  lng: initialLanguage(),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
