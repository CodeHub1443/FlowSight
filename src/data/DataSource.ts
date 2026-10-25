import type {
  ActorsFrame,
  BayState,
  CaseTick,
  EventLifecycleUpdate,
  HealthFrame,
  SiteState,
  WhEvent,
} from '@/domain';
import { MockSource } from './mock/MockSource';

export type DataMode = 'mock' | 'live' | 'replay';
export type Unsub = () => void;
/** Minimal observable, no RxJS. */
export interface Subscribable<T> {
  get(): T;
  subscribe(cb: (v: T) => void): Unsub;
}
export type ConnStatus = 'connecting' | 'live' | 'degraded' | 'offline';
/** `baseUrl` '' = same origin. */
export interface DataSourceOptions {
  mode: DataMode;
  siteId: string;
  baseUrl: string;
}

export interface DataSource {
  readonly mode: DataMode;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status: Subscribable<ConnStatus>;
  onSiteState(cb: (s: SiteState) => void): Unsub;
  onBayState(cb: (b: BayState) => void): Unsub;
  /** 2 Hz per bay. */
  onActors(cb: (a: ActorsFrame) => void): Unsub;
  /** Per item on a belt. */
  onCase(cb: (c: CaseTick) => void): Unsub;
  onEvent(cb: (e: WhEvent) => void): Unsub;
  onLifecycle(cb: (u: EventLifecycleUpdate) => void): Unsub;
  onHealth(cb: (h: HealthFrame) => void): Unsub;
  // replay only
  seek?(t: Date): Promise<void>;
  play?(speed: number): void;
  pause?(): void;
}

/** Thrown by the factory for a mode whose source has not been built yet. */
export class NotImplementedError extends Error {
  readonly feature: string;
  constructor(feature: string) {
    super(`${feature} is not implemented yet`);
    this.name = 'NotImplementedError';
    this.feature = feature;
  }
}

export function createDataSource(opts: DataSourceOptions): DataSource {
  switch (opts.mode) {
    case 'mock':
      // In-browser simulator (Web Worker). FixtureSource stays exported for unit tests.
      return new MockSource(opts);
    case 'live':
      throw new NotImplementedError('DataSource mode "live" (NatsSource, step 13)');
    case 'replay':
      throw new NotImplementedError('DataSource mode "replay" (ReplaySource, step 15)');
  }
}
