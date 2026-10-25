import type { CameraStatus, EventStatus, SiteConfig, Severity } from '@/domain';
import type { ShiftClock } from './clock';
import type { EventSpec } from './eventFactory';
import type { Rng } from './rng';
import type {
  BeltInterval,
  BeltKey,
  CameraIncident,
  EventRec,
  SimMessage,
  VisitRec,
} from './types';

/** What a BaySim needs from the depot: services, never the other way round. */
export interface SimCtx {
  readonly cfg: SiteConfig;
  readonly site: string;
  readonly rng: Rng;
  readonly clock: ShiftClock;
  readonly store: HistoryLike;
  /** True once history is generated: messages are emitted and actors move. */
  readonly live: boolean;
  emit(m: SimMessage): void;
  addEvent(spec: EventSpec): EventRec;
  nextTrackId(prefix: 't' | 'f'): string;
  captainFor(bay: string, ts: number): string;
  camStatus(cam: string): CameraStatus;
  pipelineLagMs(): number;
  /** The truck has docked: free its apron holding slot (if it had one) for the next waiting truck. */
  releaseSlot(v: VisitRec): void;
}

/** The slice of HistoryStore the bays write to. */
export interface HistoryLike {
  addVisit(v: VisitRec): void;
  addBeltInterval(bay: string, i: BeltInterval): void;
  countCase(bay: string, dir: 'OUT' | 'IN', ts: number, sku: string, conf: number): void;
  openStats(bay: string | null): { count: number; maxSev: Severity | null };
  setStatus(id: string, status: EventStatus, by: string, ts: number, note: string | null): void;
  incidents: CameraIncident[];
}

export const BELT_KEY_OF: Readonly<Record<string, BeltKey>> = {
  RUNNING_LOADED: 'runningLoaded',
  RUNNING_EMPTY: 'runningEmpty',
  STOPPED: 'stopped',
  NO_TRUCK: 'noTruck',
  OFFLINE: 'offline',
};
