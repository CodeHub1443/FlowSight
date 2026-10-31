import { createContext, useContext } from 'react';
import type { SceneMaterials, ScenePalette, SceneTheme } from './materials';
import type { QualitySettings, QualityTier } from './quality';
import type { SceneToneMapping } from './toneMapping';

/** Palette, shared materials and quality settings for everything inside <SceneRoot/>. */
export interface SceneEnv {
  theme: SceneTheme;
  palette: ScenePalette;
  materials: SceneMaterials;
  tier: QualityTier;
  quality: QualitySettings;
  /** Directional-light shadows are on (High tier). */
  shadows: boolean;
  toneMapping: SceneToneMapping;
}

export const SceneEnvContext = createContext<SceneEnv | null>(null);

export function useSceneEnv(): SceneEnv {
  const env = useContext(SceneEnvContext);
  if (!env) throw new Error('useSceneEnv must be used inside <SceneRoot/>');
  return env;
}
