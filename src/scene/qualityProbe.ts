import type { GovernorState, TierStep } from './tierGovernor';

// Readout of the automatic quality mode for the dev badge and the e2e run. Tiny and three-free: /live imports it
// from the entry chunk. Everything that uses it is behind QUALITY_DEBUG, so a production build drops it.

/** On in `pnpm dev` and in builds made with VITE_DEBUG_PANEL=1 (the e2e run), like the debug readout. */
export const QUALITY_DEBUG = import.meta.env.DEV || import.meta.env.VITE_DEBUG_PANEL === '1';

export interface QualityProbe {
  /** 'pinned' while a fixed tier is in force. */
  state: GovernorState | 'pinned';
  fps: number | null;
  /** Every automatic step since the page loaded. */
  steps: TierStep[];
}

export const qualityProbe: QualityProbe = { state: 'pinned', fps: null, steps: [] };

declare global {
  interface Window {
    __qualityProbe?: QualityProbe;
    /** e2e: replaces the measured fps of every window, because a software rasteriser cannot run fast or slow on demand. */
    __qualityFpsOverride?: number | null;
  }
}

if (QUALITY_DEBUG) window.__qualityProbe = qualityProbe;
