import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { alertStore, uiStore, type SelectionKind } from '@/stores';
import { makeBay, makeEvent, makeSite, ulid } from '@/stores/testUtils';
import actorsFrameJson from '@/domain/fixtures/actors-frame.json';
import { safeParseMessage } from '@/domain';
import { Inspector } from './Inspector';
import { push, renderWithProviders, resetStores, T0 } from './testHarness';

const EVENT_ID = ulid(7);

function actorsFrame() {
  const r = safeParseMessage('actors', actorsFrameJson);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

async function seed(role: Parameters<typeof resetStores>[0] = 'DC_MANAGER') {
  await resetStores(role);
  push(
    { kind: 'siteState', value: makeSite(T0) },
    { kind: 'bayState', value: makeBay('B02', T0) },
    { kind: 'actors', value: actorsFrame() },
  );
  alertStore.getState().ingestEvent(makeEvent(EVENT_ID, { bay: 'B02' }));
}
const select = (kind: SelectionKind, id: string) =>
  act(() => uiStore.getState().select({ kind, id }));

beforeEach(() => seed());

describe('Inspector', () => {
  it('renders nothing without a selection', () => {
    renderWithProviders(<Inspector />);
    expect(screen.queryByTestId('inspector')).not.toBeInTheDocument();
  });

  it('opens a bay body on selection: belt state, truck plate (Bangla primary), timeline, throughput, workforce; crew and staging in More details', async () => {
    renderWithProviders(<Inspector />);
    select('bay', 'B02');
    expect(screen.getByTestId('inspector-title')).toHaveTextContent('Bay 2');
    const body = screen.getByTestId('inspector');
    expect(body).toHaveTextContent('Running loaded');
    expect(within(body).getByTestId('inspector-plate')).toHaveTextContent('ঢাকা মেট্রো-ড ১১-২১৭১');
    expect(within(body).getByTestId('inspector-plate')).toHaveTextContent('DHAKA METRO-DA 11-2171');
    expect(within(body).getByTestId('bay-timeline')).toHaveTextContent('Truck timeline');
    expect(within(body).getByTestId('bay-throughput')).toHaveTextContent('2,410');
    expect(within(body).getByTestId('bay-workforce')).toHaveTextContent('Workers detected');
    // T19 spec 5B: the former crew, staging, today and camera rows sit in "More details", collapsed by default
    expect(body).not.toHaveTextContent('Pallets waiting');
    await userEvent.click(within(body).getByRole('button', { name: 'Show more details' }));
    expect(body).toHaveTextContent('6 (1 captain, 4 workers, 1 forklift)');
    expect(body).toHaveTextContent('Pallets waiting');
  });

  it('shows the captain name only to roles allowed to see it', async () => {
    renderWithProviders(<Inspector />);
    select('bay', 'B02');
    expect(screen.getByTestId('inspector-captain')).toHaveTextContent('Md. Rahim Uddin');
    await act(() => seed('HQ_VIEWER'));
    select('bay', 'B02');
    expect(screen.getByTestId('inspector-captain')).not.toHaveTextContent('Rahim');
    expect(screen.getByTestId('inspector-captain')).toHaveTextContent('Captain on duty');
  });

  it('never shows phone-use or idle behaviour', () => {
    renderWithProviders(<Inspector />);
    for (const target of [
      ['bay', 'B02'],
      ['person', 't-95'],
      ['person', 't-88'],
      ['forklift', 'f-2'],
      ['truck', 'V-20261024-B02-0007'],
    ] as const) {
      select(target[0], target[1]);
      expect(screen.getByTestId('inspector')).not.toHaveTextContent(/phone|idle/i);
    }
  });

  it('opens a truck/visit body', () => {
    renderWithProviders(<Inspector />);
    select('truck', 'V-20261024-B02-0007');
    const body = screen.getByTestId('inspector');
    expect(body).toHaveTextContent('CITY EXPRESS TRANSPORT');
    expect(body).toHaveTextContent('RIN-PB-1KG');
    expect(body).toHaveTextContent('13 min left');
  });

  it('opens an event body with a snapshot area, severity and status', () => {
    renderWithProviders(<Inspector />);
    select('event', EVENT_ID);
    const body = screen.getByTestId('inspector');
    expect(body).toHaveTextContent('Damaged case on belt');
    expect(body).toHaveTextContent('Warning');
    expect(body).toHaveTextContent('Open');
    expect(within(body).getByTestId('evidence-thumb')).toHaveTextContent('Snapshot');
    expect(body).toHaveTextContent('B02-BELT');
    expect(body).toHaveTextContent('87%');
  });

  it('an event the role may not view shows the unavailable state, not its content', async () => {
    await seed('KIOSK');
    alertStore
      .getState()
      .ingestEvent(
        makeEvent(ulid(8), { category: 'security', type: 'door_open_idle', data: { minutes: 9 } }),
      );
    renderWithProviders(<Inspector />);
    select('event', ulid(8));
    expect(screen.getByTestId('inspector-missing')).toBeInTheDocument();
  });

  it('person: role and PPE only; forklift: state', () => {
    renderWithProviders(<Inspector />);
    select('person', 't-95');
    expect(screen.getByTestId('inspector')).toHaveTextContent('Worker');
    expect(screen.getByTestId('inspector')).toHaveTextContent('PPE missing');
    select('forklift', 'f-2');
    expect(screen.getByTestId('inspector')).toHaveTextContent('Carrying a pallet');
  });

  it('site body shows KPIs', () => {
    renderWithProviders(<Inspector />);
    select('site', 'dhk-depot');
    expect(screen.getByTestId('inspector')).toHaveTextContent('5/7');
  });

  it('close clears the selection; pin keeps the last object open when the selection is cleared', async () => {
    renderWithProviders(<Inspector />);
    select('bay', 'B02');
    await userEvent.click(screen.getByTestId('inspector-pin'));
    act(() => uiStore.getState().select(null));
    expect(screen.getByTestId('inspector-title')).toHaveTextContent('Bay 2');
    await userEvent.click(screen.getByTestId('inspector-close'));
    expect(uiStore.getState().selection).toBeNull();
    expect(screen.queryByTestId('inspector')).not.toBeInTheDocument();
  });

  it('unpinned inspector closes when the selection is cleared', () => {
    renderWithProviders(<Inspector />);
    select('bay', 'B02');
    act(() => uiStore.getState().select(null));
    expect(screen.queryByTestId('inspector')).not.toBeInTheDocument();
  });
});
