import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Renders `children`, or "—" with an explanatory tooltip when the value is null/undefined.
 * Unknown values are never shown as 0 (docs/01 section 4).
 */
export function MaybeValue({
  value,
  reason,
  children,
}: {
  value: unknown;
  reason: string;
  children: ReactNode;
}) {
  if (value !== null && value !== undefined) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={reason} className="text-muted-foreground cursor-help">
          —
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
