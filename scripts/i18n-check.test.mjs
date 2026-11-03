// @vitest-environment node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkLocaleDirs,
  checkRegistered,
  compareLocales,
  declaredNamespaces,
} from './i18n-check.mjs';

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

describe('i18n-check namespace registration', () => {
  const index = (list) =>
    ['export const NAMESPACES = [', ...list.map((n) => `  '${n}',`), '] as const;'].join('\n');
  function rootWith(names) {
    const root = mkdtempSync(join(tmpdir(), 'i18n-reg-'));
    for (const lng of ['en', 'bn']) {
      mkdirSync(join(root, lng));
      for (const n of names) writeFileSync(join(root, lng, `${n}.json`), '{}');
    }
    return root;
  }

  it('parses the NAMESPACES list, multi-line or single-line', () => {
    expect(declaredNamespaces(index(['common', 'kpidetail']))).toEqual(['common', 'kpidetail']);
    expect(declaredNamespaces("export const NAMESPACES = ['a', 'b'] as const;")).toEqual([
      'a',
      'b',
    ]);
    expect(declaredNamespaces('nothing here')).toBeNull();
  });

  it('passes when files and registration agree', () => {
    expect(
      checkRegistered(rootWith(['common', 'baypanel']), index(['common', 'baypanel'])),
    ).toEqual([]);
  });

  it('reports an unregistered file and a registered namespace without a file', () => {
    expect(
      checkRegistered(rootWith(['common', 'kpidetail']), index(['common', 'baypanel'])),
    ).toEqual([
      'kpidetail.json: not registered in NAMESPACES',
      'baypanel: registered in NAMESPACES but has no locale file',
    ]);
  });

  it('the real index registers kpidetail and baypanel', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../src/i18n/index.ts', import.meta.url)),
      'utf8',
    );
    expect(declaredNamespaces(src)).toEqual(expect.arrayContaining(['kpidetail', 'baypanel']));
  });
});
