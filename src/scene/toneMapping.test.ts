// @vitest-environment node
import { Color, LinearToneMapping, NeutralToneMapping } from 'three';
import { describe, expect, it } from 'vitest';
import {
  DARK_TONE_MAPPING,
  POST_TONE_MODE,
  SCENE_TONE_MAPPING,
  THREE_TONE_MAPPING,
  unlitColor,
} from './toneMapping';
import { LIGHT_TOKENS } from './materials';

// `postprocessing` is a dependency of @react-three/postprocessing, not of this app, so its enum is read from the
// installed build's source text.
const builds = import.meta.glob(
  '/node_modules/.pnpm/postprocessing@*/node_modules/postprocessing/build/index.js',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function runtimeMode(name: string): number | undefined {
  const src = Object.values(builds)[0] ?? '';
  const block = src.slice(src.indexOf('var ToneMappingMode = {'));
  const m = block.match(new RegExp(`\\b${name}: (\\d+)`));
  return m ? Number(m[1]) : undefined;
}

/** three's NeutralToneMapping, on linear channels. */
function neutral(c: readonly [number, number, number]): number[] {
  const x = Math.min(...c);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const v = c.map((n) => n - offset);
  const peak = Math.max(...v);
  const start = 0.76;
  if (peak < start) return v;
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + d - start);
  const g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
  return v.map((n) => (n * newPeak) / peak + (newPeak - (n * newPeak) / peak) * g);
}

describe('scene tone mapping', () => {
  it('brings the light void out of the curve at its token, so fog and clear colour leave no seam', () => {
    const lit = unlitColor(LIGHT_TOKENS.void, 'light');
    const token = new Color(LIGHT_TOKENS.void);
    const [r = 0, g = 0, b = 0] = neutral([lit.r, lit.g, lit.b]);
    const out = new Color().setRGB(r, g, b).getHex();
    // compared in sRGB bytes
    for (const shift of [16, 8, 0]) {
      const diff = ((out >> shift) & 255) - ((token.getHex() >> shift) & 255);
      expect(Math.abs(diff)).toBeLessThanOrEqual(2);
    }
  });

  it('is Khronos PBR Neutral (user decision, Task 07A)', () => {
    expect(SCENE_TONE_MAPPING).toBe('neutral');
    expect(THREE_TONE_MAPPING[SCENE_TONE_MAPPING]).toBe(NeutralToneMapping);
  });

  it('passes the runtime ToneMappingMode values of the installed postprocessing', () => {
    expect(Object.keys(builds)).toHaveLength(1);
    expect(POST_TONE_MODE.aces).toBe(runtimeMode('ACES_FILMIC'));
    expect(POST_TONE_MODE.agx).toBe(runtimeMode('AGX'));
    expect(POST_TONE_MODE.neutral).toBe(runtimeMode('NEUTRAL'));
    expect(POST_TONE_MODE.linear).toBe(runtimeMode('LINEAR'));
  });

  it('renders the dark theme without a curve, so its unlit colours stay at their token', () => {
    expect(THREE_TONE_MAPPING[DARK_TONE_MAPPING]).toBe(LinearToneMapping);
    expect(unlitColor('#0E1730', 'dark').getHexString()).toBe(new Color('#0E1730').getHexString());
    expect(unlitColor('#E6ECFA', 'light').r).toBeGreaterThan(new Color('#E6ECFA').r);
  });
});
