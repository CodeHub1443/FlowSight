import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Key / value list for the inspector: label left, value right-aligned, hairline separators. */
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
        'border-hairline bn-leading flex min-h-9 items-baseline justify-between gap-3 border-b py-2 text-[13px] leading-5 last:border-b-0',
        className,
      )}
    >
      <dt className="text-ink-600 shrink-0">{label}</dt>
      <dd className="text-ink-900 min-w-0 text-right font-semibold tabular-nums">{children}</dd>
    </div>
  );
}
