import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Small-caps label (reference look). Bangla has no case, so it only gains the tracking and weight. */
export function SmallCaps({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'text-muted-foreground text-[0.85rem] leading-5 font-semibold tracking-wide uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}
