/** Semantic tone -> token classes. Colours come only from the tokens in src/index.css (docs/06 §1). */
export type Tone = 'ok' | 'warn' | 'critical' | 'neutral' | 'idle' | 'offline' | 'info';

/** Solid status colour: dots, bars, filled badges. */
export const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  critical: 'bg-critical',
  neutral: 'bg-neutral',
  idle: 'bg-idle',
  offline: 'bg-offline',
  info: 'bg-info',
};

/** Tinted background (pills, icon tiles). */
export const TONE_TINT: Record<Tone, string> = {
  ok: 'bg-ok-bg',
  warn: 'bg-warn-bg',
  critical: 'bg-critical-bg',
  neutral: 'bg-neutral-bg',
  idle: 'bg-idle-bg',
  offline: 'bg-offline-bg',
  info: 'bg-info-bg',
};

/** Coloured text on a tinted background or on a card (`*-ink` tokens, WCAG AA). Idle/offline use ink: too pale. */
export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-ink',
  warn: 'text-warn-ink',
  critical: 'text-critical-ink',
  neutral: 'text-neutral-ink',
  idle: 'text-ink-400',
  offline: 'text-ink-400',
  info: 'text-info-ink',
};

export const TONE_BAR: Record<Tone, string> = TONE_DOT;
