import type { ConnStatus } from '@/data/DataSource';

// docs/02 section 4. Pure functions of (stored receive times, now): nothing here sets state.
// Receive time (local clock) is used, not message `ts`, so a skewed browser clock or a sped-up
// simulator cannot make fresh data look stale.

export const BAY_STALE_MS = 15_000;
export const SITE_DEGRADED_MS = 10_000;
export const SITE_OFFLINE_MS = 30_000;

/** A bay with no data yet, or none for more than 15 s, is stale. */
export function isBayStale(rxAt: number | undefined, now: number): boolean {
  return rxAt === undefined || now - rxAt > BAY_STALE_MS;
}

/**
 * Connection status shown to the user. The source reports connecting/live/degraded/offline;
 * on top of that, no state message for more than 10 s is `degraded` and more than 30 s is `offline`.
 */
export function deriveConnStatus(
  source: ConnStatus,
  lastStateRxAt: number | null,
  sourceSince: number,
  now: number,
): ConnStatus {
  if (source === 'offline' || source === 'connecting') return source;
  const age = now - Math.max(lastStateRxAt ?? 0, sourceSince);
  if (age > SITE_OFFLINE_MS) return 'offline';
  if (age > SITE_DEGRADED_MS) return 'degraded';
  return source;
}
