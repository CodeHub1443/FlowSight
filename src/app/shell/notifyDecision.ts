import type { Role, Severity, WhEventWithStatus } from '@/domain';
import { canViewCategory } from '@/lib/rbac';

// Live-notification rules (t22 spec section 3), as pure functions. No React, no stores, no clock: the caller passes `now`.
//   - only a live event (after the connect backfill), sev warn or critical, role-visible, status OPEN;
//   - one toast per (category, type, bay) per 60 s;
//   - hygiene and belt events of one visit collapse into ONE toast within 5 min (its count updates);
//   - at most 3 toasts at once; warn lasts 8 s, critical stays until dismissed.

export const DEDUPE_MS = 60_000;
export const COLLAPSE_MS = 5 * 60_000;
/** Events arriving this soon after the source went live are the connect backfill, not news. */
export const BACKFILL_MS = 3_000;
export const MAX_TOASTS = 3;
export const WARN_DURATION_MS = 8_000;

const COLLAPSE_CATEGORIES: readonly string[] = ['hygiene', 'belt'];

export interface ActiveToast {
  /** Toast id handed to the toast library. */
  id: string;
  /** `category.type@bay`: the 60 s dedupe key of the event that opened it. */
  key: string;
  /** `visit:<id>` for hygiene and belt events of a visit, else null. */
  visitKey: string | null;
  bay: string | null;
  sev: Severity;
  /** Events the toast stands for (a collapsed toast counts them). */
  count: number;
  /** Newest event id: the target of "Show on map" and "Open". */
  eventId: string;
  openedAt: number;
}

export interface NotifySession {
  role: Role;
  /** True while the data source status is `live`. */
  live: boolean;
  /** Wall time (ms) the source last became live; null = never. */
  liveSince: number | null;
  now: number;
}

export interface NotifyHistory {
  /** Toasts on screen. */
  active: readonly ActiveToast[];
  /** Last time a toast was shown or updated per dedupe key. */
  lastByKey: Readonly<Record<string, number>>;
}

export const emptyHistory = (): NotifyHistory => ({ active: [], lastByKey: {} });

export type SkipReason =
  'info' | 'not-open' | 'hidden' | 'not-live' | 'backfill' | 'duplicate' | 'no-room';

export type NotifyDecision =
  | { kind: 'skip'; reason: SkipReason }
  | { kind: 'show'; toast: ActiveToast; evict: string | null }
  | { kind: 'update'; toast: ActiveToast };

export const dedupeKey = (e: Pick<WhEventWithStatus, 'category' | 'type' | 'bay'>): string =>
  `${e.category}.${e.type}@${e.bay ?? ''}`;

/** `visit:<id>` for the events that collapse per visit, else null. */
export function visitKeyOf(e: Pick<WhEventWithStatus, 'category' | 'refs'>): string | null {
  return COLLAPSE_CATEGORIES.includes(e.category) && e.refs.visitId
    ? `visit:${e.refs.visitId}`
    : null;
}

export const maxSev = (a: Severity, b: Severity): Severity =>
  a === 'critical' || b === 'critical'
    ? 'critical'
    : a === 'warn' || b === 'warn'
      ? 'warn'
      : 'info';

/** Milliseconds a toast stays: warn 8 s, critical until dismissed (Infinity). */
export const toastDuration = (sev: Severity): number =>
  sev === 'critical' ? Infinity : WARN_DURATION_MS;

export function decideNotification(
  e: WhEventWithStatus,
  session: NotifySession,
  history: NotifyHistory,
): NotifyDecision {
  if (e.sev === 'info') return { kind: 'skip', reason: 'info' };
  if (e.status !== 'OPEN') return { kind: 'skip', reason: 'not-open' };
  if (!canViewCategory(session.role, e.category)) return { kind: 'skip', reason: 'hidden' };
  if (!session.live || session.liveSince === null) return { kind: 'skip', reason: 'not-live' };
  if (session.now - session.liveSince < BACKFILL_MS) return { kind: 'skip', reason: 'backfill' };

  const { now } = session;
  const key = dedupeKey(e);
  const visitKey = visitKeyOf(e);

  // Same visit within 5 minutes: one toast, its count and text update.
  if (visitKey !== null) {
    const open = history.active.find(
      (a) => a.visitKey === visitKey && now - a.openedAt < COLLAPSE_MS,
    );
    if (open) {
      return {
        kind: 'update',
        toast: { ...open, count: open.count + 1, sev: maxSev(open.sev, e.sev), eventId: e.id },
      };
    }
  }

  const last = history.lastByKey[key];
  if (last !== undefined && now - last < DEDUPE_MS) return { kind: 'skip', reason: 'duplicate' };

  const toast: ActiveToast = {
    id: `notify-${e.id}`,
    key,
    visitKey,
    bay: e.bay,
    sev: e.sev,
    count: 1,
    eventId: e.id,
    openedAt: now,
  };
  if (history.active.length < MAX_TOASTS) return { kind: 'show', toast, evict: null };

  // Full: make room by dropping the oldest warn toast; a critical event may also displace the oldest critical one.
  const oldest = (list: readonly ActiveToast[]) =>
    [...list].sort((a, b) => a.openedAt - b.openedAt)[0];
  const victim =
    oldest(history.active.filter((a) => a.sev !== 'critical')) ??
    (e.sev === 'critical' ? oldest(history.active) : undefined);
  if (!victim) return { kind: 'skip', reason: 'no-room' };
  return { kind: 'show', toast, evict: victim.id };
}

/** The history after a decision (pure). `skip` returns it unchanged. */
export function applyDecision(
  history: NotifyHistory,
  decision: NotifyDecision,
  now: number,
): NotifyHistory {
  if (decision.kind === 'skip') return history;
  if (decision.kind === 'update') {
    return {
      active: history.active.map((a) => (a.id === decision.toast.id ? decision.toast : a)),
      lastByKey: { ...history.lastByKey, [decision.toast.key]: now },
    };
  }
  return {
    active: [...history.active.filter((a) => a.id !== decision.evict), decision.toast],
    lastByKey: { ...history.lastByKey, [decision.toast.key]: now },
  };
}

/** A toast left the screen (dismissed, expired or evicted). */
export function removeToast(history: NotifyHistory, id: string): NotifyHistory {
  return history.active.some((a) => a.id === id)
    ? { ...history, active: history.active.filter((a) => a.id !== id) }
    : history;
}
