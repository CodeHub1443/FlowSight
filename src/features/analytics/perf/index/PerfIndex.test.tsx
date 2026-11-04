import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EChartsOption } from 'echarts';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import fixture from '@/domain/fixtures/bay-performance.json';
import { BayPerformanceSchema, type BayPerformance } from '@/domain';
import i18n from '@/i18n';
import bn from '@/i18n/locales/bn/perfindex.json';
import enA from '@/i18n/locales/en/analytics.json';
import en from '@/i18n/locales/en/perfindex.json';
import type { PeriodWindow } from '@/lib/period';
import { BayIndexWidget } from './BayIndexWidget';
import { PerfIndexSection } from './PerfIndexSection';
import { inBayOrder } from './rows';
import { TimeSplitWidget } from './TimeSplitWidget';
import type { PerfQuery } from './types';
import { WorkloadWidget } from './WorkloadWidget';

// ECharts stand-in: records the option <Chart> hands to the canvas.
let lastOption: EChartsOption | null = null;
vi.mock('../../chart/load', () => ({
  preloadChart: vi.fn(),
  loadChartCanvas: () =>
    Promise.resolve({
      default: ({ option, ariaLabel }: { option: EChartsOption; ariaLabel: string }) => {
        lastOption = option;
        return <div role="img" aria-label={ariaLabel} data-testid="chart-canvas" />;
      },
    }),
}));

const hook = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/data/api', () => ({ useBayPerformance: () => hook.current }));

const BASE: BayPerformance = BayPerformanceSchema.parse(fixture);
const WINDOW: PeriodWindow = { range: 'day', start: 0, end: 1, to: 1 };
const BAYS = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07'];

const ok = (response: BayPerformance = BASE): PerfQuery => ({
  data: { window: WINDOW, response },
  isError: false,
  refetch: vi.fn(),
});
const loading: PerfQuery = { data: undefined, isError: false, refetch: vi.fn() };
const failed = (): PerfQuery => ({ data: undefined, isError: true, refetch: vi.fn() });

/** Same data with the rows in the given bay order (the widgets must still list B01..B07). */
const shuffled = (): BayPerformance => ({ ...BASE, rows: [...BASE.rows].reverse() });
const noTrucks = (): BayPerformance => ({
  ...BASE,
  site: { ...BASE.site, visits: 0 },
  rows: BASE.rows.map((r) => ({
    ...r,
    visits: 0,
    included: 0,
    index: null,
    confidence: 'NONE' as const,
    cartonsPerLoadingHour: null,
    avgCrew: null,
    cartonsPerCrewHour: null,
    mean: { ...r.mean, preOpMin: null, activeMin: null, postOpMin: null, occupancyMin: null },
  })),
});
const noIndex = (): BayPerformance => ({
  ...BASE,
  rows: BASE.rows.map((r, i) => ({
    ...r,
    included: i === 2 ? 5 : 1,
    index: null,
    confidence: 'NONE' as const,
  })),
});

