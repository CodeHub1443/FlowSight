import { useEffect } from 'react';
import i18n, { LANGUAGES } from '@/i18n';
import { uiStore } from '@/stores';

/**
 * Keeps i18n, the `dark` class and uiStore in step. The language starts from the persisted preference
 * (see i18n/index.ts); changes made anywhere, including the existing toggle, flow into uiStore and are persisted there.
 */
export function UiPreferenceSync() {
  useEffect(() => {
    const syncLanguage = (lng: string) => {
      const known = LANGUAGES.find((l) => l === lng);
      if (known) uiStore.getState().setLanguage(known);
    };
    syncLanguage(i18n.resolvedLanguage ?? i18n.language);
    i18n.on('languageChanged', syncLanguage);

    const applyTheme = (theme: string) => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    };
    applyTheme(uiStore.getState().theme);
    const unsubTheme = uiStore.subscribe((s, prev) => {
      if (s.theme !== prev.theme) applyTheme(s.theme);
    });
    const unsubLang = uiStore.subscribe((s, prev) => {
      if (s.language !== prev.language && i18n.language !== s.language)
        void i18n.changeLanguage(s.language);
    });

    return () => {
      i18n.off('languageChanged', syncLanguage);
      unsubTheme();
      unsubLang();
    };
  }, []);

  return null;
}
