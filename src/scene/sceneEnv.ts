import { createContext, useContext } from 'react';
import type { SceneMaterials, ScenePalette } from './materials';
import type { QualitySettings, QualityTier } from './quality';

/** Palette, shared materials and quality settings for everything inside <SceneRoot/>. */
export interface SceneEnv {
  palette: ScenePalette;
  materials: SceneMaterials;
  tier: QualityTier;
  quality: QualitySettings;
  /** Directional-light shadows are on (High tier). */
  shadows: boolean;
}

export const SceneEnvContext = createContext<SceneEnv | null>(null);

export function useSceneEnv(): SceneEnv {
  const env = useContext(SceneEnvContext);
  if (!env) throw new Error('useSceneEnv must be used inside <SceneRoot/>');
  return env;
}
