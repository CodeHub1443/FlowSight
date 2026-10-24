import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import bn from '@/i18n/bn.json';
import en from '@/i18n/en.json';
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
