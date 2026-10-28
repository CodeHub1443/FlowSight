// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSS_TOKENS, DARK_TOKENS, LIGHT_TOKENS } from '../src/scene/materials';

// src/index.css is the token source; scene/materials.ts mirrors it (CLAUDE.md "Style"). The scene reads these names
// from the document at runtime, so a missing or drifted token would silently change the 3D colours. Read with
// node:fs because the Vitest config does not load CSS (css: false).

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);

/** Custom properties declared in the first `<selector> {` block. */
function cssBlock(selector) {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('\n}', start));
  return new Map([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
}

/** Value of `name` with var() chains resolved, the first block that declares it winning. */
function resolve(name, blocks) {
  const raw = blocks.map((b) => b.get(name)).find((v) => v !== undefined);
  const ref = raw?.match(/^var\((--[a-z0-9-]+)\)$/);
  if (ref) return resolve(ref[1], blocks);
  return raw?.trim().toUpperCase();
}

describe('src/index.css carries every token the scene reads', () => {
  const root = cssBlock(':root');
  const dark = cssBlock('.dark');

  it('light: every name resolves to the materials.ts value', () => {
    for (const [key, name] of CSS_TOKENS)
      expect(resolve(name, [root]), name).toBe(LIGHT_TOKENS[key]);
  });

  it('dark: every name resolves to the materials.ts dark value', () => {
    for (const [key, name] of CSS_TOKENS)
      expect(resolve(name, [dark, root]), name).toBe(DARK_TOKENS[key]);
  });

  it('keeps the docs/06 marker the scene gates on and no step-06 aliases', () => {
    expect(root.has('--scene-floor-line')).toBe(true);
    for (const old of ['floor-grid', 'wall-cap', 'conveyor', 'belt', 'ground', 'yard', 'road'])
      expect(css).not.toContain(`--scene-${old}:`);
  });
});
