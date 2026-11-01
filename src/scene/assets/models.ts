import manifest from './manifest.generated.json';

// The build's output (scripts/assets/build.mjs, ADR-13). The manifest is bundled, so the hashed file names are known
// before the first request.

export interface ModelEntry {
  file: string;
  kind: string;
  bytes: number;
  tris: number;
  trisSource: number;
  source: string;
  sourceBytes: number;
  /** Extents in the GLB, metres: three x, y (up), z. */
  sizeM: [number, number, number];
  /** Palette tokens used as glTF material names. */
  tones: string[];
  textured: boolean;
}

export const MODELS = manifest.assets as unknown as Readonly<Record<ModelName, ModelEntry>>;

export type ModelName = keyof typeof manifest.assets;

/** Models the live scene uses. Scanner and crate are only in /dev/assets; the truck GLB is rejected (Task 14). */
export const LIVE_MODELS: readonly ModelName[] = [
  'pallet_b01',
  'pallet_b01_far',
  'box_brown_b28',
  'pallet_jack',
  'forklift',
];

export function modelUrl(name: ModelName): string {
  return `${import.meta.env.BASE_URL}models/${MODELS[name].file}`;
}
