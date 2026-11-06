import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClient, isoDhaka } from '@/data/api';
import type { Report, Role } from '@/domain';
import i18n from '@/i18n';
import bnReports from '@/i18n/locales/bn/reports.json';
import enReports from '@/i18n/locales/en/reports.json';
import { liveStore, sessionStore } from '@/stores';
import { REPORT_BRAND } from './brandConst';
import { buildReportModel } from './model';
import { DONE_SHIFT, NOW, simReport } from './reportFixture';
import { ReportsPage } from './ReportsPage';
import { selectHandover } from './selectors';

// Component tests with the simulator's own report served through a stubbed fetch (the same shapes the MSW handlers return).

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let role: Role = 'DC_MANAGER';
let transform: (r: Report) => Report = (r) => r;
let mode: 'ok' | 'hang' | 'error-once' | 'error' | 'not-found' = 'ok';
let errored = false;
const requests: string[] = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const url = new URL(String(input), 'http://localhost');
  requests.push(`${url.pathname}${url.search}`);
  if (url.pathname.endsWith('/media/presign')) {
    return json({
      url: `https://media.test/${url.searchParams.get('key')}`,
      expiresAt: isoDhaka(Date.now() + 10 * 60_000),
    });
  }
  const m = /\/reports\/(shift|daily)$/.exec(url.pathname);
  if (!m) return json({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404);
  if (mode === 'not-found') return json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
  if (mode === 'hang') return new Promise<Response>(() => {});
  if (mode === 'error' || (mode === 'error-once' && !errored)) {
    errored = true;
    return json({ error: { code: 'BOOM', message: 'boom' } }, 500);
  }
  const date = url.searchParams.get('date') ?? '';
  const shift = url.searchParams.get('shift') ?? undefined;
  const r = simReport(m[1] === 'daily' ? 'daily' : 'shift', { date, shift }, role);
  return r ? json(transform(r)) : json({ error: { code: 'NOT_FOUND', message: 'no window' } }, 404);
});

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
            <Route path="reports" element={<ReportsPage />} />
            <Route path="events/:id" element={<Where />} />
          </Routes>
          <Where />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const DONE = '/reports?date=2026-10-24&shift=A';
const LIVE = '/reports?date=2026-10-24&shift=B';
const reportRequests = () => requests.filter((r) => r.includes('/reports/'));

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  liveStore.setState({ lastTs: NOW });
  role = 'DC_MANAGER';
  transform = (r) => r;
  mode = 'ok';
  errored = false;
  requests.length = 0;
  fetchMock.mockClear();
  sessionStore.getState().setMockRole('DC_MANAGER');
  await i18n.changeLanguage('en');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  liveStore.getState().reset();
  sessionStore.getState().setMockRole('DC_MANAGER');
});

const doc = () => screen.findByTestId('report-document', undefined, { timeout: 30_000 });

