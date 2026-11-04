import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach } from 'vitest';
import { App } from './App';
import { InlineHost, setSimRuntime, SimRuntime } from '@/data/mock';
import { alertStore, liveStore, sessionStore } from '@/stores';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import bn from '@/i18n/locales/bn/common.json';
import en from '@/i18n/locales/en/common.json';
import { ADMIN_CHILDREN } from './adminRoutes';
import { AppRoutes } from './routes';

// the Performance tab preloads the ECharts chunk; loading the real one in jsdom only slows these tests
vi.mock('@/features/analytics/chart/load', () => ({
  loadChartCanvas: vi.fn(),
  preloadChart: vi.fn(),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('toggles the sample string between EN and Bangla', async () => {
    const user = userEvent.setup();
    renderAt('/live');
    const sample = screen.getByTestId('sample-string');
    expect(sample).toHaveTextContent(en.app.sample);

    await user.click(screen.getByRole('button', { name: bn.language.bn }));
    expect(sample).toHaveTextContent(bn.app.sample);
    expect(document.documentElement.lang).toBe('bn');

    await user.click(screen.getByRole('button', { name: en.language.en }));
    expect(sample).toHaveTextContent(en.app.sample);
  });

  it('redirects / to /live', () => {
    renderAt('/');
    expect(screen.getByTestId('live-page')).toBeInTheDocument();
  });

  it('renders the live page at /live, with the scene placeholder when WebGL is unavailable', () => {
    renderAt('/live');
    expect(screen.getByTestId('live-page')).toBeInTheDocument();
    expect(screen.getByTestId('scene-slot')).toBeInTheDocument();
    // jsdom has no WebGL: the scene chunk is not loaded and the neutral placeholder stays.
    expect(screen.getByTestId('scene-slot-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('scene-canvas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('placeholder-title')).not.toBeInTheDocument();
  });

  it.each([
    '/bays/B01',
    '/trucks',
    '/leaderboard',
    '/events',
    '/events/evt-1',
    '/reports',
    '/replay',
    '/wall',
    '/login',
    '/admin',
    ...ADMIN_CHILDREN.map(([p]) => `/admin/${p}`),
  ])('resolves %s to a placeholder page', (path) => {
    renderAt(path);
    expect(screen.queryByTestId('not-found-title')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('placeholder-title').length).toBeGreaterThan(0);
  });

  it('opens /analytics on the Performance tab (lazy chunk), with the range from the URL', async () => {
    renderAt('/analytics?range=week');
    expect(await screen.findByTestId('analytics-page')).toBeInTheDocument();
    expect(screen.getByTestId('perf-tab')).toBeInTheDocument();
    expect(screen.getByTestId('perf-index-section')).toHaveAttribute('data-range', 'week');
    expect(screen.getByTestId('perf-trend-section')).toHaveAttribute('data-range', 'week');
    expect(screen.getByRole('radio', { name: 'Last 7 days' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('keeps the placeholder on the other analytics tabs', async () => {
    renderAt('/analytics/throughput');
    expect(await screen.findByTestId('placeholder-title')).toHaveTextContent('Throughput');
    expect(screen.queryByTestId('perf-tab')).not.toBeInTheDocument();
  });

  it('shows 404 for an unknown path', () => {
    renderAt('/nope/nothing');
    expect(screen.getByTestId('not-found-title')).toHaveTextContent(en.notFound.title);
  });
});

describe('App with the DataSource provider (mock mode)', () => {
  // The factory builds a MockSource; pin the shared simulator to an inline, non-ticking runtime with one day of
  // history (the default 7 days grow with the time of day and pushed these tests past the 5 s timeout).
  beforeEach(() => {
    setSimRuntime(new SimRuntime(new InlineHost({ autoTick: false }), { historyDays: 1 }));
  });
  afterEach(() => {
    setSimRuntime(null);
    liveStore.getState().reset();
    alertStore.getState().reset();
    sessionStore.getState().setMockRole('DC_MANAGER');
  });

  it('renders, connects the simulator and shows 7 bays, 0 dropped in the debug readout', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByTestId('debug-readout')).not.toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}d{/Shift}{/Control}');
    expect(await screen.findByTestId('debug-readout')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('debug-bays')).toHaveTextContent('7'));
    expect(screen.getByTestId('debug-status')).toHaveTextContent('live');
    for (const kind of [
      'siteState',
      'bayState',
      'actors',
      'case',
      'event',
      'lifecycle',
      'health',
    ]) {
      expect(screen.getByTestId(`debug-dropped-${kind}`)).toHaveTextContent('0');
    }
    expect(
      Number(screen.getByTestId('debug-received-bayState').textContent),
    ).toBeGreaterThanOrEqual(7);
    // the simulator controls open with the readout
    expect(screen.getByRole('region', { name: 'Simulator' })).toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}d{/Shift}{/Control}');
    expect(screen.queryByTestId('debug-readout')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Simulator' })).not.toBeInTheDocument();
  });

  it('restarting the simulator on an earlier day starts the stores fresh (older messages are not ignored)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}{Shift>}d{/Shift}{/Control}');
    await waitFor(() => expect(screen.getByTestId('debug-bays')).toHaveTextContent('7'));
    // "Evening peak" starts at 2026-10-24 19:20 Dhaka, before the wall-clock "now" the app started with
    await user.selectOptions(screen.getByLabelText('Start at'), 'peak');
    await waitFor(() => expect(screen.getByTestId('debug-last-ts')).toHaveTextContent('19:20:00'));
    expect(screen.getByTestId('debug-bays')).toHaveTextContent('7');
    expect(screen.getByTestId('debug-status')).toHaveTextContent('live');
    expect(liveStore.getState().bays.B01?.ts.startsWith('2026-10-24T19:20')).toBe(true);
  });

  it('hides the simulator controls from KIOSK', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}{Shift>}d{/Shift}{/Control}');
    expect(await screen.findByRole('region', { name: 'Simulator' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(en.debug.role), 'KIOSK');
    expect(screen.queryByRole('region', { name: 'Simulator' })).not.toBeInTheDocument();
    expect(screen.getByTestId('debug-readout')).toBeInTheDocument();
  });

  it('labels the readout in Bangla', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: bn.language.bn }));
    await user.keyboard('{Control>}{Shift>}d{/Shift}{/Control}');
    expect(await screen.findByText(bn.debug.title)).toBeInTheDocument();
  });
});
