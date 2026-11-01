import { MeshStandardMaterial } from 'three';

// Scene palette. The token values are docs/06-visual-language.md section 1 with the section 7 overrides (light) and
// section 8 (dark), all binding, and are mirrored by the CSS tokens in src/index.css; `materials.test.ts` parses
// docs/06 and fails if a fallback below drifts.
// Every other scene colour is derived from these tokens (see `derive`), so nothing outside this file is a literal
// colour. Site facade colours are physical paint and come from config (the one allowed exception).

export type SceneTheme = 'light' | 'dark';

/** Colours named by docs/06 section 1 (plus the four status tokens docs/06 does not redefine). */
export interface PaletteTokens {
  void: string;
  floor: string;
  floorLine: string;
  apron: string;
  /** The truck yard outside the dock doors (docs/06 section 7.5). */
  truckYard: string;
  walkline: string;
  wall: string;
  wallAccent: string;
  brand: string;
  brandLight: string;
  brandTint: string;
  carton: string;
  cartonTape: string;
  palletBlue: string;
  palletYellow: string;
  palletOrange: string;
  // wood crates (docs/06 section 7.5): new and old timber, each a light and a deep end
  crateNew: string;
  crateNewDeep: string;
  crateOld: string;
  crateOldDeep: string;
  // ring road trees (docs/06 section 7.5)
  treeFoliage: string;
  treeFoliageDeep: string;
  treeTrunk: string;
  metal: string;
  belt: string;
  statusOk: string;
  okBg: string;
  statusWarn: string;
  warnBg: string;
  statusCritical: string;
  criticalBg: string;
  ink900: string;
  ink600: string;
  ink400: string;
  card: string;
  // CLAUDE.md status tokens without a docs/06 counterpart
  statusNeutral: string;
  statusIdle: string;
  statusOffline: string;
  statusInfo: string;
  // docs/06 section 7 (D2-D8) and section 8
  zone: string;
  zoneLine: string;
  aisle: string;
  aisleLine: string;
  wallRib: string;
  wallTop: string;
  eaveTop: string;
  conveyor: string;
  conveyorTop: string;
  beltStripe: string;
  beltTick: string;
  sack: string;
  selectionPill: string;
  pillBg: string;
  pillFg: string;
  pillBorder: string;
  hemiSky: string;
  hemiGround: string;
  keyLight: string;
  rimLight: string;
  workLight: string;
  aoColor: string;
  contactShade: string;
  vignette: string;
  voidGlow: string;
}

/** Scene colours derived from the tokens (mixes only, no new literals). */
export interface DerivedColors {
  slab: string;
  cabinet: string;
  motor: string;
  motorGrille: string;
  sackBand: string;
  road: string;
  crateNewMid: string;
  crateOldMid: string;
  shutter: string;
  seal: string;
  leveller: string;
  doorFrame: string;
  column: string;
  paintWhite: string;
  workZone: string;
  hover: string;
  selection: string;
  /** Tint of cast shadows on the void: periwinkle or navy, never black. */
  shade: string;
  /** Storage zone: the prop colours faded towards the floor (docs/06 D6, section 7.3). */
  storagePallet: string;
  storageCarton: string;
  storageTape: string;
  storageSack: string;
}

export type ScenePalette = PaletteTokens & DerivedColors;
export type PaletteKey = keyof ScenePalette;

/** The wood crate tones (docs/06 section 7.5), light to dark. */
export const CRATE_TONES: readonly PaletteKey[] = [
  'crateNew',
  'crateNewMid',
  'crateNewDeep',
  'crateOld',
  'crateOldMid',
  'crateOldDeep',
];

// CLAUDE.md values; info is --brand-500 (docs/06: brand blue for active states and selection), as in src/index.css
const STATUS_EXTRA = {
  statusNeutral: '#64748B',
  statusIdle: '#CBD5E1',
  statusOffline: '#94A3B8',
  statusInfo: '#2C6FED',
} as const;

