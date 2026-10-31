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

describe('scene tone mapping', () => {
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
