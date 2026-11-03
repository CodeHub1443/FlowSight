import type { ReactNode } from 'react';
import { TONE_DOT, type Tone } from '@/components/common';
import { cn } from '@/lib/utils';

// Compact two- and three-column blocks of the bay inspector (19.9b, decision D2: the truck timeline must fit above the
// fold at 1366x768). A cell is a small label over its value; a block is one <dl> with a hairline under it.

export function BayCells({ cols, children }: { cols: 2 | 3; children: ReactNode }) {
  return (
    <dl
      className={cn(
        'border-hairline grid gap-x-3 gap-y-2 border-b py-2 last:border-b-0',
        cols === 2 ? 'grid-cols-2' : 'grid-cols-3',
      )}
    >
      {children}
    </dl>
  );
}

export function BayCell({
  label,
  swatch,
  children,
}: {
  label: ReactNode;
  swatch?: Tone;
  children: ReactNode;
}) {
  return (
    <div className="bn-leading min-w-0">
      <dt className="text-ink-600 flex min-w-0 items-start gap-1.5 text-[12px] leading-4">
        {swatch && (
          <span aria-hidden className={cn('mt-1 size-2 shrink-0 rounded-full', TONE_DOT[swatch])} />
        )}
        <span className="min-w-0">{label}</span>
      </dt>
      <dd className="text-ink-900 text-[13px] leading-5 font-semibold tabular-nums">{children}</dd>
    </div>
  );
}
