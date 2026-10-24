import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach } from 'vitest';
import { App } from './App';
import { alertStore, liveStore } from '@/stores';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import bn from '@/i18n/locales/bn/common.json';
import en from '@/i18n/locales/en/common.json';
import { ADMIN_CHILDREN } from './adminRoutes';
import { AppRoutes } from './routes';

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
    expect(screen.getByTestId('placeholder-path')).toHaveTextContent('/live');
  });

  it.each([
    '/live',
    '/bays/B01',
    '/trucks',
    '/analytics',
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

  it('shows 404 for an unknown path', () => {
    renderAt('/nope/nothing');
    expect(screen.getByTestId('not-found-title')).toHaveTextContent(en.notFound.title);
  });
});

describe('App with the DataSource provider (mock mode)', () => {
  afterEach(() => {
    liveStore.getState().reset();
    alertStore.getState().reset();
  });

  it('renders, connects the fixture source and shows 7 bays, 0 dropped in the debug readout', async () => {
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
    ).toBeGreaterThanOrEqual(8);

    await user.keyboard('{Control>}{Shift>}d{/Shift}{/Control}');
    expect(screen.queryByTestId('debug-readout')).not.toBeInTheDocument();
  });

  it('labels the readout in Bangla', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: bn.language.bn }));
    await user.keyboard('{Control>}{Shift>}d{/Shift}{/Control}');
    expect(await screen.findByText(bn.debug.title)).toBeInTheDocument();
  });
});
