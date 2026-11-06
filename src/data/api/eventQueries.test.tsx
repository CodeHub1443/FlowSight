import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhEventWithStatusSchema, type WhEventWithStatus } from '@/domain';
import { DEFAULT_MOCK_ROLE, alertStore, sessionStore } from '@/stores';
import {
  NotPermittedError,
  eventKeys,
  presignFreshMs,
  useEvent,
  useEventAction,
  useEventsInfinite,
  useMediaUrl,
  type EventsServerFilters,
} from './eventQueries';

// Hook behaviour against hand-written MSW handlers: deterministic data, failures on demand. The simulator-backed endpoint
// contract is covered in eventEndpoints.test.ts.

const BASE = 'http://localhost/api';
const ULID = (n: number) => `01M5Q2V6W0M9S346Q3D25VT4${String(n).padStart(2, '0')}`.slice(0, 26);

function makeEvent(n: number): WhEventWithStatus {
  return WhEventWithStatusSchema.parse({
    v: 1,
    id: ULID(n),
    ts: '2026-10-24T19:50:45.120+06:00',
    site: 'dhk-depot',
    bay: 'B02',
    category: 'hygiene',
    type: 'damaged',
    sev: 'warn',
    title: { en: `Damaged case ${n}`, bn: 'ক্ষতিগ্রস্ত কার্টন' },
    src: { cam: 'B02-BELT', model: 'hygiene-v1.2', conf: 0.87 },
    refs: { visitId: null, trackId: null, sku: null, plateEn: null },
    data: { sku: 'RIN-PB-1KG', pack: 'SACK' },
    media: null,
    pos: null,
    status: 'OPEN',
    ack: null,
    closed: null,
    notes: [],
  });
}

const FILTERS: EventsServerFilters = {
  status: ['OPEN', 'ACK'],
  sev: [],
  category: [],
  bay: [],
  q: '',
  from: null,
  to: null,
};

const all = Array.from({ length: 5 }, (_, i) => makeEvent(i + 1));
const first = all[0] as WhEventWithStatus;
const calls: URL[] = [];
let presignCalls = 0;
let presignTtlMs = 15 * 60_000;
let actionStatus = 200;

const notFound = () =>
  HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'no' } }, { status: 404 });

const server = setupServer(
  http.get(`${BASE}/events`, ({ request }) => {
    const url = new URL(request.url);
    calls.push(url);
    const cursor = Number(url.searchParams.get('cursor') ?? 0);
    const limit = 2; // small pages so the paging is visible
    const next = cursor + limit < all.length ? String(cursor + limit) : null;
    return HttpResponse.json({ items: all.slice(cursor, cursor + limit), nextCursor: next });
  }),
  http.get(`${BASE}/events/:id`, ({ params }) => {
    const e = all.find((x) => x.id === params.id);
    return e ? HttpResponse.json(e) : notFound();
  }),
  http.post(`${BASE}/events/:id/:action`, async ({ params, request }) => {
    if (actionStatus !== 200) {
      return HttpResponse.json(
        { error: { code: actionStatus === 403 ? 'FORBIDDEN' : 'BOOM', message: 'denied' } },
        { status: actionStatus },
      );
    }
    const e = all.find((x) => x.id === params.id);
    if (!e) return notFound();
    const body = (await request.json()) as { note?: string; text?: string };
    const at = '2026-10-24T20:00:00.000+06:00';
    const next: WhEventWithStatus =
      params.action === 'ack'
        ? { ...e, status: 'ACK', ack: { by: 'server', at } }
        : params.action === 'close'
          ? { ...e, status: 'CLOSED', closed: { by: 'server', at, note: body.note ?? '' } }
          : { ...e, notes: [...e.notes, { by: 'server', at, text: body.text ?? '' }] };
    return HttpResponse.json(next);
  }),
  http.get(`${BASE}/media/presign`, ({ request }) => {
    presignCalls += 1;
    const key = new URL(request.url).searchParams.get('key');
    return HttpResponse.json({
      url: `blob:test/${key}/${presignCalls}`,
      expiresAt: new Date(Date.now() + presignTtlMs).toISOString(),
    });
  }),
);