describe('completed shift report, English', () => {
  it('has every section in the specified order', async () => {
    renderAt(DONE);
    const d = await doc();
    const order = [
      'report-header',
      'report-headlines',
      'report-handover',
      'report-bays',
      'report-trucks',
      'report-evidence',
      'report-sku',
      'report-captains',
    ].map((id) => within(d).getByTestId(id));
    for (let i = 1; i < order.length; i++) {
      const prev = order[i - 1] as HTMLElement;
      const cur = order[i] as HTMLElement;
      expect(prev.compareDocumentPosition(cur) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('header: logo, product, depot, period, status, generated time and the simulated marker', async () => {
    renderAt(DONE);
    const d = await doc();
    expect(within(d).getByAltText(enReports.doc.clientLogoAlt)).toHaveAttribute(
      'src',
      '/brand/unilever-logo.svg',
    );
    expect(within(d).getByTestId('report-product')).toHaveTextContent(REPORT_BRAND.product);
    expect(within(d).getByTestId('report-depot')).toHaveTextContent('Dhaka Central Sales Depot');
    expect(within(d).getByRole('heading', { level: 1 })).toHaveTextContent(
      enReports.doc.title.shift,
    );
    const period = within(d).getByTestId('report-period');
    expect(period).toHaveTextContent('Shift A');
    expect(period).toHaveTextContent('06:00 to 14:00');
    expect(period).toHaveTextContent('Sat');
    expect(period).toHaveTextContent('24 Oct 2026');
    expect(within(d).getByTestId('report-status')).toHaveTextContent(enReports.doc.status.complete);
    expect(within(d).getByTestId('report-generated')).toHaveTextContent('Generated');
    expect(import.meta.env.VITE_DATA_MODE).toBe('mock');
    expect(within(d).getByTestId('report-simulated')).toHaveTextContent(enReports.doc.simulated);
    expect(within(d).getByTestId('report-footer')).toHaveTextContent(
      'Developed by TDI Pvt. Limited',
    );
  });

  it('headlines show the report figures, hide nothing measurable, and carry deltas once the previous period arrives', async () => {
    renderAt(DONE);
    const d = await doc();
    const r = simReport('shift', DONE_SHIFT) as Report;
    const h = buildReportModel(r, 'DC_MANAGER').headlines;
    expect(within(d).getByTestId('report-headline-casesOut-value')).toHaveTextContent(
      new Intl.NumberFormat('en-IN').format(h.casesOut),
    );
    for (const id of [
      'casesOut',
      'casesIn',
      'trucks',
      'occupancy',
      'depotTat',
      'ppe',
      'openAlerts',
    ]) {
      expect(within(d).getByTestId(`report-headline-${id}`)).toBeInTheDocument();
    }
    await waitFor(() =>
      expect(within(d).getByTestId('report-headline-casesOut-delta')).toBeInTheDocument(),
    );
    expect(within(d).getByTestId('report-headline-casesOut-delta')).toHaveTextContent(
      'vs previous shift',
    );
    expect(reportRequests()).toHaveLength(2);
    expect(within(d).queryByTestId('report-figures-so-far')).toBeNull();
  });

  it('handover: nothing open when everything is closed', async () => {
    renderAt(DONE);
    const d = await doc();
    expect(within(d).getByTestId('report-handover-none')).toHaveTextContent(
      enReports.handover.none,
    );
  });

  it('handover: groups and the five most severe open events, linked to /events/:id', async () => {
    transform = (r) => ({
      ...r,
      topEvents: r.topEvents.map((e) => ({ ...e, status: 'OPEN' as const })),
    });
    const user = userEvent.setup();
    renderAt(DONE);
    const d = await doc();
    const r = transform(simReport('shift', DONE_SHIFT) as Report);
    const expected = selectHandover(r, 'DC_MANAGER');
    const groups = within(d).getByTestId('report-handover-groups');
    expect(groups.querySelectorAll('li')).toHaveLength(expected.groups.length);
    expect(within(d).getAllByTestId('report-handover-row')).toHaveLength(expected.top.length);
    expect(expected.top.length).toBeLessThanOrEqual(5);
    const first = expected.top[0];
    if (!first) throw new Error('fixture has no events');
    await user.click(within(d).getAllByRole('link')[0] as HTMLElement);
    expect(screen.getAllByTestId('where').at(-1)).toHaveTextContent(`/events/${first.id}`);
  });

  it('bays: seven rows in bay order, a totals row, no sorting by value', async () => {
    renderAt(DONE);
    const d = await doc();
    const rows = within(d).getAllByTestId('report-bay-row');
    expect(rows.map((r) => r.getAttribute('data-bay'))).toEqual([
      'B01',
      'B02',
      'B03',
      'B04',
      'B05',
      'B06',
      'B07',
    ]);
    const r = simReport('shift', DONE_SHIFT) as Report;
    const m = buildReportModel(r, 'DC_MANAGER');
    const total = within(d).getByTestId('report-bays-total');
    expect(total).toHaveTextContent(new Intl.NumberFormat('en-IN').format(m.bayTotals.casesOut));
    expect(
      within(d).getByTestId('report-bays-table').querySelectorAll('th[scope="col"]'),
    ).toHaveLength(9);
  });

  it('truck log: finished visits in arrival order with both plate spellings and a repeating header', async () => {
    renderAt(DONE);
    const d = await doc();
    const m = buildReportModel(simReport('shift', DONE_SHIFT) as Report, 'DC_MANAGER');
    const rows = within(d).getAllByTestId('report-truck-row');
    expect(rows).toHaveLength(m.truckLog.length);
    const first = m.truckLog[0];
    expect(rows[0]).toHaveTextContent(first?.plate.bn ?? '?');
    expect(rows[0]).toHaveTextContent(first?.plate.en ?? '?');
    const table = within(d).getByTestId('report-trucks-table');
    expect(table.querySelector('thead')).not.toBeNull();
  });

  it('evidence: up to five thumbnails with their boxes, SKU summary with the unknown share, captains by bay', async () => {
    renderAt(DONE);
    const d = await doc();
    const m = buildReportModel(simReport('shift', DONE_SHIFT) as Report, 'DC_MANAGER');
    expect(m.evidence.length).toBeGreaterThan(0);
    expect(m.evidence.length).toBeLessThanOrEqual(5);
    await waitFor(() =>
      expect(within(d).getAllByTestId('report-thumb-box')).toHaveLength(m.evidence.length),
    );
    expect(within(d).getAllByTestId('report-evidence-item')).toHaveLength(m.evidence.length);
    expect(within(d).getAllByTestId('report-sku-row').length).toBeLessThanOrEqual(8);
    expect(within(d).getByTestId('report-sku-unknown')).toBeInTheDocument();
    expect(within(d).getAllByTestId('report-captain-row').length).toBe(m.captains.length);
    expect(m.captains.length).toBeGreaterThan(0);
    // no ranking: no rank or score text anywhere in the captains section
    expect(within(d).getByTestId('report-captains')).not.toHaveTextContent(/\brank\b|\bscore\b/i);
  });
});

describe('completed shift report, Bangla', () => {
  it('renders every section in Bangla with Bangla digits and no raw keys', async () => {
    await i18n.changeLanguage('bn');
    renderAt(DONE);
    const d = await doc();
    expect(within(d).getByRole('heading', { level: 1 })).toHaveTextContent(
      bnReports.doc.title.shift,
    );
    expect(within(d).getByTestId('report-status')).toHaveTextContent(bnReports.doc.status.complete);
    expect(within(d).getByTestId('report-depot')).toHaveTextContent('ঢাকা সেন্ট্রাল সেলস ডিপো');
    expect(within(d).getByTestId('report-period')).toHaveTextContent('শিফট A');
    expect(within(d).getByTestId('report-period')).toHaveTextContent(
      '০৬:০০ থেকে ১৪:০০'.replace('১৪:০০', '১৪:০০'),
    );
    expect(within(d).getByTestId('report-headline-casesOut-value').textContent).toMatch(
      /^[০-৯,]+$/,
    );
    expect(within(d).getByTestId('report-bays')).toHaveTextContent(bnReports.bays.title);
    expect(within(d).getByTestId('report-trucks')).toHaveTextContent(bnReports.trucks.title);
    expect(within(d).getByTestId('report-evidence')).toHaveTextContent(bnReports.evidence.title);
    expect(within(d).getByTestId('report-sku')).toHaveTextContent(bnReports.sku.title);
    expect(within(d).getByTestId('report-captains')).toHaveTextContent(bnReports.captains.title);
    expect(within(d).getByTestId('report-footer')).toHaveTextContent('কর্তৃক তৈরি');
    expect(d.textContent).not.toMatch(
      /\b(headlines|handover|bays|trucks|doc|evidence|sku|captains)\.[a-zA-Z]+/,
    );
    // Bangla plate is the primary line of a truck row
    const m = buildReportModel(simReport('shift', DONE_SHIFT) as Report, 'DC_MANAGER');
    expect(within(d).getAllByTestId('report-truck-row')[0]).toHaveTextContent(
      m.truckLog[0]?.plate.bn ?? '?',
    );
  });

  it('handover lists group labels in Bangla', async () => {
    await i18n.changeLanguage('bn');
    transform = (r) => ({
      ...r,
      topEvents: r.topEvents.map((e) => ({ ...e, status: 'OPEN' as const })),
    });
    renderAt(DONE);
    const d = await doc();
    const groups = within(d).getByTestId('report-handover-groups');
    expect(groups.textContent).toMatch(/[ঀ-৿]/);
    expect(groups.textContent).not.toMatch(/[A-Za-z]{4,}/);
  });
});

describe('in progress versus completed', () => {
  it('an in-progress period says so, shows figures so far, has no deltas and asks for no previous period', async () => {
    renderAt(LIVE);
    const d = await doc();
    expect(d).toHaveAttribute('data-state', 'in-progress');
    expect(within(d).getByTestId('report-status')).toHaveTextContent(
      enReports.doc.status.inProgress,
    );
    expect(within(d).getByTestId('report-figures-so-far')).toBeInTheDocument();
    expect(within(d).queryAllByTestId(/report-headline-.*-delta/)).toHaveLength(0);
    // header shows the nominal shift hours, not "now"
    expect(within(d).getByTestId('report-period')).toHaveTextContent('14:00 to 22:00');
    await new Promise((r) => setTimeout(r, 50));
    expect(reportRequests()).toHaveLength(1);
  });

  it('a completed period is complete, has no "so far" note and makes a second request for the previous period', async () => {
    renderAt(DONE);
    const d = await doc();
    expect(d).toHaveAttribute('data-state', 'complete');
    expect(within(d).queryByTestId('report-figures-so-far')).toBeNull();
    await waitFor(() => expect(reportRequests()).toHaveLength(2));
    expect(reportRequests()[1]).toContain('date=2026-10-23');
    expect(reportRequests()[1]).toContain('shift=C');
  });
});

describe('roles', () => {
  it('DC_MANAGER and ADMIN get the CSV menu and the captains section', async () => {
    for (const r of ['DC_MANAGER', 'ADMIN'] as const) {
      role = r;
      sessionStore.getState().setMockRole(r);
      const view = renderAt(DONE);
      const d = await doc();
      expect(screen.getByTestId('report-csv')).toBeInTheDocument();
      expect(within(d).getByTestId('report-captains')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('HQ_VIEWER can export but sees no captain names', async () => {
    role = 'HQ_VIEWER';
    sessionStore.getState().setMockRole('HQ_VIEWER');
    renderAt(DONE);
    const d = await doc();
    expect(screen.getByTestId('report-csv')).toBeInTheDocument();
    expect(within(d).queryByTestId('report-captains')).toBeNull();
    expect(d.textContent).not.toMatch(/captains by bay assignment/i);
  });

  it('SHIFT_SUPERVISOR can print but has no CSV menu; captains are shown', async () => {
    role = 'SHIFT_SUPERVISOR';
    sessionStore.getState().setMockRole('SHIFT_SUPERVISOR');
    renderAt(DONE);
    const d = await doc();
    expect(screen.queryByTestId('report-csv')).toBeNull();
    expect(screen.getByTestId('report-print')).toBeInTheDocument();
    expect(within(d).getByTestId('report-captains')).toBeInTheDocument();
  });

  it('there is no XLSX button', async () => {
    renderAt(DONE);
    await doc();
    expect(within(screen.getByTestId('report-controls')).queryByText(/xlsx|excel/i)).toBeNull();
  });
});

describe('CSV export', () => {
  async function capture(which: 'report-csv-bays' | 'report-csv-trucks') {
    const blobs: Blob[] = [];
    const names: string[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blobs.push(b as Blob);
      return 'blob:test';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    const user = userEvent.setup();
    renderAt(DONE);
    await doc();
    await user.click(screen.getByTestId('report-csv'));
    await user.click(await screen.findByTestId(which));
    await waitFor(() => expect(blobs).toHaveLength(1));
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
      fr.readAsArrayBuffer(blobs[0] as Blob);
    });
    // ignoreBOM keeps the mark in the string so the test can see it
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    return { text, bytes, name: names[0] ?? '', blob: blobs[0] as Blob };
  }

  it('Bays: UTF-8 BOM, one row per bay in bay order, file name carries the period', async () => {
    const { text, bytes, name, blob } = await capture('report-csv-bays');
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(blob.type).toContain('text/csv');
    expect(name).toBe('report-shift-2026-10-24-A-bays.csv');
    const lines = text.split('\r\n');
    expect(lines[0]?.startsWith('﻿')).toBe(true);
    expect(lines[0]).toContain(enReports.csv.bays.casesOut);
    expect(lines.slice(1, 8).map((l) => l.split(',')[0])).toEqual([
      'B01',
      'B02',
      'B03',
      'B04',
      'B05',
      'B06',
      'B07',
    ]);
    expect(lines).toHaveLength(9);
  });

  it('Truck log: Bangla plates survive and the row count equals the on-screen log', async () => {
    const m = buildReportModel(simReport('shift', DONE_SHIFT) as Report, 'DC_MANAGER');
    const { text, name } = await capture('report-csv-trucks');
    expect(name).toBe('report-shift-2026-10-24-A-truck-log.csv');
    expect(text).toContain(m.truckLog[0]?.plate.bn ?? '?');
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(m.truckLog.length + 1);
  });
});

describe('print button', () => {
  it('waits for the thumbnails to load or fail, then calls window.print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const user = userEvent.setup();
    renderAt(DONE);
    const d = await doc();
    const button = screen.getByTestId('report-print');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(enReports.controls.printPreparing);
    await waitFor(() => expect(within(d).getAllByRole('img').length).toBeGreaterThan(1));
    // first picture loads, second fails: both count as settled
    const imgs = within(d)
      .getAllByRole('img')
      .filter((i) => i.getAttribute('src')?.startsWith('https://media.test/'));
    expect(imgs.length).toBeGreaterThan(0);
    imgs.forEach((img, i) => (i === 0 ? fireEvent.load(img) : fireEvent.error(img)));
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveTextContent(enReports.controls.print);
    await user.click(button);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('is enabled at once when there is no evidence to wait for', async () => {
    transform = (r) => ({ ...r, topEvents: [] });
    renderAt(DONE);
    await doc();
    await waitFor(() => expect(screen.getByTestId('report-print')).toBeEnabled());
  });

  it('settles a thumbnail whose presign request failed', async () => {
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (input) => {
      if (String(input).includes('/media/presign'))
        return json({ error: { code: 'X', message: 'x' } }, 500);
      return (real as NonNullable<typeof real>)(input);
    });
    renderAt(DONE);
    await doc();
    await waitFor(() => expect(screen.getByTestId('report-print')).toBeEnabled(), {
      timeout: 10_000,
    });
    expect(screen.getAllByText(enReports.evidence.unavailable).length).toBeGreaterThan(0);
  });
});

describe('states', () => {
  it('loading shows a skeleton and a disabled print button', async () => {
    mode = 'hang';
    renderAt(DONE);
    expect(await screen.findByTestId('report-loading')).toBeInTheDocument();
    expect(screen.getByTestId('report-print')).toBeDisabled();
  });

  it('error shows a message with Retry that loads the report', async () => {
    mode = 'error-once';
    const user = userEvent.setup();
    renderAt(DONE);
    expect(await screen.findByTestId('report-error')).toHaveTextContent(enReports.state.error);
    await user.click(screen.getByRole('button', { name: enReports.state.retry }));
    await doc();
  });

  it('a 404 is "report not available"', async () => {
    mode = 'not-found';
    renderAt(DONE);
    expect(await screen.findByTestId('report-not-available')).toHaveTextContent(
      enReports.state.notAvailable,
    );
    expect(screen.getByTestId('report-print')).toBeDisabled();
  });

  it('an empty period shows the empty state', async () => {
    transform = (r) => ({
      ...r,
      kpi: { ...r.kpi, casesOut: 0, casesIn: 0 },
      visits: [],
      topEvents: [],
    });
    renderAt(DONE);
    expect(
      await screen.findByTestId('report-empty', undefined, { timeout: 30_000 }),
    ).toHaveTextContent(enReports.state.empty);
    expect(screen.getByTestId('report-print')).toBeDisabled();
  });
});

describe('controls and URL', () => {
  it('defaults to the current shift, switches to the previous shift and to a daily report', async () => {
    const user = userEvent.setup();
    renderAt('/reports');
    const d = await doc();
    expect(d).toHaveAttribute('data-state', 'in-progress');
    expect(within(d).getByTestId('report-period')).toHaveTextContent('Shift B');
    expect(screen.getByRole('radio', { name: enReports.controls.currentShift })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(screen.getByRole('radio', { name: enReports.controls.previousShift }));
    await waitFor(() =>
      expect(screen.getAllByTestId('where').at(-1)).toHaveTextContent('date=2026-10-24&shift=A'),
    );
    await waitFor(() => expect(screen.getByTestId('report-period')).toHaveTextContent('Shift A'));

    await user.click(screen.getByRole('radio', { name: enReports.controls.kind.daily }));
    await waitFor(() =>
      expect(screen.getAllByTestId('where').at(-1)).toHaveTextContent('kind=daily'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('report-document')).toHaveAttribute('data-kind', 'daily'),
    );
    expect(screen.getByTestId('report-period')).not.toHaveTextContent('Shift');
    expect(screen.getByTestId('report-period')).toHaveTextContent('06:00 to 06:00');
    expect(screen.getByRole('radio', { name: enReports.controls.today })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // the daily report has no shift id in the request
    expect(
      reportRequests().some((r) => r.includes('/reports/daily') && !r.includes('shift=')),
    ).toBe(true);
  });

  it('the date and shift picker writes the period into the URL and blocks future shifts', async () => {
    const user = userEvent.setup();
    renderAt('/reports');
    await doc();
    await user.click(screen.getByRole('radio', { name: enReports.controls.pickShift }));
    const select = await screen.findByTestId('report-shift');
    const options = within(select).getAllByRole('option') as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(['A', 'B', 'C']);
    // at 19:20 on 24 Oct shift C (22:00) has not started
    expect(options.find((o) => o.value === 'C')?.disabled).toBe(true);
    expect(options.find((o) => o.value === 'A')?.disabled).toBe(false);
    await user.selectOptions(select, 'A');
    await waitFor(() => expect(screen.getAllByTestId('where').at(-1)).toHaveTextContent('shift=A'));
    expect(screen.getByTestId('report-date')).toHaveAttribute('max', '2026-10-24');
  });
});
