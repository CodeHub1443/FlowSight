import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Calm 12 px label (docs/06 §3: no shouting caps). */
export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-ink-600 text-[12px] leading-4 font-medium', className)}>
      {children}
    </span>
  );
}
