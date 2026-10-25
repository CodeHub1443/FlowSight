import { SiteConfigSchema, type SiteConfig } from '@/domain';
import siteConfigJson from '../../../../config/sites/dhk-depot.json';
import { handleApi, type ApiRequest, type ApiResponse } from './api';
import { Depot, DEFAULT_CADENCE, LIVE_STEP_MS } from './depot';
import { HOUR } from './clock';
import type { SimMessage } from './types';

// The framework-free brain behind the worker: owns the Depot, the virtual clock and the command protocol.
// simulator.worker.ts is a 5-line wrapper; tests and jsdom run the same controller inline.

export type Scenario = 'now' | 'peak';

/** The evening-peak demo day: 2026-10-24 19:20 Asia/Dhaka (the date of the contract fixtures). */
export const PEAK_START_MS = Date.parse('2026-10-24T19:20:00+06:00');

export interface InitOptions {
  seed: number;
  scenario: Scenario;
  speed: number;
  historyDays?: number;
  /** Overrides the scenario start (tests). */
  startMs?: number;
}

export type Cmd =
  | ({ t: 'init' } & InitOptions)
  | { t: 'speed'; speed: number }
  | { t: 'pause'; paused: boolean }
  | { t: 'trigger'; category: string }
  | { t: 'connect' }
  | { t: 'rpc'; id: number; req: ApiRequest };

export interface ReadyInfo {
  seed: number;
  scenario: Scenario;
  startMs: number;
  /** Wall-clock milliseconds the 7-day history took to generate. */
  historyMs: number;
  visits: number;
  events: number;
}

export type Evt =
  | { t: 'ready'; info: ReadyInfo }
  | { t: 'msgs'; items: SimMessage[]; simNow: number }
  | { t: 'rpc'; id: number; res: ApiResponse }
  | { t: 'error'; message: string };

export interface ControllerDeps {
  /** Wall clock in ms (injectable for tests). */
  now?: () => number;
  /** Config override (tests). */
  config?: SiteConfig;
}

function parseConfig(): SiteConfig {
  return SiteConfigSchema.parse(siteConfigJson);
}

export class SimController {
  private depot: Depot | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private speed = 1;
  private paused = false;
  private simClock = 0;
  private lastWall = 0;
  private init_: InitOptions | null = null;
  private readonly now: () => number;
  private readonly cfg: SiteConfig;

  constructor(
    private readonly post: (e: Evt) => void,
    deps: ControllerDeps = {},
  ) {
    this.now = deps.now ?? (() => Date.now());
    this.cfg = deps.config ?? parseConfig();
  }

  get currentDepot(): Depot | null {
    return this.depot;
  }

  handle(cmd: Cmd): void {
    try {
      switch (cmd.t) {
        case 'init':
          this.init(cmd);
          break;
        case 'speed':
          this.setSpeed(cmd.speed);
          break;
        case 'pause':
          this.paused = cmd.paused;
          this.lastWall = this.now();
          break;
        case 'trigger': {
          this.depot?.trigger(cmd.category);
          this.flush();
          break;
        }
        case 'connect':
          this.connect();
          break;
        case 'rpc':
          this.rpc(cmd.id, cmd.req);
          break;
      }
    } catch (e) {
      this.post({ t: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private init(o: InitOptions): void {
    this.init_ = o;
    const startMs = o.startMs ?? (o.scenario === 'peak' ? PEAK_START_MS : this.now());
    const t0 = performance.now();
    // a fresh config copy: PUT /admin/thresholds mutates the live one
    const depot = new Depot({
      seed: o.seed,
      startMs,
      cfg: structuredClone(this.cfg),
      historyDays: o.historyDays,
    });
    depot.runHistory();
    const historyMs = performance.now() - t0;
    this.depot = depot;
    this.simClock = depot.now;
    this.paused = false;
    this.setSpeed(o.speed);
    this.lastWall = this.now();
    this.post({
      t: 'ready',
      info: {
        seed: o.seed,
        scenario: o.scenario,
        startMs: depot.now,
        historyMs: Math.round(historyMs),
        visits: depot.store.visits.length,
        events: depot.store.events.length,
      },
    });
  }

  private setSpeed(speed: number): void {
    this.speed = speed;
    const k = Math.max(1, Math.round(speed));
    // keep the wall-clock message rates roughly constant as the sim runs faster
    this.depot?.setCadence({
      actorsEvery: k * DEFAULT_CADENCE.actorsEvery,
      stateEvery: k * DEFAULT_CADENCE.stateEvery,
      healthEvery: k * DEFAULT_CADENCE.healthEvery,
    });
  }

  /** Start the real-time loop (the worker and the inline host do; tests call `advance`). */
  start(intervalMs = 100): void {
    if (this.timer !== null) return;
    this.lastWall = this.now();
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const wall = this.now();
    const dtWall = Math.min(1000, Math.max(0, wall - this.lastWall));
    this.lastWall = wall;
    if (this.paused || !this.depot) return;
    this.advance(dtWall * this.speed);
  }

  /** Advance the virtual clock by `simMs` and publish what happened. */
  advance(simMs: number): void {
    const depot = this.depot;
    if (!depot) return;
    this.simClock += simMs;
    depot.advanceTo(this.simClock);
    this.flush();
  }

  private flush(): void {
    const depot = this.depot;
    if (!depot) return;
    const items = depot.drain();
    this.post({ t: 'msgs', items, simNow: depot.now });
  }

  private connect(): void {
    const depot = this.depot;
    if (!depot) return;
    const items: SimMessage[] = depot.snapshot();
    // JetStream-style backfill: the alerts that are still open from the last 3 hours
    const since = depot.now - 3 * HOUR;
    const open = depot.store.events.filter(
      (e) => e.status !== 'CLOSED' && Date.parse(e.ts) >= since,
    );
    for (const e of open.slice(-40)) {
      items.push({ kind: 'event', value: e });
      if (e.status === 'ACK' && e.ack) {
        items.push({
          kind: 'lifecycle',
          value: {
            v: 1,
            id: e.id,
            site: depot.site,
            status: 'ACK',
            by: { userId: e.ack.by, name: e.ack.by },
            at: e.ack.at,
            note: null,
          },
        });
      }
    }
    this.post({ t: 'msgs', items, simNow: depot.now });
  }

  private rpc(id: number, req: ApiRequest): void {
    const depot = this.depot;
    const res: ApiResponse = depot
      ? handleApi(depot, req)
      : {
          status: 503,
          body: { error: { code: 'NOT_READY', message: 'simulator is not initialised' } },
        };
    this.flush();
    this.post({ t: 'rpc', id, res });
  }

  get initOptions(): InitOptions | null {
    return this.init_;
  }

  get stepMs(): number {
    return LIVE_STEP_MS;
  }
}
