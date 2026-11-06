import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Role, WhEventWithStatus } from '@/domain';
import i18n from '@/i18n';
import { selectAlertGroups } from '@/features/live/kpiDetail/selectors';
import { stubBrowserApis } from '@/features/live/testHarness';
import { alertStore, liveStore, sessionStore, uiStore } from '@/stores';
import { makeEvent, ulid } from '@/stores/testUtils';
import { EventsPage } from './EventsPage';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), custom: vi.fn(), dismiss: vi.fn() }),
}));
import { toast } from 'sonner';

const BASE = 'http://localhost/api';
const PPE = { trackId: null, role: 'WORKER' as const, missing: ['helmet' as const] };

function row(
  n: number,
  over: Partial<WhEventWithStatus> & { category?: string; type?: string; data?: unknown } = {},
): WhEventWithStatus {
  const { category, type, data, ...rest } = over;
  const base = makeEvent(ulid(n), {
    category: category ?? 'hygiene',
    type: type ?? 'damaged',
    data: data ?? { sku: 'RIN-PB-1KG', pack: 'SACK' },
    bay: 'B02',
    ts: new Date(Date.parse('2026-10-24T10:00:00+06:00') - n * 1000).toISOString(),
  });
  return {
    ...base,
    title: { en: `Damaged case ${n}`, bn: `ক্ষতিগ্রস্ত কার্টন ${n}` },
    status: 'OPEN',
    ack: null,
    closed: null,
    notes: [],
    ...rest,
  } as WhEventWithStatus;
}

let items: WhEventWithStatus[] = [];
let listCalls: URL[] = [];
let listStatus = 200;
let actionStatus = 200;
let actionGate: Promise<void> | null = null;
let actionBodies: unknown[] = [];

const server = setupServer(
  http.get(`${BASE}/events`, ({ request }) => {
    const url = new URL(request.url);
    listCalls.push(url);
    if (listStatus !== 200) {
      return HttpResponse.json({ error: { code: 'BOOM', message: 'x' } }, { status: listStatus });
    }
    const statuses = (url.searchParams.get('status') ?? 'OPEN,ACK').split(',');
    const cursor = Number(url.searchParams.get('cursor') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 100);
    const all = items.filter((e) => statuses.includes(e.status));
    const next = cursor + limit < all.length ? String(cursor + limit) : null;
    return HttpResponse.json({ items: all.slice(cursor, cursor + limit), nextCursor: next });
  }),
  http.get(`${BASE}/events/:id`, ({ params }) => {
    const e = items.find((x) => x.id === params.id);
    return e
      ? HttpResponse.json(e)
      : HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'no' } }, { status: 404 });
  }),
  http.post(`${BASE}/events/:id/:action`, async ({ params, request }) => {
    actionBodies.push(await request.json());
    if (actionGate) await actionGate;
    if (actionStatus !== 200) {
      return HttpResponse.json({ error: { code: 'BOOM', message: 'x' } }, { status: actionStatus });
    }
    const e = items.find((x) => x.id === params.id);
    if (!e)
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'x' } }, { status: 404 });
    const at = '2026-10-24T20:00:00.000+06:00';
    const next: WhEventWithStatus =
      params.action === 'ack'
        ? { ...e, status: 'ACK', ack: { by: 'server', at } }
        : params.action === 'close'
          ? {
              ...e,
              status: 'CLOSED',
              ack: e.ack ?? { by: 'server', at },
              closed: { by: 'server', at, note: 'n' },
            }
          : { ...e, notes: [...e.notes, { by: 'server', at, text: 'n' }] };
    return HttpResponse.json(next);
  }),
  http.get(`${BASE}/media/presign`, () =>
    HttpResponse.json({
      url: 'blob:test/x',
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }),
  ),
);

