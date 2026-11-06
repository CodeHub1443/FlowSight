import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { EvidenceImage } from './EvidenceImage';
import { bboxPercent } from './evidenceBox';

const BASE = 'http://localhost/api';
const MEDIA = {
  snapshotKey: 'evidence/dhk-depot/2026-10-24/01M5Q2V6W0M9S346Q3D25VT4F5.jpg',
  clipKey: null,
  bbox: [480, 270, 960, 540] as [number, number, number, number],
  frameW: 1920,
  frameH: 1080,
};

let presign: 'ok' | 'fail' = 'ok';
const server = setupServer(
  http.get(`${BASE}/media/presign`, () =>
    presign === 'ok'
      ? HttpResponse.json({
          url: 'blob:test/snapshot',
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        })
      : HttpResponse.json({ error: { code: 'BOOM', message: 'no' } }, { status: 500 }),
  ),
);

beforeAll(() => {
  vi.stubEnv('VITE_API_BASE', BASE);
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  presign = 'ok';
  await i18n.changeLanguage('en');
});
afterEach(() => server.resetHandlers());

function renderImage(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('bboxPercent', () => {
  it('converts source pixels to percent of the frame', () => {
    expect(bboxPercent(MEDIA)).toEqual({
      left: '25%',
      top: '25%',
      width: '50%',
      height: '50%',
    });
  });

  it('clamps a box that leaves the frame', () => {
    const b = bboxPercent({ ...MEDIA, bbox: [1800, 1000, 600, 400] });
    expect(b.width).toBe('31.25%');
    expect(parseFloat(b.left) + parseFloat(b.width)).toBeGreaterThan(100); // clamping is per value, not per edge
    expect(bboxPercent({ ...MEDIA, bbox: [0, 0, 5000, 5000] }).width).toBe('100%');
  });
});

describe('EvidenceImage', () => {
  it('shows a skeleton while the URL is presigned, then the image with the box in percent', async () => {
    renderImage(<EvidenceImage media={MEDIA} />);
    expect(screen.getByTestId('evidence-image')).toHaveAttribute('data-state', 'loading');
    const img = await screen.findByRole('img', { name: 'Evidence snapshot' });
    expect(img).toHaveAttribute('src', 'blob:test/snapshot');
    expect(screen.getByTestId('evidence-image')).toHaveAttribute('data-state', 'ready');
    const box = screen.getByTestId('evidence-image-box');
    expect(box.style.left).toBe('25%');
    expect(box.style.top).toBe('25%');
    expect(box.style.width).toBe('50%');
    expect(box.style.height).toBe('50%');
  });

  it('keeps the source aspect ratio in every state', async () => {
    renderImage(<EvidenceImage media={MEDIA} />);
    expect(screen.getByTestId('evidence-image').style.aspectRatio).toBe('1920 / 1080');
    await screen.findByRole('img', { name: 'Evidence snapshot' });
    expect(screen.getByTestId('evidence-image').style.aspectRatio).toBe('1920 / 1080');
  });

  it('can hide the box', async () => {
    renderImage(<EvidenceImage media={MEDIA} showBox={false} />);
    await screen.findByRole('img', { name: 'Evidence snapshot' });
    expect(screen.queryByTestId('evidence-image-box')).not.toBeInTheDocument();
  });

  it('shows the no-media state without asking for a URL', () => {
    renderImage(<EvidenceImage media={null} />);
    expect(screen.getByTestId('evidence-image')).toHaveAttribute('data-state', 'no-media');
    expect(screen.getByText('No snapshot for this event')).toBeInTheDocument();
  });

  it('shows the error state with a retry when presign fails, and recovers on retry', async () => {
    presign = 'fail';
    renderImage(<EvidenceImage media={MEDIA} />);
    await waitFor(() =>
      expect(screen.getByTestId('evidence-image')).toHaveAttribute('data-state', 'error'),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The snapshot could not be loaded.');
    presign = 'ok';
    fireEvent.click(screen.getByTestId('evidence-image-retry'));
    expect(await screen.findByRole('img', { name: 'Evidence snapshot' })).toBeInTheDocument();
  });

  it('shows the error state when the image itself fails to load', async () => {
    renderImage(<EvidenceImage media={MEDIA} />);
    const img = await screen.findByRole('img', { name: 'Evidence snapshot' });
    fireEvent.error(img);
    expect(screen.getByTestId('evidence-image')).toHaveAttribute('data-state', 'error');
  });

  it('renders the Bangla labels', async () => {
    await i18n.changeLanguage('bn');
    renderImage(<EvidenceImage media={null} />);
    expect(screen.getByText('এই ইভেন্টের কোনো স্ন্যাপশট নেই')).toBeInTheDocument();
  });
});
