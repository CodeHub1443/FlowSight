import { useTranslation } from 'react-i18next';
import { TONE_TEXT, TONE_TINT } from '@/components/common';
import { useBayPerformance } from '@/data/api';
import { bayLabel } from '@/features/live/siteInfo';
import { useFmt } from '@/features/live/useFmt';
import type { PerfRange } from '@/lib/period';
import { cn } from '@/lib/utils';
import { noFinishedTrucks, widgetStatus } from '../selectors';
import { WidgetBody, WidgetCard } from '../shared';
import { detentionCells } from './trendSelectors';

// W5: trucks over the expected time per bay, count and share of that bay's visits (docs/tasks/t20-spec.md sections 1
// and 4). A strip of cells in bay order; never sorted by a value.

export function DetentionStrip({ range }: { range: PerfRange }) {
  const { t } = useTranslation('perftrend');
  const fmt = useFmt();
  const query = useBayPerformance(range);
  const status = widgetStatus(query, (d) => (noFinishedTrucks(d.response) ? 'empty' : 'ready'));
  const cells = query.data ? detentionCells(query.data.response.rows) : [];

  return (
    <WidgetCard title={t('detention.title')} testId="perf-w5">
      <WidgetBody status={status} skeletonHeight={96} onRetry={() => void query.refetch()}>
        <ul data-testid="detention-strip" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {cells.map((c) => {
            const label = bayLabel(c.bay, fmt.lang);
            const over = c.detentions > 0;
            if (c.sharePct === null) {
              return (
                <li
                  key={c.bay}
                  data-testid={`detention-${c.bay}`}
                  data-state="no-visits"
                  className="bg-muted/40 flex min-w-[104px] flex-1 flex-col gap-0.5 rounded-xl px-3 py-2"
                >
                  <span className="text-ink-600 text-sm font-medium">{label}</span>
                  <span
                    className="text-ink-400 text-2xl leading-8 font-semibold"
                    title={t('detention.noVisits')}
                    aria-label={t('detention.noVisits')}
                  >
                    —
                  </span>
                  <span className="text-ink-600 text-sm">{t('detention.noVisits')}</span>
                </li>
              );
            }
            return (
              <li
                key={c.bay}
                data-testid={`detention-${c.bay}`}
                data-state={over ? 'over' : 'none'}
                aria-label={t('detention.cell', {
                  bay: label,
                  n: fmt.num(c.detentions),
                  total: fmt.num(c.visits),
                  pct: fmt.pct(c.sharePct),
                })}
                className={cn(
                  'flex min-w-[104px] flex-1 flex-col gap-0.5 rounded-xl px-3 py-2',
                  over ? TONE_TINT.warn : 'bg-muted/40',
                )}
              >
                <span className="text-ink-600 text-sm font-medium">{label}</span>
                <span
                  className={cn(
                    'text-2xl leading-8 font-semibold tabular-nums',
                    over ? TONE_TEXT.warn : 'text-ink-900',
                  )}
                >
                  {fmt.num(c.detentions)}
                </span>
                <span className="text-ink-600 text-sm">
                  {t('detention.ofTrucks', { total: fmt.num(c.visits) })}
                </span>
                <span className="text-ink-600 text-sm tabular-nums">{fmt.pct(c.sharePct)}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-ink-600 text-sm">{t('detention.caption')}</p>
      </WidgetBody>
    </WidgetCard>
  );
}
