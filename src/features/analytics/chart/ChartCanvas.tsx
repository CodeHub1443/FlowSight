import type { EChartsOption } from 'echarts';
import { BarChart, LineChart } from 'echarts/charts';
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { init, use as registerEcharts, type ECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useMemo, useRef } from 'react';
import { useFmt } from '@/features/live';
import { useUiStore } from '@/stores';
import { withChartDefaults } from './options';
import { chartTheme, readChartTokens, usePrefersReducedMotion } from './theme';

// The only module that imports ECharts. Tree-shaken: the chart types and components the Performance widgets need,
// and the canvas renderer. Loaded lazily by <Chart> (analytics route only, never in the /live entry chunk).
registerEcharts([
  BarChart,
  LineChart,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export interface ChartCanvasProps {
  option: EChartsOption;
  ariaLabel: string;
  height: number | string;
  className?: string;
}

export default function ChartCanvas({ option, ariaLabel, height, className }: ChartCanvasProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const theme = useUiStore((s) => s.theme);
  const fmt = useFmt();
  const reducedMotion = usePrefersReducedMotion();
  const full = useMemo(
    () => withChartDefaults(option, { fmt, reducedMotion }),
    [option, fmt, reducedMotion],
  );
  // the newest option, for a re-init (theme switch) and the redraw once fonts are ready
  const latest = useRef(full);
  useEffect(() => {
    latest.current = full;
  }, [full]);

  // One instance per theme: the theme object is fixed at init, so a theme switch re-creates the chart.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const c = init(node, chartTheme(readChartTokens()), { renderer: 'canvas', useDirtyRect: true });
    chart.current = c;
    c.setOption(latest.current);
    let alive = true;
    // canvas text does not re-flow when a web font arrives: draw again once fonts are ready
    void globalThis.document?.fonts?.ready.then(() => {
      if (alive) c.setOption(latest.current);
    });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => c.resize());
    ro?.observe(node);
    return () => {
      alive = false;
      ro?.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, [theme]);

  // Option updates merge in place (no re-init, no flash); stale series are replaced, not kept.
  useEffect(() => {
    chart.current?.setOption(full, { replaceMerge: ['series'], lazyUpdate: true });
  }, [full]);

  return (
    <div
      ref={el}
      role="img"
      aria-label={ariaLabel}
      data-testid="chart-canvas"
      className={className}
      style={{ height, width: '100%' }}
    />
  );
}
