// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Build-output check (run `pnpm build` first; skipped when dist/ is absent): the strings of the lazy namespaces `events`
// and `reports` must not be in the /live entry chunk, and must be in some other chunk.

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const built = existsSync(`${dist}/index.html`);

const STRINGS = [
  JSON.parse(readFileSync(new URL('../src/i18n/locales/en/events.json', import.meta.url), 'utf8'))
    .page.stub,
  JSON.parse(readFileSync(new URL('../src/i18n/locales/bn/events.json', import.meta.url), 'utf8'))
    .page.stub,
  JSON.parse(readFileSync(new URL('../src/i18n/locales/en/reports.json', import.meta.url), 'utf8'))
    .page.stub,
  JSON.parse(readFileSync(new URL('../src/i18n/locales/bn/reports.json', import.meta.url), 'utf8'))
    .page.stub,
  JSON.parse(readFileSync(new URL('../src/i18n/locales/en/about.json', import.meta.url), 'utf8'))
    .description,
];

describe.skipIf(!built)('built entry chunk', () => {
  const html = built ? readFileSync(`${dist}/index.html`, 'utf8') : '';
  const entryFile = /src="\/(assets\/[^"]+\.js)"/.exec(html)?.[1] ?? '';
  const entry = entryFile ? readFileSync(`${dist}/${entryFile}`, 'utf8') : '';

  it('finds the entry chunk', () => {
    expect(entry.length).toBeGreaterThan(100_000);
  });

  it.each(STRINGS)('does not contain %s', (s) => {
    expect(entry.includes(s)).toBe(false);
  });
});
