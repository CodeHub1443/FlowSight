import type { WhEventWithStatus } from '@/domain';

// Type-specific details of an event (docs/03 section 3.5): the fields of `data` that are worth showing, with how to format
// them. References (visit, plate, SKU, track) are shown in their own block, and employee ids are never shown (privacy).

export type DetailKind =
  'int' | 'num1' | 'min' | 'sec' | 'metres' | 'pct' | 'time' | 'text' | 'enum' | 'list';

export interface DetailRow {
  /** Field name in `data`; the label key is `details.<key>`. */
  key: string;
  kind: DetailKind;
  value: string | number | readonly string[];
}

const KINDS: Record<string, DetailKind> = {
  dir: 'enum',
  casesOut: 'int',
  casesIn: 'int',
  tatMin: 'min',
  phase: 'enum',
  minutes: 'min',
  thresholdMin: 'min',
  plateBn: 'text',
  conf: 'pct',
  from: 'enum',
  to: 'enum',
  pack: 'enum',
  areaM2: 'num1',
  dropHeightM: 'metres',
  role: 'enum',
  missing: 'list',
  count: 'int',
  limit: 'int',
  forkliftId: 'text',
  distM: 'metres',
  palletsWaiting: 'int',
  oldestWaitSec: 'sec',
  cam: 'text',
  lagMs: 'int',
  at: 'time',
};

/** Fields of `data` to show, in the order the catalogue defines them. Null / unknown / reference fields are left out. */
export function detailRows(e: Pick<WhEventWithStatus, 'data'>): DetailRow[] {
  const out: DetailRow[] = [];
  for (const [key, raw] of Object.entries(e.data as Record<string, unknown>)) {
    const kind = KINDS[key];
    if (!kind || raw === null || raw === undefined) continue;
    if (kind === 'list') {
      if (Array.isArray(raw) && raw.length > 0) {
        out.push({ key, kind, value: raw.filter((v): v is string => typeof v === 'string') });
      }
    } else if (typeof raw === 'string' || typeof raw === 'number') {
      out.push({ key, kind, value: raw });
    }
  }
  return out;
}
