// @vitest-environment node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkLocaleDirs, compareLocales } from './i18n-check.mjs';

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

describe('i18n-check namespaces', () => {
  function makeRoot(files) {
    const root = mkdtempSync(join(tmpdir(), 'i18n-ns-'));
    for (const lng of ['en', 'bn']) mkdirSync(join(root, lng));
    for (const [path, content] of Object.entries(files)) {
      writeFileSync(join(root, path), JSON.stringify(content));
    }
    return root;
  }

  it('passes when every namespace pair matches', () => {
    const root = makeRoot({
      'en/common.json': { a: 'x' },
      'bn/common.json': { a: 'y' },
      'en/live.json': {},
      'bn/live.json': {},
    });
    expect(checkLocaleDirs(root)).toEqual([]);
  });

  it('reports a key missing from bn, naming the namespace', () => {
    const root = makeRoot({
      'en/common.json': { a: 'x' },
      'bn/common.json': { a: 'y' },
      'en/live.json': { k: 'x', m: 'x' },
      'bn/live.json': { k: 'y' },
    });
    expect(checkLocaleDirs(root)).toEqual(['live.json: missing in bn.json: m']);
  });

  it('reports an empty bn value in a non-common namespace', () => {
    const root = makeRoot({ 'en/scene.json': { k: 'x' }, 'bn/scene.json': { k: ' ' } });
    expect(checkLocaleDirs(root)).toEqual(['scene.json: empty bn value: k']);
  });

  it('reports a namespace file present in one language only', () => {
    const root = makeRoot({ 'en/mock.json': {}, 'bn/admin.json': {} });
    expect(checkLocaleDirs(root).sort()).toEqual([
      'admin.json: file present in bn only',
      'mock.json: file present in en only',
    ]);
  });
});
