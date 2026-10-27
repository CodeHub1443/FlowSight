import { memo, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

const TWEEN_MS = 300;

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * A number that tweens to its new value over 300 ms instead of jumping (docs/06 §3). The text is written straight to
 * the DOM from requestAnimationFrame, so a tween costs no React renders. Integers stay integers while tweening.
 * `minCh` reserves width (tabular figures are 1ch each) so a growing value never moves its neighbours.
 * Without matchMedia (tests) or with reduced motion the value is shown at once.
 */
export const Num = memo(function Num({
  value,
  format,
  minCh,
  className,
}: {
  value: number;
  format: (v: number) => string;
  minCh?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const fmt = useRef(format);

  // Keep the latest formatter (language change) and repaint a resting value with it.
  useLayoutEffect(() => {
    fmt.current = format;
    if (ref.current && shown.current === value) ref.current.textContent = format(value);
  }, [format, value]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    if (from === null || from === value || reducedMotion()) {
      shown.current = value;
      el.textContent = fmt.current(value);
      return;
    }
    const ints = Number.isInteger(from) && Number.isInteger(value);
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / TWEEN_MS);
      const v = k === 1 ? value : from + (value - from) * (1 - (1 - k) ** 3);
      shown.current = ints ? Math.round(v) : v;
      el.textContent = fmt.current(shown.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span
      ref={ref}
      data-num=""
      data-min-ch={minCh}
      className={cn('inline-block tabular-nums', className)}
      style={minCh ? { minWidth: `${minCh}ch` } : undefined}
    />
  );
});
