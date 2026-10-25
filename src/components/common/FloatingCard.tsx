import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** White floating card: 12 px radius, soft shadow. Takes pointer events even inside a click-through overlay. */
export function FloatingCard({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'bg-card text-card-foreground pointer-events-auto rounded-xl border shadow-lg shadow-black/10',
        className,
      )}
      {...props}
    />
  );
}
