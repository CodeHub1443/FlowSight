import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { alertStore } from '@/stores';
import { makeBay, makeEvent, makeSite, ulid } from '@/stores/testUtils';
import { KpiChips } from './KpiChips';
import { resetTrayFilter } from './kpiDetail/trayFilter';
import { push, renderWithProviders, resetStores, stubBrowserApis, T0 } from './testHarness';

beforeAll(() => stubBrowserApis());
beforeEach(async () => {
  resetTrayFilter();
  await resetStores();
});

/** Open a chip's popover with the mouse and wait for its lazy body. */
async function openPopover(id: string) {
  await userEvent.click(screen.getByTestId(`kpi-open-${id}`));
  const panel = await screen.findByTestId(`kpidetail-${id}`);
  // the body is a lazy chunk: wait for the Suspense fallback to go
  await waitFor(() => expect(within(panel).queryByRole('status')).toBeNull());
  return panel;
}

const valueOf = (testId: string) => screen.getByTestId(`${testId}-value`);

describe('KpiChips', () => {
  it('renders an em dash (never 0) in every chip before the first SiteState', () => {
    renderWithProviders(<KpiChips />);
    for (const id of ['cases', 'trucks', 'bays', 'tat', 'compliance', 'alerts']) {
      const chip = screen.getByTestId(`kpi-${id}`);
      expect(within(chip).getAllByText('—').length).toBeGreaterThan(0);
      expect(chip).not.toHaveTextContent(/(^|\D)0(\D|$)/);
    }
  });

  it('shows values and deltas from SiteState', () => {
    push({ kind: 'siteState', value: makeSite(T0) });
    renderWithProviders(<KpiChips />);
    expect(screen.getByTestId('kpi-cases')).toHaveTextContent('18,240');
    expect(screen.getByTestId('kpi-cases')).toHaveTextContent('6.2%');
    expect(screen.getByTestId('kpi-trucks')).toHaveTextContent('9');
    expect(screen.getByTestId('kpi-bays')).toHaveTextContent('5/7');
    expect(screen.getByTestId('kpi-compliance')).toHaveTextContent('91%');
  });

  it('turnaround chip headlines bay occupancy (rev 1.1), without the depot-turnaround delta', () => {
    push({ kind: 'siteState', value: makeSite(T0) });
    renderWithProviders(<KpiChips />);
    const tat = screen.getByTestId('kpi-tat');
    expect(tat).toHaveAttribute('data-kind', 'full');
    expect(screen.getByTestId('kpi-label-tat')).toHaveTextContent('Bay occupancy');
    // fixture: occupancyMin 52, avgTatMin 63
    expect(tat).toHaveTextContent('52m');
    expect(tat).not.toHaveTextContent('1h 03m');
    expect(within(tat).queryByTestId('kpi-delta')).toBeNull();
  });

  it('turnaround chip falls back to a truthful "Avg turnaround" without kpi.turnaround (older backend)', () => {
    const site = makeSite(T0);
    delete site.kpi.turnaround;
    push({ kind: 'siteState', value: site });
    renderWithProviders(<KpiChips />);
    const tat = screen.getByTestId('kpi-tat');
    expect(tat).toHaveAttribute('data-kind', 'legacy');
    expect(screen.getByTestId('kpi-label-tat')).toHaveTextContent('Avg turnaround');
    expect(tat).toHaveTextContent('1h 03m');
    expect(within(tat).getByTestId('kpi-delta')).toHaveTextContent('4 min');
  });

  it('alerts chip: needs attention = warn + critical; info never inflates it', () => {
    const site = makeSite(T0);
    site.kpi.openAlerts = { info: 9, warn: 70, critical: 4 };
    push({ kind: 'siteState', value: site });
    renderWithProviders(<KpiChips />);
    expect(screen.getByTestId('kpi-label-alerts')).toHaveTextContent('Needs attention');
    expect(screen.getByTestId('kpi-alerts')).toHaveTextContent('74');
    expect(screen.getByTestId('kpi-sev-critical')).toHaveTextContent('4');
    expect(screen.getByTestId('kpi-sev-critical').className).toMatch(/text-critical-ink/);
    expect(screen.getByTestId('kpi-sev-warn')).toHaveTextContent('70');
    expect(screen.getByTestId('kpi-sev-info')).toHaveTextContent('9');
    expect(screen.getByRole('img', { name: '4 critical, 70 warning, 9 info' })).toBeInTheDocument();
  });

  it('PPE chip names the bay with the most violations today, or says there are none', () => {
    push(
      { kind: 'siteState', value: makeSite(T0) },
      { kind: 'bayState', value: makeBay('B01', T0, (b) => void (b.today.ppe = 2)) },
      { kind: 'bayState', value: makeBay('B03', T0, (b) => void (b.today.ppe = 7)) },
      { kind: 'bayState', value: makeBay('B05', T0, (b) => void (b.today.ppe = 7)) },
    );
    renderWithProviders(<KpiChips />);
    // tie on 7: lowest bay id
    expect(screen.getByTestId('kpi-sub-compliance')).toHaveTextContent(
      'Most violations today: Bay 3 (7)',
    );
    act(() =>
      push(
        ...['B01', 'B03', 'B05'].map((id) => ({
          kind: 'bayState' as const,
          value: makeBay(id, T0, (b) => void (b.today.ppe = 0)),
        })),
      ),
    );
    expect(screen.getByTestId('kpi-sub-compliance')).toHaveTextContent('No violations today');
  });

  it('renders null KPI fields as an em dash with an explanatory label, not 0', () => {
    const site = makeSite(T0);
    delete site.kpi.turnaround;
    site.kpi.avgTatMin = null;
    site.kpi.avgTatDeltaMin = null;
    site.kpi.complianceScore = null;
    site.kpi.casesOutDeltaPct = null;
    push({ kind: 'siteState', value: site });
    renderWithProviders(<KpiChips />);

    const tat = screen.getByTestId('kpi-tat');
    expect(within(tat).getAllByText('—').length).toBeGreaterThan(0);
    expect(tat).not.toHaveTextContent('0m');
    const compliance = screen.getByTestId('kpi-compliance');
    expect(compliance).not.toHaveTextContent('0%');
    expect(within(compliance).getByLabelText('Not evaluated yet')).toHaveTextContent('—');
    // Cartons still render; only the delta is unknown.
    const cases = screen.getByTestId('kpi-cases');
    expect(cases).toHaveTextContent('18,240');
    expect(within(cases).getByLabelText(/No comparison yet/)).toHaveTextContent('—');
    expect(screen.queryAllByTestId('kpi-delta')).toHaveLength(0);
  });

  it('occupancy with no finished visit yet (n = 0) is an em dash with a reason', () => {
    const site = makeSite(T0);
    site.kpi.avgTatMin = null;
    site.kpi.turnaround = {
      n: 0,
      occupancyMin: null,
      depotTatMin: null,
      waitForDockMin: null,
      preOpDelayMin: null,
      activeMin: null,
      postOpDelayMin: null,
    };
    push({ kind: 'siteState', value: site });
    renderWithProviders(<KpiChips />);
    const tat = screen.getByTestId('kpi-tat');
    expect(within(tat).getByLabelText('No truck has finished yet')).toHaveTextContent('—');
  });
});

