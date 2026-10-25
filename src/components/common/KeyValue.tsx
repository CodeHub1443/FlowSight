import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Key / value list for the inspector: label left, value right-aligned. */
export function KeyValueList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('flex flex-col', className)}>{children}</dl>;
}

export function KeyValue({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 border-b border-dashed py-1.5 last:border-b-0',
        className,
      )}
    >
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}
