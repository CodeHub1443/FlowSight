import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WidgetStatus } from '../selectors';

// The four non-data states every Performance widget has (docs/tasks/t20-spec.md section 4): loading skeleton, error
// with retry, empty ("No finished trucks in this range") and insufficient data. Strings: `analytics:state.*`.

/** Calm placeholder block; pulses only without prefers-reduced-motion. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      data-testid="skeleton"
      className={cn('bg-muted rounded-lg motion-safe:animate-pulse', className)}
      style={style}
    />
  );
}

function StateMessage({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="text-ink-600 flex min-h-24 flex-col items-center justify-center gap-2 px-4 py-6 text-center text-sm"
    >
      {children}
    </div>
  );
}

export interface WidgetBodyProps {
  status: WidgetStatus;
  onRetry?: () => void;
  /** Skeleton height while loading (px). */
  skeletonHeight?: number;
  /** Override the default `analytics:state.insufficient` text. */
  insufficientText?: string;
  children?: ReactNode;
}

/** Renders the state for `status`, or the children when it is `ready`. */
export function WidgetBody({
  status,
  onRetry,
  skeletonHeight = 160,
  insufficientText,
  children,
}: WidgetBodyProps) {
  const { t } = useTranslation('analytics');
  switch (status) {
    case 'loading':
      return (
        <div role="status" aria-busy="true" data-testid="widget-loading">
          <span className="sr-only">{t('state.loading')}</span>
          <Skeleton style={{ height: skeletonHeight }} />
        </div>
      );
    case 'error':
      return (
        <StateMessage testId="widget-error">
          <span role="alert">{t('state.error')}</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t('state.retry')}
            </Button>
          )}
        </StateMessage>
      );
    case 'empty':
      return <StateMessage testId="widget-empty">{t('state.empty')}</StateMessage>;
    case 'insufficient':
      return (
        <StateMessage testId="widget-insufficient">
          {insufficientText ?? t('state.insufficient')}
        </StateMessage>
      );
    case 'ready':
      return <>{children}</>;
  }
}
