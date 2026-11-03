import { useTranslation } from 'react-i18next';
import { KeyValue, KeyValueList, MaybeValue } from '@/components/common';
import type { BayState } from '@/domain';
import { ProgressRow, SectionTitle } from '../InspectorFrame';
import { workKindOf } from '../kpiDetail/selectors';
import { BELT_TONE } from '../tones';
import { useFmt } from '../useFmt';

/**
 * Section 2 of the bay inspector (T19 spec 5B): cartons this visit (casesOut or casesIn by belt direction, against
 * the expected quantity when known), cartons/min from the belt, then the bay's day: cartons, trucks, avg turnaround.
 */
export function BayThroughput({ bay }: { bay: BayState }) {
  const { t } = useTranslation(['baypanel', 'live']);
  const fmt = useFmt();
  const { visit, belt, today } = bay;
  const count = visit
    ? workKindOf(visit, belt.direction) === 'unloading'
      ? visit.casesIn
      : visit.casesOut
    : null;
  const expected = visit?.expected ?? null;
  const progress =
    count !== null && expected !== null && expected > 0 ? (count / expected) * 100 : null;

  return (
    <section data-testid="bay-throughput">
      <SectionTitle>{t('throughput.title')}</SectionTitle>
      {/* Always mounted: when the truck leaves the value falls back to "—" instead of the card jumping. */}
      <ProgressRow
        label={t('throughput.visitCartons')}
        value={progress}
        caption={
          <span data-testid="bay-visit-cartons">
            <MaybeValue value={count} reason={t('throughput.noTruck')}>
              {fmt.num(count ?? 0)}
              {expected !== null && ` / ${fmt.num(expected)}`}
            </MaybeValue>
          </span>
        }
        tone={BELT_TONE[belt.status]}
      />
      <KeyValueList>
        <KeyValue label={t('throughput.rate')}>
          <span data-testid="bay-rate">{fmt.num(belt.rateCpm, 1)}</span>
        </KeyValue>
        <KeyValue label={t('throughput.todayCartons')}>
          {t('throughput.todaySplit', { out: fmt.num(today.casesOut), in: fmt.num(today.casesIn) })}
        </KeyValue>
        <KeyValue label={t('throughput.trucks')}>{fmt.num(today.trucks)}</KeyValue>
        <KeyValue label={t('throughput.tat')}>
          <MaybeValue value={today.avgTatMin} reason={t('live:kpi.noTat')}>
            {fmt.durHM(today.avgTatMin)}
          </MaybeValue>
        </KeyValue>
      </KeyValueList>
    </section>
  );
}