/** docs/06 section 1 with the section 7 overrides, light theme (exact values). */
export const LIGHT_TOKENS: PaletteTokens = {
  void: '#F2F6FC',
  floor: '#F2F7FF',
  floorLine: '#D4DEF7',
  apron: '#DCE4F8',
  truckYard: '#DDF8EA',
  walkline: '#F3CA6C',
  wall: '#F3F6FE',
  wallAccent: '#3D6AE4',
  brand: '#2C6FED',
  brandLight: '#5193F3',
  brandTint: '#EAF2FF',
  carton: '#E9C6A2',
  cartonTape: '#D9AE80',
  palletBlue: '#3F7BF0',
  palletYellow: '#F5C542',
  palletOrange: '#F59E5B',
  crateNew: '#D8B27A',
  crateNewDeep: '#C99A5F',
  crateOld: '#8A5A33',
  crateOldDeep: '#6E4526',
  treeFoliage: '#57BB86',
  treeFoliageDeep: '#45AB76',
  treeTrunk: '#99756F',
  metal: '#C9D2E3',
  belt: '#3A4A73',
  statusOk: '#1FA653',
  okBg: '#E3F6EA',
  statusWarn: '#D87C00',
  warnBg: '#FFF1DF',
  statusCritical: '#E5484D',
  criticalBg: '#FDE8E8',
  ink900: '#0F172A',
  ink600: '#475569',
  ink400: '#5F6E85',
  card: '#FFFFFF',
  ...STATUS_EXTRA,
  zone: '#D6E4FF',
  zoneLine: '#F3CA6C',
  aisle: '#B8CDFF',
  aisleLine: '#F3CA6C',
  wallRib: '#DCE4F8',
  wallTop: '#F7F9FE',
  eaveTop: '#6EA7F9',
  conveyor: '#2C6FED',
  conveyorTop: '#5193F3',
  beltStripe: '#4A5C8A',
  beltTick: '#64769F',
  sack: '#F7F9FE',
  selectionPill: '#2C5BD8',
  pillBg: '#FFFFFF',
  pillFg: '#0F172A',
  pillBorder: '#0F172A',
  hemiSky: '#C4DAFC',
  hemiGround: '#9FB4F0',
  keyLight: '#FFFCF6',
  rimLight: '#C4DAFC',
  workLight: '#FFE3B0',
  aoColor: '#8EA6EC',
  contactShade: '#7F98E6',
  vignette: '#EAF0FA',
  voidGlow: '#F2F6FC',
};

/**
 * Dark "night shift" theme: docs/06 section 8, mirrored by the `.dark` block of src/index.css. The translucent pill
 * and row fills of section 8.4 are stored composited over the card, so every token stays a plain hex colour.
 */
