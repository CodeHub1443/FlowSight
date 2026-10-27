import { MeshStandardMaterial } from 'three';

// Scene palette. The token values are docs/06-visual-language.md section 1 (binding) and are mirrored by the CSS
// tokens in src/index.css; `materials.test.ts` parses the docs/06 table and fails if a fallback below drifts.
// Every other scene colour is derived from these tokens (see `derive`), so nothing outside this file is a literal
// colour. Site facade colours are physical paint and come from config (the one allowed exception).

export type SceneTheme = 'light' | 'dark';

/** Colours named by docs/06 section 1 (plus the four status tokens docs/06 does not redefine). */
export interface PaletteTokens {
  void: string;
  floor: string;
  floorLine: string;
  apron: string;
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
}

/** Scene colours derived from the tokens (mixes only, no new literals). */
export interface DerivedColors {
  slab: string;
  cabinet: string;
  motor: string;
  motorGrille: string;
  sack: string;
  sackBand: string;
  crate: string;
  shutter: string;
  seal: string;
  leveller: string;
  column: string;
  paintWhite: string;
  workZone: string;
  hover: string;
  selection: string;
  /** Tint of ambient occlusion and contact shadows: a dark blue, never black. */
  shade: string;
  /** Light colours: white key and softbox, cool periwinkle sky fill (theme-independent; the dark theme darkens
   *  surfaces, not the lights). */
  keyLight: string;
  /** Hemisphere light: sky and ground. */
  skyFill: string;
  groundFill: string;
}

export type ScenePalette = PaletteTokens & DerivedColors;
export type PaletteKey = keyof ScenePalette;

const STATUS_EXTRA = {
  statusNeutral: '#64748B',
  statusIdle: '#CBD5E1',
  statusOffline: '#94A3B8',
  statusInfo: '#2563EB',
} as const;

/** docs/06 section 1, light theme (exact values). */
export const LIGHT_TOKENS: PaletteTokens = {
  void: '#E6ECFA',
  floor: '#EEF2FC',
  floorLine: '#D4DEF7',
  apron: '#DCE4F8',
  walkline: '#F2C94C',
  wall: '#F7F9FE',
  wallAccent: '#3D6AE4',
  brand: '#2C6FED',
  brandLight: '#5193F3',
  brandTint: '#EAF2FF',
  carton: '#E9C6A2',
  cartonTape: '#D9AE80',
  palletBlue: '#3F7BF0',
  palletYellow: '#F5C542',
  palletOrange: '#F59E5B',
  metal: '#C9D2E3',
  belt: '#2E3445',
  statusOk: '#22AF5B',
  okBg: '#E3F6EA',
  statusWarn: '#E8890C',
  warnBg: '#FFF1DF',
  statusCritical: '#E5484D',
  criticalBg: '#FDE8E8',
  ink900: '#0F172A',
  ink600: '#475569',
  ink400: '#94A3B8',
  card: '#FFFFFF',
  ...STATUS_EXTRA,
};

/**
 * Dark "control room" theme. docs/06 fixes void `#0B1222`, floor `#141C2F` and card `#121A2B`; the rest mirrors
 * the light tokens at lower value (scene-only until the main session adds dark --scene-* tokens).
 */
export const DARK_TOKENS: PaletteTokens = {
  ...LIGHT_TOKENS,
  void: '#0B1222',
  floor: '#141C2F',
  floorLine: '#22304F',
  apron: '#101829',
  walkline: '#D9B23F',
  wall: '#1C2640',
  wallAccent: '#4A78EE',
  brand: '#3B7CF2',
  brandLight: '#5C9BF5',
  brandTint: '#1A2A4F',
  carton: '#B9987A',
  cartonTape: '#A5835F',
  palletBlue: '#3A6FDA',
  palletYellow: '#D8AE3C',
  palletOrange: '#D98A52',
  metal: '#7E8AA3',
  okBg: '#12301F',
  warnBg: '#33240F',
  criticalBg: '#3A1A1D',
  ink900: '#E6ECFA',
  ink600: '#A9B4C8',
  ink400: '#6B7894',
  card: '#121A2B',
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

export function derive(p: PaletteTokens, theme: SceneTheme): ScenePalette {
  const dark = theme === 'dark';
  return {
    ...p,
    slab: mixHex(p.apron, p.metal, 0.35),
    cabinet: p.metal,
    motor: p.palletYellow,
    motorGrille: mixHex(p.palletYellow, p.belt, 0.5),
    // physical white goods stay light in the dark theme, a little dimmed
    sack: dark ? mixHex(LIGHT_TOKENS.wall, p.metal, 0.35) : p.wall,
    sackBand: p.brandLight,
    crate: p.palletBlue,
    shutter: mixHex(p.wall, p.metal, 0.6),
    seal: mixHex(p.belt, p.metal, 0.18),
    leveller: p.metal,
    column: mixHex(p.wall, p.metal, 0.55),
    paintWhite: dark ? mixHex(p.floor, LIGHT_TOKENS.card, 0.35) : p.card,
    workZone: mixHex(p.floor, p.statusIdle, dark ? 0.12 : 0.32),
    hover: p.brandLight,
    selection: p.statusInfo,
    shade: mixHex(p.belt, p.brand, 0.22),
    keyLight: LIGHT_TOKENS.card,
    skyFill: mixHex(LIGHT_TOKENS.brandTint, LIGHT_TOKENS.brandLight, 0.25),
    groundFill: mixHex(p.floor, p.brand, 0.08),
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
    case 'crate':
      return PLASTIC;
    default:
      return MATTE;
  }
}

/** One shared MeshStandardMaterial per palette colour, for the few non-instanced meshes (floor, plates). */
export type SceneMaterials = Record<PaletteKey, MeshStandardMaterial>;

export function createMaterials(p: ScenePalette): SceneMaterials {
  const out = {} as Record<PaletteKey, MeshStandardMaterial>;
  for (const key of Object.keys(p) as PaletteKey[]) {
    out[key] = new MeshStandardMaterial({ color: p[key], ...finishOf(key) });
  }
  return out;
}

export function disposeMaterials(m: SceneMaterials): void {
  for (const mat of Object.values(m)) mat.dispose();
}