beforeAll(() => {
  vi.stubEnv('VITE_API_BASE', BASE);
  stubBrowserApis();
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

async function reset(role: Role = 'DC_MANAGER', lang: 'en' | 'bn' = 'en') {
  items = [];
  listCalls = [];
  listStatus = 200;
  actionStatus = 200;
  actionGate = null;
  actionBodies = [];
  vi.mocked(toast.error).mockClear();
  alertStore.getState().reset();
  liveStore.getState().reset();
  uiStore.setState({ selection: null, cameraTarget: null });
  sessionStore.getState().setMockRole(role);
  await i18n.changeLanguage(lang);
}
beforeEach(() => reset());
afterEach(() => server.resetHandlers());

function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.search}`}</output>;
}

function renderPage(path = '/events') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <Where />
          <Routes>
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:id" element={<EventsPage />} />
            <Route path="/live" element={<p data-testid="live-page" />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const where = () => screen.getByTestId('where').textContent;

describe('list', () => {
  it('shows the open events newest first with their columns', async () => {
    items = [row(1), row(2, { sev: 'critical' })];
    renderPage();
    const first = await screen.findByTestId(`events-row-${ulid(1)}`);
    expect(first).toHaveTextContent('Damaged case 1');
    expect(first).toHaveTextContent('Open');
    expect(first).toHaveTextContent('Bay 2');
    expect(first).toHaveTextContent('Hygiene');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', '3');
    // default request: OPEN + ACK, 100 per page, no range
    expect(listCalls[0]?.searchParams.get('status')).toBe('OPEN,ACK');
    expect(listCalls[0]?.searchParams.get('limit')).toBe('100');
    expect(listCalls[0]?.searchParams.get('from')).toBeNull();
  });

  it('windows a long list: only the rows in view are in the DOM', async () => {
    items = Array.from({ length: 300 }, (_, i) => row(i + 1));
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThan(60);
    // the page of 100 is loaded; the grid reports the whole loaded list
    expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', '101');
  });

  it('shows "No open alerts" for the unfiltered default and "No events match" with a way out otherwise', async () => {
    renderPage();
    expect(await screen.findByTestId('events-none-open')).toHaveTextContent('No open alerts');
  });

  it('shows "No events match" with Clear filters when filters are set', async () => {
    renderPage('/events?bay=B05');
    expect(await screen.findByTestId('events-empty')).toHaveTextContent('No events match');
    await userEvent.click(within(screen.getByTestId('events-empty')).getByRole('button'));
    await waitFor(() => expect(where()).toBe('/events'));
    expect(await screen.findByTestId('events-none-open')).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    listStatus = 500;
    renderPage();
    expect(await screen.findByTestId('events-error')).toHaveTextContent('could not be loaded');
    listStatus = 200;
    items = [row(1)];
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId(`events-row-${ulid(1)}`)).toBeInTheDocument();
  });

  it('shows the simulated-data marker in mock mode only', async () => {
    items = [row(1)];
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    const { unmount } = renderPage();
    expect(await screen.findByTestId('events-simulated')).toHaveTextContent('Simulated data');
    unmount();
    vi.stubEnv('VITE_DATA_MODE', 'live');
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);
    expect(screen.queryByTestId('events-simulated')).toBeNull();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_API_BASE', BASE);
  });
});

describe('filters live in the URL', () => {
  it('status, group, bay, severity and text update the query string and the request', async () => {
    items = [row(1)];
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);

    await userEvent.click(screen.getByTestId('events-status-CLOSED'));
    await waitFor(() => expect(where()).toBe('/events?status=OPEN%2CACK%2CCLOSED'));
    await waitFor(() =>
      expect(listCalls.at(-1)?.searchParams.get('status')).toBe('OPEN,ACK,CLOSED'),
    );
    // CLOSED without a range: the request carries today's start as `from`
    expect(listCalls.at(-1)?.searchParams.get('from')).toMatch(
      /^\d{4}-\d{2}-\d{2}T06:00:00\+06:00$/,
    );
    // the URL keeps no range: the default is applied, not written
    expect(where()).not.toContain('from=');

    await userEvent.click(screen.getByTestId('events-group-hygiene'));
    await waitFor(() => expect(where()).toContain('group=hygiene'));
    await userEvent.click(screen.getByTestId('events-group-hygiene'));
    await waitFor(() => expect(where()).not.toContain('group='));

    await userEvent.type(screen.getByTestId('events-search'), 'metro');
    await waitFor(() => expect(where()).toContain('q=metro'), { timeout: 2000 });
  });

  it('reads filters from the URL', async () => {
    items = [row(1)];
    renderPage('/events?status=ACK&bay=B02,B03&sev=warn&group=hygiene');
    await screen.findByTestId('events-empty');
    expect(screen.getByTestId('events-status-ACK')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('events-status-OPEN')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('events-group-hygiene')).toHaveAttribute('aria-pressed', 'true');
    const call = listCalls.at(-1);
    expect(call?.searchParams.get('status')).toBe('ACK');
    expect(call?.searchParams.get('bay')).toBe('B02,B03');
    expect(call?.searchParams.get('sev')).toBe('warn');
    // group is applied on the client, never sent
    expect(call?.searchParams.get('group')).toBeNull();
  });

  it('never lets the last status be switched off', async () => {
    items = [row(1)];
    renderPage('/events?status=ACK');
    await screen.findByTestId('events-empty');
    await userEvent.click(screen.getByTestId('events-status-ACK'));
    expect(screen.getByTestId('events-status-ACK')).toHaveAttribute('aria-pressed', 'true');
  });

  it('group counts equal the KPI popover selector for the role-visible open set', async () => {
    const open = [
      row(1, { category: 'ppe', type: 'violation', data: PPE }),
      row(2, { category: 'ppe', type: 'violation', data: PPE }),
      row(3),
      row(4, { category: 'security', type: 'door_open_idle', data: { minutes: 9 } }),
    ];
    items = open;
    alertStore.getState().mergeEvents(open);
    const mgr = selectAlertGroups(
      open.filter((e) => e.category !== 'security' || true),
      { includeEmpty: true },
    );
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);
    for (const g of mgr) {
      if (g.id === 'other') continue;
      expect(screen.getByTestId(`events-group-${g.id}`)).toHaveAttribute(
        'data-total',
        String(g.total),
      );
    }
    expect(screen.getByTestId('events-group-ppe')).toHaveAttribute('data-total', '2');
    // idle includes security.door_open_idle (exact key wins over the security wildcard)
    expect(screen.getByTestId('events-group-idle')).toHaveAttribute('data-total', '1');
    // the "other" group stays hidden while empty
    expect(screen.queryByTestId('events-group-other')).toBeNull();
  });

  it('hides a group count the role may not see (same set as the popover)', async () => {
    await reset('HQ_VIEWER');
    const open = [
      row(1),
      row(2, { category: 'security', type: 'door_open_idle', data: { minutes: 9 } }),
    ];
    items = open;
    alertStore.getState().mergeEvents(open);
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);
    expect(screen.getByTestId('events-group-idle')).toHaveAttribute('data-total', '0');
    expect(screen.getByTestId('events-group-hygiene')).toHaveAttribute('data-total', '1');
  });

  it('offers only the categories the role may view', async () => {
    await reset('HQ_VIEWER');
    items = [row(1)];
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);
    await userEvent.click(screen.getByTestId('events-category-toggle'));
    expect(await screen.findByTestId('events-category-hygiene')).toBeVisible();
    expect(screen.queryByTestId('events-category-security')).toBeNull();
    expect(screen.queryByTestId('events-category-roster')).toBeNull();
  });

  it('lists the bays in bay order', async () => {
    items = [row(1)];
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);
    await userEvent.click(screen.getByTestId('events-bay-toggle'));
    const ids = within(screen.getByTestId('events-bay'))
      .getAllByRole('checkbox')
      .map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(
      ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07'].map((b) => `events-bay-${b}`),
    );
  });
});

describe('keyboard', () => {
  it('Down moves, Enter opens the drawer, A acknowledges, Escape closes', async () => {
    items = [row(1), row(2)];
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);
    const grid = screen.getByTestId('events-scroller');
    grid.focus();
    expect(screen.getByTestId(`events-row-${ulid(1)}`)).toHaveAttribute('data-active', 'true');
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId(`events-row-${ulid(2)}`)).toHaveAttribute('data-active', 'true');
    expect(grid).toHaveAttribute('aria-activedescendant', `events-row-${ulid(2)}`);
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByTestId(`events-row-${ulid(1)}`)).toHaveAttribute('data-active', 'true');

    await userEvent.keyboard('a');
    await waitFor(() =>
      expect(screen.getByTestId(`events-row-${ulid(1)}`)).toHaveAttribute('data-status', 'ACK'),
    );
    await waitFor(() => expect(actionBodies).toHaveLength(1));

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(where()).toBe(`/events/${ulid(1)}`));
    expect(await screen.findByTestId('event-detail')).toHaveAttribute('data-event-id', ulid(1));

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('event-detail')).toBeNull());
    expect(where()).toBe('/events');
  });

  it('A does nothing for a read-only role', async () => {
    await reset('HQ_VIEWER');
    items = [row(1)];
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);
    screen.getByTestId('events-scroller').focus();
    await userEvent.keyboard('a');
    await new Promise((r) => setTimeout(r, 50));
    expect(actionBodies).toHaveLength(0);
    expect(screen.getByTestId(`events-row-${ulid(1)}`)).toHaveAttribute('data-status', 'OPEN');
  });

  it('A does nothing on an event that is already acknowledged', async () => {
    items = [row(1, { status: 'ACK', ack: { by: 'x', at: '2026-10-24T10:00:00+06:00' } })];
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);
    screen.getByTestId('events-scroller').focus();
    await userEvent.keyboard('a');
    await new Promise((r) => setTimeout(r, 50));
    expect(actionBodies).toHaveLength(0);
  });
});

describe('drawer', () => {
  it('shows evidence, references, details and history', async () => {
    const e = row(1, {
      refs: {
        visitId: 'V-20261024-B02-0001',
        trackId: null,
        sku: 'RIN-PB-1KG',
        plateEn: 'DHAKA METRO-DA 11-2171',
      },
      media: {
        snapshotKey: 'evidence/a.jpg',
        clipKey: 'clips/a.mp4',
        bbox: [100, 100, 200, 200],
        frameW: 1920,
        frameH: 1080,
      },
      src: { cam: 'B02-BELT', model: 'hygiene-v1', conf: 0.87 },
      ack: { by: 'Rahim', at: '2026-10-24T10:05:00+06:00' },
      status: 'ACK',
      notes: [{ by: 'Karim', at: '2026-10-24T10:06:00+06:00', text: 'checked on site' }],
    });
    items = [e];
    renderPage(`/events/${e.id}`);
    const detail = await screen.findByTestId('event-detail');
    expect(detail).toHaveTextContent('Damaged case 1');
    expect(detail).toHaveTextContent('B02-BELT');
    expect(detail).toHaveTextContent('87%');
    expect(detail).toHaveTextContent('DHAKA METRO-DA 11-2171');
    expect(detail).toHaveTextContent('RIN-PB-1KG');
    expect(within(detail).getByTestId('event-details')).toHaveTextContent('SACK');
    const history = within(detail).getByTestId('event-history');
    expect(history).toHaveTextContent('Raised');
    expect(history).toHaveTextContent('Acknowledged by Rahim');
    expect(history).toHaveTextContent('checked on site');
    // snapshot with box, full-size dialog, clip with controls and no preload
    expect(await within(detail).findByTestId('event-snapshot-box')).toBeInTheDocument();
    const clip = within(detail).getByTestId('event-clip');
    expect(clip).toHaveAttribute('controls');
    expect(clip).toHaveAttribute('preload', 'none');
    await waitFor(() => expect(clip).toHaveAttribute('poster', 'blob:test/x'));
    await userEvent.click(within(detail).getByTestId('event-snapshot-open'));
    expect(await screen.findByTestId('event-snapshot-full')).toBeInTheDocument();
  });

  it('"Show on map" selects the truck or bay and goes to /live', async () => {
    const e = row(1, {
      refs: { visitId: 'V-20261024-B02-0001', trackId: null, sku: null, plateEn: null },
    });
    items = [e];
    renderPage(`/events/${e.id}`);
    await userEvent.click(await screen.findByTestId('event-show-truck'));
    await waitFor(() => expect(where()).toBe('/live'));
    expect(uiStore.getState().selection).toEqual({ kind: 'truck', id: 'V-20261024-B02-0001' });
    expect(uiStore.getState().cameraTarget).toMatchObject({
      kind: 'truck',
      id: 'V-20261024-B02-0001',
    });
  });

  it('acknowledges optimistically and keeps the result', async () => {
    const e = row(1);
    items = [e];
    alertStore.getState().mergeEvents([e]);
    let release: () => void = () => {};
    actionGate = new Promise((r) => (release = r));
    renderPage(`/events/${e.id}`);
    await userEvent.click(await screen.findByTestId('event-ack'));
    // before the server answers
    await waitFor(() =>
      expect(screen.getByTestId('event-detail')).toHaveAttribute('data-status', 'ACK'),
    );
    expect(screen.queryByTestId('event-ack')).toBeNull();
    release();
    await waitFor(() => expect(alertStore.getState().events[e.id]?.status).toBe('ACK'));
    expect(screen.getByTestId('event-detail')).toHaveAttribute('data-status', 'ACK');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('rolls back and shows an error toast when the server refuses', async () => {
    const e = row(1);
    items = [e];
    alertStore.getState().mergeEvents([e]);
    actionStatus = 500;
    let release: () => void = () => {};
    actionGate = new Promise((r) => (release = r));
    renderPage(`/events/${e.id}`);
    await userEvent.click(await screen.findByTestId('event-ack'));
    await waitFor(() =>
      expect(screen.getByTestId('event-detail')).toHaveAttribute('data-status', 'ACK'),
    );
    release();
    await waitFor(() =>
      expect(screen.getByTestId('event-detail')).toHaveAttribute('data-status', 'OPEN'),
    );
    expect(alertStore.getState().events[e.id]?.status).toBe('OPEN');
    expect(toast.error).toHaveBeenCalledWith('Not saved. Change undone.');
    expect(await screen.findByTestId('event-ack')).toBeInTheDocument();
  });

  it('says "not permitted" on a 403', async () => {
    const e = row(1);
    items = [e];
    actionStatus = 403;
    renderPage(`/events/${e.id}`);
    await userEvent.click(await screen.findByTestId('event-ack'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not permitted.'));
    await waitFor(() =>
      expect(screen.getByTestId('event-detail')).toHaveAttribute('data-status', 'OPEN'),
    );
  });

  it('closing needs a note of at least 3 characters', async () => {
    const e = row(1);
    items = [e];
    alertStore.getState().mergeEvents([e]);
    renderPage(`/events/${e.id}`);
    await userEvent.click(await screen.findByTestId('event-close'));
    const submit = screen.getByTestId('event-submit');
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByTestId('event-draft'), 'ab');
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByTestId('event-draft'), 'c');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await waitFor(() => expect(actionBodies).toEqual([{ note: 'abc' }]));
    await waitFor(() =>
      expect(screen.getByTestId('event-detail')).toHaveAttribute('data-status', 'CLOSED'),
    );
    expect(screen.queryByTestId('event-close')).toBeNull();
    expect(screen.getByTestId('event-history')).toHaveTextContent('Closed by');
  });

  it('restores a refused close note so the user can retry', async () => {
    const e = row(1);
    items = [e];
    actionStatus = 500;
    renderPage(`/events/${e.id}`);
    await userEvent.click(await screen.findByTestId('event-close'));
    await userEvent.type(screen.getByTestId('event-draft'), 'wrong camera angle');
    await userEvent.click(screen.getByTestId('event-submit'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(await screen.findByTestId('event-draft')).toHaveValue('wrong camera angle');
  });

  it('adds a note', async () => {
    const e = row(1);
    items = [e];
    alertStore.getState().mergeEvents([e]);
    renderPage(`/events/${e.id}`);
    await userEvent.click(await screen.findByTestId('event-note'));
    await userEvent.type(screen.getByTestId('event-draft'), 'seen');
    await userEvent.click(screen.getByTestId('event-submit'));
    await waitFor(() => expect(actionBodies).toEqual([{ text: 'seen' }]));
  });

  it('keeps a draft when a lifecycle message arrives for the same event', async () => {
    const e = row(1);
    items = [e];
    alertStore.getState().mergeEvents([e]);
    renderPage(`/events/${e.id}`);
    await userEvent.click(await screen.findByTestId('event-note'));
    await userEvent.type(screen.getByTestId('event-draft'), 'half a thou');
    act(() => {
      alertStore.getState().applyLifecycle({
        v: 1,
        id: e.id,
        site: e.site,
        status: 'ACK',
        by: { userId: 'u-other', name: 'Someone else' },
        at: '2026-10-24T10:10:00+06:00',
        note: null,
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId('event-detail')).toHaveAttribute('data-status', 'ACK'),
    );
    expect(screen.getByTestId('event-draft')).toHaveValue('half a thou');
    expect(screen.getByTestId('event-history')).toHaveTextContent('Acknowledged by Someone else');
  });

  it('gives a read-only role no action buttons and one line of explanation', async () => {
    await reset('HQ_VIEWER');
    const e = row(1);
    items = [e];
    renderPage(`/events/${e.id}`);
    expect(await screen.findByTestId('event-readonly')).toHaveTextContent('View only.');
    expect(screen.queryByTestId('event-ack')).toBeNull();
    expect(screen.queryByTestId('event-close')).toBeNull();
    expect(screen.queryByTestId('event-note')).toBeNull();
  });

  it('gives an acting role the buttons', async () => {
    const e = row(1);
    items = [e];
    renderPage(`/events/${e.id}`);
    expect(await screen.findByTestId('event-ack')).toBeInTheDocument();
    expect(screen.getByTestId('event-close')).toBeInTheDocument();
    expect(screen.getByTestId('event-note')).toBeInTheDocument();
    expect(screen.queryByTestId('event-readonly')).toBeNull();
  });
});

describe('deep link /events/:id', () => {
  it('opens the drawer for an event that is not in the list (fetch by id)', async () => {
    const closed = row(9, {
      status: 'CLOSED',
      closed: { by: 'x', at: '2026-10-24T10:00:00+06:00', note: 'done' },
    });
    items = [closed];
    renderPage(`/events/${closed.id}`);
    expect(await screen.findByTestId('event-detail')).toHaveAttribute('data-event-id', closed.id);
    // the list behind it is the default one and does not contain the closed event
    expect(screen.queryByTestId(`events-row-${closed.id}`)).toBeNull();
  });

  it('shows one neutral state for an unknown id', async () => {
    renderPage(`/events/${ulid(77)}`);
    const nf = await screen.findByTestId('event-notfound');
    expect(nf).toHaveTextContent('Event not found or not available');
    expect(screen.queryByTestId('event-detail')).toBeNull();
  });

  it('shows the same state for a category the role cannot view', async () => {
    await reset('HQ_VIEWER');
    const e = row(5, { category: 'security', type: 'door_open_idle', data: { minutes: 9 } });
    items = [e];
    renderPage(`/events/${e.id}`);
    const nf = await screen.findByTestId('event-notfound');
    expect(nf).toHaveTextContent('Event not found or not available');
    expect(nf).not.toHaveTextContent(e.title.en);
    expect(screen.queryByTestId('event-detail')).toBeNull();
  });
});

describe('live rows', () => {
  it('merges a live open event at the top when the list is at the top', async () => {
    items = [row(1)];
    alertStore.getState().mergeEvents(items);
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);
    act(() =>
      alertStore.getState().ingestEvent(makeEvent(ulid(50), { ts: '2026-10-24T11:00:00+06:00' })),
    );
    const live = await screen.findByTestId(`events-row-${ulid(50)}`);
    expect(screen.getAllByRole('row')[1]).toBe(live);
    expect(screen.queryByTestId('events-new-pill')).toBeNull();
  });

  it('does not duplicate an event that is both fetched and live', async () => {
    const e = row(1);
    items = [e];
    alertStore.getState().mergeEvents([e]);
    renderPage();
    await screen.findByTestId(`events-row-${e.id}`);
    act(() => alertStore.getState().ingestEvent(makeEvent(e.id, {})));
    expect(screen.getAllByTestId(`events-row-${e.id}`)).toHaveLength(1);
  });

  it('holds new rows behind an "N new" pill while scrolled, then applies them', async () => {
    items = Array.from({ length: 40 }, (_, i) => row(i + 1));
    alertStore.getState().mergeEvents(items);
    renderPage();
    await screen.findByTestId(`events-row-${ulid(1)}`);
    const scroller = screen.getByTestId('events-scroller');
    fireEvent.scroll(scroller, { target: { scrollTop: 400 } });

    act(() =>
      alertStore.getState().ingestEvent(makeEvent(ulid(60), { ts: '2026-10-24T11:00:00+06:00' })),
    );
    const pill = await screen.findByTestId('events-new-pill');
    expect(pill).toHaveTextContent('1 new');
    // the visible rows did not move
    expect(screen.queryByTestId(`events-row-${ulid(60)}`)).toBeNull();
    const before = screen.getAllByRole('row').map((r) => r.id);

    act(() =>
      alertStore.getState().ingestEvent(makeEvent(ulid(61), { ts: '2026-10-24T11:01:00+06:00' })),
    );
    await waitFor(() => expect(screen.getByTestId('events-new-pill')).toHaveTextContent('2 new'));
    expect(screen.getAllByRole('row').map((r) => r.id)).toEqual(before);

    await userEvent.click(screen.getByTestId('events-new-pill'));
    await waitFor(() => expect(screen.queryByTestId('events-new-pill')).toBeNull());
    expect((scroller as HTMLElement).scrollTop).toBe(0);
    fireEvent.scroll(scroller, { target: { scrollTop: 0 } });
    expect(await screen.findByTestId(`events-row-${ulid(61)}`)).toBeInTheDocument();
    expect(screen.getByTestId(`events-row-${ulid(60)}`)).toBeInTheDocument();
  });
});

describe('group by truck', () => {
  it('collapses a truck into one expandable row', async () => {
    const visit = {
      visitId: 'V-20261024-B02-0001',
      trackId: null,
      sku: null,
      plateEn: 'DHAKA METRO-DA 11-2171',
    };
    items = [row(1, { refs: visit }), row(2, { refs: visit }), row(3)];
    renderPage('/events?groupBy=visit');
    const group = await screen.findByTestId('events-group-row-V-20261024-B02-0001');
    expect(group).toHaveTextContent('2 events for this truck');
    expect(screen.queryByTestId(`events-row-${ulid(2)}`)).toBeNull();
    await userEvent.click(group);
    expect(await screen.findByTestId(`events-row-${ulid(2)}`)).toBeInTheDocument();
    expect(screen.getByTestId(`events-row-${ulid(3)}`)).toBeInTheDocument();
  });
});

describe('Bangla', () => {
  it('renders the page, table and drawer in Bangla with Bangla digits', async () => {
    await reset('DC_MANAGER', 'bn');
    const e = row(1, { src: { cam: 'B02-BELT', model: 'm', conf: 0.87 } });
    items = [e, row(2)];
    alertStore.getState().mergeEvents(items);
    renderPage();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('ইভেন্ট');
    const first = await screen.findByTestId(`events-row-${ulid(1)}`);
    expect(first).toHaveTextContent('ক্ষতিগ্রস্ত কার্টন 1');
    expect(first).toHaveTextContent('খোলা');
    expect(first).toHaveTextContent('বে ২');
    // group count chip uses Bangla digits (2 open hygiene events)
    expect(screen.getByTestId('events-group-hygiene')).toHaveTextContent('২');
    expect(screen.getByRole('grid')).toHaveAttribute('aria-label', 'ইভেন্ট');

    await userEvent.click(first);
    const detail = await screen.findByTestId('event-detail');
    expect(detail).toHaveTextContent('৮৭%');
    expect(within(detail).getByTestId('event-ack')).toHaveTextContent('স্বীকার করুন');
    expect(within(detail).getByTestId('event-history')).toHaveTextContent('উঠেছে');
  });
});