function Where() {
  const { search } = useLocation();
  return <output data-testid="where">{search}</output>;
}
function wrap(ui: React.ReactNode, path = '/analytics') {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        {ui}
        <Where />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(async () => {
  lastOption = null;
  hook.current = ok();
  await i18n.changeLanguage('en');
});

const rowIds = (testIdPrefix: string, container: HTMLElement) =>
  within(container)
    .getAllByTestId(new RegExp(`^${testIdPrefix}-B\\d+$`))
    .map((e) => e.dataset.testid?.slice(-3));

describe('W1 bay index', () => {
  it('loading: busy skeleton', () => {
    wrap(<BayIndexWidget query={loading} range="day" onShowWeek={vi.fn()} />);
    expect(screen.getByTestId('widget-loading')).toHaveAttribute('aria-busy', 'true');
  });

  it('error: message and retry calls refetch', async () => {
    const q = failed();
    wrap(<BayIndexWidget query={q} range="day" onShowWeek={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(enA.state.error);
    await userEvent.setup().click(screen.getByRole('button', { name: enA.state.retry }));
    expect(q.refetch).toHaveBeenCalledTimes(1);
  });

  it('empty: no finished trucks', () => {
    wrap(<BayIndexWidget query={ok(noTrucks())} range="day" onShowWeek={vi.fn()} />);
    expect(screen.getByTestId('widget-empty')).toHaveTextContent(enA.state.empty);
  });

  it('insufficient: "n of min" with the highest included, and the week button', async () => {
    const onShowWeek = vi.fn();
    wrap(<BayIndexWidget query={ok(noIndex())} range="day" onShowWeek={onShowWeek} />);
    expect(screen.getByTestId('widget-insufficient')).toHaveTextContent(
      en.w1.insufficient.replace('{{n}}', '5').replace('{{min}}', '8'),
    );
    await userEvent.setup().click(screen.getByRole('button', { name: en.w1.showWeek }));
    expect(onShowWeek).toHaveBeenCalledTimes(1);
  });

  it('insufficient: the week button is hidden when the range is already week', () => {
    wrap(<BayIndexWidget query={ok(noIndex())} range="week" onShowWeek={vi.fn()} />);
    expect(screen.getByTestId('widget-insufficient')).toBeInTheDocument();
    expect(screen.queryByTestId('w1-show-week')).not.toBeInTheDocument();
  });

  it('ok: index, bar, band, visits per bay; no confidence note for OK', () => {
    wrap(<BayIndexWidget query={ok()} range="day" onShowWeek={vi.fn()} />);
    const b01 = screen.getByTestId('w1-row-B01');
    expect(b01).toHaveAttribute('data-confidence', 'OK');
    expect(b01).toHaveAttribute('data-band', 'comparable');
    expect(screen.getByTestId('w1-index-B01')).toHaveTextContent('104.2');
    expect(within(b01).getByTestId('w1-band')).toBeInTheDocument();
    expect(within(b01).getByTestId('w1-bar')).toBeInTheDocument();
    expect(screen.getByTestId('w1-visits-B01')).toHaveTextContent('11 visits');
    expect(screen.queryByTestId('w1-note-B01')).not.toBeInTheDocument();
    // under 90 reads slower
    expect(screen.getByTestId('w1-row-B02')).toHaveAttribute('data-band', 'slower');
  });

  it('LOW confidence: index shown muted with "few trucks"', () => {
    wrap(<BayIndexWidget query={ok()} range="day" onShowWeek={vi.fn()} />);
    expect(screen.getByTestId('w1-row-B03')).toHaveAttribute('data-confidence', 'LOW');
    expect(screen.getByTestId('w1-index-B03')).toHaveTextContent('97.3');
    expect(screen.getByTestId('w1-index-B03')).toHaveClass('text-ink-400');
    expect(screen.getByTestId('w1-note-B03')).toHaveTextContent('Few trucks (5 of 8)');
  });

  it('NONE confidence: no index and no bar, "Not enough comparable trucks"', () => {
    wrap(<BayIndexWidget query={ok()} range="day" onShowWeek={vi.fn()} />);
    expect(screen.getByTestId('w1-index-B04')).toBeEmptyDOMElement();
    expect(within(screen.getByTestId('w1-row-B04')).queryByTestId('w1-bar')).toBeNull();
    expect(screen.getByTestId('w1-none-B04')).toHaveTextContent(enA.confidence.none);
    // a bay with no visits at all still gets its row
    expect(screen.getByTestId('w1-visits-B05')).toHaveTextContent('0 visits');
  });

  it('lists the seven bays in bay order whatever order the data arrives in', () => {
    wrap(<BayIndexWidget query={ok(shuffled())} range="day" onShowWeek={vi.fn()} />);
    expect(rowIds('w1-row', screen.getByTestId('w1-rows'))).toEqual(BAYS);
  });

  it('the how-calculated popover opens with one sentence', async () => {
    wrap(<BayIndexWidget query={ok()} range="day" onShowWeek={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: en.how.open }));
    expect(await screen.findByTestId('w1-how-content')).toHaveTextContent(
      'same direction, pack type',
    );
  });

  it('renders Bangla digits and labels', async () => {
    await i18n.changeLanguage('bn');
    wrap(<BayIndexWidget query={ok()} range="day" onShowWeek={vi.fn()} />);
    expect(screen.getByTestId('w1-index-B01')).toHaveTextContent('১০৪.২');
    expect(screen.getByTestId('w1-visits-B01')).toHaveTextContent('১১');
    expect(screen.getByText(bn.w1.title)).toBeInTheDocument();
  });
});

describe('W2 where the time goes', () => {
  it('loading, error and empty', () => {
    const { rerender } = wrap(<TimeSplitWidget query={loading} />);
    expect(screen.getByTestId('widget-loading')).toBeInTheDocument();
    rerender(
      <TooltipProvider>
        <MemoryRouter>
          <TimeSplitWidget query={failed()} />
        </MemoryRouter>
      </TooltipProvider>,
    );
    expect(screen.getByTestId('widget-error')).toBeInTheDocument();
    rerender(
      <TooltipProvider>
        <MemoryRouter>
          <TimeSplitWidget query={ok(noTrucks())} />
        </MemoryRouter>
      </TooltipProvider>,
    );
    expect(screen.getByTestId('widget-empty')).toHaveTextContent(enA.state.empty);
  });

  it('insufficient: trucks but no phase data', () => {
    const p = noTrucks();
    wrap(<TimeSplitWidget query={ok({ ...p, site: { ...p.site, visits: 3 } })} />);
    expect(screen.getByTestId('widget-insufficient')).toHaveTextContent(en.w2.insufficient);
  });

  it('ok: stacked phases in bay order with tones, occupancy label and the site median line', async () => {
    wrap(<TimeSplitWidget query={ok(shuffled())} />);
    await screen.findByTestId('chart-canvas');
    const o = lastOption as unknown as {
      yAxis: { data: string[] };
      series: { id: string; stack: string; markLine?: { data: { xAxis: number }[] } }[];
    };
    expect(o.yAxis.data).toEqual(BAYS.map((_, i) => `Bay ${i + 1}`));
    const phases = o.series.filter((s) => s.id !== 'occupancy');
    expect(phases.map((s) => s.id)).toEqual(['preOp', 'work', 'postOp']);
    expect(new Set(o.series.map((s) => s.stack))).toEqual(new Set(['occupancy']));
    const median = BASE.site.medianOccupancyMin;
    expect(phases[2]?.markLine?.data).toEqual([{ xAxis: median }]);
    // text alternative: aria-label and a data table in bay order
    expect(screen.getByRole('img')).toHaveAccessibleName(/site median/i);
    const rows = within(screen.getByTestId('chart-data-table')).getAllByRole('rowheader');
    expect(rows.map((r) => r.textContent)).toEqual(BAYS.map((_, i) => `Bay ${i + 1}`));
  });

  it('labels the work phase by the dominant direction', async () => {
    wrap(<TimeSplitWidget query={ok()} />);
    await screen.findByTestId('chart-data-table');
    const table = screen.getByTestId('chart-data-table');
    // B01 sends cartons out; B04 only receives
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(`${en.w2.loading}:`);
    expect(within(table).getAllByRole('row')[4]).toHaveTextContent(`${en.w2.unloading}:`);
  });

  it('LOW confidence has no effect on W2 (delays are not volume-normalised)', async () => {
    wrap(<TimeSplitWidget query={ok()} />);
    await screen.findByTestId('chart-canvas');
    const o = lastOption as unknown as { series: { data: number[] }[] };
    expect(o.series[0]?.data[2]).toBe(10.8); // B03 is LOW, its pre-op mean is still drawn
  });

  it('Bangla category names', async () => {
    await i18n.changeLanguage('bn');
    wrap(<TimeSplitWidget query={ok()} />);
    await screen.findByTestId('chart-canvas');
    const o = lastOption as unknown as { yAxis: { data: string[] } };
    expect(o.yAxis.data[0]).toBe('বে ১');
  });
});

describe('W3 workload context', () => {
  it('loading, error and empty', () => {
    const { rerender } = wrap(<WorkloadWidget query={loading} />);
    expect(screen.getByTestId('widget-loading')).toBeInTheDocument();
    for (const [q, id] of [
      [failed(), 'widget-error'],
      [ok(noTrucks()), 'widget-empty'],
    ] as const) {
      rerender(
        <TooltipProvider>
          <MemoryRouter>
            <WorkloadWidget query={q} />
          </MemoryRouter>
        </TooltipProvider>,
      );
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('insufficient: trucks but no loading rate anywhere', () => {
    const p = noTrucks();
    wrap(<WorkloadWidget query={ok({ ...p, site: { ...p.site, visits: 2 } })} />);
    expect(screen.getByTestId('widget-insufficient')).toHaveTextContent(en.w3.insufficient);
  });

  it('ok: seven rows in bay order, never sorted, all five columns', () => {
    wrap(<WorkloadWidget query={ok(shuffled())} />);
    const table = screen.getByTestId('w3-table');
    expect(rowIds('w3-row', table)).toEqual(BAYS);
    const heads = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(heads).toEqual([
      en.bay,
      en.w3.cols.rate,
      en.w3.cols.outIn,
      en.w3.cols.trucks,
      en.w3.cols.crew,
      en.w3.cols.perCrew,
    ]);
    const b02 = screen.getByTestId('w3-row-B02');
    expect(b02).toHaveTextContent('5,400 / 1,800');
    expect(within(b02).getByText('400')).toBeInTheDocument();
    expect(within(b02).getByText('6.0')).toBeInTheDocument();
  });

  it('labels the crew rate "per crew member present", never "per worker"', () => {
    wrap(<WorkloadWidget query={ok()} />);
    const text = screen.getByTestId('w3-table').textContent ?? '';
    expect(text).toContain('per crew member present');
    expect(text.toLowerCase()).not.toContain('per worker');
  });

  it('a bay without visits shows a dash with the reason', () => {
    wrap(<WorkloadWidget query={ok()} />);
    const b05 = within(screen.getByTestId('w3-row-B05'));
    expect(b05.getAllByLabelText(en.w3.noVisits).length).toBeGreaterThan(0);
  });

  it('hides the crew columns when no bay has a crew count', () => {
    const p: BayPerformance = {
      ...BASE,
      rows: BASE.rows.map((r) => ({ ...r, avgCrew: null, cartonsPerCrewHour: null })),
    };
    wrap(<WorkloadWidget query={ok(p)} />);
    expect(screen.queryByText(en.w3.cols.crew)).not.toBeInTheDocument();
    expect(screen.queryByText(en.w3.cols.perCrew)).not.toBeInTheDocument();
  });

  it('Bangla digits', async () => {
    await i18n.changeLanguage('bn');
    wrap(<WorkloadWidget query={ok()} />);
    expect(screen.getByTestId('w3-row-B02')).toHaveTextContent('৫,৪০০ / ১,৮০০');
  });
});

describe('inBayOrder', () => {
  it('orders by bay id numerically and does not mutate', () => {
    const rows = [...BASE.rows].reverse();
    const before = rows.map((r) => r.bay);
    expect(inBayOrder(rows).map((r) => r.bay)).toEqual(BAYS);
    expect(rows.map((r) => r.bay)).toEqual(before);
  });
});

describe('PerfIndexSection', () => {
  it('feeds W1, W2 and W3 from one query, in that order', async () => {
    wrap(<PerfIndexSection range="day" />);
    const ids = ['perf-w1', 'perf-w2', 'perf-w3'].map((id) => screen.getByTestId(id));
    expect(ids[0]?.compareDocumentPosition(ids[1] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(ids[1]?.compareDocumentPosition(ids[2] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await screen.findByTestId('chart-canvas');
  });

  it('"Show last 7 days" sets the shared range to week', async () => {
    hook.current = ok(noIndex());
    wrap(<PerfIndexSection range="day" />);
    await userEvent.setup().click(screen.getByTestId('w1-show-week'));
    expect(screen.getByTestId('where')).toHaveTextContent('?range=week');
  });

  it('shows loading in all three widgets', () => {
    hook.current = loading;
    wrap(<PerfIndexSection range="day" />);
    expect(screen.getAllByTestId('widget-loading')).toHaveLength(3);
  });
});
