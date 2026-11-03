import { useTranslation } from 'react-i18next';
import { CollapsiblePanel, KeyValue, KeyValueList, MaybeValue } from '@/components/common';
import type { BayState } from '@/domain';
import { useNow1Hz } from '@/stores';
import { ProgressRow, SectionTitle } from '../InspectorFrame';
import { DEFAULT_SITE } from '../siteInfo';
import { useFmt } from '../useFmt';

/**
 * Section 4 of the bay inspector (T19 spec 5B), collapsed by default: the rows that answer no management question on
 * their own (metric admission rule, spec section 0). The body is its own component so that, collapsed, nothing in it
 * renders or subscribes to the clock.
 */
export function BayMoreDetails({ bay }: { bay: BayState }) {
  const { t } = useTranslation('baypanel');
  return (
    <CollapsiblePanel
      testId="bay-more"
      defaultCollapsed
      className="mt-3 shadow-none!"
      headerClassName="px-3 py-1.5"
      bodyClassName="px-3 pb-2"
      collapseLabel={t('more.hide')}
      expandLabel={t('more.show')}
      header={<h3 className="text-ink-600 text-[13px] leading-5 font-medium">{t('more.title')}</h3>}
    >
      <MoreDetailsBody bay={bay} />
    </CollapsiblePanel>
  );
}

function MoreDetailsBody({ bay }: { bay: BayState }) {
  const { t } = useTranslation(['baypanel', 'live']);
  const fmt = useFmt();
  const nowMs = useNow1Hz();
  const { belt, crew, staging, today, health, visit } = bay;
  const cams = Object.values(health.cams);
  const camsOk = cams.filter((c) => c === 'OK').length;
  const skuCount = visit?.skuCount;

  return (
    <div data-testid="bay-more-body">
      <KeyValueList>
        <KeyValue label={t('live:inspector.bay.since')}>
          {fmt.clock(belt.since)} · {fmt.dur(Math.max(0, (nowMs - Date.parse(belt.since)) / 1000))}
        </KeyValue>
        <KeyValue label={t('live:inspector.bay.crew')}>
          {t('live:inspector.bay.crewSplit', {
            total: fmt.num(crew.total),
            captains: fmt.num(crew.captains),
            workers: fmt.num(crew.workers),
            forklift: fmt.num(crew.forkliftOps),
          })}
        </KeyValue>
      </KeyValueList>

      <SectionTitle>{t('live:inspector.bay.stagingSection')}</SectionTitle>
      <ProgressRow
        label={t('live:inspector.bay.occupancy')}
        value={staging.occupancyPct}
        caption={fmt.pct(staging.occupancyPct)}
        tone={staging.oldestWaitSec > DEFAULT_SITE.thresholds.palletWaitSec ? 'warn' : 'info'}
      />
      <KeyValueList>
        <KeyValue label={t('live:inspector.bay.pallets')}>
          {fmt.num(staging.palletsWaiting)}
        </KeyValue>
        <KeyValue label={t('live:inspector.bay.oldestWait')}>
          {fmt.dur(staging.oldestWaitSec)}
        </KeyValue>
      </KeyValueList>

      <SectionTitle>{t('live:inspector.bay.todaySection')}</SectionTitle>
      <KeyValueList>
        <KeyValue label={t('live:inspector.bay.damage')}>{fmt.num(today.damage)}</KeyValue>
        <KeyValue label={t('live:inspector.bay.fallOff')}>{fmt.num(today.fallOff)}</KeyValue>
        <KeyValue label={t('live:inspector.bay.cameras')}>
          <span className={camsOk < cams.length ? 'text-critical-ink' : undefined}>
            {t('live:inspector.bay.camsOk', { ok: fmt.num(camsOk), total: fmt.num(cams.length) })}
          </span>
        </KeyValue>
        <KeyValue label={t('more.skus')}>
          <span data-testid="bay-skus">
            {/* null/absent: an older backend (rev < 1.1) or no truck; temporarily unknown, so "—" with the reason. */}
            <MaybeValue value={skuCount} reason={t(visit ? 'more.skusAbsent' : 'more.noTruck')}>
              {fmt.num(skuCount ?? 0)}
            </MaybeValue>
          </span>
        </KeyValue>
      </KeyValueList>
    </div>
  );
}
