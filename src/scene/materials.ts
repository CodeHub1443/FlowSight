import { MeshStandardMaterial } from 'three';

// Scene palette (docs/04 section 1). The values mirror the --scene-* and --status-* tokens in src/index.css
// (CSS is the source of truth for the tokens listed under "Requests to main session" in docs/progress/step-06.md);
// the keys without a CSS token yet are scene-only constants. Site facade colours are physical paint and come from config.

export type SceneTheme = 'light' | 'dark';

export interface ScenePalette {
  // --scene-* tokens
  void: string;
  floor: string;
  floorGrid: string;
  walkline: string;
  wall: string;
  wallCap: string;
  apron: string;
  conveyor: string;
  belt: string;
  // scene-only
  floorPatchDark: string;
  floorPatchLight: string;
  slab: string;
  steel: string;
  cabinet: string;
  motor: string;
  motorGrille: string;
  palletBlue: string;
  palletYellow: string;
  palletOrange: string;
  carton: string;
  cartonDark: string;
  sack: string;
  sackBand: string;
  crate: string;
  shutter: string;
  seal: string;
  leveller: string;
  column: string;
  paintWhite: string;
  plate: string;
  workZone: string;
  hover: string;
  // status tokens
  statusOk: string;
  statusWarn: string;
  statusCritical: string;
  statusNeutral: string;
  statusIdle: string;
  statusOffline: string;
  statusInfo: string;
  brand: string;
}

const STATUS = {
  statusOk: '#16A34A',
  statusWarn: '#F59E0B',
  statusCritical: '#DC2626',
  statusNeutral: '#64748B',
  statusIdle: '#CBD5E1',
  statusOffline: '#94A3B8',
  statusInfo: '#2563EB',
} as const;

export const LIGHT_PALETTE: ScenePalette = {
  void: '#E8EBF7',
  floor: '#DCE7DF',
  floorGrid: '#C3D2C8',
  walkline: '#F2C94C',
  wall: '#F7F8FC',
  wallCap: '#1F36C7',
  apron: '#DDE1F2',
  conveyor: '#2F55B8',
  belt: '#3A3F4A',
  floorPatchDark: '#C9DACE',
  floorPatchLight: '#E6EEE8',
  slab: '#C7CFE3',
  steel: '#C4CAD3',
  cabinet: '#AEB4BF',
  motor: '#F0B90B',
  motorGrille: '#7A6A2A',
  palletBlue: '#3F6FE0',
  palletYellow: '#F2C94C',
  palletOrange: '#F08A3C',
  carton: '#C9A46A',
  cartonDark: '#B08B52',
  sack: '#F4F4F0',
  sackBand: '#5B8DEF',
  crate: '#2F63D6',
  shutter: '#B7BFD6',
  seal: '#2B2F3A',
  leveller: '#8C95A8',
  column: '#B9BFCC',
  paintWhite: '#FFFFFF',
  plate: '#1F36C7',
  workZone: mixHex('#DCE7DF', STATUS.statusNeutral, 0.3),
  hover: '#93C5FD',
  brand: '#1F36C7',
  ...STATUS,
};

export const DARK_PALETTE: ScenePalette = {
  ...LIGHT_PALETTE,
  void: '#0E1424',
  floor: '#1B2430',
  floorGrid: '#273341',
  walkline: '#D9B23F',
  wall: '#1A2238',
  wallCap: '#4D63E8',
  apron: '#151C30',
  conveyor: '#3C64CC',
  belt: '#2A2E37',
  floorPatchDark: '#16202A',
  floorPatchLight: '#222D3A',
  slab: '#151C30',
  steel: '#8E96A4',
  cabinet: '#7C828D',
  motor: '#D9A908',
  motorGrille: '#5A4E1E',
  palletBlue: '#3562CC',
  palletYellow: '#D9B23F',
  palletOrange: '#D9782F',
  carton: '#A88955',
  cartonDark: '#8F733F',
  sack: '#D8D8D2',
  sackBand: '#4A78D8',
  crate: '#2955B8',
  shutter: '#5C6482',
  seal: '#12141A',
  leveller: '#6B7385',
  column: '#4A5266',
  paintWhite: '#C9CFE0',
  plate: '#4D63E8',
  workZone: mixHex('#1B2430', STATUS.statusNeutral, 0.3),
  hover: '#6F8FD8',
  brand: '#4D63E8',
};

