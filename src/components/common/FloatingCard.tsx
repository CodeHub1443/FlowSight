import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Floating card (docs/06 §3): 16 px radius, hairline border, two-layer soft shadow, 92 % card over a 12 px backdrop
 * blur (`card-surface` in src/index.css). Takes pointer events even inside a click-through overlay.
 */
export function FloatingCard({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('card-surface pointer-events-auto', className)} {...props} />;
}
