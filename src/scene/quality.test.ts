// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  AUTO_START_TIER,
  autoStartTier,
  MAX_PIXELS,
  parsePixelOverride,
  QUALITY,
  renderPixelRatio,
  stepTier,
  type QualityTier,
} from './quality';

describe('quality tiers', () => {
  it('starts automatic mode at Med on a GPU and at Low on a software rasteriser', () => {
    expect(AUTO_START_TIER).toBe('med');
    expect(
      autoStartTier('ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ).toBe('med');
    expect(
      autoStartTier('ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ).toBe('med');
    expect(autoStartTier(null)).toBe('med');
    expect(
      autoStartTier(
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
      ),
    ).toBe('low');
    expect(autoStartTier('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('low');
    expect(autoStartTier('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)')).toBe(
      'low',
    );
  });

  it('keeps post-processing and cast shadows off on Low, AO on High and Med (ADR-11)', () => {
    expect(QUALITY.low.post).toBeNull();
    expect(QUALITY.low.shadowMapSize).toBeNull();
    expect(QUALITY.med.post).not.toBeNull();
    expect(QUALITY.high.post).not.toBeNull();
  });

  it('steps within low..high', () => {
    expect(stepTier('high', 1)).toBe('high');
    expect(stepTier('low', -1)).toBe('low');
    expect(stepTier('med', -1)).toBe('low');
  });
});

describe('pixel budget', () => {
  const ratio = (tier: QualityTier, cssWidth: number, cssHeight: number, deviceDpr = 1) =>
    renderPixelRatio({
      dpr: QUALITY[tier].dpr,
      maxPixels: QUALITY[tier].maxPixels,
      deviceDpr,
      cssWidth,
      cssHeight,
    });
  /** What three.js allocates for a CSS size and ratio. */
  const buffer = (r: number, w: number, h: number) => Math.floor(w * r) * Math.floor(h * r);
  const TIERS: readonly QualityTier[] = ['low', 'med', 'high'];

  it.each(TIERS)('leaves 1920x1080 and 1366x768 at device scale 1 untouched on %s', (tier) => {
    expect(ratio(tier, 1920, 1080)).toBe(1);
    expect(ratio(tier, 1366, 768)).toBe(1);
  });

  it('leaves 2560x1440 untouched on High and lowers it on Med', () => {
    expect(ratio('high', 2560, 1440)).toBe(1);
    expect(ratio('med', 2560, 1440)).toBeCloseTo(Math.sqrt(MAX_PIXELS.med / (2560 * 1440)), 12);
  });

  it.each([
    [3840, 2160],
    [7680, 4320],
    [15360, 2160],
    [1080, 3840],
    [5120, 1440],
  ])('holds every tier to its budget on a %ix%i wall, at any device scale', (w, h) => {
    for (const tier of TIERS) {
      for (const dpr of [1, 1.5, 2]) {
        const r = ratio(tier, w, h, dpr);
        expect(r).toBeLessThan(1);
        expect(buffer(r, w, h)).toBeLessThanOrEqual(MAX_PIXELS[tier]);
        // spends it: a ratio this far under would waste a visible share of the budget
        expect(buffer(r, w, h)).toBeGreaterThan(MAX_PIXELS[tier] * 0.99);
      }
    }
  });

  it('keeps the aspect ratio, because one ratio scales both sides', () => {
    const r = ratio('med', 3840, 1080);
    expect((3840 * r) / (1080 * r)).toBeCloseTo(3840 / 1080, 12);
  });

  it('is what R3F computed from the range while the budget is not reached', () => {
    expect(ratio('high', 800, 600, 1)).toBe(1);
    expect(ratio('high', 800, 600, 1.5)).toBe(1.5);
    expect(ratio('high', 800, 600, 2)).toBe(2);
    expect(ratio('high', 800, 600, 3)).toBe(2);
    expect(ratio('med', 800, 600, 2)).toBe(1.5);
    expect(ratio('low', 800, 600, 2)).toBe(1);
    // a browser zoomed out below 100 % stays at the bottom of the range
    expect(ratio('med', 800, 600, 0.5)).toBe(1);
  });

  it('lowers a high-density 1080p screen only as far as the budget', () => {
    // 1.5 and 2 would allocate 4.7 and 8.3 MP
    expect(ratio('med', 1920, 1080, 1.5)).toBeCloseTo(
      Math.sqrt(MAX_PIXELS.med / (1920 * 1080)),
      12,
    );
    expect(ratio('high', 1920, 1080, 2)).toBeCloseTo(
      Math.sqrt(MAX_PIXELS.high / (1920 * 1080)),
      12,
    );
    expect(ratio('high', 1280, 720, 2)).toBe(2);
    expect(ratio('high', 1200, 700, 1.5)).toBe(1.5);
  });

  it('is safe on tiny windows and before layout', () => {
    expect(ratio('med', 1, 1)).toBe(1);
    expect(ratio('high', 32, 18, 2)).toBe(2);
    expect(ratio('med', 0, 0)).toBe(1);
    expect(ratio('med', 0, 900)).toBe(1);
  });

  it('follows the tier: a tier change moves the ratio at a size over the budget', () => {
    const [w, h] = [3840, 2160];
    const low = ratio('low', w, h);
    const med = ratio('med', w, h);
    const high = ratio('high', w, h);
    expect(low).toBe(med);
    expect(high).toBeGreaterThan(med);
    expect(Math.floor(w * high)).toBe(2564);
    expect(Math.floor(w * med)).toBe(1932);
  });

  it('never lets a budget run below a standard size on a tier that serves it', () => {
    expect(MAX_PIXELS.med).toBeGreaterThanOrEqual(1920 * 1080);
    expect(MAX_PIXELS.low).toBeGreaterThanOrEqual(1920 * 1080);
    expect(MAX_PIXELS.high).toBeGreaterThanOrEqual(2560 * 1440);
  });

  it('reads ?pixels= in megapixels and ignores anything that is not a positive number', () => {
    expect(parsePixelOverride('?pixels=8.3')).toBeCloseTo(8_300_000);
    expect(parsePixelOverride('?quality=med&pixels=1')).toBe(1_000_000);
    for (const bad of [
      '',
      '?pixels=',
      '?pixels=0',
      '?pixels=-2',
      '?pixels=abc',
      '?pixels=Infinity',
    ]) {
      expect(parsePixelOverride(bad)).toBeNull();
    }
  });
});
