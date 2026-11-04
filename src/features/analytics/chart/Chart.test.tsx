import { act, render, screen } from '@testing-library/react';
import type { EChartsOption } from 'echarts';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { uiStore } from '@/stores';
import { Chart } from './Chart';
import { formatChartNumber, withChartDefaults, type ChartFormat } from './options';
import { chartTheme, readChartTokens } from './theme';

// jsdom has no canvas: echarts/core is replaced by a recording fake.
const charts: {
  setOption: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  theme: unknown;
}[] = [];
vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: vi.fn((_el: HTMLElement, theme: unknown) => {
    const c = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn(), theme };
    charts.push(c);
    return c;
  }),
}));
// only passed to use(): stand-ins keep the lazy chunk small in jsdom
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {} }));
vi.mock('echarts/components', () => ({
  DatasetComponent: {},
  GridComponent: {},
  LegendComponent: {},
  MarkAreaComponent: {},
  MarkLineComponent: {},
  TooltipComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

// the first import transforms the module graph; slow under a loaded full run
beforeAll(async () => {
  await import('./ChartCanvas');
}, 60_000);

const fmtEn: ChartFormat = { num: (n, d = 0) => n.toFixed(d), clock: () => '19:20' };
const OPTION: EChartsOption = {
  xAxis: { type: 'value' },
  yAxis: { type: 'category', data: ['B01'] },
  tooltip: {},
  series: [{ type: 'bar', data: [1234] }],
};
const TABLE = { columns: ['Bay', 'Cartons'], rows: [['Bay 1', '1,234']] };

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      matches: reduce && q.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(async () => {
  charts.length = 0;
  setReducedMotion(false);
  await i18n.changeLanguage('en');
});
afterEach(() => {
  vi.unstubAllGlobals();
  uiStore.getState().setTheme('light');
});

async function renderChart(option: EChartsOption = OPTION) {
  const view = render(
    <Chart option={option} ariaLabel="Cartons per bay" table={TABLE} testId="c" />,
  );
  await screen.findByTestId('chart-canvas');
  return view;
}

const lastOption = (i = 0): Record<string, unknown> => {
  const calls = charts[i]?.setOption.mock.calls ?? [];
  return (calls[calls.length - 1]?.[0] ?? {}) as Record<string, unknown>;
};

describe('<Chart>', () => {
  it('has an accessible name and a visually hidden data table', async () => {
    await renderChart();
    expect(screen.getByRole('img', { name: 'Cartons per bay' })).toBeInTheDocument();
    const table = screen.getByTestId('chart-data-table');
    expect(table).toHaveClass('sr-only');
    expect(table).toHaveTextContent('Data table: Cartons per bay');
    expect(screen.getByRole('rowheader', { name: 'Bay 1' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1,234' })).toBeInTheDocument();
  });

  it('inits once with a token theme and disposes on unmount', async () => {
    const view = await renderChart();
    expect(charts).toHaveLength(1);
    expect(charts[0]?.theme).toMatchObject({ backgroundColor: 'transparent' });
    view.unmount();
    expect(charts[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it('re-creates the chart when the theme changes (and disposes the old one)', async () => {
    await renderChart();
    act(() => uiStore.getState().setTheme('dark'));
    expect(charts).toHaveLength(2);
    expect(charts[0]?.dispose).toHaveBeenCalled();
    expect(charts[1]?.setOption).toHaveBeenCalled();
  });

  it('updates in place when the option changes (no re-init)', async () => {
    const view = await renderChart();
    view.rerender(
      <Chart
        option={{ ...OPTION, series: [{ type: 'bar', data: [5] }] }}
        ariaLabel="Cartons per bay"
        table={TABLE}
      />,
    );
    expect(charts).toHaveLength(1);
    const calls = charts[0]?.setOption.mock.calls ?? [];
    expect(calls[calls.length - 1]?.[1]).toMatchObject({ replaceMerge: ['series'] });
  });

  it('turns animation off under prefers-reduced-motion', async () => {
    setReducedMotion(true);
    await renderChart();
    expect(lastOption().animation).toBe(false);
  });

  it('formats value axes and tooltips with Bangla digits in bn', async () => {
    await i18n.changeLanguage('bn');
    await renderChart();
    const x = lastOption().xAxis as { axisLabel: { formatter: (v: number) => string } };
    expect(x.axisLabel.formatter(1234)).toBe('১,২৩৪');
    const tip = lastOption().tooltip as { valueFormatter: (v: number) => string };
    expect(tip.valueFormatter(150000)).toBe('১,৫০,০০০');
  });
});

describe('withChartDefaults', () => {
  it('fills formatters only where the widget set none', () => {
    const own = (v: number) => `x${v}`;
    const out = withChartDefaults(
      {
        xAxis: [{ type: 'value', axisLabel: { formatter: own } }, { type: 'time' }],
        yAxis: {},
        tooltip: { formatter: 'custom' },
      },
      { fmt: fmtEn, reducedMotion: false },
    ) as Record<string, unknown>;
    const xs = out.xAxis as { axisLabel: { formatter: (v: number) => string } }[];
    expect(xs[0]?.axisLabel.formatter).toBe(own);
    expect(xs[1]?.axisLabel.formatter(0)).toBe('19:20');
    // yAxis defaults to a value axis in ECharts
    expect(
      (out.yAxis as { axisLabel: { formatter: (v: number) => string } }).axisLabel.formatter(2.5),
    ).toBe('2.5');
    expect(out.tooltip).toEqual({ formatter: 'custom' });
    expect(out.animation).toBe(true);
  });

  it('does not add axes the option does not have, and does not mutate', () => {
    const opt: EChartsOption = { series: [] };
    const out = withChartDefaults(opt, { fmt: fmtEn, reducedMotion: true }) as Record<
      string,
      unknown
    >;
    expect('xAxis' in out).toBe(false);
    expect(out.animation).toBe(false);
    expect(opt).toEqual({ series: [] });
  });

  it('formatChartNumber keeps one decimal only when needed and shows a dash for null', () => {
    expect(formatChartNumber(fmtEn, 3)).toBe('3');
    expect(formatChartNumber(fmtEn, 3.25)).toBe('3.3');
    expect(formatChartNumber(fmtEn, null)).toBe('—');
  });
});

describe('chart theme', () => {
  it('reads every colour from the CSS tokens', () => {
    document.documentElement.style.setProperty('--ink-600', '#475569');
    document.documentElement.style.setProperty('--border', '#e3e8f3');
    const t = readChartTokens();
    expect(t.ink600).toBe('#475569');
    const theme = chartTheme(t);
    expect(theme.valueAxis.axisLabel.color).toBe('#475569');
    expect(theme.valueAxis.splitLine.lineStyle.color).toBe('#e3e8f3');
  });
});
