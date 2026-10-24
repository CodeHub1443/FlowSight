// UI preferences kept in localStorage (language, theme). No PII ever goes here.
// Storage can be missing or throw (private window, blocked site data), so every access is guarded.

export const PREF_KEYS = { language: 'depot.pref.language', theme: 'depot.pref.theme' } as const;

export function readPref(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Preference is a convenience only.
  }
}
