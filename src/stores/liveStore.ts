import { createStore, type StoreApi } from 'zustand';
import type { ConnStatus } from '@/data/DataSource';
import type {
  ActorsFrame,
  BayState,
  BayVisit,
  HealthFrame,
  MessageKind,
  MessageValue,
  SiteState,
  Snapshot,
} from '@/domain';

// Live state (docs/02 section 3). Merge rules:
//  - subscribe-then-snapshot: live messages and the REST snapshot go through the same reducer, so a snapshot
//    applied after the first deltas can never overwrite newer data;
//  - a message whose `ts` is older than the stored one is counted as received but otherwise ignored;
//  - writes are coalesced and flushed at most every FLUSH_MS (4 Hz), never per animation frame.

export const FLUSH_MS = 250;
export const MAX_VISITS = 60;

export const MESSAGE_KINDS = [
  'siteState',
  'bayState',
  'actors',
  'case',
  'event',
  'lifecycle',
  'health',
] as const satisfies readonly MessageKind[];

export type KindCounts = Record<MessageKind, number>;

export interface VisitRecord {
  bay: string;
  visit: BayVisit;
  /** Local receive time (ms). */
  rxAt: number;
}

export interface LiveData {
  site: SiteState | null;
  bays: Record<string, BayState>;
  /** Local receive time (ms) per bay, for staleness. */
  bayRxAt: Record<string, number>;
  actors: Record<string, ActorsFrame>;
  /** Visits seen in BayState.visit, keyed by visit id. Kept after the bay moves on. */
  visits: Record<string, VisitRecord>;
  health: HealthFrame | null;
  /** Newest message `ts` applied (epoch ms). */
  lastTs: number | null;
  /** Local time (ms) of the last applied SiteState or BayState, for the site staleness rules. */
  lastStateRxAt: number | null;
  sourceStatus: ConnStatus;
  /** Local time (ms) the source status last changed. */
  sourceSince: number;
  stats: { received: KindCounts; dropped: KindCounts };
}

export type LiveMessage = { [K in MessageKind]: { kind: K; value: MessageValue[K] } }[MessageKind];

export interface LiveActions {
  /** Queue a validated message. Applied on the next flush (immediately when flushMs is 0). */
  ingest(msg: LiveMessage): void;
  /** Apply a REST snapshot through the same merge rules as live messages. */
  applySnapshot(snapshot: Snapshot): void;
  /** Count a message dropped at the validation boundary. */
  recordDrop(kind: MessageKind): void;
  setSourceStatus(status: ConnStatus): void;
  /** Apply everything queued so far. */
  flush(): void;
  reset(): void;
}

export type LiveState = LiveData & LiveActions;
export type LiveStore = StoreApi<LiveState>;

export interface LiveStoreOptions {
  flushMs?: number;
  now?: () => number;
}

const zeroCounts = (): KindCounts => ({
  siteState: 0,
  bayState: 0,
  actors: 0,
  case: 0,
  event: 0,
  lifecycle: 0,
  health: 0,
});

export function initialLiveData(now: number): LiveData {
  return {
    site: null,
    bays: {},
    bayRxAt: {},
    actors: {},
    visits: {},
    health: null,
    lastTs: null,
    lastStateRxAt: null,
    sourceStatus: 'offline',
    sourceSince: now,
    stats: { received: zeroCounts(), dropped: zeroCounts() },
  };
}

const ms = (ts: string) => Date.parse(ts);
const isOlder = (incoming: string, stored: string | undefined) =>
  stored !== undefined && ms(incoming) < ms(stored);
const maxTs = (prev: number | null, ts: string) => Math.max(prev ?? -Infinity, ms(ts));

type Item = { type: 'msg'; msg: LiveMessage; rxAt: number } | { type: 'drop'; kind: MessageKind };

function evictVisits(visits: Record<string, VisitRecord>): Record<string, VisitRecord> {
  const ids = Object.keys(visits);
  if (ids.length <= MAX_VISITS) return visits;
  const keep = ids
    .sort((a, b) => ms(visits[b]?.visit.arrivedAt ?? '') - ms(visits[a]?.visit.arrivedAt ?? ''))
    .slice(0, MAX_VISITS);
  return Object.fromEntries(keep.flatMap((id) => (visits[id] ? [[id, visits[id]] as const] : [])));
}

