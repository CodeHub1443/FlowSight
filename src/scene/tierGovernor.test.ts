// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AUTO_QUALITY, TierGovernor, type TierStep } from './tierGovernor';
import { autoStartTier, type QualityTier } from './quality';

interface Run {
  fps: number;
  ms: number;
  active?: boolean;
  ready?: boolean;
  override?: number;
}

/** Feeds frames at a steady rate and collects the steps. Advances the shared clock. */
function drive(g: TierGovernor, clock: { now: number }, run: Run): TierStep[] {
  const steps: TierStep[] = [];
  const end = clock.now + run.ms;
  const dt = 1000 / run.fps;
  while (clock.now < end) {
    clock.now += dt;
    const s = g.frame(clock.now, run.active ?? true, run.ready ?? true, run.override);
    if (s) steps.push(s);
  }
  return steps;
}

function start(tier: QualityTier = 'med') {
  const clock = { now: 1000 };
  const g = new TierGovernor(tier, clock.now);
  return { g, clock };
}

/** Past the warm-up at a healthy rate that triggers nothing from Med. */
function warmUp(g: TierGovernor, clock: { now: number }) {
  drive(g, clock, { fps: 45, ms: AUTO_QUALITY.warmupMs + 100 });
}

describe('TierGovernor', () => {
  describe('regression: a fast GPU', () => {
    it('reaches High and stays there at 120 fps (PerformanceMonitor locked this to Low)', () => {
      const { g, clock } = start();
      warmUp(g, clock);
      const steps = drive(g, clock, { fps: 120, ms: 10 * 60_000 });
      expect(steps.map((s) => `${s.from}>${s.to}`)).toEqual(['med>high']);
      expect(g.tier).toBe('high');
    });
  });

  describe('warm-up', () => {
    it('ignores a slow burst during the first seconds', () => {
      const { g, clock } = start();
      const steps = drive(g, clock, { fps: 1, ms: AUTO_QUALITY.warmupMs - 1100 });
      expect(steps).toEqual([]);
      expect(g.state).toBe('warmup');
      expect(g.fps).toBeNull();
    });

    it('waits for the models beyond the warm-up, then settles', () => {
      const { g, clock } = start();
      expect(drive(g, clock, { fps: 5, ms: 12_000, ready: false })).toEqual([]);
      expect(g.state).toBe('warmup');
      drive(g, clock, { fps: 60, ms: AUTO_QUALITY.settleMs - 100 });
      expect(g.state).toBe('warmup');
      drive(g, clock, { fps: 60, ms: 200 });
      expect(g.state).toBe('monitoring');
    });

    it('starts measuring anyway when a model never settles', () => {
      const { g, clock } = start();
      drive(g, clock, {
        fps: 30,
        ms: AUTO_QUALITY.maxLoadWaitMs + AUTO_QUALITY.settleMs + 500,
        ready: false,
      });
      expect(g.state).toBe('monitoring');
    });
  });

  describe('stepping down', () => {
    it('does not drop on a stutter shorter than the hold', () => {
      const { g, clock } = start('high');
      warmUp(g, clock);
      drive(g, clock, { fps: 60, ms: 3000 });
      expect(drive(g, clock, { fps: 5, ms: 3000 })).toEqual([]);
      expect(drive(g, clock, { fps: 60, ms: 20_000 })).toEqual([]);
      expect(g.tier).toBe('high');
    });

    it('drops High to Med on sustained low fps, with the reason', () => {
      const { g, clock } = start('high');
      warmUp(g, clock);
      const steps = drive(g, clock, { fps: 25, ms: 8000 });
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({ from: 'high', to: 'med', reason: 'sustained-low-fps' });
      expect(steps[0]?.fps).toBeCloseTo(25, 0);
    });

    it('goes one tier at a time and settles in between', () => {
      const { g, clock } = start('high');
      warmUp(g, clock);
      const steps = drive(g, clock, { fps: 15, ms: 8000 });
      expect(steps.map((s) => s.to)).toEqual(['med']);
      expect(g.state).toBe('warmup');
    });

    it('keeps Med at 25 fps: below target but not slow enough for Low', () => {
      const { g, clock } = start();
      warmUp(g, clock);
      expect(drive(g, clock, { fps: 25, ms: 5 * 60_000 })).toEqual([]);
      expect(g.tier).toBe('med');
    });

    it('drops Med to Low only after several seconds below 20 fps', () => {
      const { g, clock } = start();
      warmUp(g, clock);
      expect(drive(g, clock, { fps: 15, ms: 5000 })).toEqual([]);
      const steps = drive(g, clock, { fps: 15, ms: 4000 });
      expect(steps.map((s) => s.to)).toEqual(['low']);
    });

    it('still drops when a good second interrupts a slow period', () => {
      const { g, clock } = start();
      warmUp(g, clock);
      const steps: TierStep[] = [];
      for (let i = 0; i < 3 && g.tier === 'med'; i++) {
        steps.push(...drive(g, clock, { fps: 15, ms: 4000 }));
        steps.push(...drive(g, clock, { fps: 45, ms: 1000 }));
      }
      expect(steps.map((s) => s.to)).toEqual(['low']);
    });
  });

  describe('recovery', () => {
    it('steps back up from Low when the load goes away', () => {
      const { g, clock } = start();
      warmUp(g, clock);
      drive(g, clock, { fps: 10, ms: 10_000 });
      expect(g.tier).toBe('low');
      const steps = drive(g, clock, { fps: 60, ms: 16_000 });
      expect(steps[0]).toMatchObject({ from: 'low', to: 'med', reason: 'sustained-high-fps' });
    });

    it('recovers at once after a load that took a fresh High all the way down', () => {
      const { g, clock } = start();
      warmUp(g, clock);
      drive(g, clock, { fps: 120, ms: 11_000 });
      expect(g.tier).toBe('high');
      drive(g, clock, { fps: 10, ms: 22_000 });
      expect(g.tier).toBe('low');
      // only High was tried and failed, so Med is not on hold
      const steps = drive(g, clock, { fps: 160, ms: 14_000 });
      expect(steps.map((s) => s.to)).toEqual(['med']);
    });

    it('needs the hold before stepping up', () => {
      const { g, clock } = start('low');
      warmUp(g, clock);
      expect(drive(g, clock, { fps: 60, ms: 5000 })).toEqual([]);
    });

    it('stays at the top without stepping again', () => {
      const { g, clock } = start('high');
      warmUp(g, clock);
      expect(drive(g, clock, { fps: 165, ms: 5 * 60_000 })).toEqual([]);
    });
  });

  describe('flip-flop protection', () => {
    /** Med at 60, High at 20: an Intel UHD on a 60 Hz panel. Returns the times High was entered. */
    function intelLike(minutes: number) {
      const { g, clock } = start();
      warmUp(g, clock);
      const entered: number[] = [];
      const end = clock.now + minutes * 60_000;
      while (clock.now < end) {
        const steps = drive(g, clock, { fps: g.tier === 'high' ? 20 : 60, ms: 1000 });
        for (const s of steps) if (s.to === 'high') entered.push(s.at);
      }
      return { entered, tier: g.tier };
    }

    it('backs off exponentially from a tier that fails', () => {
      const { entered } = intelLike(20);
      expect(entered.length).toBeGreaterThanOrEqual(3);
      expect(entered.length).toBeLessThanOrEqual(6);
      const waits = entered.slice(1).map((t, i) => t - (entered[i] ?? 0));
      for (let i = 1; i < waits.length; i++) {
        expect(waits[i]).toBeGreaterThan(waits[i - 1] ?? 0);
      }
    });

    it('never falls to Low because of failed High trials', () => {
      const { g, clock } = start();
      warmUp(g, clock);
      const tiers = new Set<QualityTier>();
      for (let i = 0; i < 20 * 60; i++) {
        drive(g, clock, { fps: g.tier === 'high' ? 20 : 60, ms: 1000 });
        tiers.add(g.tier);
      }
      expect(tiers.has('low')).toBe(false);
    });

    it('caps the retry wait', () => {
      const { entered } = intelLike(180);
      const waits = entered.slice(1).map((t, i) => t - (entered[i] ?? 0));
      const slack = 60_000;
      for (const w of waits) expect(w).toBeLessThanOrEqual(AUTO_QUALITY.retryMaxMs + slack);
    });
  });

  describe('pause', () => {
    it('measures nothing while hidden or unfocused', () => {
      const { g, clock } = start();
      warmUp(g, clock);
      expect(drive(g, clock, { fps: 1, ms: 60_000, active: false })).toEqual([]);
      expect(g.tier).toBe('med');
      expect(g.state).toBe('paused');
    });

    it('forgets the samples before the pause and settles after it', () => {
      const { g, clock } = start();
      warmUp(g, clock);
      drive(g, clock, { fps: 15, ms: 6000 });
      drive(g, clock, { fps: 15, ms: 5000, active: false });
      expect(g.fps).not.toBeNull();
      expect(drive(g, clock, { fps: 15, ms: AUTO_QUALITY.settleMs - 100 })).toEqual([]);
      expect(g.state).toBe('warmup');
      expect(drive(g, clock, { fps: 15, ms: 5000 })).toEqual([]);
      expect(g.tier).toBe('med');
    });

    it('treats a long gap between frames as a pause, not as slow frames', () => {
      const { g, clock } = start();
      warmUp(g, clock);
      drive(g, clock, { fps: 15, ms: 6000 });
      clock.now += 3000;
      expect(g.frame(clock.now, true, true)).toBeNull();
      expect(g.state).toBe('warmup');
      expect(drive(g, clock, { fps: 15, ms: 5000 })).toEqual([]);
      expect(g.tier).toBe('med');
    });

    it('does not step on rAF throttled to 1 Hz in a page that still reports visible and focused', () => {
      const { g, clock } = start('high');
      warmUp(g, clock);
      expect(drive(g, clock, { fps: 1, ms: 5 * 60_000 })).toEqual([]);
      expect(g.tier).toBe('high');
    });

    it('still drops a machine whose frames take just under the gap limit', () => {
      const { g, clock } = start();
      warmUp(g, clock);
      const steps = drive(g, clock, { fps: 1.5, ms: 30_000 });
      expect(steps.map((s) => s.to)).toEqual(['low']);
    });
  });
});

describe('software renderer rule', () => {
  it.each([
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 6GB Laptop GPU, Direct3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 6GB Laptop GPU (0x000025AC) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    // "Software" in a driver or vendor name is not a software rasteriser
    'ANGLE (Acme Software Inc, Acme GPU, D3D11)',
    'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
  ])('starts a real GPU at Med: %s', (renderer) => {
    expect(autoStartTier(renderer)).toBe('med');
  });

  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'softpipe',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ])('starts a software rasteriser at Low: %s', (renderer) => {
    expect(autoStartTier(renderer)).toBe('low');
  });

  it('starts at Med when the renderer is hidden', () => {
    expect(autoStartTier(null)).toBe('med');
  });
});
