import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { alertStore, uiStore } from '@/stores';
import { makeBay, makeEvent, makeSite, ulid } from '@/stores/testUtils';
import { Inspector } from './Inspector';
import { Tray } from './Tray';
import { push, renderWithProviders, resetStores, stubBrowserApis, T0 } from './testHarness';

// Links and actions that 22A adds to the live panels: the tray row, the inspector event body.

const ID = ulid(7);

async function seed(role: Parameters<typeof resetStores>[0] = 'DC_MANAGER') {
  await resetStores(role);
  push({ kind: 'siteState', value: makeSite(T0) }, { kind: 'bayState', value: makeBay('B02', T0) });
  alertStore.getState().ingestEvent(makeEvent(ID, { bay: 'B02' }));
}

const withQuery = (node: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {node}
  </QueryClientProvider>
);

beforeAll(stubBrowserApis);

describe('Tray alert rows', () => {
  it('link to the event in the Events page, next to the row that selects it on the map', async () => {
    await seed();
    uiStore.setState({ trayTab: 'alerts' });
    renderWithProviders(<Tray />);
    const link = await screen.findByTestId(`tray-alert-${ID}-open`);
    expect(link).toHaveAttribute('href', `/events/${ID}`);
    expect(link).toHaveAccessibleName('Open in Events');
    // the row itself is still the map action and is not nested inside the link
    expect(screen.getByTestId(`tray-alert-${ID}`)).not.toContainElement(link);
  });
});

describe('Inspector event body', () => {
  it('offers "Open in Events" and, for a role that can act, Acknowledge / Close / Note', async () => {
    await seed('DC_MANAGER');
    renderWithProviders(withQuery(<Inspector />));
    act(() => uiStore.getState().select({ kind: 'event', id: ID }));
    expect(screen.getByTestId('inspector-open-events')).toHaveAttribute('href', `/events/${ID}`);
    expect(await screen.findByTestId('event-ack')).toBeInTheDocument();
    expect(screen.getByTestId('event-close')).toBeInTheDocument();
    expect(screen.getByTestId('event-note')).toBeInTheDocument();
  });

  it('shows a read-only role one line and no buttons', async () => {
    await seed('HQ_VIEWER');
    renderWithProviders(withQuery(<Inspector />));
    act(() => uiStore.getState().select({ kind: 'event', id: ID }));
    expect(await screen.findByTestId('event-readonly')).toBeInTheDocument();
    expect(screen.queryByTestId('event-ack')).toBeNull();
    expect(screen.getByTestId('inspector-open-events')).toBeInTheDocument();
  });
});
