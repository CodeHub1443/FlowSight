import { stepTier, type QualityTier } from './quality';

// Automatic quality (docs/02 section 6 rule 4): a pure state machine fed one timestamp per rendered frame. It replaces
// drei's PerformanceMonitor, whose `flipflops` counts every step including repeated inclines: on a fast GPU five good
// 2.5 s periods fired onFallback, which locked the scene to Low at 130 fps.

export const AUTO_QUALITY = {
  /** Nothing is measured for this long after the first frame: shader compiles and GLB decodes stall these frames. */
  warmupMs: 5000,
  /** Measuring starts even if a model never settles (a hung request must not disable the governor). */
  maxLoadWaitMs: 30_000,
  /** Quiet time after models become ready, a tier step or a pause: the new shaders compile on these frames. */
  settleMs: 3000,
  /**
   * A longer gap is the browser not drawing, not a slow frame: an occluded or background page can stay "visible" with
   * rAF at 1 Hz. The cost: a machine below ~1.25 fps is never stepped down, which no GPU that passes the software rule reaches.
   */
  maxFrameGapMs: 800,
  /** One fps sample per window. */
  windowMs: 1000,
  /** A step needs this share of the last `holdSamples` windows on its side, so one good or bad second changes nothing. */
  sustainedShare: 0.8,
  /** Step down: below `fps` for `holdSamples` windows. Low needs a truly slow machine, not a missed target. */
  down: {
    high: { fps: 40, holdSamples: 6 },
    med: { fps: 20, holdSamples: 8 },
  },
  /** Step up: at least `fps` for `holdSamples` windows. Well above `down`, so a tier cannot oscillate on its own. */
  up: {
    low: { fps: 40, holdSamples: 10 },
    med: { fps: 55, holdSamples: 10 },
  },
  /** A tier that was left this soon after stepping up to it is too heavy: wait before trying it again. */
  failedStepWithinMs: 30_000,
  /** First wait before retrying a failed step up; doubles on every further failure. */
  retryBaseMs: 60_000,
  retryMaxMs: 30 * 60_000,
} as const;

export type GovernorState = 'warmup' | 'paused' | 'monitoring';

export interface TierStep {
  from: QualityTier;
  to: QualityTier;
  reason: 'sustained-low-fps' | 'sustained-high-fps';
  /** Mean fps of the windows that decided the step. */
  fps: number;
  /** Timestamp of the deciding frame. */
  at: number;
}

export class TierGovernor {
  state: GovernorState = 'warmup';
  /** Latest fps sample; null until one window has closed. */
  fps: number | null = null;

  private samples: number[] = [];
  private windowStart = -1;
  private windowFrames = 0;
  private lastFrame = -1;
  private settleUntil: number;
  private loadDeadline: number;
  private lastStepUp: { to: QualityTier; at: number } | null = null;
  private readonly retryAt = new Map<QualityTier, number>();
  private readonly retryDelay = new Map<QualityTier, number>();

  constructor(
    public tier: QualityTier,
    now: number,
  ) {
    this.settleUntil = now + AUTO_QUALITY.warmupMs;
    this.loadDeadline = now + AUTO_QUALITY.maxLoadWaitMs;
  }

  /**
   * Call once per rendered frame.
   * @param active the page is visible and focused; while false nothing is measured
   * @param ready models of the current tier have loaded or failed
   * @param fpsOverride replaces the measured value of a window (e2e on a software rasteriser only)
   * @returns the step when this frame decided one
   */
  frame(
    now: number,
    active: boolean,
    ready: boolean,
    fpsOverride?: number | null,
  ): TierStep | null {
    // with an override the frame times are not what is being measured
    const gap =
      fpsOverride == null &&
      this.lastFrame >= 0 &&
      now - this.lastFrame > AUTO_QUALITY.maxFrameGapMs;
    this.lastFrame = now;
    if (!active || gap) {
      this.state = active ? 'warmup' : 'paused';
      this.discard();
      this.settleUntil = Math.max(this.settleUntil, now + AUTO_QUALITY.settleMs);
      return null;
    }
    if (!ready && now < this.loadDeadline) {
      this.state = 'warmup';
      this.discard();
      this.settleUntil = Math.max(this.settleUntil, now + AUTO_QUALITY.settleMs);
      return null;
    }
    if (now < this.settleUntil) {
      this.state = 'warmup';
      return null;
    }
    this.state = 'monitoring';

    if (this.windowStart < 0) {
      this.windowStart = now;
      this.windowFrames = 0;
      return null;
    }
    this.windowFrames++;
    const elapsed = now - this.windowStart;
    if (elapsed < AUTO_QUALITY.windowMs) return null;
    this.fps = fpsOverride ?? (this.windowFrames * 1000) / elapsed;
    this.windowStart = now;
    this.windowFrames = 0;
    this.samples.push(this.fps);
    if (this.samples.length > 10) this.samples.shift();
    return this.decide(now);
  }

  private decide(now: number): TierStep | null {
    if (this.tier !== 'low') {
      const down = AUTO_QUALITY.down[this.tier];
      if (this.sustained(down.holdSamples, (fps) => fps < down.fps)) {
        return this.stepDown(now, down.holdSamples);
      }
    }
    if (this.tier !== 'high') {
      const up = AUTO_QUALITY.up[this.tier];
      const next = stepTier(this.tier, 1);
      if (
        now >= (this.retryAt.get(next) ?? -Infinity) &&
        this.sustained(up.holdSamples, (fps) => fps >= up.fps)
      ) {
        this.lastStepUp = { to: next, at: now };
        return this.step(now, next, 'sustained-high-fps', up.holdSamples);
      }
    }
    return null;
  }

  private stepDown(now: number, holdSamples: number): TierStep {
    const left = this.tier;
    const up = this.lastStepUp;
    if (up?.to === left && now - up.at <= AUTO_QUALITY.failedStepWithinMs) {
      const delay = this.retryDelay.get(left) ?? AUTO_QUALITY.retryBaseMs;
      this.retryAt.set(left, now + delay);
      this.retryDelay.set(left, Math.min(delay * 2, AUTO_QUALITY.retryMaxMs));
    } else {
      this.retryDelay.delete(left);
    }
    return this.step(now, stepTier(left, -1), 'sustained-low-fps', holdSamples);
  }

  private step(
    now: number,
    to: QualityTier,
    reason: TierStep['reason'],
    holdSamples: number,
  ): TierStep {
    const decided = this.samples.slice(-holdSamples);
    const step: TierStep = {
      from: this.tier,
      to,
      reason,
      fps: decided.reduce((sum, fps) => sum + fps, 0) / decided.length,
      at: now,
    };
    this.tier = to;
    this.discard();
    this.state = 'warmup';
    this.settleUntil = now + AUTO_QUALITY.settleMs;
    this.loadDeadline = now + AUTO_QUALITY.maxLoadWaitMs;
    return step;
  }

  private sustained(holdSamples: number, test: (fps: number) => boolean): boolean {
    if (this.samples.length < holdSamples) return false;
    const hits = this.samples.slice(-holdSamples).filter(test).length;
    return hits >= Math.ceil(holdSamples * AUTO_QUALITY.sustainedShare);
  }

  private discard(): void {
    this.samples = [];
    this.windowStart = -1;
    this.windowFrames = 0;
  }
}
