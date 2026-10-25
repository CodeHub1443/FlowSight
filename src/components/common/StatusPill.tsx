import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TONE_DOT, TONE_TINT, type Tone } from './tone';

/** Coloured status chip: tinted background, token dot, foreground text (legible on both themes). */
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
        'text-foreground inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.85rem] leading-5 font-medium whitespace-nowrap',
        TONE_TINT[tone],
        className,
      )}
    >
      <span className={cn('size-2 shrink-0 rounded-full', TONE_DOT[tone])} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}
