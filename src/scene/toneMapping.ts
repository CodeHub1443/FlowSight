import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, type ToneMapping } from 'three';

// One switch for the scene's tone mapping, used by the renderer (Low tier, no post-processing) and by the
// post-processing ToneMapping effect (High/Med), so every tier renders the palette the same way.

export type SceneToneMapping = 'aces' | 'agx' | 'neutral';

/**
 * Khronos PBR Neutral (user decision, Task 07A). docs/06 section 2 names ACES Filmic or AgX, but both desaturate
 * the docs/06 section 1 pale tints to grey (floor #EEF2FC renders ~#DDDEE1 with ACES, ~#C4C6C9 with AgX) and dull
 * the brand blue, failing docs/06 section 5; Neutral keeps them within a few RGB units. Proposed docs/06 + ADR-11
 * change in docs/progress/vis-3d.md.
 */
export const SCENE_TONE_MAPPING: SceneToneMapping = 'neutral';

/**
 * Unlit colours (background, fog) are scaled by this before tone mapping so they come out at their token value:
 * Neutral maps #E6ECFA x 1.5 to ~#E4EAF7 (x 1 would give ~#DAE0EE).
 */
export const UNLIT_GAIN = 1.5;

export const THREE_TONE_MAPPING: Record<SceneToneMapping, ToneMapping> = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
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
};
