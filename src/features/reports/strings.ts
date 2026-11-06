import i18n from '@/i18n';
import bn from '@/i18n/locales/bn/reports.json';
import en from '@/i18n/locales/en/reports.json';

// Registers the `reports` namespace when this chunk loads. Today `src/i18n/index.ts` (a shared file, not editable in Task 22C) also
// imports both files eagerly, so the JSON still ships in the /live entry (see docs/progress/t22c.md, "Bundle"). 22.9: delete the two
// `reports` imports and the two `reports:` resource entries from `src/i18n/index.ts` and the entry shrinks by the size of these files;
// this module then becomes the only loader. Registering twice is harmless.
for (const [lng, bundle] of [
  ['en', en],
  ['bn', bn],
] as const) {
  if (!i18n.hasResourceBundle(lng, 'reports'))
    i18n.addResourceBundle(lng, 'reports', bundle, true, true);
}
