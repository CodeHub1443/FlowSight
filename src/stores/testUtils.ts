// Test-only helpers for the stores (no runtime use).
import bayStateJson from '@/domain/fixtures/bay-state.json';
import lifecycleJson from '@/domain/fixtures/lifecycle-update.json';
import siteStateJson from '@/domain/fixtures/site-state.json';
import whEventJson from '@/domain/fixtures/wh-event.json';
import {
  safeParseMessage,
  type BayState,
  type EventLifecycleUpdate,
  type SiteState,
  type WhEvent,
} from '@/domain';

function must<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

export function makeBay(
  bay: string,
  ts: string,
  patch: (b: BayState) => void = () => {},
): BayState {
  const b = must(safeParseMessage('bayState', bayStateJson));
  b.bay = bay;
  b.ts = ts;
  patch(b);
  return b;
}

export function makeSite(ts: string): SiteState {
  const s = must(safeParseMessage('siteState', siteStateJson));
  s.ts = ts;
  return s;
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** A valid ULID that differs per n (0-1023). */
export const ulid = (n: number): string =>
  `01M5Q2V6W0M9S346Q3D25V${ALPHABET.charAt(n % 32)}${ALPHABET.charAt(Math.floor(n / 32) % 32)}ABC`.slice(
    0,
    26,
  );

/** The wh-event fixture with a new id, and optionally another catalogue row (data must match that row). */
export function makeEvent(
  id: string,
  over: { category?: string; type?: string; data?: unknown; ts?: string; bay?: string | null } = {},
): WhEvent {
  const raw: Record<string, unknown> = { ...structuredClone(whEventJson), id };
  if (over.category) raw.category = over.category;
  if (over.type) raw.type = over.type;
  if (over.data !== undefined) raw.data = over.data;
  if (over.ts) raw.ts = over.ts;
  if (over.bay !== undefined) raw.bay = over.bay;
  return must(safeParseMessage('event', raw));
}

export function makeLifecycle(
  id: string,
  status: 'OPEN' | 'ACK' | 'CLOSED',
  at: string,
  note: string | null = null,
): EventLifecycleUpdate {
  const u = must(safeParseMessage('lifecycle', lifecycleJson));
  return { ...u, id, status, at, note };
}
