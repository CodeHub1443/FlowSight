import { cn } from '@/lib/utils';
import { TONE_BAR, type Tone } from './tone';

/** Thin rounded progress bar. `value` is 0-100; null renders an empty track (unknown, never 0). */
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
      className={cn('bg-track h-1.5 w-full overflow-hidden rounded-full', className)}
    >
      {/* Always mounted: the bar glides from its last width instead of popping in. */}
      <div
        className={cn(
          'ease-soft h-full rounded-full transition-[width,background-color] duration-300',
          TONE_BAR[tone],
        )}
        style={{ width: `${clamped ?? 0}%` }}
      />
    </div>
  );
}
