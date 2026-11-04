import type { EChartsOption } from 'echarts';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Skeleton } from '../perf/shared/WidgetStates';
import { loadChartCanvas } from './load';

// <Chart option> for every analytics chart (docs/tasks/t20-spec.md section 4). It owns: the theme from the index.css
// tokens (light and dark), the font, locale digits on axes and tooltips (Bangla digits via formatter callbacks),
// resize, prefers-reduced-motion, disposal on unmount, and the text alternative (aria-label + visually hidden table).
// ECharts itself loads lazily with the first chart.

const ChartCanvas = lazy(loadChartCanvas);

export type ChartCell = string | number | null;

/** The data behind the chart, as a table for screen readers. Format numbers with useFmt before passing them. */
export interface ChartTable {
  caption?: string;
  columns: readonly string[];
  rows: readonly (readonly ChartCell[])[];
}

export interface ChartProps {
  /** ECharts option. Leave axis/tooltip formatters out to get locale digits; series colours from useChartTokens(). */
  option: EChartsOption;
  /** One-sentence summary of what the chart shows (its accessible name). */
  ariaLabel: string;
  table: ChartTable;
  height?: number | string;
  className?: string;
  testId?: string;
}

export function Chart({ option, ariaLabel, table, height = 240, className, testId }: ChartProps) {
  return (
    <figure className={cn('m-0 min-w-0', className)} data-testid={testId}>
      <Suspense fallback={<Skeleton style={{ height }} />}>
        <ChartCanvas option={option} ariaLabel={ariaLabel} height={height} />
      </Suspense>
      <ChartDataTable table={table} fallbackCaption={ariaLabel} />
    </figure>
  );
}

function ChartDataTable({
  table,
  fallbackCaption,
}: {
  table: ChartTable;
  fallbackCaption: string;
}) {
  const { t } = useTranslation('analytics');
  return (
    <table className="sr-only" data-testid="chart-data-table">
      <caption>{`${t('chart.dataTable')}: ${table.caption ?? fallbackCaption}`}</caption>
      <thead>
        <tr>
          {table.columns.map((c, i) => (
            <th key={i} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, i) =>
              i === 0 ? (
                <th key={i} scope="row">
                  {cell ?? '—'}
                </th>
              ) : (
                <td key={i}>{cell ?? '—'}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
