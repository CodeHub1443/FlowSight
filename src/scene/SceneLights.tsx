import { ContactShadows } from '@react-three/drei';
import { useSceneEnv } from './sceneEnv';
import type { SiteLayout } from './site/layout';

/** Hemisphere + one directional light from above-south (docs/04 section 1), soft shadows on High, baked contact shadows on High/Med. */
export function SceneLights({ layout }: { layout: SiteLayout }) {
  const { palette, quality, shadows, tier } = useSceneEnv();
  const { width, depth } = layout.footprint;
  const reach = Math.max(width, depth) * 0.75 + 8;
  const size = quality.shadowMapSize ?? 1024;
  return (
    <>
      <hemisphereLight args={[palette.wall, palette.floorGrid, 1.8]} />
      <directionalLight
        position={[-24, 85, 55]}
        intensity={1.35}
        castShadow={shadows}
        shadow-mapSize={[size, size]}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={3}
      />
      {shadows && (
        // catches the shed's shadow on the void so the dollhouse sits on something
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
          <planeGeometry args={[width + 160, depth + 160]} />
          <shadowMaterial opacity={0.12} />
        </mesh>
      )}
      {quality.contactShadows && (
        <ContactShadows
          key={tier}
          position={[0, layout.floorLevel + 0.012, 0]}
          scale={[width, depth]}
          far={4}
          blur={2.4}
          opacity={0.38}
          resolution={1024}
          frames={1}
          color="#1B2A4A"
        />
      )}
    </>
  );
}
