import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  EventLifecycleUpdate,
  EventStatus,
  Page,
  Presign,
  VisitDetail,
  WhEventWithStatus,
} from '@/domain';
import type { EventFilters } from '@/features/events/urlState';
import { DEFAULT_SITE } from '@/features/live/siteInfo';
import { alertStore, applyLifecycleTo, clockNow, sessionStore } from '@/stores';
import { ApiRequestError } from './client';
import {
  ackEvent,
  closeEvent,
  getEvent,
  getEvents,
  getMediaUrl,
  getVisit,
  isoDhaka,
  noteEvent,
  type EventsParams,
} from './endpoints';

// React Query hooks for the events centre (Task 22.0). Live lifecycle messages invalidate nothing here: lists merge live
// open events by id on the page (22A), so a message never refetches 100 rows.
// These live in their own module (not queries.ts) so the /live entry chunk does not carry them.

/** The part of the filters the server understands. `group` and `groupBy` are applied on the client (matchesAlertGroup). */
export type EventsServerFilters = Pick<
  EventFilters,
  'status' | 'sev' | 'category' | 'bay' | 'q' | 'from' | 'to'
>;

export const eventKeys = {
  all: ['events'] as const,
  lists: () => ['events', 'list'] as const,
  list: (site: string, f: EventsServerFilters) =>
    [
      'events',
      'list',
      site,
      {
        status: f.status,
        sev: f.sev,
        category: f.category,
        bay: f.bay,
        q: f.q,
        from: f.from,
        to: f.to,
      },
    ] as const,
  detail: (id: string) => ['events', 'detail', id] as const,
  visit: (visitId: string) => ['events', 'visit', visitId] as const,
  media: (key: string) => ['events', 'media', key] as const,
};

/** GET /events as an infinite query (cursor, 100 per page). Flatten with `data.pages.flatMap(p => p.items)`. */
export function useEventsInfinite(filters: EventsServerFilters) {
  const site = DEFAULT_SITE.id;
  return useInfiniteQuery({
    queryKey: eventKeys.list(site, filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }): Promise<Page<WhEventWithStatus>> => {
      const params: EventsParams = {
        site,
        status: filters.status,
        sev: filters.sev,
        category: filters.category,
        bay: filters.bay,
        q: filters.q,
        from: filters.from ?? undefined,
        to: filters.to ?? undefined,
        cursor: pageParam,
      };
      return getEvents(params, signal);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** GET /events/{id}; disabled while `id` is undefined. */
export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: eventKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getEvent(id ?? '', signal),
    enabled: id !== undefined && id !== '',
  });
}

/** GET /visits/{visitId}; disabled while `visitId` is null. */
export function useVisit(visitId: string | null | undefined) {
  return useQuery<VisitDetail>({
    queryKey: eventKeys.visit(visitId ?? ''),
    queryFn: ({ signal }) => getVisit(visitId ?? '', signal),
    enabled: !!visitId,
  });
}

/** Presigned URLs are reused until this long before they expire. */
export const PRESIGN_MARGIN_MS = 30_000;

/** ms a presigned URL stays reusable: until `PRESIGN_MARGIN_MS` before `expiresAt`. */
export function presignFreshMs(p: Presign, now = Date.now()): number {
  return Math.max(0, Date.parse(p.expiresAt) - PRESIGN_MARGIN_MS - now);
}

/** GET /media/presign?key=. Cached until 30 s before `expiresAt`, then fetched again on next use. */
export function useMediaUrl(key: string | null | undefined) {
  return useQuery<Presign>({
    queryKey: eventKeys.media(key ?? ''),
    queryFn: ({ signal }) => getMediaUrl(key ?? '', signal),
    enabled: !!key,
    staleTime: (q) => (q.state.data ? presignFreshMs(q.state.data) : 0),
  });
}

// ---------------------------------------------------------------------------
// Lifecycle actions
// ---------------------------------------------------------------------------

/** The user may not do that (HTTP 403). The UI shows "not permitted" and the change is rolled back. */
export class NotPermittedError extends Error {
  constructor(message = 'not permitted') {
    super(message);
    this.name = 'NotPermittedError';
  }
}

export type EventAction =
  | { id: string; action: 'ack' }
  | { id: string; action: 'close'; note: string }
  | { id: string; action: 'note'; text: string };

