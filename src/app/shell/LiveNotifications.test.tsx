import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStores } from '@/features/live/testHarness';
import { alertStore, liveStore, uiStore } from '@/stores';
import { makeEvent, ulid } from '@/stores/testUtils';
import { LiveNotifications } from './LiveNotifications';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { custom: vi.fn(), dismiss: vi.fn(), error: vi.fn() }),
}));
import { toast } from 'sonner';

const custom = vi.mocked(toast.custom);
const VISIT = 'V-20261024-B04-0001';
const PPE = { trackId: null, role: 'WORKER' as const, missing: ['helmet' as const] };

/** The source has been live for a minute: past the connect backfill. */
function goLive(ageMs = 60_000) {
  liveStore.getState().setSourceStatus('live');
  liveStore.setState({ sourceSince: Date.now() - ageMs });
}

let slot: (n: ReactNode) => void = () => {};
function Where() {
  const l = useLocation();
  const [node, setNode] = useState<ReactNode>(null);
  useEffect(() => {
    slot = setNode;
  }, []);
  return (
    <>
      <output data-testid="where">{`${l.pathname}${l.search}`}</output>
      {node}
    </>
  );
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/live']}>
      <LiveNotifications />
      <Where />
    </MemoryRouter>,
  );
}

/** Ingest one live event and let the lazily loaded notification runtime run. */
const ingest = (
  n: number,
  over: Parameters<typeof makeEvent>[1] = {},
  sev: 'info' | 'warn' | 'critical' = 'warn',
) =>
  act(async () => {
    alertStore.getState().ingestEvent({ ...makeEvent(ulid(n), over), sev });
    await import('./notifyRuntime');
    await new Promise((r) => setTimeout(r, 0));
  });
beforeEach(async () => {
  (await import('./notifyRuntime')).resetNotifications();
  custom.mockClear();
  vi.mocked(toast.dismiss).mockClear();
  await resetStores();
  goLive();
});

