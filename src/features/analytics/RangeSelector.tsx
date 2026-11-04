import { useTranslation } from 'react-i18next';
import { PERF_RANGES, type PerfRange } from '@/lib/period';
import { cn } from '@/lib/utils';

/** Segmented control for the shared analytics range (radio semantics; the same look as the tray tabs). */
export function RangeSelector({
  value,
  onChange,
}: {
  value: PerfRange;
  onChange: (r: PerfRange) => void;
}) {
  const { t } = useTranslation('analytics');
  return (
    <div
      role="radiogroup"
      aria-label={t('range.label')}
      data-testid="range-selector"
      className="bg-segment-track flex w-fit items-center gap-0.5 rounded-full p-[3px]"
    >
      {PERF_RANGES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          data-range={r}
          onClick={() => onChange(r)}
          className={cn(
            'soft-transition focus-visible:ring-ring/50 flex h-8 items-center rounded-full px-3 text-sm leading-4 font-medium whitespace-nowrap focus-visible:ring-[3px] focus-visible:outline-none',
            value === r ? 'bg-card text-ink-900 shadow-raised' : 'text-ink-600 hover:text-ink-900',
          )}
        >
          {t(`range.${r}`)}
        </button>
      ))}
    </div>
  );
}
