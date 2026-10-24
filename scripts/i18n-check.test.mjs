// @vitest-environment node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareLocales } from './i18n-check.mjs';

const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

describe('i18n-check', () => {
  const en = fixture('en.json');

  it('passes when both locales match', () => {
    expect(compareLocales(en, fixture('bn-ok.json'))).toEqual([]);
  });

  it('reports a key missing from bn', () => {
    expect(compareLocales(en, fixture('bn-missing.json'))).toEqual(['missing in bn.json: a.two']);
  });

  it('reports a key missing from en', () => {
    expect(compareLocales(en, fixture('bn-extra.json'))).toEqual(['missing in en.json: c']);
  });

  it('reports an empty bn value', () => {
    expect(compareLocales(en, fixture('bn-empty.json'))).toEqual(['empty bn value: a.two']);
  });

  it('passes on the real locale files', () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./i18n-check.mjs', import.meta.url))],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
  });
});
