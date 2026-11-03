import type { ReactNode } from 'react';
import { ArrowUp } from 'lucide-react';
import { MaybeValue, TONE_TEXT } from '@/components/common';
import { cn } from '@/lib/utils';

/** Delta vs the same time yesterday: arrow + value, green when the move is good, red when bad (docs/06 §3). */
export function Delta({
  value,
  good,
  children,
  reason,
}: {
  value: number | null | undefined;
  /** Whether a rise is good (cartons) or bad (turnaround minutes). */
  good: 'up' | 'down';
  children: (v: number) => ReactNode;
  reason: string;
}) {
  return (
    <MaybeValue value={value} reason={reason}>
      {value !== null && value !== undefined && (
        <span
          data-testid="kpi-delta"
          data-value={value}
          className={cn(
            'soft-transition inline-flex items-center gap-0.5 text-[12px] leading-4 font-medium whitespace-nowrap tabular-nums',
            value === 0
              ? 'text-ink-400'
              : value > 0 === (good === 'up')
                ? TONE_TEXT.ok
                : TONE_TEXT.critical,
          )}
        >
          {/* One arrow, rotated: the sign flipping never swaps (remounts) the icon. */}
          <ArrowUp
            aria-hidden
            strokeWidth={2}
            className={cn(
              'soft-transition size-3',
              value < 0 && 'rotate-180',
              value === 0 && 'opacity-0',
            )}
          />
          {children(value)}
        </span>
      )}
    </MaybeValue>
  );
}
