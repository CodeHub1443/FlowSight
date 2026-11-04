import { useTranslation } from 'react-i18next';
import { TONE_BAR, TONE_TEXT } from '@/components/common';
import { Button } from '@/components/ui/button';
import type { BayPerformance, BayPerfRow } from '@/domain';
import { bayLabel, useFmt } from '@/features/live';
import type { PerfRange } from '@/lib/period';
import { cn } from '@/lib/utils';
import { INDEX_BAND, INDEX_BAND_TONE, INDEX_CENTER } from '../constants';
import { confidenceNote, indexBand, widgetStatus } from '../selectors';
import { WidgetBody, WidgetCard } from '../shared';
import { HowCalculated } from './HowCalculated';
import { inBayOrder, indexHalfSpan, indexPos, judgeIndex, maxIncluded } from './rows';
import type { PerfQuery } from './types';

// W1: bay efficiency vs comparable trucks (docs/tasks/t20-spec.md sections 2 and 4). Seven rows in bay order, never
// sorted: bay, index, a bar from the centre (100 = typical for this depot's comparable trucks) with the comparable band
// shaded, the number of visits and the confidence note. Plain HTML rows: every value is text, so it needs no chart
// text alternative.

const ROW_GRID = 'grid grid-cols-[4.5rem_3.5rem_minmax(0,1fr)] items-center gap-x-3';

export function BayIndexWidget({
  query,
  range,
  onShowWeek,
}: {
  query: PerfQuery;
  range: PerfRange;
  onShowWeek: () => void;
}) {
  const { t } = useTranslation('perfindex');
  const fmt = useFmt();
  const status = widgetStatus(query, (d) => judgeIndex(d.response));
  const perf = query.data?.response;
  const insufficientText = perf
    ? t('w1.insufficient', { n: fmt.int(maxIncluded(perf)), min: fmt.int(perf.minIncluded) })
    : undefined;

  return (
    <WidgetCard
      title={t('w1.title')}
      help={<HowCalculated text={t('w1.how', { center: fmt.int(INDEX_CENTER) })} testId="w1-how" />}
      testId="perf-w1"
    >
      <WidgetBody
        status={status}
        onRetry={() => void query.refetch()}
        insufficientText={insufficientText}
        skeletonHeight={280}
      >
        {perf && <IndexRows perf={perf} />}
      </WidgetBody>
      {status === 'insufficient' && range !== 'week' && (
        <div className="-mt-3 flex justify-center pb-2">
          <Button variant="outline" size="sm" onClick={onShowWeek} data-testid="w1-show-week">
            {t('w1.showWeek')}
          </Button>
        </div>
      )}
    </WidgetCard>
  );
}

function IndexRows({ perf }: { perf: BayPerformance }) {
  const { t } = useTranslation('perfindex');
  const fmt = useFmt();
  const rows = inBayOrder(perf.rows);
  const halfSpan = indexHalfSpan(rows.map((r) => (r.confidence === 'NONE' ? null : r.index)));
  const center = fmt.int(INDEX_CENTER);

  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid="w1-rows">
      <div className={cn(ROW_GRID, 'text-ink-400 text-[12px] leading-4')} aria-hidden>
        <span />
        <span />
        <span className="relative flex justify-between">
          <span>{`← ${t('w1.scale.slower')}`}</span>
          <span className="absolute start-1/2 -translate-x-1/2 whitespace-nowrap">
            {t('w1.scale.typical', { center })}
          </span>
          <span>{`${t('w1.scale.faster')} →`}</span>
        </span>
      </div>
      <ol aria-label={t('w1.listLabel')} className="flex flex-col">
        {rows.map((row) => (
          <IndexRow key={row.bay} row={row} minIncluded={perf.minIncluded} halfSpan={halfSpan} />
        ))}
      </ol>
    </div>
  );
}

function IndexRow({
  row,
  minIncluded,
  halfSpan,
}: {
  row: BayPerfRow;
  minIncluded: number;
  halfSpan: number;
}) {
  const { t } = useTranslation('perfindex');
  const fmt = useFmt();
  const note = confidenceNote(row.confidence, row.included, minIncluded);
  const index = note.showIndex ? row.index : null;
  const band = indexBand(index);
  const tone = band ? INDEX_BAND_TONE[band] : null;
  const noteText = note.key
    ? t(`analytics:${note.key}`, { n: fmt.int(note.params.n), min: fmt.int(note.params.min) })
    : null;
  const visits = t('analytics:visits', { count: row.visits, n: fmt.int(row.visits) });

  return (
    <li
      data-testid={`w1-row-${row.bay}`}
      data-confidence={row.confidence}
      data-band={band ?? undefined}
      className="border-hairline flex flex-col gap-0.5 border-b py-1.5 last:border-b-0"
    >
      <div className={ROW_GRID}>
        <span className="text-ink-900 bn-leading truncate text-sm font-medium">
          {bayLabel(row.bay, fmt.lang)}
        </span>
        <span
          data-testid={`w1-index-${row.bay}`}
          className={cn(
            'text-end text-sm font-semibold tabular-nums',
            index === null
              ? 'text-ink-400'
              : note.muted
                ? 'text-ink-400'
                : tone && tone !== 'neutral'
                  ? TONE_TEXT[tone]
                  : 'text-ink-900',
          )}
        >
          {index !== null && (
            <>
              {fmt.num(index, 1)}
              {band && <span className="sr-only">{` ${t(`analytics:band.${band}`)}`}</span>}
            </>
          )}
        </span>
        {index !== null && band ? (
          <IndexBar
            index={index}
            halfSpan={halfSpan}
            tone={INDEX_BAND_TONE[band]}
            muted={note.muted}
          />
        ) : (
          <span className="text-ink-600 bn-leading text-[13px]" data-testid={`w1-none-${row.bay}`}>
            {noteText}
          </span>
        )}
      </div>
      <div className={ROW_GRID}>
        <span />
        <span />
        <span className="text-ink-600 bn-leading flex min-w-0 flex-wrap gap-x-2 text-[12px] leading-4">
          <span data-testid={`w1-visits-${row.bay}`}>{visits}</span>
          {note.level === 'LOW' && noteText && (
            <span className="text-ink-400" data-testid={`w1-note-${row.bay}`}>
              {`· ${noteText}`}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

function IndexBar({
  index,
  halfSpan,
  tone,
  muted,
}: {
  index: number;
  halfSpan: number;
  tone: (typeof INDEX_BAND_TONE)[keyof typeof INDEX_BAND_TONE];
  muted: boolean;
}) {
  const pos = indexPos(index, halfSpan);
  const bandStart = indexPos(INDEX_BAND.low, halfSpan);
  const bandEnd = indexPos(INDEX_BAND.high, halfSpan);
  return (
    <span aria-hidden className="bg-track relative block h-3 w-full rounded-full">
      <span
        data-testid="w1-band"
        className="bg-neutral/25 absolute inset-y-0 block"
        style={{ insetInlineStart: `${bandStart}%`, width: `${bandEnd - bandStart}%` }}
      />
      <span
        data-testid="w1-bar"
        className={cn(
          'ease-soft absolute inset-y-0.5 block rounded-full transition-[inset,width] duration-300',
          TONE_BAR[tone],
          muted && 'opacity-50',
        )}
        style={{ insetInlineStart: `${Math.min(pos, 50)}%`, width: `${Math.abs(pos - 50)}%` }}
      />
      <span className="bg-ink-400 absolute -inset-y-0.5 start-1/2 block w-px" />
    </span>
  );
}
