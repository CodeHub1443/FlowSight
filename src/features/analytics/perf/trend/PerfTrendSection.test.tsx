import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BayPerformance, BayPerfRow, Series } from '@/domain';
import i18n from '@/i18n';
import bn from '@/i18n/locales/bn/perftrend.json';
import en from '@/i18n/locales/en/perftrend.json';
import analyticsEn from '@/i18n/locales/en/analytics.json';
import type { PerfRange, PeriodWindow } from '@/lib/period';
import { PerfTrendSection } from './PerfTrendSection';

// The data hooks and the chart are stand-ins: these tests are about what the widgets ask for and show. ECharts itself
// is covered by Chart.test.tsx; here the chart records the option it was given.
const H = 3_600_000;
const D = 24 * H;
const DAY_START = Date.parse('2026-10-24T06:00:00+06:00');

type QueryState<T> = {
  data: T | undefined;
  isError: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  throughput: new Map<string, unknown>(),
  perf: { current: undefined as unknown },
  chart: { last: undefined as undefined | { option: unknown; ariaLabel: string; table: unknown } },
}));

vi.mock('@/data/api', () => ({
  useThroughput: (_range: string, previous: boolean) =>
    mocks.throughput.get(previous ? 'previous' : 'current'),
  useBayPerformance: () => mocks.perf.current,
}));

vi.mock('../../chart/Chart', () => ({
  Chart: (props: { option: unknown; ariaLabel: string; table: unknown }) => {
    mocks.chart.last = props;
    return <div data-testid="trend-chart" aria-label={props.ariaLabel} role="img" />;
  },
}));
vi.mock('../../chart/theme', () => ({
  useChartTokens: () => ({ uiBlue: 'blue', ink400: 'grey' }),
}));

const win = (start: number, to: number): PeriodWindow => ({
  range: 'day',
  start,
  end: start + D,
  to,
});

const ser = (key: string, start: number, pairs: [number, number][]): Series => ({
  key,
  label: { en: key, bn: key },
  points: pairs.map(([h, v]) => ({ t: new Date(start + h * H).toISOString(), v })),
});

function query<T>(data: T | undefined, isError = false): QueryState<T> {
  return { data, isError, refetch: vi.fn() };
}

function setThroughput(cur: QueryState<unknown>, prev: QueryState<unknown>) {
  mocks.throughput.set('current', cur);
  mocks.throughput.set('previous', prev);
}

/** Two periods: now = 3 hours in; today 5+6+7, yesterday 10+10+10+10. */
function readyThroughput(opts: { prevScale?: number } = {}) {
  const scale = opts.prevScale ?? 1;
  const prevStart = DAY_START - D;
  const now = DAY_START + 3 * H;
  setThroughput(
    query({
      window: win(DAY_START, now),
      response: {
        series: [
          ser('B01.OUT', DAY_START, [
            [0, 2],
            [1, 3],
            [2, 4],
          ]),
          ser('B01.IN', DAY_START, [[0, 1]]),
          ser('B02.OUT', DAY_START, [
            [0, 2],
            [1, 3],
            [2, 3],
          ]),
        ],
      },
    }),
    query({
      window: win(prevStart, DAY_START),
      response: {
        series: [
          ser('B01.OUT', prevStart, [
            [0, 5 * scale],
            [1, 5 * scale],
            [2, 5 * scale],
            [3, 5 * scale],
          ]),
          ser('B02.OUT', prevStart, [
            [0, 5 * scale],
            [1, 5 * scale],
            [2, 5 * scale],
            [3, 5 * scale],
          ]),
        ],
      },
    }),
  );
}

const row = (bay: string, visits: number, detentions: number): BayPerfRow =>
  ({
    bay,
    visits,
    included: visits,
    cartonsOut: 0,
    cartonsIn: 0,
    cartonsPerLoadingHour: null,
    minPer100Cartons: null,
    avgCrew: null,
    cartonsPerCrewHour: null,
    mean: {
      occupancyMin: null,
      waitForDockMin: null,
      preOpMin: null,
      activeMin: null,
      postOpMin: null,
    },
    detentions,
    index: null,
    confidence: 'NONE',
  }) as BayPerfRow;

