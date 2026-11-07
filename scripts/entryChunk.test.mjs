// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Build-output check (run `pnpm build` first; skipped when dist/ is absent): the lazy namespaces `events`,
// `reports` and `about` must not be in the /live entry chunk — each should land in its own route/dialog chunk.
// Rather than hard-coding a key path (which goes stale the moment a feature's JSON shape changes), each
// namespace's longest leaf string is found programmatically and used as the "does not appear" needle: long
// strings are unlikely to coincidentally match unrelated minified code.

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const built = existsSync(`${dist}/index.html`);

function longestLeafString(value, best = '') {
  if (typeof value === 'string') return value.length > best.length ? value : best;
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) best = longestLeafString(child, best);
  }
  return best;
}

function loadJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

const NAMESPACE_FILES = [
  '../src/i18n/locales/en/events.json',
  '../src/i18n/locales/bn/events.json',
  '../src/i18n/locales/en/reports.json',
  '../src/i18n/locales/bn/reports.json',
  '../src/i18n/locales/en/about.json',
  '../src/i18n/locales/bn/about.json',
];

const STRINGS = NAMESPACE_FILES.map((path) => longestLeafString(loadJson(path)));

// Accepted baseline from docs/progress/t22-9.md: 930,351 bytes for index-B35irfMK.js, plus a 1.0 kB
// (1,000 byte) tolerance for incidental build-hash/whitespace drift. A failure here means real feature code
// grew the entry chunk, not just a namespace leaking into it (that's STRINGS, above).
const ENTRY_BUDGET_BYTES = 930_351 + 1_000;

describe.skipIf(!built)('built entry chunk', () => {
  const html = built ? readFileSync(`${dist}/index.html`, 'utf8') : '';
  const entryFile = /src="\/(assets\/[^"]+\.js)"/.exec(html)?.[1] ?? '';
  const entryBuffer = entryFile ? readFileSync(`${dist}/${entryFile}`) : Buffer.alloc(0);
  const entry = entryBuffer.toString('utf8');

  it('finds the entry chunk', () => {
    expect(entry.length).toBeGreaterThan(100_000);
  });

  it('stays within the entry size budget', () => {
    expect(entryBuffer.length).toBeLessThanOrEqual(ENTRY_BUDGET_BYTES);
  });

  it.each(STRINGS)('does not contain %s', (s) => {
    expect(entry.includes(s)).toBe(false);
  });
});
