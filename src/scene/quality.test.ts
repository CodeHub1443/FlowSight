// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AUTO_START_TIER, autoStartTier, QUALITY, stepTier } from './quality';

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
