import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClient } from '@/data/api';
import i18n from '@/i18n';
import bn from '@/i18n/locales/bn/analytics.json';
import en from '@/i18n/locales/en/analytics.json';
import { sessionStore } from '@/stores';
import AnalyticsPage from './AnalyticsPage';
import { preloadChart } from './chart/load';
import { ANALYTICS_TABS } from './tabs';

// stands in for the ECharts chunk (the real one is slow to load in jsdom)
vi.mock('./chart/load', () => ({ loadChartCanvas: vi.fn(), preloadChart: vi.fn() }));

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

function renderAt(path: string) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false, refetchOnWindowFocus: false } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="analytics/*" element={<AnalyticsPage />} />
          </Routes>
          <Where />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  // network stub: a request that never resolves, so widgets stay in their loading state
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
  await i18n.changeLanguage('en');
  sessionStore.getState().setMockRole('DC_MANAGER');
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStore.getState().setMockRole('DC_MANAGER');
});

describe('/analytics shell', () => {
  it('lists the tabs with Performance first and selected by default', () => {
    renderAt('/analytics');
    const nav = screen.getByRole('navigation', { name: en.tabsLabel });
    const links = nav.querySelectorAll('a');
    expect([...links].map((a) => a.dataset.tab)).toEqual(ANALYTICS_TABS.map((t) => t.id));
    expect(links[0]).toHaveTextContent(en.tabs.performance);
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('perf-tab')).toBeInTheDocument();
    expect(preloadChart).toHaveBeenCalled();
  });

  it('defaults to Today and writes the range into the URL, kept across tabs', async () => {
    const user = userEvent.setup();
    renderAt('/analytics');
    expect(screen.getByRole('radio', { name: en.range.day })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('radio', { name: en.range.shift }));
    expect(screen.getByTestId('where')).toHaveTextContent('/analytics?range=shift');
    expect(screen.getByTestId('perf-index-section')).toHaveAttribute('data-range', 'shift');
    await user.click(screen.getByRole('link', { name: en.tabs.sku }));
    expect(screen.getByTestId('where')).toHaveTextContent('/analytics/sku?range=shift');
    expect(screen.getByTestId('placeholder-title')).toHaveTextContent(en.tabs.sku);
    // back to the default removes the parameter
    await user.click(screen.getByRole('radio', { name: en.range.day }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/analytics\/sku$/);
  });

  it('ignores an unknown range value', () => {
    renderAt('/analytics?range=month');
    expect(screen.getByRole('radio', { name: en.range.day })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('shows 404 for an unknown tab', () => {
    renderAt('/analytics/nope');
    expect(screen.getByTestId('not-found-title')).toBeInTheDocument();
  });

  it('carries the simulated-data marker in mock mode', () => {
    renderAt('/analytics');
    expect(import.meta.env.VITE_DATA_MODE).toBe('mock');
    expect(screen.getByTestId('analytics-simulated')).toHaveTextContent(en.simulated);
  });

  it('is not available to KIOSK', () => {
    sessionStore.getState().setMockRole('KIOSK');
    renderAt('/analytics');
    expect(screen.getByTestId('analytics-forbidden')).toHaveTextContent(en.forbidden);
    expect(screen.queryByTestId('perf-tab')).not.toBeInTheDocument();
  });

  it('renders in Bangla', async () => {
    await i18n.changeLanguage('bn');
    renderAt('/analytics');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(bn.title);
    expect(screen.getByRole('radio', { name: bn.range.week })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: bn.tabs.dwell })).toBeInTheDocument();
  });
});
