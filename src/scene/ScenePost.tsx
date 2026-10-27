import {
  EffectComposer,
  N8AO,
  SMAA,
  ToneMapping,
  type ToneMappingProps,
} from '@react-three/postprocessing';
import { useSceneEnv } from './sceneEnv';
import { POST_TONE_MODE } from './toneMapping';

// ADR-11 / docs/06 section 2: N8AO ambient occlusion + SMAA on High and Med, nothing on Low. The composer forces
// the renderer to NoToneMapping while it runs, so the scene tone mapping (toneMapping.ts) is applied by the last
// effect; on Low the renderer itself tone-maps with the same curve, so every tier looks the same.

/** World-space AO radius in metres: about one pallet, so crevices and floor contacts darken, not whole bays. */
export const AO_RADIUS = 2.2;
export const AO_INTENSITY = 6;

export function ScenePost() {
  const { quality, palette, toneMapping } = useSceneEnv();
  const post = quality.post;
  if (!post) return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO
        quality={post.ao}
        halfRes={post.halfRes}
        aoRadius={AO_RADIUS}
        distanceFalloff={1}
        intensity={AO_INTENSITY}
        color={palette.shade}
      />
      <SMAA />
      {/* runtime enum value: the library's typings and runtime disagree (see toneMapping.ts) */}
      <ToneMapping mode={POST_TONE_MODE[toneMapping] as ToneMappingProps['mode']} />
    </EffectComposer>
  );
}
