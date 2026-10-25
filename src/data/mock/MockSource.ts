import { safeParseMessage, type MessageKind, type MessageValue } from '@/domain';
import type {
  ConnStatus,
  DataMode,
  DataSource,
  DataSourceOptions,
  Subscribable,
  Unsub,
} from '../DataSource';
import { Observable } from '../fixture/observable';
import type { Scenario } from './core/controller';
import { getSimRuntime, type MessageBatch, type SimRuntime } from './runtime';

export const SPEEDS = [1, 10, 60] as const;
export type Speed = (typeof SPEEDS)[number];

/** Event categories the dev controls can trigger (docs/03 section 3.5). */
export const TRIGGER_CATEGORIES = [
  'truck',
  'belt',
  'hygiene',
  'handling',
  'ppe',
  'compliance',
  'roster',
  'staging',
  'security',
  'system',
] as const;

export type MessageRates = Record<MessageKind, number>;

/** Everything the dev controls show and change. */
export interface MockControlState {
  seed: number;
  speed: number;
  paused: boolean;
  scenario: Scenario;
  /** Virtual "now" of the simulator (epoch ms), 0 before it is ready. */
  simNow: number;
  ready: boolean;
  /** Wall-clock ms the 7-day history took. */
  historyMs: number;
  /** Messages per second (wall clock) per channel, over the last second. */
  rates: MessageRates;
  /** Messages that failed validation at the boundary since connect. */
  dropped: number;
}

const KINDS: readonly MessageKind[] = [
  'siteState',
  'bayState',
  'actors',
  'case',
  'event',
  'lifecycle',
  'health',
];
const zeroRates = (): MessageRates => ({
  siteState: 0,
  bayState: 0,
  actors: 0,
  case: 0,
  event: 0,
  lifecycle: 0,
  health: 0,
});

type Listeners = { [K in MessageKind]: Set<(v: MessageValue[K]) => void> };

/**
 * DataSource backed by the in-browser simulator (a Web Worker). Every message from the worker is validated with
 * safeParseMessage before a listener sees it; invalid ones are dropped and counted, like the live source will do.
 */
export class MockSource implements DataSource {
  readonly mode: DataMode;
  readonly status = new Observable<ConnStatus>('offline');
  readonly control: Subscribable<MockControlState>;
  private readonly controlState: Observable<MockControlState>;
  private readonly listeners: Listeners = {
    siteState: new Set(),
    bayState: new Set(),
    actors: new Set(),
    case: new Set(),
    event: new Set(),
    lifecycle: new Set(),
    health: new Set(),
  };
  private unsubs: Unsub[] = [];
  private counts = zeroRates();
  private rateTimer: ReturnType<typeof setInterval> | null = null;
  private connecting: Promise<void> | null = null;
  private dropped = 0;

  constructor(
    opts: DataSourceOptions,
    private readonly runtime: SimRuntime = getSimRuntime(),
  ) {
    this.mode = opts.mode;
    const o = runtime.options;
    this.controlState = new Observable<MockControlState>({
      seed: o.seed,
      speed: o.speed,
      paused: false,
      scenario: o.scenario,
      simNow: 0,
      ready: false,
      historyMs: 0,
      rates: zeroRates(),
      dropped: 0,
    });
    this.control = this.controlState;
  }

  // ---- DataSource ---------------------------------------------------------------------------------------------

  connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.status.set('connecting');
    this.unsubs.push(this.runtime.onBatch((b) => this.onBatch(b)));
    this.connecting = this.runtime.ensure().then((info) => {
      this.patch({ ready: true, historyMs: info.historyMs, simNow: info.startMs });
      this.runtime.connect();
      this.status.set('live');
      this.rateTimer = setInterval(() => this.sampleRates(), 1000);
    });
    return this.connecting;
  }

  async disconnect(): Promise<void> {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.rateTimer !== null) clearInterval(this.rateTimer);
    this.rateTimer = null;
    this.connecting = null;
    this.status.set('offline');
  }

  onSiteState = (cb: (v: MessageValue['siteState']) => void): Unsub => this.on('siteState', cb);
  onBayState = (cb: (v: MessageValue['bayState']) => void): Unsub => this.on('bayState', cb);
  onActors = (cb: (v: MessageValue['actors']) => void): Unsub => this.on('actors', cb);
  onCase = (cb: (v: MessageValue['case']) => void): Unsub => this.on('case', cb);
  onEvent = (cb: (v: MessageValue['event']) => void): Unsub => this.on('event', cb);
  onLifecycle = (cb: (v: MessageValue['lifecycle']) => void): Unsub => this.on('lifecycle', cb);
  onHealth = (cb: (v: MessageValue['health']) => void): Unsub => this.on('health', cb);

  /** Same as the replay controls of the DataSource interface: `play(speed)` resumes at 1x, 10x or 60x. */
  play(speed: number): void {
    this.setSpeed(speed);
    this.setPaused(false);
  }

  pause(): void {
    this.setPaused(true);
  }

  // ---- dev controls -------------------------------------------------------------------------------------------

  setSpeed(speed: number): void {
    this.runtime.send({ t: 'speed', speed });
    this.patch({ speed });
  }

  setPaused(paused: boolean): void {
    this.runtime.send({ t: 'pause', paused });
    this.patch({ paused });
  }

  /** New seed: the depot is rebuilt (history regenerated) and the live feed restarts from its snapshot. */
  async setSeed(seed: number): Promise<void> {
    await this.restart({ seed });
  }

  async setScenario(scenario: Scenario): Promise<void> {
    await this.restart({ scenario });
  }

  private async restart(init: { seed?: number; scenario?: Scenario }): Promise<void> {
    this.patch({ ready: false, ...init });
    const info = await this.runtime.restart(init);
    this.patch({ ready: true, historyMs: info.historyMs, simNow: info.startMs, paused: false });
    this.runtime.send({ t: 'speed', speed: this.controlState.get().speed });
    this.runtime.connect();
  }

  /** Emit one plausible event of the category (truck, belt, hygiene, ppe, compliance, ...) right now. */
  trigger(category: string): void {
    this.runtime.send({ t: 'trigger', category });
  }

  // ---- internals ----------------------------------------------------------------------------------------------

  private patch(p: Partial<MockControlState>): void {
    this.controlState.set({ ...this.controlState.get(), ...p });
  }

  private on<K extends MessageKind>(kind: K, cb: (v: MessageValue[K]) => void): Unsub {
    const set: Set<(v: MessageValue[K]) => void> = this.listeners[kind];
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }

  private onBatch(b: MessageBatch): void {
    const droppedBefore = this.dropped;
    for (const m of b.items) this.deliver(m.kind, m.value);
    const cur = this.controlState.get();
    if (b.simNow !== cur.simNow || this.dropped !== droppedBefore)
      this.patch({ simNow: b.simNow, dropped: this.dropped });
  }

  private deliver<K extends MessageKind>(kind: K, raw: unknown): void {
    const parsed = safeParseMessage(kind, raw);
    if (!parsed.ok) {
      this.dropped += 1;
      return; // dropped and counted (domain drop handler) by safeParseMessage
    }
    this.counts[kind] += 1;
    const set: Set<(v: MessageValue[K]) => void> = this.listeners[kind];
    for (const cb of [...set]) {
      try {
        cb(parsed.value);
      } catch (e) {
        console.error('MockSource listener threw', e);
      }
    }
  }

  private sampleRates(): void {
    const rates = zeroRates();
    for (const k of KINDS) rates[k] = this.counts[k];
    this.counts = zeroRates();
    this.patch({ rates, dropped: this.dropped });
  }
}
