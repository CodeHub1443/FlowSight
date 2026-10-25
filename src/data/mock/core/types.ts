import type {
  Lang,
  MessageKind,
  MessageValue,
  PackType,
  VisitPhase,
  WhEventWithStatus,
} from '@/domain';

/** One outbound message, tagged with its DataSource channel. */
export type SimMessage = {
  [K in MessageKind]: { kind: K; value: MessageValue[K] };
}[MessageKind];

export type SkuTally = { pack: PackType; count: number; confSum: number };

/** A truck visit: the single record that feeds BayState.visit, Visit (REST), reports and the leaderboard. */
export interface VisitRec {
  visitId: string;
  bay: string;
  plate: { bn: string; en: string; conf: number };
  agency: Lang | null;
  dir: 'OUT' | 'IN';
  /** Items the truck will carry (hidden truth, never emitted). */
  total: number;
  /** Items that have actually crossed the belt (truth; observed counters below can lag if the BELT camera is out). */
  loaded: number;
  baseRateCpm: number;
  phase: VisitPhase;
  arrivedAt: number;
  dockedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  departedAt: number | null;
  casesOut: number;
  casesIn: number;
  damaged: number;
  openTape: number;
  tornSack: number;
  wetStained: number;
  fallOff: number;
  sku: Map<string, SkuTally>;
  skuMix: { sku: string; weight: number }[];
  captain: string | null;
  eventIds: string[];
  detention: boolean;
  crewWorkers: number;
  crewTotal: number;
  /** Track ids of the workers who were on this visit (for the manager-only presence report). */
  workerTracks: string[];
  crewFrom: number | null;
  crewTo: number | null;
  loadedMs: number;
  stoppedMs: number;
  emptyMs: number;
  ppeViolations: number;
  palletWaitsSec: number[];
  shiftId: string;
  businessDay: string;
}

export type EventRec = WhEventWithStatus;

export type BeltInterval = { status: string; start: number; end: number };

export type CameraIncident = { cam: string; from: number; to: number | null };

export const BELT_KEYS = [
  'runningLoaded',
  'runningEmpty',
  'stopped',
  'noTruck',
  'offline',
] as const;
export type BeltKey = (typeof BELT_KEYS)[number];
export type BeltAcc = Record<BeltKey, number>;
