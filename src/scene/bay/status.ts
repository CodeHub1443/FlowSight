import type { BeltStatus } from '@/domain';
import type { PaletteKey } from '../materials';

/** Belt status -> palette colour (docs/04 section 5). */
export const STATUS_TONE: Record<BeltStatus, PaletteKey> = {
  RUNNING_LOADED: 'statusOk',
  RUNNING_EMPTY: 'statusWarn',
  STOPPED: 'statusNeutral',
  NO_TRUCK: 'statusIdle',
  OFFLINE: 'statusOffline',
};

/** Belt status -> work-light level: active bays glow warm, idle bays dim (docs/06 section 8.3). */
export const WORK_LIGHT_LEVEL: Record<BeltStatus, number> = {
  RUNNING_LOADED: 1,
  RUNNING_EMPTY: 0.6,
  STOPPED: 0.3,
  NO_TRUCK: 0.15,
  OFFLINE: 0,
};
