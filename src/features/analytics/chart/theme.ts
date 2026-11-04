import { useSyncExternalStore } from 'react';
import { useUiStore } from '@/stores';

// Chart colours and type, resolved from the CSS tokens of src/index.css (docs/06). Canvas cannot read `var(--x)`, so
// the values are read from the document at chart init and again when the theme changes. No colour literals here.

export const CHART_TOKENS = {
  ink900: '--ink-900',
  ink600: '--ink-600',
  ink400: '--ink-400',
  border: '--border',
  card: '--card',
  track: '--track',
  uiBlue: '--ui-blue',
  ok: '--ok',
  warn: '--warn',
  critical: '--critical',
  neutral: '--neutral',
  idle: '--idle',
  offline: '--offline',
  info: '--info',
  okInk: '--ok-ink',
  warnInk: '--warn-ink',
  neutralInk: '--neutral-ink',
  infoInk: '--info-ink',
  fontSans: '--font-sans',
} as const;

export type ChartTokenName = keyof typeof CHART_TOKENS;
export type ChartTokens = Record<ChartTokenName, string>;

/** Resolved token values for the current theme (empty strings outside a browser). */
export function readChartTokens(
  root: Element | null = globalThis.document?.documentElement ?? null,
): ChartTokens {
  const style = root ? getComputedStyle(root) : null;
  const out = {} as ChartTokens;
  for (const [name, cssVar] of Object.entries(CHART_TOKENS) as [ChartTokenName, string][]) {
    out[name] = style?.getPropertyValue(cssVar).trim() ?? '';
  }
  return out;
}

/** Resolved tokens, re-read when the light/dark theme changes. For widgets that colour series by tone. */
export function useChartTokens(): ChartTokens {
  const theme = useUiStore((s) => s.theme);
  // theme is the cache key: the `dark` class is toggled synchronously by UiPreferenceSync before this renders
  return cachedTokens(theme);
}

let cache: { theme: string; tokens: ChartTokens } | null = null;
function cachedTokens(theme: string): ChartTokens {
  if (!cache || cache.theme !== theme) cache = { theme, tokens: readChartTokens() };
  return cache.tokens;
}

/** The ECharts theme object (axis, grid, tooltip, legend, palette) for the resolved tokens. */
export function chartTheme(t: ChartTokens) {
  const axis = {
    axisLine: { lineStyle: { color: t.border } },
    axisTick: { lineStyle: { color: t.border } },
    axisLabel: { color: t.ink600 },
    splitLine: { lineStyle: { color: t.border } },
    nameTextStyle: { color: t.ink600 },
  };
  return {
    color: [t.uiBlue, t.neutral, t.warn, t.ok, t.idle, t.ink400],
    backgroundColor: 'transparent',
    textStyle: { fontFamily: t.fontSans || undefined, color: t.ink600 },
    title: { textStyle: { color: t.ink900 } },
    legend: { textStyle: { color: t.ink600 } },
    tooltip: {
      backgroundColor: t.card,
      borderColor: t.border,
      textStyle: { color: t.ink900 },
    },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    logAxis: axis,
  };
}

const REDUCED = '(prefers-reduced-motion: reduce)';

function subscribeReduced(cb: () => void): () => void {
  const mq = globalThis.matchMedia?.(REDUCED);
  if (!mq) return () => {};
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const reducedSnapshot = (): boolean => globalThis.matchMedia?.(REDUCED).matches ?? false;
const noReduced = (): boolean => false;

/** `prefers-reduced-motion: reduce`, live. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, reducedSnapshot, noReduced);
}
