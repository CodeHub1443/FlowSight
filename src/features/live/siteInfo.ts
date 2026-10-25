import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema, type Lang, type SiteConfig } from '@/domain';

// Site data comes from config (CLAUDE.md "Config, not code"). Until GET /sites/{site}/config is wired (later step)
// the shell reads the checked-in file and validates it with the same schema. Multi-site ready: add files to SITE_FILES.

const parsed = SiteConfigSchema.safeParse(siteConfigJson);
if (!parsed.success)
  throw new Error(`config/sites/dhk-depot.json is invalid: ${parsed.error.message}`);

export const SITES: readonly SiteConfig[] = [parsed.data];
export const DEFAULT_SITE: SiteConfig = parsed.data;

const BAY_CFG = new Map(
  SITES.flatMap((s) => s.dockFaces.flatMap((f) => f.bays)).map((b) => [b.id, b] as const),
);

/** "Bay 2" / "বে ২" from config; falls back to the id for a bay the config does not list. */
export function bayLabel(bayId: string, lang: keyof Lang): string {
  return BAY_CFG.get(bayId)?.label[lang] ?? bayId;
}

/** "Conveyor-02" (physical cabinet label, not translated). */
export function bayConveyor(bayId: string): string | null {
  return BAY_CFG.get(bayId)?.conveyor ?? null;
}
