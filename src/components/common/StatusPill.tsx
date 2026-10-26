import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TONE_TEXT, TONE_TINT, type Tone } from './tone';

/** Status pill (docs/06 §3): tinted background, coloured text, 12 px medium, 4 x 10 px padding, fully rounded. */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'soft-transition inline-flex max-w-full shrink-0 items-center rounded-full px-[10px] py-[4px] text-[12px] leading-4 font-medium whitespace-nowrap',
        TONE_TINT[tone],
        TONE_TEXT[tone],
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