beforeAll(() => {
  vi.stubEnv('VITE_API_BASE', BASE);
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

let client: QueryClient;
beforeEach(() => {
  calls.length = 0;
  presignCalls = 0;
  presignTtlMs = 15 * 60_000;
  actionStatus = 200;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  server.resetHandlers();
  alertStore.getState().reset();
  sessionStore.getState().setMockRole(DEFAULT_MOCK_ROLE);
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

describe('useEventsInfinite', () => {
  it('walks the cursor and sends the filters', async () => {
    const { result } = renderHook(
      () => useEventsInfinite({ ...FILTERS, sev: ['warn', 'critical'], bay: ['B02'], q: 'tape' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.items.map((e) => e.id)).toEqual([ULID(1), ULID(2)]);
    expect(result.current.hasNextPage).toBe(true);
    const req = calls[0];
    expect(req?.searchParams.get('status')).toBe('OPEN,ACK');
    expect(req?.searchParams.get('sev')).toBe('warn,critical');
    expect(req?.searchParams.get('bay')).toBe('B02');
    expect(req?.searchParams.get('q')).toBe('tape');
    expect(req?.searchParams.get('limit')).toBe('100');
    expect(req?.searchParams.has('cursor')).toBe(false);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.data?.pages.flatMap((p) => p.items.map((e) => e.id))).toEqual(
      all.map((e) => e.id),
    );
    expect(calls[1]?.searchParams.get('cursor')).toBe('2');
  });
});

describe('useEventAction', () => {
  const id = ULID(1);

  it('applies the change at once to the alert store and the detail cache, then keeps the server version', async () => {
    alertStore.getState().mergeEvents([first]);
    client.setQueryData(eventKeys.detail(id), first);
    const { result } = renderHook(() => useEventAction(), { wrapper });
    let promise: Promise<unknown> = Promise.resolve();
    act(() => {
      promise = result.current.mutateAsync({ id, action: 'ack' });
    });
    await waitFor(() => expect(alertStore.getState().events[id]?.status).toBe('ACK'));
    expect(client.getQueryData<WhEventWithStatus>(eventKeys.detail(id))?.status).toBe('ACK');
    await act(async () => {
      await promise;
    });
    expect(client.getQueryData<WhEventWithStatus>(eventKeys.detail(id))?.ack?.by).toBe('server');
    expect(alertStore.getState().events[id]?.status).toBe('ACK');
  });

  it('rolls back the store, the detail cache and the cached lists on a server error', async () => {
    actionStatus = 500;
    alertStore.getState().mergeEvents([first]);
    const listKey = eventKeys.list('dhk-depot', FILTERS);
    client.setQueryData(eventKeys.detail(id), first);
    client.setQueryData(listKey, {
      pages: [{ items: [first], nextCursor: null }],
      pageParams: [undefined],
    });
    const { result } = renderHook(() => useEventAction(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id, action: 'close', note: 'done' }).catch(() => {});
    });
    expect(result.current.isError).toBe(true);
    expect(result.current.error).not.toBeInstanceOf(NotPermittedError);
    expect(alertStore.getState().events[id]?.status).toBe('OPEN');
    expect(alertStore.getState().events[id]?.closed).toBeNull();
    expect(client.getQueryData<WhEventWithStatus>(eventKeys.detail(id))?.status).toBe('OPEN');
    const list = client.getQueryData<{ pages: { items: WhEventWithStatus[] }[] }>(listKey);
    expect(list?.pages[0]?.items[0]?.status).toBe('OPEN');
  });

  it('shows the optimistic state while the request is pending, before the rollback', async () => {
    actionStatus = 500;
    alertStore.getState().mergeEvents([first]);
    const seen: string[] = [];
    const unsub = alertStore.subscribe((s) => {
      const st = s.events[id]?.status;
      if (st) seen.push(st);
    });
    const { result } = renderHook(() => useEventAction(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id, action: 'ack' }).catch(() => {});
    });
    unsub();
    expect(seen).toContain('ACK');
    expect(seen.at(-1)).toBe('OPEN');
  });

  it('maps a 403 to NotPermittedError and rolls back', async () => {
    actionStatus = 403;
    alertStore.getState().mergeEvents([first]);
    const { result } = renderHook(() => useEventAction(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id, action: 'ack' }).catch(() => {});
    });
    expect(result.current.error).toBeInstanceOf(NotPermittedError);
    expect(alertStore.getState().events[id]?.status).toBe('OPEN');
  });

  it('a note keeps the status and appends the text', async () => {
    alertStore.getState().mergeEvents([first]);
    const { result } = renderHook(() => useEventAction(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id, action: 'note', text: 'looked at it' });
    });
    expect(alertStore.getState().events[id]?.status).toBe('OPEN');
    expect(alertStore.getState().events[id]?.notes.at(-1)?.text).toBe('looked at it');
  });
});

describe('useEvent', () => {
  it('fetches by id and is disabled without one', async () => {
    const { result } = renderHook(() => useEvent(ULID(3)), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe(ULID(3));
    const off = renderHook(() => useEvent(undefined), { wrapper });
    expect(off.result.current.fetchStatus).toBe('idle');
  });
});

describe('useMediaUrl', () => {
  const KEY = 'evidence/dhk-depot/2026-10-24/01M5Q2V6W0M9S346Q3D25VT4F5.jpg';

  it('presigns once and reuses the URL while it is fresh (until 30 s before expiresAt)', async () => {
    const a = renderHook(() => useMediaUrl(KEY), { wrapper });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    const b = renderHook(() => useMediaUrl(KEY), { wrapper });
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
    expect(presignCalls).toBe(1);
    expect(b.result.current.data?.url).toBe(a.result.current.data?.url);
  });

  it('asks again when the cached URL is within 30 s of expiring', async () => {
    presignTtlMs = 20_000; // already inside the margin
    const a = renderHook(() => useMediaUrl(KEY), { wrapper });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    a.unmount();
    const b = renderHook(() => useMediaUrl(KEY), { wrapper });
    await waitFor(() => expect(presignCalls).toBe(2));
    expect(b.result.current.data).toBeDefined();
  });

  it('presignFreshMs counts down to 30 s before expiry and never goes negative', () => {
    const now = Date.parse('2026-10-24T20:00:00Z');
    expect(presignFreshMs({ url: 'x', expiresAt: '2026-10-24T20:10:00Z' }, now)).toBe(570_000);
    expect(presignFreshMs({ url: 'x', expiresAt: '2026-10-24T20:00:10Z' }, now)).toBe(0);
  });

  it('is disabled without a key', () => {
    const { result } = renderHook(() => useMediaUrl(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(presignCalls).toBe(0);
  });
});