export const DARK_TOKENS: PaletteTokens = {
  void: '#0E1730',
  floor: '#1E2E58',
  floorLine: '#3A5596',
  apron: '#17244A',
  truckYard: '#17244A',
  walkline: '#E8B93C',
  wall: '#2A3B68',
  wallAccent: '#3E73FF',
  brand: '#4C86F5',
  brandLight: '#6FA0F7',
  brandTint: '#172A4F',
  carton: '#C99D72',
  cartonTape: '#B0845C',
  palletBlue: '#4A7FF5',
  palletYellow: '#E8B93C',
  palletOrange: '#E98A4F',
  // the night look keeps its blue crates (Task 13 is light only)
  crateNew: '#4A7FF5',
  crateNewDeep: '#4A7FF5',
  crateOld: '#4A7FF5',
  crateOldDeep: '#4A7FF5',
  // not drawn at night (the ring road is light only); kept so the token set is the same in both themes
  treeFoliage: '#3F8F6B',
  treeFoliageDeep: '#357A5B',
  treeTrunk: '#6B5650',
  metal: '#8A9BC4',
  belt: '#2B3863',
  statusOk: '#3DDC84',
  okBg: '#1C3A48',
  statusWarn: '#FFB547',
  warnBg: '#37353F',
  statusCritical: '#FF6B6B',
  criticalBg: '#3B2C45',
  ink900: '#E8EDFF',
  ink600: '#A3B0D6',
  ink400: '#98A5CA',
  card: '#16203E',
  statusNeutral: '#A3B0D6',
  statusIdle: '#4A5A8A',
  statusOffline: '#6F7DA6',
  statusInfo: '#7EA2FF',
  zone: '#25386A',
  zoneLine: '#3A5596',
  aisle: '#1A2850',
  aisleLine: '#AA8E42',
  wallRib: '#344777',
  wallTop: '#3B5190',
  eaveTop: '#6E95FF',
  conveyor: '#4C7DFF',
  conveyorTop: '#6E95FF',
  beltStripe: '#3A4A7E',
  beltTick: '#5266A6',
  sack: '#D9E1F2',
  selectionPill: '#3468F0',
  pillBg: '#1C2A55',
  pillFg: '#E8EDFF',
  pillBorder: '#8CA5FF',
  hemiSky: '#6F86C9',
  hemiGround: '#1A2650',
  keyLight: '#B9C8FF',
  rimLight: '#7EA2FF',
  workLight: '#FFE3B0',
  aoColor: '#0A1330',
  contactShade: '#0F1A3A',
  vignette: '#0E1730',
  voidGlow: '#16244A',
};

/** Mix two hex colours, `t` = share of `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseInt(a.slice(1), 16);
  const cb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((ca >> shift) & 255) * (1 - t) + ((cb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`.toUpperCase();
}

/** `#RRGGBB` + alpha -> `rgba()` for DOM shadows built from tokens. */
export function hexAlpha(hex: string, alpha: number): string {
  const c = parseInt(hex.slice(1), 16);
  return `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${alpha})`;
}

/** Share of the floor colour in the storage props (docs/06 section 7.3). */
const STORAGE_FADE = 0.35;

export function derive(p: PaletteTokens, theme: SceneTheme): ScenePalette {
  const dark = theme === 'dark';
  return {
    ...p,
    slab: mixHex(p.apron, p.metal, 0.35),
    cabinet: p.metal,
    motor: p.palletYellow,
    motorGrille: mixHex(p.palletYellow, p.belt, 0.5),
    sackBand: p.brandLight,
    road: p.aisle,
    crateNewMid: mixHex(p.crateNew, p.crateNewDeep, 0.5),
    crateOldMid: mixHex(p.crateOld, p.crateOldDeep, 0.5),
    shutter: mixHex(p.wall, p.metal, 0.6),
    // docs/06 D4: no dark gaps around the door openings
    seal: mixHex(p.apron, p.metal, 0.6),
    leveller: p.metal,
    // docs/06 D5 (--brand-500) and section 8.1 (dock band / frames: --scene-wall-accent)
    doorFrame: dark ? p.wallAccent : p.brand,
    column: mixHex(p.wall, p.metal, 0.55),
    paintWhite: dark ? mixHex(p.floor, LIGHT_TOKENS.card, 0.35) : p.card,
    // the belt-mouth plate: towards the aisle in light, as the idle grey turned it lavender (docs/06 section 7.5)
    workZone: dark ? mixHex(p.zone, p.statusIdle, 0.2) : mixHex(p.zone, p.aisle, 0.4),
    hover: p.brandLight,
    selection: p.statusInfo,
    shade: p.contactShade,
    storagePallet: mixHex(p.palletBlue, p.floor, STORAGE_FADE),
    storageCarton: mixHex(p.carton, p.floor, STORAGE_FADE),
    storageTape: mixHex(p.cartonTape, p.floor, STORAGE_FADE),
    // sacks are the palest prop: on the night floor they need more fade to stay behind the bays
    storageSack: mixHex(p.sack, p.floor, dark ? 0.6 : STORAGE_FADE),
  };
}

