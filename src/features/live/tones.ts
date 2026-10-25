import type { Tone } from '@/components/common';
import type { BeltStatus, CameraStatus, EventStatus, Severity, VisitPhase } from '@/domain';
import type { ConnStatus } from '@/data/DataSource';

// Status -> token mapping. Belt states follow docs/04 section 5.

export const BELT_TONE: Record<BeltStatus, Tone> = {
  RUNNING_LOADED: 'ok',
  RUNNING_EMPTY: 'warn',
  STOPPED: 'neutral',
  NO_TRUCK: 'idle',
  OFFLINE: 'offline',
};

export const SEV_TONE: Record<Severity, Tone> = {
  info: 'info',
  warn: 'warn',
  critical: 'critical',
};

export const PHASE_TONE: Record<VisitPhase, Tone> = {
  ARRIVED: 'info',
  DOCKED: 'info',
  LOADING: 'ok',
  UNLOADING: 'ok',
  FINISHED: 'neutral',
  DEPARTED: 'idle',
};

export const EVENT_STATUS_TONE: Record<EventStatus, Tone> = {
  OPEN: 'warn',
  ACK: 'info',
  CLOSED: 'idle',
};

export const CONN_TONE: Record<ConnStatus, Tone> = {
  connecting: 'info',
  live: 'ok',
  degraded: 'warn',
  offline: 'critical',
};

export const CAMERA_TONE: Record<CameraStatus, Tone> = {
  OK: 'ok',
  OFFLINE: 'critical',
  OBSTRUCTED: 'warn',
  DEFOCUS: 'warn',
  MOVED: 'warn',
};

const SEV_RANK: Record<Severity, number> = { info: 0, warn: 1, critical: 2 };

/** The more severe of two severities (null = none). */
export function maxSeverity(a: Severity | null, b: Severity | null): Severity | null {
  if (a === null) return b;
  if (b === null) return a;
  return SEV_RANK[a] >= SEV_RANK[b] ? a : b;
}
