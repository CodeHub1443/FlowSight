import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import en from '@/i18n/locales/en/common.json';
import { canAccessReports } from '@/lib/rbac';
import { DEFAULT_MOCK_ROLE, sessionStore } from '@/stores';
import { RouteGuard } from './RouteGuard';
import { AppRoutes } from './routes';

const LAZY_CHUNK_MS = 10_000;
const LAZY_TEST_MS = 15_000;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => {
  sessionStore.getState().setMockRole(DEFAULT_MOCK_ROLE);
});

describe('RouteGuard', () => {
  it('renders the children when the role is allowed', () => {
    render(
      <RouteGuard allow={canAccessReports}>
        <p data-testid="inside">ok</p>
      </RouteGuard>,
    );
    expect(screen.getByTestId('inside')).toBeInTheDocument();
  });

  it('renders the Not available page when the role is not allowed', () => {
    sessionStore.getState().setMockRole('KIOSK');
    render(
      <MemoryRouter>
        <RouteGuard allow={canAccessReports}>
          <p data-testid="inside">ok</p>
        </RouteGuard>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('inside')).not.toBeInTheDocument();
    expect(screen.getByTestId('not-available-title')).toHaveTextContent(en.notAvailable.title);
  });
});

describe('events and reports routes', () => {
  it.each([
    ['/events', 'events-page'],
    ['/events/01JABCDEFGHJKMNPQRSTVWXYZ0', 'events-page'],
    ['/reports', 'reports-page'],
  ])(
    'opens %s as a stub inside the shell',
    async (path, testId) => {
      renderAt(path);
      expect(await screen.findByTestId(testId, {}, { timeout: LAZY_CHUNK_MS })).toBeInTheDocument();
      expect(screen.getByTestId('top-bar')).toBeInTheDocument();
    },
    LAZY_TEST_MS,
  );

  it.each(['/events', '/events/01JABCDEFGHJKMNPQRSTVWXYZ0', '/reports'])(
    'shows Not available for KIOSK at %s',
    (path) => {
      sessionStore.getState().setMockRole('KIOSK');
      renderAt(path);
      expect(screen.getByTestId('not-available-title')).toBeInTheDocument();
      expect(screen.queryByTestId('events-page')).not.toBeInTheDocument();
      expect(screen.queryByTestId('reports-page')).not.toBeInTheDocument();
    },
  );

  it(
    'lets SHIFT_SUPERVISOR open /reports and SECURITY open /events but not /reports',
    async () => {
      sessionStore.getState().setMockRole('SHIFT_SUPERVISOR');
      const first = renderAt('/reports');
      expect(
        await screen.findByTestId('reports-page', {}, { timeout: LAZY_CHUNK_MS }),
      ).toBeInTheDocument();
      first.unmount();

      sessionStore.getState().setMockRole('SECURITY');
      const second = renderAt('/reports');
      expect(screen.getByTestId('not-available-title')).toBeInTheDocument();
      second.unmount();
      renderAt('/events');
      expect(
        await screen.findByTestId('events-page', {}, { timeout: LAZY_CHUNK_MS }),
      ).toBeInTheDocument();
    },
    LAZY_TEST_MS,
  );
});
