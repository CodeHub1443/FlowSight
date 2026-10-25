import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { alertStore, uiStore } from '@/stores';
import { makeBay, makeEvent, makeSite, ulid } from '@/stores/testUtils';
import { Tray } from './Tray';
import { push, renderWithProviders, resetStores, T0 } from './testHarness';

const EVENT_ID = ulid(1);

async function seed(role: Parameters<typeof resetStores>[0] = 'DC_MANAGER') {
  await resetStores(role);
  push(
    { kind: 'siteState', value: makeSite(T0) },
    {
      kind: 'bayState',
      value: makeBay('B01', T0, (b) => {
        b.visit = null;
        b.queue = [];
      }),
    },
    {
      // the contract fixture: loading V-...-B02-0007, with V-...-B02-0008 queued in apron slot 1
      kind: 'bayState',
      value: makeBay('B02', T0, (b) => {
        if (b.visit) b.visit.visitId = 'V-20261024-B02-0007';
      }),
    },
    {
      kind: 'bayState',
      value: makeBay('B03', T0, (b) => {
        b.crew.captain = null;
        b.queue = [];
        if (b.visit) b.visit.visitId = 'V-20261024-B03-0008';
      }),
    },
  );
  alertStore.getState().ingestEvent(makeEvent(EVENT_ID, { bay: 'B02' }));
}

describe('Tray', () => {
  beforeEach(() => seed());

  it('shows live counts on the four tabs', () => {
    renderWithProviders(<Tray />);
    expect(screen.getByRole('tab', { name: /Bays/ })).toHaveTextContent('3/3');
    // two trucks at doors + one queued on the apron
    expect(screen.getByRole('tab', { name: /Trucks/ })).toHaveTextContent('3');
    expect(screen.getByRole('tab', { name: /Alerts/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Captains/ })).toHaveTextContent('2');
  });

  it('lists queued trucks after the docked ones, as waiting with their apron slot', async () => {
    renderWithProviders(<Tray />);
    await userEvent.click(screen.getByRole('tab', { name: /Trucks/ }));
    const rows = screen.getAllByTestId(/^tray-truck-V-/).map((r) => r.dataset.testid);
    expect(rows).toEqual([
      'tray-truck-V-20261024-B02-0007',
      'tray-truck-V-20261024-B03-0008',
      'tray-truck-V-20261024-B02-0008',
    ]);
    const queued = screen.getByTestId('tray-truck-V-20261024-B02-0008');
    expect(queued).toHaveTextContent('Waiting');
    expect(queued).toHaveTextContent('ঢাকা মেট্রো-ট ২২-৪৮১৫');
    expect(screen.getByTestId('tray-truck-slot-V-20261024-B02-0008')).toHaveTextContent(
      'Apron slot 1',
    );
    await userEvent.click(queued);
    expect(uiStore.getState().selection).toEqual({ kind: 'truck', id: 'V-20261024-B02-0008' });
  });

  it('a departed truck is listed but not counted, so the count matches trucks on site', async () => {
    push({
      kind: 'bayState',
      value: makeBay('B03', T0, (b) => {
        b.queue = [];
        if (b.visit) {
          b.visit.visitId = 'V-20261024-B03-0008';
          b.visit.phase = 'DEPARTED';
          b.visit.departedAt = T0;
        }
      }),
    });
    renderWithProviders(<Tray />);
    expect(screen.getByRole('tab', { name: /Trucks/ })).toHaveTextContent('2');
    await userEvent.click(screen.getByRole('tab', { name: /Trucks/ }));
    expect(screen.getByTestId('tray-truck-V-20261024-B03-0008')).toBeInTheDocument();
  });

  it('clicking a bay row selects it and sets the camera target', async () => {
    renderWithProviders(<Tray />);
    await userEvent.click(screen.getByTestId('tray-bay-B02'));
    expect(uiStore.getState().selection).toEqual({ kind: 'bay', id: 'B02' });
    expect(uiStore.getState().cameraTarget).toMatchObject({ kind: 'bay', id: 'B02' });
  });

  it('clicking a truck row selects the visit and flies to it', async () => {
    renderWithProviders(<Tray />);
    await userEvent.click(screen.getByRole('tab', { name: /Trucks/ }));
    expect(uiStore.getState().trayTab).toBe('trucks');
    await userEvent.click(screen.getByTestId('tray-truck-V-20261024-B02-0007'));
    expect(uiStore.getState().selection).toEqual({ kind: 'truck', id: 'V-20261024-B02-0007' });
    expect(uiStore.getState().cameraTarget).toMatchObject({
      kind: 'truck',
      id: 'V-20261024-B02-0007',
    });
  });

  it('clicking an alert row selects the event; clicking a captain row selects the person', async () => {
    renderWithProviders(<Tray />);
    await userEvent.click(screen.getByRole('tab', { name: /Alerts/ }));
    await userEvent.click(screen.getByTestId(`tray-alert-${EVENT_ID}`));
    expect(uiStore.getState().selection).toEqual({ kind: 'event', id: EVENT_ID });

    await userEvent.click(screen.getByRole('tab', { name: /Captains/ }));
    await userEvent.click(screen.getByTestId('tray-captain-B02'));
    expect(uiStore.getState().selection).toEqual({ kind: 'person', id: 't-88' });
  });

  it('re-clicking the same row issues a new camera request (seq changes)', async () => {
    renderWithProviders(<Tray />);
    await userEvent.click(screen.getByTestId('tray-bay-B02'));
    const first = uiStore.getState().cameraTarget?.seq;
    await userEvent.click(screen.getByTestId('tray-bay-B02'));
    expect(uiStore.getState().cameraTarget?.seq).toBeGreaterThan(first ?? 0);
  });

  it('hides captain names for roles that may not see them', async () => {
    await seed('KIOSK');
    renderWithProviders(<Tray />);
    await userEvent.click(screen.getByRole('tab', { name: /Captains/ }));
    expect(screen.queryByText(/Rahim/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Captain').length).toBeGreaterThan(0);
  });

  it('shows the captain name to a depot manager', async () => {
    renderWithProviders(<Tray />);
    await userEvent.click(screen.getByRole('tab', { name: /Captains/ }));
    expect(screen.getAllByText('Md. Rahim Uddin').length).toBeGreaterThan(0);
  });

  it('collapses to the header only', async () => {
    renderWithProviders(<Tray />);
    expect(screen.getByTestId('tray-bay-B02')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse panel' }));
    expect(screen.queryByTestId('tray-bay-B02')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Bays/ })).toBeInTheDocument();
  });
});
