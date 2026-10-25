import {
  defaultSeverity,
  parseWhEvent,
  type EventKey,
  type Lang,
  type Severity,
  type WhEvent,
} from '@/domain';
import { EVENT_SOURCE, EVENT_TITLES } from './catalog';
import { dateOf, iso } from './clock';
import { makeUlid, round, type Rng } from './rng';

export interface EventSpec {
  key: EventKey;
  ts: number;
  bay: string | null;
  data: Record<string, unknown>;
  sev?: Severity;
  visit?: { visitId: string; plateEn: string } | null;
  trackId?: string | null;
  sku?: string | null;
  conf?: number;
  pos?: { x: number; y: number } | null;
  title?: Lang;
  /** Evidence image; default is "yes" for every camera event listed in EVENT_SOURCE with a bay. */
  evidence?: boolean;
}

const FRAME_W = 1920;
const FRAME_H = 1080;

/** Keys whose rows carry a snapshot when produced by a camera. */
const NO_EVIDENCE: ReadonlySet<string> = new Set([
  'truck.docked',
  'truck.started',
  'truck.finished',
  'truck.departed',
  'belt.state_changed',
  'belt.empty_run',
  'roster.captain_detected',
  'roster.captain_absent',
  'security.door_open_idle',
]);

/**
 * Builds a contract-valid WhEvent. The result is parsed with the domain schema (strict catalogue), so a bad
 * `data` shape throws here, in the simulator, instead of reaching the UI.
 */
export function buildEvent(site: string, rng: Rng, spec: EventSpec): WhEvent {
  const key = spec.key;
  const id = makeUlid(spec.ts, rng);
  const [category, type] = key.split('.');
  const source = EVENT_SOURCE[key] ?? null;
  const cam = source && spec.bay ? `${spec.bay}-${source.role}` : null;
  const conf = cam ? (spec.conf ?? round(rng.range(0.78, 0.97), 2)) : null;
  const wantMedia = spec.evidence ?? (cam !== null && !NO_EVIDENCE.has(key));
  const w = rng.int(120, 520);
  const h = rng.int(100, 360);
  const media =
    wantMedia && cam
      ? {
          snapshotKey: `evidence/${site}/${dateOf(spec.ts)}/${id}.jpg`,
          clipKey: null,
          bbox: [rng.int(60, FRAME_W - w - 60), rng.int(60, FRAME_H - h - 60), w, h] as [
            number,
            number,
            number,
            number,
          ],
          frameW: FRAME_W,
          frameH: FRAME_H,
        }
      : null;
  const raw = {
    v: 1,
    id,
    ts: iso(spec.ts),
    site,
    bay: spec.bay,
    category,
    type,
    sev: spec.sev ?? defaultSeverity(key),
    title: spec.title ?? EVENT_TITLES[key] ?? { en: key, bn: key },
    src: { cam, model: cam ? (source?.model ?? null) : null, conf },
    refs: {
      visitId: spec.visit?.visitId ?? null,
      trackId: spec.trackId ?? null,
      sku: spec.sku ?? null,
      plateEn: spec.visit?.plateEn ?? null,
    },
    data: spec.data,
    media,
    pos: spec.pos ?? null,
  };
  const parsed = parseWhEvent(raw);
  if (!parsed.ok) {
    throw new Error(`simulator built an invalid ${key} event: ${parsed.error.message}`);
  }
  return parsed.value;
}
