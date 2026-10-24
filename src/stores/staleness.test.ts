import { describe, expect, it } from 'vitest';
import {
  BAY_STALE_MS,
  deriveConnStatus,
  isBayStale,
  SITE_DEGRADED_MS,
  SITE_OFFLINE_MS,
} from './staleness';

describe('isBayStale', () => {
  it('is stale when never received', () => {
    expect(isBayStale(undefined, 1_000)).toBe(true);
  });
  it('is fresh up to and including 15 s, stale after', () => {
    expect(isBayStale(0, BAY_STALE_MS)).toBe(false);
    expect(isBayStale(0, BAY_STALE_MS + 1)).toBe(true);
  });
});

describe('deriveConnStatus', () => {
  it('passes connecting and offline through regardless of message age', () => {
    expect(deriveConnStatus('connecting', 0, 0, 999_999)).toBe('connecting');
    expect(deriveConnStatus('offline', 999_999, 0, 999_999)).toBe('offline');
  });
  it('is live while state messages are recent', () => {
    expect(deriveConnStatus('live', 95_000, 0, 100_000)).toBe('live');
  });
  it('degrades after 10 s without a state message and goes offline after 30 s', () => {
    expect(deriveConnStatus('live', 0, 0, SITE_DEGRADED_MS)).toBe('live');
    expect(deriveConnStatus('live', 0, 0, SITE_DEGRADED_MS + 1)).toBe('degraded');
    expect(deriveConnStatus('live', 0, 0, SITE_OFFLINE_MS)).toBe('degraded');
    expect(deriveConnStatus('live', 0, 0, SITE_OFFLINE_MS + 1)).toBe('offline');
  });
  it('measures from the moment the source went live when nothing has arrived yet', () => {
    expect(deriveConnStatus('live', null, 50_000, 55_000)).toBe('live');
    expect(deriveConnStatus('live', null, 50_000, 61_000)).toBe('degraded');
  });
  it('restarts the clock on reconnect (source change newer than the last message)', () => {
    expect(deriveConnStatus('live', 0, 100_000, 105_000)).toBe('live');
  });
  it('keeps a source-reported degraded status', () => {
    expect(deriveConnStatus('degraded', 99_000, 0, 100_000)).toBe('degraded');
  });
});
