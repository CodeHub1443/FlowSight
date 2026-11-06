import type { Tone } from '@/components/common/tone';
import type { EventStatus, Severity } from '@/domain';

export const SEV_TONE: Record<Severity, Tone> = {
  critical: 'critical',
  warn: 'warn',
  info: 'info',
};
export const STATUS_TONE: Record<EventStatus, Tone> = {
  OPEN: 'warn',
  ACK: 'info',
  CLOSED: 'neutral',
};
