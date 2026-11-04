import type { ReactNode } from 'react';
import { FloatingCard } from '@/components/common';
import { cn } from '@/lib/utils';

/** A Performance widget frame (docs/06 card): title, optional help (e.g. a "How this is calculated" popover) and action. */
export function WidgetCard({
  title,
  help,
  action,
  children,
  className,
  testId,
}: {
  title: ReactNode;
  help?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <FloatingCard className={cn('flex min-w-0 flex-col gap-3 p-4', className)} data-testid={testId}>
      <header className="flex min-w-0 items-center gap-2">
        <h3 className="text-ink-900 min-w-0 truncate text-[15px] leading-5 font-semibold">
          {title}
        </h3>
        {help}
        {action && <div className="ms-auto shrink-0">{action}</div>}
      </header>
      {children}
    </FloatingCard>
  );
}
