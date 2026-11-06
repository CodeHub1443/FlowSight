import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import bnEvents from '@/i18n/locales/bn/events.json';
import enEvents from '@/i18n/locales/en/events.json';
import enReports from '@/i18n/locales/en/reports.json';
import { AppRoutes } from './routes';

// The events and reports namespaces load with their route chunks (not in src/i18n/index.ts). The built entry chunk is
// checked by scripts/entryChunk.test.mjs.

const LAZY_CHUNK_MS = 10_000;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('lazy i18n namespaces', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('events is registered, for both languages, once its page has loaded', async () => {
    renderAt('/events');
    const page = await screen.findByTestId('events-page', {}, { timeout: LAZY_CHUNK_MS });
    expect(page).toHaveTextContent(enEvents.page.title);
    expect(i18n.hasResourceBundle('en', 'events')).toBe(true);
    expect(i18n.hasResourceBundle('bn', 'events')).toBe(true);
  });

  it('a language switch updates an already-open lazy page', async () => {
    renderAt('/events');
    const page = await screen.findByTestId('events-page', {}, { timeout: LAZY_CHUNK_MS });
    await i18n.changeLanguage('bn');
    expect(await screen.findByText(bnEvents.page.title)).toBeInTheDocument();
    expect(page).toHaveTextContent(bnEvents.page.title);
    await i18n.changeLanguage('en');
    expect(await screen.findByText(enEvents.page.title)).toBeInTheDocument();
  });

  it('reports registers with its page', async () => {
    renderAt('/reports');
    const page = await screen.findByTestId('reports-page', {}, { timeout: LAZY_CHUNK_MS });
    expect(page).toHaveTextContent(enReports.controls.kind.shift);
    expect(i18n.hasResourceBundle('en', 'reports')).toBe(true);
    expect(i18n.hasResourceBundle('bn', 'reports')).toBe(true);
  });
});
