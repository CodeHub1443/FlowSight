import { QueryClient, QueryClientProvider, type Query } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SITE } from '@/features/live/siteInfo';
import { liveStore } from '@/stores';
import { reportKeys, isReportInProgress, reportPeriodEnd, useReport } from './reportQueries';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const REPORT = {
  kind: 'shift',
  site: 'dhk-depot',
  businessDay: '2026-10-24',
  shiftId: 'B',
  from: '2026-10-24T14:00:00+06:00',
  to: '2026-10-24T19:20:00+06:00',
  kpi: {
    casesOut: 0,
    casesIn: 0,
    casesOutDeltaPct: null,
    casesInDeltaPct: null,
    trucksOnSite: 0,
    trucksDocked: 0,
    trucksWaiting: 0,
    baysRunning: 0,
    baysTotal: 7,
    avgTatMin: null,
    avgTatDeltaMin: null,
    complianceScore: null,
    openAlerts: { info: 0, warn: 0, critical: 0 },
  },
  bays: [],
  captains: [],
  visits: [],
  topEvents: [],
  sku: [],
};

const site = DEFAULT_SITE;
const NOW = Date.parse('2026-10-24T19:20:00+06:00');

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  liveStore.setState({ lastTs: NOW });
});
afterEach(() => {
  vi.unstubAllGlobals();
  liveStore.getState().reset();
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('report period', () => {
  it('knows when a shift and a day end', () => {
    expect(reportPeriodEnd('shift', { date: '2026-10-24', shift: 'B' }, site)).toBe(
      Date.parse('2026-10-24T22:00:00+06:00'),
    );
    expect(reportPeriodEnd('daily', { date: '2026-10-24' }, site)).toBe(
      Date.parse('2026-10-25T06:00:00+06:00'),
    );
    expect(reportPeriodEnd('shift', { date: '2026-10-24', shift: 'nope' }, site)).toBeNull();
  });

  it('is in progress until its end, in stream time', () => {
    const p = { date: '2026-10-24', shift: 'B' };
    expect(isReportInProgress('shift', p, site, NOW)).toBe(true);
    expect(isReportInProgress('shift', p, site, Date.parse('2026-10-24T22:00:00+06:00'))).toBe(
      false,
    );
    expect(isReportInProgress('shift', { date: '2026-10-24', shift: 'A' }, site, NOW)).toBe(false);
  });
});

describe('useReport', () => {
  it('asks for the shift report of a date and shift, and validates it', async () => {
    fetchMock.mockResolvedValueOnce(json(REPORT));
    const { wrapper } = setup();
    const { result } = renderHook(() => useReport('shift', { date: '2026-10-24', shift: 'B' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const u = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://x');
    expect(u.pathname).toBe('/api/reports/shift');
    expect(u.searchParams.get('site')).toBe('dhk-depot');
    expect(u.searchParams.get('date')).toBe('2026-10-24');
    expect(u.searchParams.get('shift')).toBe('B');
    expect(result.current.data?.shiftId).toBe('B');
  });

  it('does not send a shift for the daily report', async () => {
    fetchMock.mockResolvedValueOnce(json({ ...REPORT, kind: 'daily', shiftId: null }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useReport('daily', { date: '2026-10-24', shift: 'B' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const u = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://x');
    expect(u.pathname).toBe('/api/reports/daily');
    expect(u.searchParams.has('shift')).toBe(false);
  });

  it('refetches an in-progress period every 60 s and a completed one never', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(REPORT)));
    const { client, wrapper } = setup();
    const live = { date: '2026-10-24', shift: 'B' };
    const done = { date: '2026-10-24', shift: 'A' };
    const a = renderHook(() => useReport('shift', live), { wrapper });
    const b = renderHook(() => useReport('shift', done), { wrapper });
    await waitFor(() =>
      expect(a.result.current.isSuccess && b.result.current.isSuccess).toBe(true),
    );
    const optionsOf = (p: typeof live) => {
      const q = client.getQueryCache().find({ queryKey: reportKeys.report(site.id, 'shift', p) });
      return q?.options as {
        refetchInterval: (q: Query) => number | false;
        staleTime: () => number;
      };
    };
    expect(optionsOf(live).refetchInterval({} as Query)).toBe(60_000);
    expect(optionsOf(done).refetchInterval({} as Query)).toBe(false);
    expect(optionsOf(done).staleTime()).toBe(Infinity);
  });

  it('an invalid report is an error state, not data', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(json({ nope: true }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useReport('daily', { date: '2026-10-24' }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
