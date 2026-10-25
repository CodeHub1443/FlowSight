import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeSite } from '@/stores/testUtils';
import { KpiChips } from './KpiChips';
import { push, renderWithProviders, resetStores, T0 } from './testHarness';

beforeEach(() => resetStores());

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
    expect(screen.getByTestId('kpi-tat')).toHaveTextContent('1h 03m');
    expect(screen.getByTestId('kpi-compliance')).toHaveTextContent('91%');
    expect(screen.getByTestId('kpi-alerts')).toHaveTextContent('7');
  });

  it('renders null KPI fields as an em dash with an explanatory label, not 0', () => {
    const site = makeSite(T0);
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
    // Cases still render; only the delta is unknown.
    const cases = screen.getByTestId('kpi-cases');
    expect(cases).toHaveTextContent('18,240');
    expect(within(cases).getByLabelText(/No comparison yet/)).toHaveTextContent('—');
    expect(screen.queryAllByTestId('kpi-delta')).toHaveLength(0);
  });
});