describe('LiveNotifications', () => {
  it('toasts a live warn event for 8 seconds, with an id per event', async () => {
    mount();
    await ingest(1, { category: 'ppe', type: 'violation', data: PPE });
    expect(custom).toHaveBeenCalledTimes(1);
    const opts = custom.mock.calls[0]?.[1];
    expect(opts).toMatchObject({ id: `notify-${ulid(1)}`, duration: 8000 });
  });

  it('keeps a critical toast until it is dismissed', async () => {
    mount();
    await ingest(
      1,
      { category: 'compliance', type: 'on_belt', data: { trackId: null } },
      'critical',
    );
    expect(custom.mock.calls[0]?.[1]).toMatchObject({ duration: Infinity });
  });

  it('is silent for info events, REST-merged events and events inside the connect backfill', async () => {
    mount();
    await ingest(
      1,
      {
        category: 'truck',
        type: 'arrived',
        data: { visitId: VISIT, plateEn: 'X', at: '2026-10-24T10:00:00+06:00' },
      },
      'info',
    );
    act(() =>
      alertStore.getState().mergeEvents([
        {
          ...makeEvent(ulid(2), { category: 'ppe', type: 'violation', data: PPE }),
          status: 'OPEN',
          ack: null,
          closed: null,
          notes: [],
        },
      ]),
    );
    expect(custom).not.toHaveBeenCalled();
    goLive(500);
    await ingest(3, { category: 'ppe', type: 'violation', data: PPE });
    expect(custom).not.toHaveBeenCalled();
  });

  it('is silent while the source is not live', async () => {
    mount();
    liveStore.getState().setSourceStatus('offline');
    await ingest(1, { category: 'ppe', type: 'violation', data: PPE });
    expect(custom).not.toHaveBeenCalled();
  });

  it('does not toast a category the session role cannot view', async () => {
    await resetStores('HQ_VIEWER');
    goLive();
    mount();
    await ingest(1, { category: 'security', type: 'door_open_idle', data: { minutes: 9 } });
    expect(custom).not.toHaveBeenCalled();
    await ingest(2, { category: 'ppe', type: 'violation', data: PPE });
    expect(custom).toHaveBeenCalledTimes(1);
  });

  it('does not toast events that were already unread when it mounted', async () => {
    await ingest(1, { category: 'ppe', type: 'violation', data: PPE });
    mount();
    expect(custom).not.toHaveBeenCalled();
  });

  it('does not toast the same key twice within 60 seconds', async () => {
    mount();
    await ingest(1, { category: 'ppe', type: 'violation', data: PPE, bay: 'B01' });
    await ingest(2, { category: 'ppe', type: 'violation', data: PPE, bay: 'B01' });
    await ingest(3, { category: 'ppe', type: 'violation', data: PPE, bay: 'B02' });
    expect(custom).toHaveBeenCalledTimes(2);
  });

  it('collapses hygiene and belt events of one visit into one toast with a live count', async () => {
    mount();
    const withVisit = (n: number, type: string, category = 'hygiene') =>
      act(async () => {
        const e = makeEvent(ulid(n), {
          category,
          type,
          bay: 'B04',
          data: category === 'belt' ? { sku: null, pack: 'CASE' } : { sku: null, pack: 'SACK' },
        });
        alertStore.getState().ingestEvent({ ...e, refs: { ...e.refs, visitId: VISIT } });
        await import('./notifyRuntime');
        await new Promise((r) => setTimeout(r, 0));
      });
    await withVisit(1, 'damaged');
    await withVisit(2, 'open_tape');
    await withVisit(3, 'fall_off', 'belt');
    expect(custom).toHaveBeenCalledTimes(3);
    const ids = custom.mock.calls.map((c) => c[1]?.id);
    expect(new Set(ids).size).toBe(1);

    const last = custom.mock.calls[2]?.[0] as (id: string) => ReactNode;
    act(() => slot(last('x')));
    expect(screen.getByTestId('live-toast-text')).toHaveTextContent('3 product issues, Bay 4');
    expect(screen.getByTestId('live-toast')).toHaveAttribute('data-count', '3');
  });

  it('shows at most 3 toasts: a fourth evicts the oldest warn one', async () => {
    mount();
    for (const [i, bay] of ['B01', 'B02', 'B03', 'B04'].entries()) {
      await ingest(i + 1, { category: 'ppe', type: 'violation', data: PPE, bay });
    }
    expect(custom).toHaveBeenCalledTimes(4);
    expect(toast.dismiss).toHaveBeenCalledWith(`notify-${ulid(1)}`);
  });

  it('"Show on map" selects the event and flies to it; "Open" goes to the event page', async () => {
    mount();
    await ingest(1, { category: 'ppe', type: 'violation', data: PPE, bay: 'B02' });
    const body = custom.mock.calls[0]?.[0] as (id: string) => ReactNode;
    act(() => slot(body('t1')));

    await userEvent.click(screen.getByRole('button', { name: 'Show on map' }));
    expect(uiStore.getState().selection).toEqual({ kind: 'event', id: ulid(1) });
    expect(uiStore.getState().cameraTarget).toMatchObject({ kind: 'event', id: ulid(1) });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/live'));

    act(() => slot(body('t1')));
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(`/events/${ulid(1)}`),
    );
    expect(toast.dismiss).toHaveBeenCalledWith(`notify-${ulid(1)}`);
  });

  it('renders the toast text in Bangla', async () => {
    await resetStores('DC_MANAGER', 'bn');
    goLive();
    mount();
    await ingest(1, { category: 'ppe', type: 'violation', data: PPE, bay: 'B02' });
    const body = custom.mock.calls[0]?.[0] as (id: string) => ReactNode;
    act(() => slot(body('t1')));
    expect(screen.getByRole('button', { name: 'মানচিত্রে দেখুন' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'খুলুন' })).toBeInTheDocument();
  });

  it('stops listening when unmounted', async () => {
    const { unmount } = mount();
    unmount();
    await ingest(1, { category: 'ppe', type: 'violation', data: PPE });
    expect(custom).not.toHaveBeenCalled();
  });
});
