import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { alertStore, sessionStore } from '@/stores';
import { makeEvent, ulid } from '@/stores/testUtils';
import { renderWithProviders, resetStores, stubBrowserApis } from '@/features/live/testHarness';
import { AlertBell } from './AlertBell';

const BELT = ulid(1); // belt: visible to every role
const SECURITY = ulid(2); // security: hidden from HQ_VIEWER and KIOSK
const ROSTER = ulid(3); // roster: hidden from HQ_VIEWER, SECURITY and KIOSK

beforeAll(stubBrowserApis);
beforeEach(async () => {
  await resetStores();
  const s = alertStore.getState();
  s.ingestEvent(makeEvent(BELT, { category: 'belt', type: 'empty_run', data: { minutes: 6 } }));
  s.ingestEvent(
    makeEvent(SECURITY, { category: 'security', type: 'door_open_idle', data: { minutes: 9 } }),
  );
  s.ingestEvent(
    makeEvent(ROSTER, {
      category: 'roster',
      type: 'captain_absent',
      data: { employeeId: 'EMP-1051', minutes: 12 },
    }),
  );
});

const count = () => screen.getByTestId('alert-bell-count');

describe('AlertBell role filtering', () => {
  it('a depot manager sees every category', () => {
    renderWithProviders(<AlertBell />);
    expect(count()).toHaveTextContent('3');
  });

  it.each([
    ['HQ_VIEWER', 1],
    ['SECURITY', 2],
    ['SHIFT_SUPERVISOR', 3],
    ['KIOSK', 1],
  ] as const)('%s sees %i alert(s)', async (role, expected) => {
    await resetStores(role);
    const s = alertStore.getState();
    s.ingestEvent(makeEvent(BELT, { category: 'belt', type: 'empty_run', data: { minutes: 6 } }));
    s.ingestEvent(
      makeEvent(SECURITY, { category: 'security', type: 'door_open_idle', data: { minutes: 9 } }),
    );
    s.ingestEvent(
      makeEvent(ROSTER, {
        category: 'roster',
        type: 'captain_absent',
        data: { employeeId: 'EMP-1051', minutes: 12 },
      }),
    );
    renderWithProviders(<AlertBell />);
    expect(count()).toHaveTextContent(String(expected));
  });

  it('lists only the visible alerts in the dropdown and reacts to a role change', async () => {
    sessionStore.getState().setMockRole('HQ_VIEWER');
    renderWithProviders(<AlertBell />);
    await userEvent.click(screen.getByTestId('alert-bell'));
    const menu = await screen.findByTestId('alert-bell-menu');
    expect(within(menu).getByTestId(`bell-alert-${BELT}`)).toBeInTheDocument();
    expect(within(menu).queryByTestId(`bell-alert-${SECURITY}`)).not.toBeInTheDocument();
    expect(within(menu).queryByTestId(`bell-alert-${ROSTER}`)).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    act(() => sessionStore.getState().setMockRole('ADMIN'));
    expect(count()).toHaveTextContent('3');
  });

  it('shows no count badge when there is nothing to see', async () => {
    await resetStores();
    renderWithProviders(<AlertBell />);
    expect(screen.queryByTestId('alert-bell-count')).not.toBeInTheDocument();
  });
});