export const LIGHT_PALETTE: ScenePalette = derive(LIGHT_TOKENS, 'light');
export const DARK_PALETTE: ScenePalette = derive(DARK_TOKENS, 'dark');

/** docs/06 section 1 token names for the palette keys (the CSS side of the mirror). */
export const CSS_TOKENS: readonly (readonly [keyof PaletteTokens, string])[] = [
  ['void', '--scene-void'],
  ['floor', '--scene-floor'],
  ['floorLine', '--scene-floor-line'],
  ['apron', '--scene-apron'],
  ['truckYard', '--scene-truck-yard'],
  ['walkline', '--scene-walkline'],
  ['wall', '--scene-wall'],
  ['wallAccent', '--scene-wall-accent'],
  ['brand', '--brand-500'],
  ['brandLight', '--brand-400'],
  ['brandTint', '--brand-50'],
  ['carton', '--carton'],
  ['cartonTape', '--carton-tape'],
  ['palletBlue', '--pallet-blue'],
  ['palletYellow', '--pallet-yellow'],
  ['palletOrange', '--pallet-orange'],
  ['crateNew', '--crate-new'],
  ['crateNewDeep', '--crate-new-deep'],
  ['crateOld', '--crate-old'],
  ['crateOldDeep', '--crate-old-deep'],
  ['treeFoliage', '--tree-foliage'],
  ['treeFoliageDeep', '--tree-foliage-deep'],
  ['treeTrunk', '--tree-trunk'],
  ['metal', '--metal'],
  ['belt', '--belt'],
  ['statusOk', '--ok'],
  ['okBg', '--ok-bg'],
  ['statusWarn', '--warn'],
  ['warnBg', '--warn-bg'],
  ['statusCritical', '--critical'],
  ['criticalBg', '--critical-bg'],
  ['ink900', '--ink-900'],
  ['ink600', '--ink-600'],
  ['ink400', '--ink-400'],
  ['statusNeutral', '--status-neutral'],
  ['statusIdle', '--status-idle'],
  ['statusOffline', '--status-offline'],
  ['statusInfo', '--status-info'],
  ['zone', '--scene-zone'],
  ['zoneLine', '--scene-zone-line'],
  ['aisle', '--scene-aisle'],
  ['aisleLine', '--scene-aisle-line'],
  ['wallRib', '--scene-wall-rib'],
  ['wallTop', '--scene-wall-top'],
  ['eaveTop', '--scene-eave-top'],
  ['conveyor', '--conveyor-frame'],
  ['conveyorTop', '--conveyor-top'],
  ['beltStripe', '--belt-stripe'],
  ['beltTick', '--belt-tick'],
  ['sack', '--sack'],
  ['selectionPill', '--selection-pill'],
  ['pillBg', '--scene-pill-bg'],
  ['pillFg', '--scene-pill-fg'],
  ['pillBorder', '--scene-pill-border'],
  ['hemiSky', '--scene-hemi-sky'],
  ['hemiGround', '--scene-hemi-ground'],
  ['keyLight', '--scene-key-light'],
  ['rimLight', '--scene-rim-light'],
  ['workLight', '--scene-work-light'],
  ['aoColor', '--scene-ao'],
  ['contactShade', '--scene-contact-shade'],
  ['vignette', '--scene-vignette'],
  ['voidGlow', '--scene-void-glow'],
];

/**
 * Only read the CSS once it carries the docs/06 token set. Older stylesheets define `--scene-floor` etc. with the
 * rejected step-06 values; `--scene-floor-line` exists only in the docs/06 set, so it marks the new tokens.
 */
const DOCS06_MARKER = '--scene-floor-line';

