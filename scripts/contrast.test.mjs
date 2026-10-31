// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// docs/06 section 8.4: every text/background pair must meet WCAG AA (4.5:1 text, 3:1 large text and graphics), checked
// in both themes. The pairs are read from src/index.css, not restated, so changing a token re-checks everything it
// touches. Read with node:fs because the Vitest config does not load CSS (css: false).

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);

function block(selector) {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('\n}', start));
  return new Map([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
}

const ROOT = block(':root');
const THEMES = { light: [ROOT], dark: [block('.dark'), ROOT] };

/** Value of a token with var() chains resolved; the first block that declares it wins. */
function token(theme, name) {
  const raw = THEMES[theme].map((b) => b.get(name)).find((v) => v !== undefined);
  if (raw === undefined) throw new Error(`no token ${name} in ${theme}`);
  const ref = raw.match(/^var\((--[a-z0-9-]+)\)$/)?.[1];
  return ref ? token(theme, ref) : raw.trim();
}

function parse(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const c = parseInt(hex, 16);
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255, 1];
  }
  const m = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (!m) throw new Error(`not a colour: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

const over = (top, under) => [
  top[0] * top[3] + under[0] * (1 - top[3]),
  top[1] * top[3] + under[1] * (1 - top[3]),
  top[2] * top[3] + under[2] * (1 - top[3]),
  1,
];

function luminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const GRAPHIC = 3;

/** [foreground, background, minimum]. Backgrounds may be translucent: they are composited over the card. */
const INKS = ['--ink-900', '--ink-600', '--ink-400'];
const SURFACES = ['--card', '--popover', '--muted', '--row-hover', '--row-selected'];
const STATUS = ['ok', 'warn', 'critical', 'neutral', 'info'];

const PAIRS = [
  // body text on every surface it appears on
  ...INKS.flatMap((ink) => SURFACES.map((s) => [ink, s, TEXT])),
  ['--ink-900', '--background', TEXT],
  ['--ink-600', '--background', TEXT],
  ['--ink-900', '--topbar-bg', TEXT],
  ['--ink-600', '--topbar-bg', TEXT],
  ['--ink-400', '--topbar-bg', TEXT],
  // pills: status text on its tint and on a card (tray counts, inspector values)
  ...STATUS.flatMap((s) => [
    [`--${s}-ink`, `--${s}-bg`, TEXT],
    [`--${s}-ink`, '--card', TEXT],
  ]),
  // idle and offline pills use ink, their own colour is too pale for text
  ['--ink-400', '--idle-bg', TEXT],
  ['--ink-400', '--offline-bg', TEXT],
  // text on solid fills
  ['--on-solid', '--tile-to', TEXT],
  ['--on-solid', '--selection-pill', TEXT],
  ['--primary-foreground', '--primary', TEXT],
  // bay pills in 3D (docs/06 section 8.4)
  ['--scene-pill-fg', '--scene-pill-bg', TEXT],
  // glyphs and bars are graphics: 3:1
  ['--on-solid', '--tile-from', GRAPHIC],
  ...STATUS.map((s) => [`--${s}`, '--card', GRAPHIC]),
];

describe('WCAG AA for every text/background token pair (docs/06 section 8.4)', () => {
  for (const theme of Object.keys(THEMES)) {
    const card = parse(token(theme, '--card'));
    for (const [fg, bg, min] of PAIRS) {
      it(`${theme}: ${fg} on ${bg} >= ${min}`, () => {
        const back = over(parse(token(theme, bg)), card);
        const front = over(parse(token(theme, fg)), back);
        expect(contrast(front, back)).toBeGreaterThanOrEqual(min);
      });
    }
  }

  it('fails a pair that is known to be below AA (the check itself works)', () => {
    expect(contrast(parse('#94a3b8'), parse('#ffffff'))).toBeLessThan(TEXT);
    expect(contrast(parse('#000000'), parse('#ffffff'))).toBeCloseTo(21, 5);
  });
});

describe('docs/06 section 8.1 layers', () => {
  const lum = (name) => luminance(parse(token('dark', name)));

  it('each layer is lighter than the one behind it', () => {
    const order = [
      '--scene-void',
      '--scene-apron',
      '--scene-floor',
      '--scene-zone',
      '--scene-wall',
      '--scene-wall-top',
      '--scene-wall-accent',
    ];
    for (let i = 1; i < order.length; i++) {
      expect(lum(order[i]), `${order[i]} over ${order[i - 1]}`).toBeGreaterThan(lum(order[i - 1]));
    }
  });

  it('nothing large is darker than the void', () => {
    for (const name of ['--scene-aisle', '--belt', '--scene-floor', '--scene-apron'])
      expect(lum(name), name).toBeGreaterThan(lum('--scene-void'));
  });
});
