import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MaybeValue } from '@/components/common';
import type { BayPerformance, BayPerfRow } from '@/domain';
import { bayLabel, useFmt } from '@/features/live';
import { cn } from '@/lib/utils';
import { widgetStatus } from '../selectors';
import { WidgetBody, WidgetCard } from '../shared';
import { inBayOrder, judgeWorkload } from './rows';
import type { PerfQuery } from './types';

// W3: workload context (docs/tasks/t20-spec.md sections 2 and 4). A compact table in bay order, no sorting: cartons
// per loading hour, cartons out / in, trucks, average crew and cartons per crew-hour, labelled "per crew member
// present" (a bay-level crew size, never a per-worker number). The crew columns are hidden when no bay in the range has
// a crew count (not measurable), and an unknown cell shows "—" with the reason.

export function WorkloadWidget({ query, className }: { query: PerfQuery; className?: string }) {
  const { t } = useTranslation('perfindex');
  const status = widgetStatus(query, (d) => judgeWorkload(d.response));
  const perf = query.data?.response;
  return (
    <WidgetCard title={t('w3.title')} testId="perf-w3" className={className}>
      <WidgetBody
        status={status}
        onRetry={() => void query.refetch()}
        insufficientText={t('w3.insufficient')}
        skeletonHeight={240}
      >
        {perf && <WorkloadTable perf={perf} />}
      </WidgetBody>
    </WidgetCard>
  );
}

type Column = 'rate' | 'outIn' | 'trucks' | 'crew' | 'perCrew';

function WorkloadTable({ perf }: { perf: BayPerformance }) {
  const { t } = useTranslation('perfindex');
  const fmt = useFmt();
  const rows = inBayOrder(perf.rows);
  const crewMeasured = rows.some((r) => r.avgCrew !== null);
  const columns: readonly Column[] = crewMeasured
    ? ['rate', 'outIn', 'trucks', 'crew', 'perCrew']
    : ['rate', 'outIn', 'trucks'];

  const reason = (r: BayPerfRow) => (r.visits === 0 ? t('w3.noVisits') : t('w3.notMeasured'));
  const cell = (r: BayPerfRow, c: Column): ReactNode => {
    switch (c) {
      case 'rate':
        return (
          <MaybeValue value={r.cartonsPerLoadingHour} reason={reason(r)}>
            {fmt.int(r.cartonsPerLoadingHour ?? 0)}
          </MaybeValue>
        );
      case 'outIn':
        return `${fmt.int(r.cartonsOut)} / ${fmt.int(r.cartonsIn)}`;
      case 'trucks':
        return fmt.int(r.visits);
      case 'crew':
        return (
          <MaybeValue value={r.avgCrew} reason={reason(r)}>
            {fmt.num(r.avgCrew ?? 0, 1)}
          </MaybeValue>
        );
      case 'perCrew':
        return (
          <MaybeValue value={r.cartonsPerCrewHour} reason={reason(r)}>
            {fmt.int(r.cartonsPerCrewHour ?? 0)}
          </MaybeValue>
        );
    }
  };

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[36rem] border-collapse text-sm" data-testid="w3-table">
        <caption className="sr-only">{t('w3.caption')}</caption>
        <thead>
          <tr className="border-border text-ink-600 border-b text-[12px] leading-4">
            <th scope="col" className="bn-leading px-2 py-2 text-start font-medium">
              {t('bay')}
            </th>
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                data-col={c}
                className="bn-leading px-2 py-2 text-end align-bottom font-medium"
              >
                {t(`w3.cols.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.bay}
              data-testid={`w3-row-${r.bay}`}
              className="border-hairline border-b last:border-b-0"
            >
              <th
                scope="row"
                className="text-ink-900 bn-leading px-2 py-1.5 text-start font-medium whitespace-nowrap"
              >
                {bayLabel(r.bay, fmt.lang)}
              </th>
              {columns.map((c) => (
                <td
                  key={c}
                  data-col={c}
                  className={cn(
                    'text-ink-900 px-2 py-1.5 text-end whitespace-nowrap tabular-nums',
                    r.visits === 0 && 'text-ink-400',
                  )}
                >
                  {cell(r, c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