describe('KPI popovers', () => {
  it('opens by click, closes by Esc and returns focus to the chip', async () => {
    push({ kind: 'siteState', value: makeSite(T0) });
    renderWithProviders(<KpiChips />);
    const panel = await openPopover('cartons');
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('Cartons today');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('kpidetail-cartons')).toBeNull());
    expect(screen.getByTestId('kpi-open-cartons')).toHaveFocus();
  });

  it('opens by keyboard (Enter) and traps focus inside', async () => {
    push({ kind: 'siteState', value: makeSite(T0) });
    renderWithProviders(<KpiChips />);
    screen.getByTestId('kpi-open-turnaround').focus();
    await userEvent.keyboard('{Enter}');
    const panel = await screen.findByTestId('kpidetail-turnaround');
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      expect(panel.contains(document.activeElement)).toBe(true);
    }
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('kpidetail-turnaround')).toBeNull());
  });

  it('cartons: out/in today with deltas, rate now per hour by belt direction', async () => {
    push(
      { kind: 'siteState', value: makeSite(T0) },
      {
        kind: 'bayState',
        value: makeBay('B01', T0, (b) => {
          b.belt.status = 'RUNNING_LOADED';
          b.belt.direction = 'OUT';
          b.belt.rateCpm = 14.2;
        }),
      },
      {
        kind: 'bayState',
        value: makeBay('B02', T0, (b) => {
          b.belt.status = 'RUNNING_LOADED';
          b.belt.direction = 'IN';
          b.belt.rateCpm = 5;
        }),
      },
    );
    renderWithProviders(<KpiChips />);
    await openPopover('cartons');
    expect(valueOf('kpidetail-cartons-out')).toHaveTextContent('18,240');
    expect(screen.getByTestId('kpidetail-cartons-out')).toHaveTextContent('6.2%');
    expect(valueOf('kpidetail-cartons-in')).toHaveTextContent('3,120');
    expect(screen.getByTestId('kpidetail-cartons-in')).toHaveTextContent('3.1%');
    expect(valueOf('kpidetail-rate-out')).toHaveTextContent('852/h'); // 14.2 x 60
    expect(valueOf('kpidetail-rate-out')).toHaveAttribute('data-value', '852');
    expect(valueOf('kpidetail-rate-in')).toHaveTextContent('300/h');
  });

  it('cartons: rate now is an em dash with a reason when no belt is running', async () => {
    push(
      { kind: 'siteState', value: makeSite(T0) },
      { kind: 'bayState', value: makeBay('B01', T0, (b) => void (b.belt.status = 'STOPPED')) },
    );
    renderWithProviders(<KpiChips />);
    await openPopover('cartons');
    expect(
      within(valueOf('kpidetail-rate-out')).getByLabelText('No belt is running right now'),
    ).toHaveTextContent('—');
    expect(valueOf('kpidetail-rate-out')).not.toHaveAttribute('data-value');
  });

  it('turnaround: breakdown rows, stacked bar and finished visits; wait before docking only when known', async () => {
    const site = makeSite(T0);
    push({ kind: 'siteState', value: site });
    renderWithProviders(<KpiChips />);
    await openPopover('turnaround');
    expect(valueOf('kpidetail-turnaround-occupancy')).toHaveTextContent('52m');
    expect(valueOf('kpidetail-turnaround-preop')).toHaveTextContent('9m');
    expect(valueOf('kpidetail-turnaround-work')).toHaveTextContent('38m');
    expect(valueOf('kpidetail-turnaround-postop')).toHaveTextContent('5m');
    expect(valueOf('kpidetail-turnaround-depot')).toHaveTextContent('1h 03m');
    expect(screen.getByTestId('kpidetail-turnaround-depot')).toHaveTextContent('4 min');
    expect(valueOf('kpidetail-turnaround-waitdock')).toHaveTextContent('11m');
    expect(valueOf('kpidetail-turnaround-visits')).toHaveTextContent('41');
    const bar = screen.getByTestId('kpidetail-turnaround-bar');
    const shares = [...bar.children].map((c) => Number((c as HTMLElement).dataset.share));
    expect(shares[0]).toBeCloseTo(9 / 52);
    expect(shares[1]).toBeCloseTo(38 / 52);
    expect(shares[2]).toBeCloseTo(5 / 52);

    const noWait = makeSite(T0);
    if (noWait.kpi.turnaround) noWait.kpi.turnaround.waitForDockMin = null;
    act(() => push({ kind: 'siteState', value: noWait }));
    expect(screen.queryByTestId('kpidetail-turnaround-waitdock')).toBeNull();
  });

  it('turnaround: older backend shows the average turnaround and says why there is no breakdown', async () => {
    const site = makeSite(T0);
    delete site.kpi.turnaround;
    push({ kind: 'siteState', value: site });
    renderWithProviders(<KpiChips />);
    const panel = await openPopover('turnaround');
    expect(valueOf('kpidetail-turnaround-depot')).toHaveTextContent('1h 03m');
    expect(within(panel).queryByTestId('kpidetail-turnaround-occupancy')).toBeNull();
    expect(within(panel).queryByTestId('kpidetail-turnaround-bar')).toBeNull();
    expect(panel).toHaveTextContent(/only the average turnaround/);
  });

  it('PPE: score and the bay with most violations', async () => {
    push(
      { kind: 'siteState', value: makeSite(T0) },
      { kind: 'bayState', value: makeBay('B04', T0, (b) => void (b.today.ppe = 5)) },
    );
    renderWithProviders(<KpiChips />);
    await openPopover('ppe');
    expect(valueOf('kpidetail-ppe-score')).toHaveTextContent('91%');
    expect(valueOf('kpidetail-ppe-worst')).toHaveTextContent('Bay 4 (5)');
    expect(valueOf('kpidetail-ppe-worst')).toHaveAttribute('data-value', '5');
  });

  it('alerts: groups sorted by critical then warn; unknown kinds go to Other; a row opens the filtered tray', async () => {
    const site = makeSite(T0);
    site.kpi.openAlerts = { info: 0, warn: 3, critical: 1 };
    push({ kind: 'siteState', value: site });
    const s = alertStore.getState();
    s.ingestEvent(makeEvent(ulid(1), { bay: 'B02' })); // hygiene.damaged, warn
    s.ingestEvent(
      makeEvent(ulid(2), { category: 'belt', type: 'empty_run', data: { minutes: 6 } }),
    );
    s.ingestEvent({
      ...makeEvent(ulid(3), {
        category: 'security',
        type: 'door_open_idle',
        data: { minutes: 9 },
      }),
      sev: 'critical',
    });
    // a catalogue type the group table does not name: lands in Other, never dropped
    s.ingestEvent(
      makeEvent(ulid(4), {
        category: 'truck',
        type: 'unknown_plate',
        data: { plateBn: 'ঢাকা মেট্রো-ট ১১-২২৩৩', plateEn: 'DHAKA METRO-TA 11-2233', conf: 0.4 },
      }),
    );
    renderWithProviders(<KpiChips />);
    await openPopover('alerts');
    expect(valueOf('kpidetail-alerts-attention')).toHaveTextContent('4');
    expect(screen.getByTestId('kpidetail-alerts-split')).toHaveTextContent(
      '1 critical, 3 warning, 0 info',
    );
    const rows = within(screen.getByTestId('kpidetail-groups')).getAllByRole('link');
    // idle has the critical one (and a warn), then the warn-only groups in table order
    expect(rows.map((r) => r.dataset.group)).toEqual(['idle', 'hygiene', 'other']);
    expect(rows[0]).toHaveAttribute('data-total', '2');
    expect(rows[0]).toHaveTextContent('Idle & stoppage');
    expect(rows[2]).toHaveTextContent('Other');

    // each row links to the Events page with the group filter (the page count uses the same matchesAlertGroup)
    expect(rows.map((r) => r.getAttribute('href'))).toEqual([
      '/events?group=idle',
      '/events?group=hygiene',
      '/events?group=other',
    ]);
  });

  it('renders Bangla labels and digits', async () => {
    await resetStores('DC_MANAGER', 'bn');
    push(
      { kind: 'siteState', value: makeSite(T0) },
      { kind: 'bayState', value: makeBay('B02', T0, (b) => void (b.today.ppe = 3)) },
    );
    renderWithProviders(<KpiChips />);
    expect(screen.getByTestId('kpi-label-tat')).toHaveTextContent('বে দখলের সময়');
    expect(screen.getByTestId('kpi-label-alerts')).toHaveTextContent('মনোযোগ দরকার');
    expect(screen.getByTestId('kpi-sub-compliance')).toHaveTextContent(
      'আজ সবচেয়ে বেশি লঙ্ঘন: বে ২ (৩)',
    );
    await openPopover('turnaround');
    expect(valueOf('kpidetail-turnaround-occupancy')).toHaveTextContent('৫২ মি');
    expect(valueOf('kpidetail-turnaround-depot')).toHaveTextContent('১ ঘ ০৩ মি');
    expect(valueOf('kpidetail-turnaround-visits')).toHaveTextContent('৪১');
  });
});