/** Pure reducer for one message. Returns the same object only when nothing at all changed (never: counts move). */
export function reduceMessage(s: LiveData, msg: LiveMessage, rxAt: number): LiveData {
  const counted: LiveData = {
    ...s,
    stats: {
      ...s.stats,
      received: { ...s.stats.received, [msg.kind]: s.stats.received[msg.kind] + 1 },
    },
  };
  switch (msg.kind) {
    case 'siteState': {
      if (isOlder(msg.value.ts, s.site?.ts)) return counted;
      return {
        ...counted,
        site: msg.value,
        lastTs: maxTs(s.lastTs, msg.value.ts),
        lastStateRxAt: rxAt,
      };
    }
    case 'bayState': {
      const b = msg.value;
      if (isOlder(b.ts, s.bays[b.bay]?.ts)) return counted;
      const visits = b.visit
        ? evictVisits({ ...s.visits, [b.visit.visitId]: { bay: b.bay, visit: b.visit, rxAt } })
        : s.visits;
      return {
        ...counted,
        bays: { ...s.bays, [b.bay]: b },
        bayRxAt: { ...s.bayRxAt, [b.bay]: rxAt },
        visits,
        lastTs: maxTs(s.lastTs, b.ts),
        lastStateRxAt: rxAt,
      };
    }
    case 'actors': {
      const a = msg.value;
      if (isOlder(a.ts, s.actors[a.bay]?.ts)) return counted;
      return { ...counted, actors: { ...s.actors, [a.bay]: a }, lastTs: maxTs(s.lastTs, a.ts) };
    }
    case 'health': {
      if (isOlder(msg.value.ts, s.health?.ts)) return counted;
      return { ...counted, health: msg.value, lastTs: maxTs(s.lastTs, msg.value.ts) };
    }
    // Cases are too frequent to keep; events and lifecycle updates live in the alert store.
    case 'case':
    case 'event':
    case 'lifecycle':
      return counted;
  }
}

export function createLiveStore(opts: LiveStoreOptions = {}): LiveStore {
  const flushMs = opts.flushMs ?? FLUSH_MS;
  const now = opts.now ?? (() => Date.now());
  let queue: Item[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  return createStore<LiveState>()((set, get) => {
    const apply = (items: Item[]) => {
      if (items.length === 0) return;
      let data: LiveData = get();
      for (const item of items) {
        if (item.type === 'drop') {
          data = {
            ...data,
            stats: {
              ...data.stats,
              dropped: { ...data.stats.dropped, [item.kind]: data.stats.dropped[item.kind] + 1 },
            },
          };
        } else {
          data = reduceMessage(data, item.msg, item.rxAt);
        }
      }
      set(data);
    };

    const flush = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const items = queue;
      queue = [];
      apply(items);
    };

    const enqueue = (item: Item) => {
      queue.push(item);
      if (flushMs <= 0) flush();
      else timer ??= setTimeout(flush, flushMs);
    };

    return {
      ...initialLiveData(now()),
      ingest: (msg) => enqueue({ type: 'msg', msg, rxAt: now() }),
      applySnapshot: (snap) => {
        const rxAt = now();
        enqueue({ type: 'msg', msg: { kind: 'siteState', value: snap.site }, rxAt });
        for (const value of snap.bays)
          enqueue({ type: 'msg', msg: { kind: 'bayState', value }, rxAt });
        enqueue({ type: 'msg', msg: { kind: 'health', value: snap.health }, rxAt });
      },
      recordDrop: (kind) => enqueue({ type: 'drop', kind }),
      setSourceStatus: (status) => {
        flush();
        if (get().sourceStatus === status) return;
        set({ sourceStatus: status, sourceSince: now() });
      },
      flush,
      reset: () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        queue = [];
        set(initialLiveData(now()));
      },
    };
  });
}

/** The app-wide live store. Tests build their own with createLiveStore({ flushMs: 0 }). */
export const liveStore: LiveStore = createLiveStore();
