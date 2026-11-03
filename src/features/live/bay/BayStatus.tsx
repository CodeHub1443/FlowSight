import { useTranslation } from 'react-i18next';
import type { BayState } from '@/domain';
import { SectionTitle } from '../InspectorFrame';
import { captainName } from '../privacy';
import { useFmt } from '../useFmt';
import { useRole } from '../useLiveModel';
import { BayCell, BayCells } from './BayCells';

/**
 * Bay status (19.9b, decision D2): the door, the belt direction, the captain line and the PPE violations now, in one
 * compact block below the operational sections. The captain's name shows only when the payload carries it and the
 * role may see it (`captainName`); otherwise "Captain on duty".
 */
export function BayStatus({ bay }: { bay: BayState }) {
  const { t } = useTranslation('baypanel');
  const { t: tl } = useTranslation('live');
  const fmt = useFmt();
  const role = useRole();
  const { crew, belt } = bay;
  const captain = crew.captain;
  const name = captainName(bay, role);
  return (
    <section data-testid="bay-status">
      <SectionTitle>{t('status.title')}</SectionTitle>
      <BayCells cols={2}>
        <BayCell label={tl('inspector.bay.door')}>{tl(`door.${bay.door.status}`)}</BayCell>
        <BayCell label={tl('inspector.bay.belt')}>{tl(`belt.direction.${belt.direction}`)}</BayCell>
        <BayCell label={tl('actorRole.CAPTAIN')}>
          {captain ? (
            <span data-testid="inspector-captain">
              {name ? name[fmt.lang] || name.en : tl('inspector.bay.captainHidden')}
              <span className="text-ink-400 block text-[12px] font-normal">
                {captain.present ? tl('tray.onFloor') : tl('tray.notOnFloor')}
              </span>
            </span>
          ) : (
            '—'
          )}
        </BayCell>
        <BayCell label={tl('inspector.bay.ppeNow')}>
          <span data-testid="bay-ppe-now">{fmt.num(crew.ppeViolationsNow)}</span>
        </BayCell>
      </BayCells>
    </section>
  );
}