function setPerf(rows: BayPerfRow[], state: Partial<QueryState<unknown>> = {}) {
  const response = {
    from: '',
    to: '',
    minIncluded: 8,
    site: {
      visits: rows.reduce((a, r) => a + r.visits, 0),
      medianOccupancyMin: null,
      medianPreOpMin: null,
      medianPostOpMin: null,
    },
    cohorts: [],
    rows,
  } as BayPerformance;
  mocks.perf.current = {
    data: { window: win(DAY_START, DAY_START + 3 * H), response },
    isError: false,
    refetch: vi.fn(),
    ...state,
  };
}

const renderSection = (range: PerfRange = 'day') => render(<PerfTrendSection range={range} />);

type LineSeries = { name: string; data: (number | null)[] };
const chartOption = () =>
  mocks.chart.last?.option as { series: LineSeries[]; xAxis: { data: string[] } };

beforeEach(async () => {
  await i18n.changeLanguage('en');
  mocks.chart.last = undefined;
  readyThroughput();
  setPerf([row('B01', 11, 2), row('B02', 0, 0), row('B03', 5, 0)]);
});

describe('W4 throughput trend', () => {
  it('draws this period against the previous one, the current line stopping at now', () => {
    renderSection('day');
    const [previous, current] = chartOption().series as [LineSeries, LineSeries];
    expect(previous.name).toBe(en.throughput.series.previous.day);
    expect(current.name).toBe(en.throughput.series.current.day);
    // all bays, both directions: hour 0 = 2+1+2, hour 1 = 3+3, hour 2 = 4+3
    expect(current.data.slice(0, 4)).toEqual([5, 6, 7, null]);
    expect(current.data).toHaveLength(24);
    expect(previous.data.slice(0, 5)).toEqual([10, 10, 10, 10, 0]);
    expect(chartOption().xAxis.data[0]).toBe('06:00');
  });

  it('caption: totals of both periods at the same point and the difference in percent', () => {
    renderSection('day');
    expect(screen.getByTestId('trend-total-current')).toHaveTextContent(/^Today: 18 cartons$/);
    // 3 hours elapsed: 3 x 10 of yesterday
    expect(screen.getByTestId('trend-total-previous')).toHaveTextContent(
      /^Yesterday by the same time: 30 cartons$/,
    );
    // (18 - 30) / 30 = -40 %
    expect(screen.getByTestId('trend-delta')).toHaveTextContent(/-40%/);
  });

  it('hides the difference when the previous total is 0', () => {
    readyThroughput({ prevScale: 0 });
    renderSection('day');
    expect(screen.getByTestId('trend-total-previous')).toHaveTextContent('0 cartons');
    expect(screen.queryByTestId('trend-delta')).not.toBeInTheDocument();
    expect(screen.getByTestId('trend-no-previous')).toHaveTextContent(
      en.throughput.caption.noPrevious,
    );
  });

  it('shows "No previous-period data yet" instead of a difference when the previous period is unknown', async () => {
    const prevStart = DAY_START - D;
    const prev = mocks.throughput.get('previous') as QueryState<{
      window: PeriodWindow;
      response: { series: Series[] };
    }>;
    const nulls: Series = {
      key: 'B01.OUT',
      label: { en: 'B01.OUT', bn: 'B01.OUT' },
      points: [0, 1, 2, 3].map((h) => ({ t: new Date(prevStart + h * H).toISOString(), v: null })),
    };
    mocks.throughput.set('previous', {
      ...prev,
      data: { window: prev.data?.window as PeriodWindow, response: { series: [nulls] } },
    });
    renderSection('day');
    expect(chartOption().series[0]?.data.slice(0, 4)).toEqual([null, null, null, null]);
    expect(screen.queryByTestId('trend-delta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trend-total-previous')).not.toBeInTheDocument();
    expect(screen.getByTestId('trend-no-previous')).toHaveTextContent(
      en.throughput.caption.noPrevious,
    );
    await i18n.changeLanguage('bn');
    renderSection('day');
    expect(screen.getAllByText(bn.throughput.caption.noPrevious).length).toBeGreaterThan(0);
  });

  it('the hour in progress is a dashed, hollow partial point, not a full bucket', () => {
    const cur = mocks.throughput.get('current') as QueryState<{
      window: PeriodWindow;
      response: unknown;
    }>;
    mocks.throughput.set('current', {
      ...cur,
      data: {
        window: win(DAY_START, DAY_START + 2.5 * H),
        response: (cur.data as { response: unknown }).response,
      },
    });
    renderSection('day');
    const series = chartOption().series as unknown as { name: string; data: unknown[] }[];
    expect(series).toHaveLength(3);
    expect(series[1]?.data.slice(0, 3)).toEqual([5, 6, null]);
    expect(series[2]?.data[2]).toMatchObject({ value: 7, symbol: 'circle' });
  });

  it('the bay filter re-cuts both lines without a new request', async () => {
    const user = userEvent.setup();
    renderSection('day');
    const select = screen.getByRole('combobox', { name: en.throughput.bayFilter });
    expect(within(select).getAllByRole('option')[0]).toHaveTextContent(en.throughput.allBays);
    expect(within(select).getAllByRole('option')).toHaveLength(8); // all bays + the configured bays
    await user.selectOptions(select, 'B02');
    const [previous, current] = chartOption().series as [LineSeries, LineSeries];
    expect(current.data.slice(0, 3)).toEqual([2, 3, 3]);
    expect(previous.data.slice(0, 2)).toEqual([5, 5]);
    expect(screen.getByTestId('trend-total-current')).toHaveTextContent('8 cartons');
  });

  it('the week is drawn as per-day totals with date labels', () => {
    const weekStart = DAY_START - 6 * D;
    const prevStart = weekStart - 7 * D;
    const wk = (start: number, to: number): PeriodWindow => ({
      range: 'week',
      start,
      end: start + 7 * D,
      to,
    });
    setThroughput(
      query({
        window: wk(weekStart, weekStart + 6 * D + 2 * H),
        response: {
          series: [
            ser('B01.OUT', weekStart, [
              [0, 4],
              [30, 6],
              [24 * 6, 1],
            ]),
          ],
        },
      }),
      query({
        window: wk(prevStart, weekStart),
        response: { series: [ser('B01.OUT', prevStart, [[0, 8]])] },
      }),
    );
    renderSection('week');
    const [, current] = chartOption().series as [LineSeries, LineSeries];
    // the day in progress (the last) is not a full bucket: it is the dashed, hollow partial point
    expect(current.data).toEqual([4, 6, 0, 0, 0, 0, null]);
    const partial = (chartOption().series as unknown as { data: unknown[] }[])[2];
    expect(partial?.data[6]).toMatchObject({ value: 1, symbol: 'circle' });
    expect(chartOption().xAxis.data).toHaveLength(7);
    expect(chartOption().xAxis.data[0]).toBe('Sun 18 Oct');
    expect(screen.getByText(en.throughput.title.day)).toBeInTheDocument();
  });

  it('Bangla: digits, series names and caption', async () => {
    await i18n.changeLanguage('bn');
    renderSection('day');
    const [previous, current] = chartOption().series as [LineSeries, LineSeries];
    expect(current.name).toBe(bn.throughput.series.current.day);
    expect(previous.name).toBe(bn.throughput.series.previous.day);
    expect(chartOption().xAxis.data[0]).toBe('০৬:০০');
    expect(screen.getByTestId('trend-total-current')).toHaveTextContent('১৮');
    expect(screen.getByTestId('trend-delta')).toHaveTextContent(/৪০/);
    expect(screen.getByTestId('trend-delta').textContent).not.toMatch(/[0-9]/);
    expect(screen.getByTestId('trend-total-previous').textContent).not.toMatch(/[0-9]/);
  });

  it('loading', () => {
    setThroughput(query(undefined), query(undefined));
    renderSection();
    expect(within(screen.getByTestId('perf-w4')).getByTestId('widget-loading')).toBeInTheDocument();
  });

  it('error: message and a retry that asks both requests again', async () => {
    setThroughput(query(undefined, true), query(undefined));
    renderSection();
    const w4 = screen.getByTestId('perf-w4');
    expect(within(w4).getByRole('alert')).toHaveTextContent(analyticsEn.state.error);
    await userEvent
      .setup()
      .click(within(w4).getByRole('button', { name: analyticsEn.state.retry }));
    const cur = mocks.throughput.get('current') as QueryState<unknown>;
    const prev = mocks.throughput.get('previous') as QueryState<unknown>;
    expect(cur.refetch).toHaveBeenCalledTimes(1);
    expect(prev.refetch).toHaveBeenCalledTimes(1);
  });

  it('data already on screen stays when a refetch fails', () => {
    const cur = mocks.throughput.get('current') as QueryState<unknown>;
    cur.isError = true;
    renderSection();
    expect(screen.getByTestId('trend-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('widget-error')).not.toBeInTheDocument();
  });

  it('empty: no cartons in either period', () => {
    setThroughput(
      query({ window: win(DAY_START, DAY_START + 3 * H), response: { series: [] } }),
      query({ window: win(DAY_START - D, DAY_START), response: { series: [] } }),
    );
    renderSection();
    expect(within(screen.getByTestId('perf-w4')).getByTestId('widget-empty')).toHaveTextContent(
      analyticsEn.state.empty,
    );
  });

  it('insufficient: the period has not started', () => {
    setThroughput(
      query({ window: win(DAY_START, DAY_START), response: { series: [] } }),
      query({ window: win(DAY_START - D, DAY_START), response: { series: [] } }),
    );
    renderSection();
    expect(
      within(screen.getByTestId('perf-w4')).getByTestId('widget-insufficient'),
    ).toHaveTextContent(en.throughput.insufficient);
  });

  it('gives the chart a text alternative: label and a table with both series', () => {
    renderSection('day');
    expect(screen.getByRole('img')).toHaveAccessibleName(
      `${en.throughput.title.hour}: ${en.throughput.series.current.day} compared with ${en.throughput.series.previous.day}`,
    );
    const table = mocks.chart.last?.table as { columns: string[]; rows: (string | null)[][] };
    expect(table.columns).toEqual([
      en.throughput.table.hour,
      en.throughput.series.current.day,
      en.throughput.series.previous.day,
    ]);
    expect(table.rows[0]).toEqual(['06:00', '5', '10']);
    expect(table.rows[5]?.[1]).toBeNull(); // the future is empty, not 0
  });
});

describe('W5 trucks over the expected time', () => {
  const cell = (bay: string) => screen.getByTestId(`detention-${bay}`);

  it('one cell per bay in the order the rows come, with count and "of n"', () => {
    renderSection();
    const strip = screen.getByTestId('detention-strip');
    const ids = within(strip)
      .getAllByRole('listitem')
      .map((li) => li.dataset.testid);
    expect(ids).toEqual(['detention-B01', 'detention-B02', 'detention-B03']);
    expect(cell('B01')).toHaveAccessibleName(/2 of 11 trucks over the expected time \(18%\)/);
    expect(cell('B01')).toHaveTextContent('2');
    expect(cell('B01')).toHaveTextContent('of 11 trucks');
    expect(cell('B01')).toHaveAttribute('data-state', 'over');
    expect(cell('B03')).toHaveAttribute('data-state', 'none');
  });

  it('is never sorted by a value', () => {
    setPerf([row('B01', 2, 0), row('B02', 10, 9), row('B03', 4, 1)]);
    renderSection();
    const ids = within(screen.getByTestId('detention-strip'))
      .getAllByRole('listitem')
      .map((li) => li.dataset.testid);
    expect(ids).toEqual(['detention-B01', 'detention-B02', 'detention-B03']);
  });

  it('a bay without visits shows a dash with its reason, not 0', () => {
    renderSection();
    expect(cell('B02')).toHaveAttribute('data-state', 'no-visits');
    expect(cell('B02')).toHaveTextContent('—');
    expect(cell('B02')).toHaveTextContent(en.detention.noVisits);
    expect(cell('B02')).not.toHaveTextContent('0');
  });

  it('Bangla digits and language-aware bay labels', async () => {
    await i18n.changeLanguage('bn');
    renderSection();
    expect(cell('B01')).toHaveTextContent('বে ১');
    expect(cell('B01').textContent).not.toMatch(/[0-9]/);
    expect(cell('B01')).toHaveTextContent('১১');
  });

  it('loading, error with retry, empty', async () => {
    mocks.perf.current = { data: undefined, isError: false, refetch: vi.fn() };
    const { unmount } = renderSection();
    expect(within(screen.getByTestId('perf-w5')).getByTestId('widget-loading')).toBeInTheDocument();
    unmount();

    const refetch = vi.fn();
    mocks.perf.current = { data: undefined, isError: true, refetch };
    const second = renderSection();
    await userEvent.setup().click(
      within(screen.getByTestId('perf-w5')).getByRole('button', {
        name: analyticsEn.state.retry,
      }),
    );
    expect(refetch).toHaveBeenCalledTimes(1);
    second.unmount();

    setPerf([row('B01', 0, 0), row('B02', 0, 0)]);
    renderSection();
    expect(within(screen.getByTestId('perf-w5')).getByTestId('widget-empty')).toHaveTextContent(
      analyticsEn.state.empty,
    );
  });
});
