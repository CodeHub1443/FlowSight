import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '@/domain/fixtures/bay-performance.json';
import { liveStore } from '@/stores';
import { ApiRequestError, apiGet, invalidResponseCount, resetInvalidResponseCount } from './client';
import { isoDhaka } from './endpoints';
import { createQueryClient, useBayPerformance, useThroughput } from './queries';
import { BayPerformanceSchema } from '@/domain';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  resetInvalidResponseCount();
});
afterEach(() => {
  vi.unstubAllGlobals();
  liveStore.getState().reset();
});

function wrapper() {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const urlOf = (call: number) => new URL(String(fetchMock.mock.calls[call]?.[0]), 'http://x');

describe('apiGet', () => {
  it('validates the body with the schema', async () => {
    fetchMock.mockResolvedValueOnce(json(fixture));
    const data = await apiGet('/analytics/bay-performance', {}, BayPerformanceSchema);
    expect(data.rows).toHaveLength(7);
    expect(invalidResponseCount()).toBe(0);
  });

  it('drops and counts an invalid body', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(json({ ...fixture, rows: [{ bay: 'B01' }] }));
    await expect(
      apiGet('/analytics/bay-performance', {}, BayPerformanceSchema),
    ).rejects.toMatchObject({
      kind: 'invalid',
    });
    expect(invalidResponseCount()).toBe(1);
  });

  it('turns an ApiError body into an http error', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'FORBIDDEN', message: 'no' } }, 403));
    const e = await apiGet('/x', {}, BayPerformanceSchema).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiRequestError);
    expect(e).toMatchObject({ kind: 'http', status: 403, code: 'FORBIDDEN' });
  });

  it('reports a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiGet('/x', {}, BayPerformanceSchema)).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('isoDhaka', () => {
  it('writes +06:00 offsets', () => {
    expect(isoDhaka(Date.parse('2026-10-24T00:00:00Z'))).toBe('2026-10-24T06:00:00+06:00');
  });
});

describe('analytics hooks', () => {
  const NOW = Date.parse('2026-10-24T19:20:00+06:00');
  beforeEach(() => {
    liveStore.setState({ lastTs: NOW });
  });

  it('useBayPerformance asks for the business day so far (stream time) and returns the window', async () => {
    fetchMock.mockResolvedValueOnce(json(fixture));
    const { result } = renderHook(() => useBayPerformance('day'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const u = urlOf(0);
    expect(u.pathname).toBe('/api/analytics/bay-performance');
    expect(u.searchParams.get('site')).toBe('dhk-depot');
    expect(u.searchParams.get('from')).toBe('2026-10-24T06:00:00+06:00');
    expect(u.searchParams.get('to')).toBe('2026-10-24T19:20:00+06:00');
    expect(result.current.data?.window.range).toBe('day');
    expect(result.current.data?.response.rows).toHaveLength(7);
  });

  it('useThroughput(previous) asks for the complete period before, hourly', async () => {
    fetchMock.mockResolvedValue(json({ series: [] }));
    const { result } = renderHook(() => useThroughput('shift', true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const u = urlOf(0);
    expect(u.pathname).toBe('/api/analytics/throughput');
    expect(u.searchParams.get('from')).toBe('2026-10-24T06:00:00+06:00');
    expect(u.searchParams.get('to')).toBe('2026-10-24T14:00:00+06:00');
    expect(u.searchParams.get('bucket')).toBe('hour');
  });

  it('an invalid response becomes an error state, not data', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(json({ nope: true }));
    const { result } = renderHook(() => useBayPerformance('week'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
