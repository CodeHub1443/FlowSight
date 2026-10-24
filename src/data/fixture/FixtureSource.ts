import actorsFrameJson from '@/domain/fixtures/actors-frame.json';
import bayStateJson from '@/domain/fixtures/bay-state.json';
import caseTickJson from '@/domain/fixtures/case-tick.json';
import healthFrameJson from '@/domain/fixtures/health-frame.json';
import lifecycleJson from '@/domain/fixtures/lifecycle-update.json';
import siteStateJson from '@/domain/fixtures/site-state.json';
import whEventJson from '@/domain/fixtures/wh-event.json';
import { safeParseMessage, type MessageKind, type MessageValue } from '@/domain';
import type { ConnStatus, DataMode, DataSource, DataSourceOptions, Unsub } from '../DataSource';
import { actorsVariant, bayVariant, FIXTURE_BAYS, healthVariant, siteVariant } from './bays';
import { Observable } from './observable';

export const FIXTURE_TICK_MS = 2000;

/** Parse a contract fixture once; a bad fixture is a programming error, not a runtime condition. */
function load<K extends MessageKind>(kind: K, raw: unknown): MessageValue[K] {
  const parsed = safeParseMessage(kind, raw);
  if (!parsed.ok) throw new Error(`fixture ${kind} is invalid: ${parsed.error.message}`);
  return parsed.value;
}

type Listeners = { [K in MessageKind]: Set<(v: MessageValue[K]) => void> };

/**
 * Emits the contract fixtures on connect, then re-emits SiteState, ActorsFrame and all seven BayStates
 * every 2 s (HealthFrame every 10 s) with fresh timestamps. Stand-in until the simulator (step 3) lands.
 * Every message goes through safeParseMessage before a listener sees it.
 */
export class FixtureSource implements DataSource {
  readonly mode: DataMode;
  readonly status = new Observable<ConnStatus>('offline');
  private readonly listeners: Listeners = {
    siteState: new Set(),
    bayState: new Set(),
    actors: new Set(),
    case: new Set(),
    event: new Set(),
    lifecycle: new Set(),
    health: new Set(),
  };
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private readonly base = {
    site: load('siteState', siteStateJson),
    bay: load('bayState', bayStateJson),
    actors: load('actors', actorsFrameJson),
    health: load('health', healthFrameJson),
  };

  constructor(opts: DataSourceOptions) {
    this.mode = opts.mode;
  }

  async connect(): Promise<void> {
    if (this.timer !== null) return;
    this.status.set('connecting');
    // Verbatim contract fixtures first, then a full fresh sweep.
    this.emit('siteState', siteStateJson);
    this.emit('bayState', bayStateJson);
    this.emit('actors', actorsFrameJson);
    this.emit('case', caseTickJson);
    this.emit('event', whEventJson);
    this.emit('lifecycle', lifecycleJson);
    this.emit('health', healthFrameJson);
    this.sweep();
    this.timer = setInterval(() => this.sweep(), FIXTURE_TICK_MS);
    this.status.set('live');
  }

  async disconnect(): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.status.set('offline');
  }

  onSiteState = (cb: (v: MessageValue['siteState']) => void): Unsub => this.on('siteState', cb);
  onBayState = (cb: (v: MessageValue['bayState']) => void): Unsub => this.on('bayState', cb);
  onActors = (cb: (v: MessageValue['actors']) => void): Unsub => this.on('actors', cb);
  onCase = (cb: (v: MessageValue['case']) => void): Unsub => this.on('case', cb);
  onEvent = (cb: (v: MessageValue['event']) => void): Unsub => this.on('event', cb);
  onLifecycle = (cb: (v: MessageValue['lifecycle']) => void): Unsub => this.on('lifecycle', cb);
  onHealth = (cb: (v: MessageValue['health']) => void): Unsub => this.on('health', cb);

  private on<K extends MessageKind>(kind: K, cb: (v: MessageValue[K]) => void): Unsub {
    const set: Set<(v: MessageValue[K]) => void> = this.listeners[kind];
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }

  private emit<K extends MessageKind>(kind: K, raw: unknown): void {
    const parsed = safeParseMessage(kind, raw);
    if (!parsed.ok) return; // dropped and counted by safeParseMessage
    const set: Set<(v: MessageValue[K]) => void> = this.listeners[kind];
    for (const cb of [...set]) {
      try {
        cb(parsed.value);
      } catch (e) {
        console.error('FixtureSource listener threw', e);
      }
    }
  }

  private sweep(): void {
    const now = Date.now();
    this.tick += 1;
    const bays = FIXTURE_BAYS.map((_, i) => bayVariant(this.base.bay, i, this.tick, now));
    this.emit('siteState', siteVariant(this.base.site, bays, this.tick, now));
    for (const b of bays) this.emit('bayState', b);
    FIXTURE_BAYS.forEach((_, i) => {
      this.emit('actors', actorsVariant(this.base.actors, i, this.tick, now));
    });
    if (this.tick % 5 === 1) this.emit('health', healthVariant(this.base.health, now));
  }
}
