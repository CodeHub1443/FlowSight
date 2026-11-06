import i18n from 'i18next';

// Namespaces owned by a lazy route chunk (t22 spec section 2). The page module imports its register module (`./events`,
// `./reports`), so the JSON travels with the chunk and is added to i18next for both languages before the page renders.
// A language switch then re-renders the open page like any other namespace.

export const LAZY_NAMESPACES = ['events', 'reports', 'about'] as const;
export type LazyNamespace = (typeof LAZY_NAMESPACES)[number];

/** Add a namespace for both languages. Safe to call twice (the bundles are merged and overwritten). */
export function registerNamespace(ns: LazyNamespace, en: object, bn: object): void {
  i18n.addResourceBundle('en', ns, en, true, true);
  i18n.addResourceBundle('bn', ns, bn, true, true);
}
