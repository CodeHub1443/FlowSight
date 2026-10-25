import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FloatingCard } from './FloatingCard';

/**
 * Floating card with a header row and a collapse chevron. Collapsed, only the header remains.
 * `bodyClassName` styles the body region.
 */
export function CollapsiblePanel({
  header,
  collapseLabel,
  expandLabel,
  children,
  className,
  bodyClassName,
  defaultCollapsed = false,
  testId,
}: {
  header: ReactNode;
  collapseLabel: string;
  expandLabel: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  defaultCollapsed?: boolean;
  testId?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const Icon = collapsed ? ChevronUp : ChevronDown;
  return (
    <FloatingCard className={cn('flex min-h-0 flex-col', className)} data-testid={testId}>
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">{header}</div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? expandLabel : collapseLabel}
          className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 rounded-md p-1 focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <Icon className="size-4" />
        </button>
      </div>
      {!collapsed && <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>}
    </FloatingCard>
  );
}
