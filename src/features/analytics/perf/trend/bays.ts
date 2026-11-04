import { DEFAULT_SITE } from '@/features/live/siteInfo';

/** The configured bays in bay order (B01 to B07), from the site config. Used for the W4 filter options. */
export const CONFIGURED_BAY_IDS: readonly string[] = DEFAULT_SITE.dockFaces
  .flatMap((f) => f.bays.map((b) => b.id))
  .sort((a, b) => a.localeCompare(b));
