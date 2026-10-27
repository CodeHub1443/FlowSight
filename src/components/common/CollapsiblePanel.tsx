import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FloatingCard } from './FloatingCard';

/**
 * Floating card with a header row and a collapse chevron. Collapsed, only the header remains; opening slides and fades
 * the body in (200 ms). `bodyClassName` styles the body region.
 */
export function CollapsiblePanel({
  header,
  collapseLabel,
  expandLabel,
  children,
  className,
  headerClassName,
  bodyClassName,
  defaultCollapsed = false,
  testId,
}: {
  header: ReactNode;
  collapseLabel: string;
  expandLabel: string;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  defaultCollapsed?: boolean;
  testId?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <FloatingCard className={cn('flex min-h-0 flex-col', className)} data-testid={testId}>
      <div className={cn('flex shrink-0 items-center gap-2 px-3 py-2.5', headerClassName)}>
        <div className="min-w-0 flex-1">{header}</div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? expandLabel : collapseLabel}
          className="soft-transition text-ink-400 hover:bg-row-hover hover:text-ink-900 focus-visible:ring-ring/50 grid size-7 shrink-0 place-items-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <ChevronDown
            className={cn('soft-transition size-4', collapsed && 'rotate-180')}
            strokeWidth={1.75}
          />
        </button>
      </div>
      {!collapsed && (
        <div
          className={cn(
            'animate-in fade-in-0 slide-in-from-bottom-1 min-h-0 flex-1 duration-200',
            bodyClassName,
          )}
        >
          {children}
        </div>
      )}
    </FloatingCard>
  );
}
