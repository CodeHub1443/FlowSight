import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  Color,
  LinearToneMapping,
  NeutralToneMapping,
  type ToneMapping,
} from 'three';

// One switch for the scene's tone mapping, used by the renderer (Low tier, no post-processing) and by the
// post-processing ToneMapping effect (High/Med), so every tier renders the palette the same way.

export type SceneToneMapping = 'aces' | 'agx' | 'neutral' | 'linear';

/**
 * Khronos PBR Neutral (user decision, Task 07A). docs/06 section 2 names ACES Filmic or AgX, but both desaturate
 * the docs/06 section 1 pale tints to grey (floor #EEF2FC renders ~#DDDEE1 with ACES, ~#C4C6C9 with AgX) and dull
 * the brand blue, failing docs/06 section 5; Neutral keeps them within a few RGB units. Proposed docs/06 + ADR-11
 * change in docs/progress/vis-3d.md.
 */
export const SCENE_TONE_MAPPING: SceneToneMapping = 'neutral';

/**
 * The dark theme renders without a curve. Neutral's toe subtracts the darkest channel from every colour below 0.08
 * linear, which turns the whole docs/06 section 8 palette into saturated blue and swallows the warm work lights;
 * nothing in that palette is bright enough to need a shoulder.
 */
export const DARK_TONE_MAPPING: SceneToneMapping = 'linear';

/**
 * Unlit colours (background, fog) are scaled by this before tone mapping so they come out at their token value:
 * Neutral maps the void #F2F6FC x 2.2 to ~#F2F6FB (x 1.5 gives ~#EEF2F8). `toneMapping.test.ts` runs the curve.
 */
export const UNLIT_GAIN = 2.2;

/** The colour to give an unlit surface (background, fog) so the theme's tone mapping renders it at `hex`. */
export function unlitColor(hex: string, theme: 'light' | 'dark'): Color {
  const out = new Color(hex);
  return theme === 'light' ? out.multiplyScalar(UNLIT_GAIN) : out;
}

export const THREE_TONE_MAPPING: Record<SceneToneMapping, ToneMapping> = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
  linear: LinearToneMapping,
};

/**
 * `postprocessing` ToneMappingMode values at runtime (6.39). Its typings number the enum differently (they count
 * the CINEON alias), and its runtime default is AGX, so the mode is always passed explicitly with these values;
 * `toneMapping.test.ts` checks them against the installed library.
 */
export const POST_TONE_MODE: Record<SceneToneMapping, number> = {
  aces: 6,
  agx: 7,
  neutral: 8,
  linear: 0,
};
