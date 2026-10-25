import { cn } from '@/lib/utils';
import { TONE_BAR, type Tone } from './tone';

/** Thin progress bar. `value` is 0-100; null renders an empty track (unknown, never 0). */
export function ThinProgress({
  value,
  tone = 'ok',
  label,
  className,
}: {
  value: number | null;
  tone?: Tone;
  label: string;
  className?: string;
}) {
  const clamped = value === null ? null : Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(clamped === null ? {} : { 'aria-valuenow': Math.round(clamped) })}
      className={cn('bg-muted h-1.5 w-full overflow-hidden rounded-full', className)}
    >
      {clamped !== null && (
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', TONE_BAR[tone])}
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  );
}
