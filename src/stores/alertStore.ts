import { createStore, type StoreApi } from 'zustand';
import type {
  EventLifecycleUpdate,
  EventStatus,
  WhEvent,
  WhEventWithStatus,
  WhEventStatusFields,
} from '@/domain';
import { filterAlerts, type AlertFilter } from './alertFilter';

// Open alerts keyed by event id (ULID).
//  - Events are deduped by id: a second copy never resets status, notes or the unread flag.
//  - Lifecycle updates move OPEN -> ACK -> CLOSED forward only; notes are appended at any time;
//    an update older than the last one applied to that event is ignored.
//  - A lifecycle update that arrives before its event is parked and applied when the event shows up.
//  - Ack actions are optimistic in the UI and confirmed by REST (later step); this store only applies messages.

export const MAX_EVENTS = 500;
const MAX_PENDING = 200;

const RANK: Record<EventStatus, number> = { OPEN: 0, ACK: 1, CLOSED: 2 };
const ms = (ts: string) => Date.parse(ts);

export interface AlertData {
  events: Record<string, WhEventWithStatus>;
  /** `at` (epoch ms) of the last lifecycle update applied per event. */
  lifecycleAt: Record<string, number>;
  /** Lifecycle updates that arrived before their event. */
  pending: Record<string, EventLifecycleUpdate[]>;
  /** Ids of live events not yet seen by the user. */
  unreadIds: Record<string, true>;
  duplicates: number;
}

export interface AlertActions {
  ingestEvent(e: WhEvent): void;
  /** Merge events from the REST snapshot or a backfill. They do not count as unread. */
  mergeEvents(events: readonly WhEventWithStatus[]): void;
  applyLifecycle(u: EventLifecycleUpdate): void;
  markAllRead(): void;
  markRead(id: string): void;
  reset(): void;
}

export type AlertState = AlertData & AlertActions;
export type AlertStore = StoreApi<AlertState>;

const initialData = (): AlertData => ({
  events: {},
  lifecycleAt: {},
  pending: {},
  unreadIds: {},
  duplicates: 0,
});

function withStatus(e: WhEvent): WhEventWithStatus {
  return { ...e, status: 'OPEN', ack: null, closed: null, notes: [] };
}

/** Pure: apply one lifecycle update to one event. Returns the same object when nothing changes. */
export function applyLifecycleTo(e: WhEventWithStatus, u: EventLifecycleUpdate): WhEventWithStatus {
  const by = u.by.name || u.by.userId;
  const fields: Partial<WhEventStatusFields> = {};
  if (RANK[u.status] > RANK[e.status]) {
    fields.status = u.status;
    if (u.status === 'ACK') fields.ack = { by, at: u.at };
    else {
      fields.closed = { by, at: u.at, note: u.note ?? '' };
      // Closing straight from OPEN still records who saw it last.
      if (e.ack === null) fields.ack = { by, at: u.at };
    }
    if (u.note !== null && u.status === 'ACK') {
      fields.notes = [...e.notes, { by, at: u.at, text: u.note }];
    }
  } else if (u.status === e.status && u.note !== null) {
    fields.notes = [...e.notes, { by, at: u.at, text: u.note }];
  } else {
    return e; // duplicate or backwards transition
  }
  return { ...e, ...fields };
}

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(rec).filter(([k]) => k !== key));
}

function evict(events: Record<string, WhEventWithStatus>): Record<string, WhEventWithStatus> {
  const ids = Object.keys(events);
  if (ids.length <= MAX_EVENTS) return events;
  // Drop the oldest closed events first, then the oldest of anything.
  const byAge = ids.sort((a, b) => {
    const ea = events[a];
    const eb = events[b];
    const closed = (ea?.status === 'CLOSED' ? 0 : 1) - (eb?.status === 'CLOSED' ? 0 : 1);
    return closed || ms(ea?.ts ?? '') - ms(eb?.ts ?? '');
  });
  const drop = new Set(byAge.slice(0, ids.length - MAX_EVENTS));
  return Object.fromEntries(Object.entries(events).filter(([id]) => !drop.has(id)));
}

export function createAlertStore(): AlertStore {
  return createStore<AlertState>()((set, get) => ({
    ...initialData(),

    ingestEvent: (incoming) => {
      const s = get();
      if (s.events[incoming.id]) {
        set({ duplicates: s.duplicates + 1 });
        return;
      }
      let event = withStatus(incoming);
      let lifecycleAt = s.lifecycleAt;
      const parked = s.pending[incoming.id];
      for (const u of parked ?? []) {
        event = applyLifecycleTo(event, u);
        lifecycleAt = {
          ...lifecycleAt,
          [incoming.id]: Math.max(lifecycleAt[incoming.id] ?? 0, ms(u.at)),
        };
      }
      const pending = omit(s.pending, incoming.id);
      set({
        events: evict({ ...s.events, [incoming.id]: event }),
        lifecycleAt,
        pending,
        unreadIds:
          event.status === 'CLOSED' ? s.unreadIds : { ...s.unreadIds, [incoming.id]: true },
      });
    },

    mergeEvents: (incoming) => {
      const s = get();
      let events = s.events;
      for (const e of incoming) {
        const cur = events[e.id];
        if (
          !cur ||
          RANK[e.status] > RANK[cur.status] ||
          (e.status === cur.status && e.notes.length > cur.notes.length)
        ) {
          events = { ...events, [e.id]: e };
        }
      }
      if (events !== s.events) set({ events: evict(events) });
    },

    applyLifecycle: (u) => {
      const s = get();
      const cur = s.events[u.id];
      if (!cur) {
        const parked = s.pending[u.id] ?? [];
        if (Object.keys(s.pending).length >= MAX_PENDING && parked.length === 0) return;
        set({ pending: { ...s.pending, [u.id]: [...parked, u] } });
        return;
      }
      if (ms(u.at) < (s.lifecycleAt[u.id] ?? 0)) return;
      const next = applyLifecycleTo(cur, u);
      if (next === cur) return;
      set({
        events: { ...s.events, [u.id]: next },
        lifecycleAt: { ...s.lifecycleAt, [u.id]: ms(u.at) },
      });
    },

    markAllRead: () => set({ unreadIds: {} }),
    markRead: (id) => {
      const { unreadIds } = get();
      if (!(id in unreadIds)) return;
      set({ unreadIds: omit(unreadIds, id) });
    },
    reset: () => set(initialData()),
  }));
}

/** Open (not closed) events matching the filter, newest first. */
export function selectOpenAlerts(
  s: Pick<AlertData, 'events'>,
  filter: AlertFilter = {},
): WhEventWithStatus[] {
  return filterAlerts(Object.values(s.events), filter);
}

/** Unread count among events the filter lets through (so a role never counts what it cannot see). */
export function selectUnreadCount(
  s: Pick<AlertData, 'events' | 'unreadIds'>,
  filter: AlertFilter = {},
): number {
  const visible = filterAlerts(
    Object.keys(s.unreadIds).flatMap((id) => (s.events[id] ? [s.events[id]] : [])),
    filter,
  );
  return visible.length;
}

export const alertStore: AlertStore = createAlertStore();
