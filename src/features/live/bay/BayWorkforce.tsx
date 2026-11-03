import { useTranslation } from 'react-i18next';
import { KeyValue, KeyValueList, StatusPill } from '@/components/common';
import type { BayState } from '@/domain';
import { SectionTitle } from '../InspectorFrame';
import { useFmt } from '../useFmt';

/**
 * Section 3 of the bay inspector (T19 spec 5B): is the bay staffed? Bay-level counts and presence only.
 * PRIVACY (binding): no idle or phone time, no per-person rankings, no person-level behaviour. The captain's name is
 * shown only on the captain line above (payload + role gate, `captainName`), never here.
 */
export function BayWorkforce({ bay }: { bay: BayState }) {
  const { t } = useTranslation('baypanel');
  const fmt = useFmt();
  const { crew, visit } = bay;
  const storekeeper = crew.captain?.present === true;
  const forkliftOp = crew.forkliftOps > 0;
  // A missing role only needs attention while a truck is at the door.
  const missingTone = visit ? 'warn' : 'neutral';
  const yesNo = (v: boolean, testId: string) => (
    <span data-testid={testId} data-value={v ? 'yes' : 'no'}>
      <StatusPill tone={v ? 'ok' : missingTone}>
        {t(v ? 'workforce.yes' : 'workforce.no')}
      </StatusPill>
    </span>
  );

  return (
    <section data-testid="bay-workforce">
      <SectionTitle>{t('workforce.title')}</SectionTitle>
      <KeyValueList>
        <KeyValue label={t('workforce.workers')}>
          <span data-testid="bay-workers">{fmt.num(crew.workers)}</span>
        </KeyValue>
        <KeyValue label={t('workforce.storekeeper')} className="items-center">
          {yesNo(storekeeper, 'bay-storekeeper')}
        </KeyValue>
        <KeyValue label={t('workforce.forkliftOp')} className="items-center">
          {yesNo(forkliftOp, 'bay-forklift-op')}
        </KeyValue>
      </KeyValueList>
    </section>
  );
}