/** Palette keys backed by a CSS token in src/index.css. `workZone` is derived from `floor`. */
const CSS_TOKENS: readonly (readonly [PaletteKey, string])[] = [
  ['void', '--scene-void'],
  ['floor', '--scene-floor'],
  ['floorGrid', '--scene-floor-grid'],
  ['walkline', '--scene-walkline'],
  ['wall', '--scene-wall'],
  ['wallCap', '--scene-wall-cap'],
  ['apron', '--scene-apron'],
  ['conveyor', '--scene-conveyor'],
  ['belt', '--scene-belt'],
  ['statusOk', '--status-ok'],
  ['statusWarn', '--status-warn'],
  ['statusCritical', '--status-critical'],
  ['statusNeutral', '--status-neutral'],
  ['statusIdle', '--status-idle'],
  ['statusOffline', '--status-offline'],
  ['statusInfo', '--status-info'],
];

function normalizeHex(v: string): string | null {
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s))
    return `#${[...s.slice(1)].map((c) => c + c).join('')}`.toUpperCase();
  return null;
}

/**
 * Token values from the document, or nothing when the document does not show `theme` (UiPreferenceSync toggles
 * `.dark` on <html>; the dev preview themes a wrapper instead) or there is no DOM. Non-hex values are skipped.
 */
function readTokens(theme: SceneTheme): Partial<ScenePalette> {
  if (typeof document === 'undefined') return {};
  const root = document.documentElement;
  if (root.classList.contains('dark') !== (theme === 'dark')) return {};
  const style = getComputedStyle(root);
  const out: Partial<ScenePalette> = {};
  for (const [key, name] of CSS_TOKENS) {
    const hex = normalizeHex(style.getPropertyValue(name));
    if (hex) out[key] = hex;
  }
  return out;
}

let current: { theme: SceneTheme; palette: ScenePalette } | null = null;

/**
 * The palette for `theme`: the CSS tokens over the constants above. The document is read on the first call and
 * again only when the theme changes; every other call returns the same object, so materials are not rebuilt.
 */
export function paletteFor(theme: SceneTheme): ScenePalette {
  if (current?.theme === theme) return current.palette;
  const base = theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
  const tokens = readTokens(theme);
  const palette: ScenePalette = { ...base, ...tokens };
  if (tokens.floor || tokens.statusNeutral)
    palette.workZone = mixHex(palette.floor, palette.statusNeutral, 0.3);
  current = { theme, palette };
  return palette;
}

/** Mix two hex colours, `t` = share of `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseInt(a.slice(1), 16);
  const cb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((ca >> shift) & 255) * (1 - t) + ((cb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

export type PaletteKey = keyof ScenePalette;

/** One shared MeshStandardMaterial per palette colour (matte, roughness 0.9; steel is semi-gloss). */
export type SceneMaterials = Record<PaletteKey, MeshStandardMaterial>;

export function createMaterials(p: ScenePalette): SceneMaterials {
  const out = {} as Record<PaletteKey, MeshStandardMaterial>;
  for (const key of Object.keys(p) as PaletteKey[]) {
    const shiny = key === 'steel';
    out[key] = new MeshStandardMaterial({
      color: p[key],
      roughness: shiny ? 0.4 : 0.9,
      metalness: shiny ? 0.25 : 0,
    });
  }
  return out;
}

export function disposeMaterials(m: SceneMaterials): void {
  for (const mat of Object.values(m)) mat.dispose();
}