const STATUS_AFTER: Record<EventAction['action'], EventStatus | null> = {
  ack: 'ACK',
  close: 'CLOSED',
  note: null,
};

function send(a: EventAction): Promise<WhEventWithStatus> {
  if (a.action === 'ack') return ackEvent(a.id);
  if (a.action === 'close') return closeEvent(a.id, a.note);
  return noteEvent(a.id, a.text);
}

type ListData = InfiniteData<Page<WhEventWithStatus>, string | undefined>;

/** Replace one event in the detail cache and in every cached list page. */
function patchCaches(
  qc: QueryClient,
  id: string,
  next: (e: WhEventWithStatus) => WhEventWithStatus,
): void {
  qc.setQueryData<WhEventWithStatus>(eventKeys.detail(id), (e) => (e ? next(e) : e));
  qc.setQueriesData<ListData>({ queryKey: eventKeys.lists() }, (d) =>
    d
      ? {
          ...d,
          pages: d.pages.map((p) => ({
            ...p,
            items: p.items.map((e) => (e.id === id ? next(e) : e)),
          })),
        }
      : d,
  );
}

type Rollback = {
  prevStore: WhEventWithStatus | undefined;
  prevAt: number | undefined;
  prevDetail: WhEventWithStatus | undefined;
  prevLists: [readonly unknown[], ListData | undefined][];
};

/**
 * Acknowledge, close or note an event. Optimistic: the alertStore, the detail cache and the cached list pages change at
 * once through `applyLifecycleTo`; on error everything is restored. A 403 rejects with `NotPermittedError`.
 */
export function useEventAction() {
  const qc = useQueryClient();
  return useMutation<WhEventWithStatus, Error, EventAction, Rollback>({
    mutationFn: async (a) => {
      try {
        return await send(a);
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 403) {
          throw new NotPermittedError(e.message);
        }
        throw e;
      }
    },
    onMutate: async (a) => {
      await qc.cancelQueries({ queryKey: eventKeys.all });
      const st = alertStore.getState();
      const rollback: Rollback = {
        prevStore: st.events[a.id],
        prevAt: st.lifecycleAt[a.id],
        prevDetail: qc.getQueryData<WhEventWithStatus>(eventKeys.detail(a.id)),
        prevLists: qc.getQueriesData<ListData>({ queryKey: eventKeys.lists() }),
      };
      const user = sessionStore.getState().user;
      const at = isoDhaka(clockNow());
      const apply = (e: WhEventWithStatus): WhEventWithStatus => {
        const u: EventLifecycleUpdate = {
          v: 1,
          id: a.id,
          site: e.site,
          status: STATUS_AFTER[a.action] ?? e.status,
          by: { userId: user.id, name: user.name },
          at,
          note: a.action === 'close' ? a.note : a.action === 'note' ? a.text : null,
        };
        return applyLifecycleTo(e, u);
      };
      if (rollback.prevStore) {
        const next = apply(rollback.prevStore);
        if (next !== rollback.prevStore) {
          alertStore.setState((s) => ({
            events: { ...s.events, [a.id]: next },
            lifecycleAt: { ...s.lifecycleAt, [a.id]: Date.parse(at) },
          }));
        }
      }
      patchCaches(qc, a.id, apply);
      return rollback;
    },
    onError: (_e, a, rb) => {
      if (!rb) return;
      alertStore.setState((s) => {
        const others = <T>(rec: Record<string, T>): Record<string, T> =>
          Object.fromEntries(Object.entries(rec).filter(([k]) => k !== a.id));
        return {
          events: rb.prevStore ? { ...s.events, [a.id]: rb.prevStore } : others(s.events),
          lifecycleAt:
            rb.prevAt !== undefined
              ? { ...s.lifecycleAt, [a.id]: rb.prevAt }
              : others(s.lifecycleAt),
        };
      });
      qc.setQueryData(eventKeys.detail(a.id), rb.prevDetail);
      for (const [key, data] of rb.prevLists) qc.setQueryData(key, data);
    },
    onSuccess: (server, a) => {
      alertStore.getState().mergeEvents([server]);
      patchCaches(qc, a.id, () => server);
    },
  });
}
