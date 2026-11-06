import {
  EffectComposer,
  N8AO,
  SMAA,
  ToneMapping,
  type ToneMappingProps,
} from '@react-three/postprocessing';
import { disposeFullScreenQuads } from './gpuRelease';
import { useSceneEnv } from './sceneEnv';
import { POST_TONE_MODE } from './toneMapping';

// ADR-11 / docs/06 section 2: N8AO ambient occlusion + SMAA on High and Med, nothing on Low. The composer forces
// the renderer to NoToneMapping while it runs, so the scene tone mapping (toneMapping.ts) is applied by the last
// effect; on Low the renderer itself tone-maps with the same curve, so every tier looks the same.

/** World-space AO radius in metres: about one pallet, so crevices and floor contacts darken, not whole bays. */
export const AO_RADIUS = 1.8;
/** Periwinkle AO (docs/06 D2) reads softer than a grey one, so it can be strong without looking dirty. */
export const AO_INTENSITY = 3.5;

/**
 * Releases the AO pass's full-screen quads when the pass goes (gpuRelease.ts: they hold the renderer through n8ao's
 * shared triangle). Module-level, so React never detaches and re-attaches it on a re-render.
 */
const releaseAoQuads = (pass: object | null) => () => disposeFullScreenQuads(pass);

export function ScenePost() {
  const { quality, palette, toneMapping } = useSceneEnv();
  const post = quality.post;
  if (!post) return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO
        ref={releaseAoQuads}
        quality={post.ao}
        halfRes={post.halfRes}
        aoRadius={AO_RADIUS}
        distanceFalloff={1}
        intensity={AO_INTENSITY}
        color={palette.aoColor}
      />
      <SMAA />
      {/* runtime enum value: the library's typings and runtime disagree (see toneMapping.ts) */}
      <ToneMapping mode={POST_TONE_MODE[toneMapping] as ToneMappingProps['mode']} />
    </EffectComposer>
  );
}
