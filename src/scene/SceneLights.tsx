import { Environment, Lightformer } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { ContactShadowLayer } from './ContactShadowLayer';
import { contactShadows } from './contactShadowController';
import { radialTexture } from './labels/textures';
import { useSceneEnv } from './sceneEnv';
import type { SiteLayout } from './site/layout';
import { unlitColor } from './toneMapping';

// docs/06 section 2 lighting: an environment built only from local Lightformers (no HDR download, offline LAN rule),
// a hemisphere fill, one soft key light (PCF shadow, radius >= 6, tuned bias) and contact shadows. Top faces read
// lighter than side faces because the big soft light is overhead, not because of different colours. Colours are
// theme tokens: warm key and periwinkle shadows in light (D2), moonlight and a cool rim in dark (section 8.3).

/**
 * Light balance. The key light carries enough of the total that its soft shadows read (with more fill they vanish
 * on the pale floor); environment + hemisphere keep shadowed faces periwinkle, never grey-black.
 */
export const KEY_INTENSITY = 3.4;
export const ENV_INTENSITY = 0.24;
export const HEMI_INTENSITY = 0.32;
/** Low, shadowless fill from the opposite side: lifts faces turned away from the key, hardly touches the floor. */
export const FILL_INTENSITY = 0.9;
/**
 * Dark rig. docs/06 section 8.3 gives relative intensities; three.js lights divide by pi and the hemisphere and key
 * colours are blue, so they are calibrated (docs/06 section 7.3) until the shed floor renders at its token #1E2E58.
 */
const DARK_RIG = {
  key: 0.8 * Math.PI * 1.35,
  hemi: 0.55 * Math.PI * 1.35,
  rim: 0.6 * Math.PI,
  env: 0.12,
} as const;
/** Contact-shadow strength (docs/06 D2 in light; the dark tint is close to the floor, so it can be stronger). */
const CONTACT_OPACITY = { light: 0.35, dark: 0.7 } as const;
/** Size of the radial glow behind the shed in the dark theme (docs/06 section 8.1). */
const VOID_GLOW_SIZE = 420;
/** Shadow softness of the key light (PCF radius, docs/06: >= 6) and its sample count. */
export const KEY_SHADOW_RADIUS = 6;
export const KEY_SHADOW_SAMPLES = 16;
/** Depth bias and normal bias of the key light, tuned against acne and light leaks on the rounded boxes. */
export const KEY_SHADOW_BIAS = -0.0003;
export const KEY_SHADOW_NORMAL_BIAS = 0.03;

export function SceneLights({ layout }: { layout: SiteLayout }) {
  const { palette, quality, shadows, tier, theme } = useSceneEnv();
  const { width, depth } = layout.footprint;
  const reach = Math.max(width, depth) * 0.62 + 6;
  const size = quality.shadowMapSize ?? 1024;
  const cs = quality.contactShadows;
  const dark = theme === 'dark';
  const glowColor = useMemo(() => unlitColor(palette.voidGlow, theme), [palette.voidGlow, theme]);

  // a theme or tier switch changes what the contact shadows see
  useEffect(() => contactShadows.invalidate(), [palette, tier]);

  return (
    <>
      <Environment
        // rebaked per theme: the lightformers carry the theme's light colours
        key={theme}
        resolution={128}
        frames={1}
        environmentIntensity={dark ? DARK_RIG.env : ENV_INTENSITY}
      >
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
          color={palette.hemiSky}
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
      <hemisphereLight
        args={[palette.hemiSky, palette.hemiGround, dark ? DARK_RIG.hemi : HEMI_INTENSITY]}
      />
      {/* key light from the north-west, high: soft shadows fall towards the dock wall and the camera sees lit faces */}
      <directionalLight
        position={[-30, 78, -42]}
        intensity={dark ? DARK_RIG.key : KEY_INTENSITY}
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
      {dark ? (
        // rim: back-right of the hero view, so edges of conveyors, pallets and walls catch a cool highlight
        <directionalLight
          position={[-60, 22, 8]}
          intensity={DARK_RIG.rim}
          color={palette.rimLight}
        />
      ) : (
        <directionalLight
          position={[40, 18, 34]}
          intensity={FILL_INTENSITY}
          color={palette.hemiSky}
        />
      )}
      {dark && (
        // the radial glow behind the shed: the void stays navy at the edges, never black
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
          <planeGeometry args={[VOID_GLOW_SIZE, VOID_GLOW_SIZE]} />
          <meshBasicMaterial
            map={radialTexture(1)}
            color={glowColor}
            transparent
            depthWrite={false}
            fog={false}
          />
        </mesh>
      )}
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
        color={palette.contactShade}
        opacity={CONTACT_OPACITY[theme]}
        blur={2.4}
        resolution={cs.resolution}
        maxHz={cs.maxHz}
      />
    </>
  );
}
