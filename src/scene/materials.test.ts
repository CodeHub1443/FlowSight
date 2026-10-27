// @vitest-environment node
import { describe, expect, it } from 'vitest';
import doc from '../../docs/06-visual-language.md?raw';
import {
  CSS_TOKENS,
  DARK_TOKENS,
  LIGHT_PALETTE,
  LIGHT_TOKENS,
  finishOf,
  type PaletteKey,
  type PaletteTokens,
} from './materials';

// docs/06 section 1 is binding: the fallback constants in materials.ts must equal the table exactly. The table is
// parsed from the document itself, so editing either side without the other fails here.

/** docs/06 token -> palette keys, in the order the row lists its values. */
const KEYS: Record<string, (keyof PaletteTokens)[]> = {
  '--scene-void': ['void'],
  '--scene-floor': ['floor'],
  '--scene-floor-line': ['floorLine'],
  '--scene-apron': ['apron'],
  '--scene-walkline': ['walkline'],
  '--scene-wall': ['wall'],
  '--scene-wall-accent': ['wallAccent'],
  '--brand-500': ['brand'],
  '--brand-400': ['brandLight'],
  '--brand-50': ['brandTint'],
  '--carton': ['carton', 'cartonTape'],
  '--pallet-blue': ['palletBlue'],
  '--pallet-yellow': ['palletYellow'],
  '--pallet-orange': ['palletOrange'],
  '--metal': ['metal'],
  '--belt': ['belt'],
  '--ok': ['statusOk', 'okBg'],
  '--warn': ['statusWarn', 'warnBg'],
  '--critical': ['statusCritical', 'criticalBg'],
  '--ink-900': ['ink900'],
  '--ink-600': ['ink600'],
  '--ink-400': ['ink400'],
  '--card': ['card'],
};

const section1 = doc.slice(doc.indexOf('## 1.'), doc.indexOf('## 2.'));

/** [token names, hex values] for every `| \`--token\` | ... |` row of the section 1 table. */
function tableRows(): [string[], string[]][] {
  return section1
    .split('\n')
    .filter((l) => l.startsWith('| `--'))
    .map((l) => {
      const [, names = '', values = ''] = l.split('|');
      return [names.match(/--[a-z0-9-]+/g) ?? [], values.match(/#[0-9A-Fa-f]{6}/g) ?? []];
    });
}

/** palette key -> docs/06 hex. */
function expected(): Map<keyof PaletteTokens, string> {
  const out = new Map<keyof PaletteTokens, string>();
  for (const [names, values] of tableRows()) {
    const keys =
      names.length > 1 ? names.flatMap((n) => KEYS[n] ?? []) : (KEYS[names[0] ?? ''] ?? []);
    expect(keys.length, `docs/06 row ${names.join(' ')} is mapped`).toBe(values.length);
    keys.forEach((k, i) => out.set(k, (values[i] ?? '').toUpperCase()));
  }
  return out;
}

describe('materials.ts mirrors docs/06 section 1', () => {
  it('parses the whole table', () => {
    expect(tableRows().length).toBe(19);
    expect(expected().size).toBe(Object.values(KEYS).flat().length);
  });

  it('light fallbacks equal the docs/06 values exactly', () => {
    for (const [key, hex] of expected()) expect(LIGHT_TOKENS[key], key).toBe(hex);
  });

  it('dark fallbacks equal the docs/06 dark values (void, floor, card)', () => {
    const m = section1.match(
      /void `(#[0-9A-F]{6})`, floor `(#[0-9A-F]{6})`, cards `(#[0-9A-F]{6})`/i,
    );
    expect(m).not.toBeNull();
    expect(DARK_TOKENS.void).toBe(m?.[1]?.toUpperCase());
    expect(DARK_TOKENS.floor).toBe(m?.[2]?.toUpperCase());
    expect(DARK_TOKENS.card).toBe(m?.[3]?.toUpperCase());
  });

  it('reads every docs/06 token name from CSS (except --card, which is not a plain hex)', () => {
    const names = new Set(CSS_TOKENS.map(([, n]) => n));
    for (const [doc06, keys] of Object.entries(KEYS)) {
      if (doc06 === '--card') continue;
      expect(names.has(doc06), doc06).toBe(true);
      for (const k of keys)
        expect(
          CSS_TOKENS.some(([key]) => key === k),
          k,
        ).toBe(true);
    }
  });

  it('uses no pure black and keeps the belt the darkest light-theme colour (docs/06 section 2)', () => {
    const lum = (hex: string) => {
      const c = parseInt(hex.slice(1), 16);
      return 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
    };
    const scene = (Object.keys(LIGHT_PALETTE) as PaletteKey[]).filter(
      (k) => !k.startsWith('ink') && k !== 'shade',
    );
    for (const k of scene) {
      expect(LIGHT_PALETTE[k], k).not.toBe('#000000');
      expect(lum(LIGHT_PALETTE[k]), k).toBeGreaterThanOrEqual(lum(LIGHT_PALETTE.belt) - 1);
    }
  });

  it('gives matte surfaces roughness 0.55-0.75 and metalness 0, steel metalness 0.4', () => {
    for (const k of Object.keys(LIGHT_PALETTE) as PaletteKey[]) {
      const f = finishOf(k);
      expect(f.roughness, k).toBeGreaterThanOrEqual(0.55);
      expect(f.roughness, k).toBeLessThanOrEqual(0.75);
      expect([0, 0.4]).toContain(f.metalness);
    }
    expect(finishOf('metal').metalness).toBe(0.4);
    expect(finishOf('carton').metalness).toBe(0);
  });
});
