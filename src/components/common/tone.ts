/** Semantic tone -> token classes. Colours come only from the status tokens in src/index.css. */
export type Tone = 'ok' | 'warn' | 'critical' | 'neutral' | 'idle' | 'offline' | 'info';

export const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  critical: 'bg-status-critical',
  neutral: 'bg-status-neutral',
  idle: 'bg-status-idle',
  offline: 'bg-status-offline',
  info: 'bg-status-info',
};

export const TONE_TINT: Record<Tone, string> = {
  ok: 'bg-status-ok/15',
  warn: 'bg-status-warn/20',
  critical: 'bg-status-critical/15',
  neutral: 'bg-status-neutral/15',
  idle: 'bg-status-idle/30',
  offline: 'bg-status-offline/20',
  info: 'bg-status-info/15',
};

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-status-ok',
  warn: 'text-status-warn',
  critical: 'text-status-critical',
  neutral: 'text-status-neutral',
  idle: 'text-status-offline',
  offline: 'text-status-offline',
  info: 'text-status-info',
};

export const TONE_BAR: Record<Tone, string> = TONE_DOT;