function normalizeHex(v: string): string | null {
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s))
    return `#${[...s.slice(1)].map((c) => c + c).join('')}`.toUpperCase();
  return null;
}

/**
 * Token values from the document, or nothing when the document does not show `theme` (UiPreferenceSync toggles
 * `.dark` on <html>; the dev preview themes a wrapper instead), has no DOM or predates the docs/06 tokens.
 */
function readTokens(theme: SceneTheme): Partial<PaletteTokens> {
  if (typeof document === 'undefined') return {};
  const root = document.documentElement;
  if (root.classList.contains('dark') !== (theme === 'dark')) return {};
  const style = getComputedStyle(root);
  if (!normalizeHex(style.getPropertyValue(DOCS06_MARKER))) return {};
  const out: Partial<PaletteTokens> = {};
  for (const [key, name] of CSS_TOKENS) {
    const hex = normalizeHex(style.getPropertyValue(name));
    if (hex) out[key] = hex;
  }
  return out;
}

let current: { theme: SceneTheme; palette: ScenePalette } | null = null;

/**
 * The palette for `theme`: the CSS tokens over the constants above, derived colours recomputed from the result.
 * The document is read on the first call and again only when the theme changes; every other call returns the
 * same object, so materials are not rebuilt.
 */
export function paletteFor(theme: SceneTheme): ScenePalette {
  if (current?.theme === theme) return current.palette;
  const base = theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  const palette = derive({ ...base, ...readTokens(theme) }, theme);
  current = { theme, palette };
  return palette;
}

/** Surface finish (docs/06 section 2): matte paint/plastic, or steel. */
export interface Finish {
  roughness: number;
  metalness: number;
}
export const MATTE: Finish = { roughness: 0.66, metalness: 0 };
export const STEEL: Finish = { roughness: 0.55, metalness: 0.4 };
const BELT: Finish = { roughness: 0.75, metalness: 0 };
const PLASTIC: Finish = { roughness: 0.58, metalness: 0 };

export function finishOf(tone: PaletteKey): Finish {
  switch (tone) {
    case 'metal':
    case 'cabinet':
    case 'leveller':
      return STEEL;
    case 'belt':
    case 'seal':
      return BELT;
    case 'palletBlue':
    case 'palletYellow':
    case 'palletOrange':
    case 'crateNew':
    case 'crateNewMid':
    case 'crateNewDeep':
    case 'crateOld':
    case 'crateOldMid':
    case 'crateOldDeep':
      return PLASTIC;
    default:
      return MATTE;
  }
}

/** Emissive intensity of a palette colour (docs/06 section 8.1-8.3): only the dark theme glows. */
export function emissiveOf(tone: PaletteKey, theme: SceneTheme): number {
  if (theme !== 'dark') return 0;
  switch (tone) {
    case 'wallAccent':
    case 'eaveTop':
    case 'doorFrame':
      return 0.15;
    case 'conveyor':
    case 'conveyorTop':
      return 0.08;
    case 'statusOk':
    case 'statusWarn':
    case 'statusNeutral':
    case 'statusIdle':
    case 'statusOffline':
    case 'statusCritical':
      return 0.6;
    default:
      return 0;
  }
}

/** One shared MeshStandardMaterial per palette colour, for the few non-instanced meshes (floor, plates). */
export type SceneMaterials = Record<PaletteKey, MeshStandardMaterial>;

export function createMaterials(p: ScenePalette, theme: SceneTheme = 'light'): SceneMaterials {
  const out = {} as Record<PaletteKey, MeshStandardMaterial>;
  for (const key of Object.keys(p) as PaletteKey[]) {
    out[key] = new MeshStandardMaterial({
      color: p[key],
      emissive: p[key],
      emissiveIntensity: emissiveOf(key, theme),
      ...finishOf(key),
    });
  }
  return out;
}

export function disposeMaterials(m: SceneMaterials): void {
  for (const mat of Object.values(m)) mat.dispose();
}
