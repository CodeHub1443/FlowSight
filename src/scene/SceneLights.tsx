import { Environment, Lightformer } from '@react-three/drei';
import { useEffect } from 'react';
import { ContactShadowLayer } from './ContactShadowLayer';
import { contactShadows } from './contactShadowController';
import { useSceneEnv } from './sceneEnv';
import type { SiteLayout } from './site/layout';

// docs/06 section 2 lighting: an environment built only from local Lightformers (no HDR download, offline LAN rule),
// a hemisphere fill, one soft key light (PCF shadow, radius >= 6, tuned bias) and contact shadows. Top faces read
// lighter than side faces because the big soft light is overhead, not because of different colours.

/**
 * Light balance. The key light carries enough of the total that its soft shadows read (with more fill they vanish
 * on the pale floor); environment + hemisphere keep shadowed faces periwinkle, never grey-black.
 */
export const KEY_INTENSITY = 3.4;
export const ENV_INTENSITY = 0.24;
export const HEMI_INTENSITY = 0.32;
/** Low, shadowless fill from the opposite side: lifts faces turned away from the key, hardly touches the floor. */
export const FILL_INTENSITY = 0.9;
/** Shadow softness of the key light (PCF radius, docs/06: >= 6) and its sample count. */
export const KEY_SHADOW_RADIUS = 6;
export const KEY_SHADOW_SAMPLES = 16;
/** Depth bias and normal bias of the key light, tuned against acne and light leaks on the rounded boxes. */
export const KEY_SHADOW_BIAS = -0.0003;
export const KEY_SHADOW_NORMAL_BIAS = 0.03;

export function SceneLights({ layout }: { layout: SiteLayout }) {
  const { palette, quality, shadows, tier } = useSceneEnv();
  const { width, depth } = layout.footprint;
  const reach = Math.max(width, depth) * 0.62 + 6;
  const size = quality.shadowMapSize ?? 1024;
  const cs = quality.contactShadows;

  // a theme or tier switch changes what the contact shadows see
  useEffect(() => contactShadows.invalidate(), [palette, tier]);

  return (
    <>
      <Environment resolution={128} frames={1} environmentIntensity={ENV_INTENSITY}>
        {/* broad white softbox overhead: lifts every top face */}
        <Lightformer
          form="rect"
          intensity={2.4}
          color={palette.keyLight}
          position={[0, 12, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[24, 24, 1]}
        />
        {/* cool periwinkle bounce from the void on the north and west, warmer white from the south-east */}
        <Lightformer
          form="rect"
          intensity={1.1}
          color={palette.skyFill}
          position={[-10, 4, -10]}
          rotation={[0, Math.PI / 4, 0]}
          scale={[20, 6, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.9}
          color={palette.keyLight}
          position={[10, 3, 10]}
          rotation={[0, (-3 * Math.PI) / 4, 0]}
          scale={[20, 5, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.6}
          color={palette.void}
          position={[0, -6, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[30, 30, 1]}
        />
      </Environment>
      <hemisphereLight args={[palette.skyFill, palette.groundFill, HEMI_INTENSITY]} />
      {/* key light from the north-west, high: soft shadows fall towards the dock wall and the camera sees lit faces */}
      <directionalLight
        position={[-30, 78, -42]}
        intensity={KEY_INTENSITY}
        color={palette.keyLight}
        castShadow={shadows}
        shadow-mapSize={[size, size]}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-near={20}
        shadow-camera-far={220}
        shadow-bias={KEY_SHADOW_BIAS}
        shadow-normalBias={KEY_SHADOW_NORMAL_BIAS}
        shadow-radius={KEY_SHADOW_RADIUS}
        shadow-blurSamples={KEY_SHADOW_SAMPLES}
      />
      <directionalLight
        position={[40, 18, 34]}
        intensity={FILL_INTENSITY}
        color={palette.skyFill}
      />
      {shadows && (
        // catches the shed's shadow on the void so the dollhouse sits on something
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
          <planeGeometry args={[width + 160, depth + 160]} />
          <shadowMaterial color={palette.shade} opacity={0.14} />
        </mesh>
      )}
      <ContactShadowLayer
        key={tier}
        position={[0, layout.floorLevel + 0.014, 0]}
        width={width}
        depth={depth}
        far={3.5}
        color={palette.shade}
        opacity={tier === 'low' ? 0.85 : 0.75}
        blur={2.4}
        resolution={cs.resolution}
        maxHz={cs.maxHz}
      />
    </>
  );
}
