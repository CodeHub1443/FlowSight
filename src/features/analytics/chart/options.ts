import type { EChartsOption } from 'echarts';

// Pure option post-processing owned by <Chart>: locale digits on axes and tooltips, and reduced motion.
// Widgets may set their own formatters; these only fill the gaps, so every number on a chart goes through
// src/lib/format.ts (Bangla digits and lakh grouping in bn).

export type ChartFormat = {
  num: (n: number, fractionDigits?: number) => string;
  clock: (t: Date | number | string) => string;
};

type AxisLike = {
  type?: string;
  axisLabel?: { formatter?: unknown } & Record<string, unknown>;
} & Record<string, unknown>;

/** Up to one decimal, only when the value has one (axis ticks like 0.5). */
export function formatChartNumber(fmt: ChartFormat, v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v))
    return v === null || v === undefined ? '—' : String(v);
  return fmt.num(v, Number.isInteger(v) ? 0 : 1);
}

function fixAxis(axis: AxisLike, fmt: ChartFormat, defaultType: 'value' | 'category'): AxisLike {
  if (axis.axisLabel?.formatter !== undefined) return axis;
  const type = axis.type ?? defaultType;
  if (type === 'value' || type === 'log') {
    return {
      ...axis,
      axisLabel: { ...axis.axisLabel, formatter: (v: number) => formatChartNumber(fmt, v) },
    };
  }
  if (type === 'time') {
    return { ...axis, axisLabel: { ...axis.axisLabel, formatter: (v: number) => fmt.clock(v) } };
  }
  return axis;
}

function fixAxes(axes: unknown, fmt: ChartFormat, defaultType: 'value' | 'category'): unknown {
  if (axes === undefined || axes === null) return axes;
  if (Array.isArray(axes)) return axes.map((a: AxisLike) => fixAxis(a, fmt, defaultType));
  return fixAxis(axes as AxisLike, fmt, defaultType);
}

function fixTooltip(tooltip: unknown, fmt: ChartFormat): unknown {
  if (tooltip === undefined || tooltip === null || Array.isArray(tooltip)) return tooltip;
  const t = tooltip as Record<string, unknown>;
  if (t.formatter !== undefined || t.valueFormatter !== undefined) return t;
  return { ...t, valueFormatter: (v: unknown) => formatChartNumber(fmt, v) };
}

/** The option with locale formatters filled in and animation off under reduced motion. Does not mutate. */
export function withChartDefaults(
  option: EChartsOption,
  ctx: { fmt: ChartFormat; reducedMotion: boolean },
): EChartsOption {
  const out: Record<string, unknown> = { ...option };
  out.xAxis = fixAxes(option.xAxis, ctx.fmt, 'category');
  out.yAxis = fixAxes(option.yAxis, ctx.fmt, 'value');
  out.tooltip = fixTooltip(option.tooltip, ctx.fmt);
  if (option.xAxis === undefined) delete out.xAxis;
  if (option.yAxis === undefined) delete out.yAxis;
  if (option.tooltip === undefined) delete out.tooltip;
  if (ctx.reducedMotion) out.animation = false;
  else {
    out.animation = option.animation ?? true;
    out.animationDuration = option.animationDuration ?? 300;
    out.animationDurationUpdate = option.animationDurationUpdate ?? 300;
  }
  return out as EChartsOption;
}
