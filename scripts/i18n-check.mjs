// Fails when, in any namespace, a key is missing from one language, a bn value is empty,
// or a namespace file exists in only one language.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function flatten(obj, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') Object.assign(out, flatten(value, path));
    else out[path] = value;
  }
  return out;
}

/** Compare one en/bn pair. `label` prefixes every message (the namespace file name). */
export function compareLocales(en, bn, label = '') {
  const prefix = label ? `${label}: ` : '';
  const flatEn = flatten(en);
  const flatBn = flatten(bn);
  const errors = [];
  for (const key of Object.keys(flatEn)) {
    if (!(key in flatBn)) errors.push(`${prefix}missing in bn.json: ${key}`);
  }
  for (const key of Object.keys(flatBn)) {
    if (!(key in flatEn)) errors.push(`${prefix}missing in en.json: ${key}`);
  }
  for (const [key, value] of Object.entries(flatBn)) {
    if (typeof value !== 'string' || value.trim() === '')
      errors.push(`${prefix}empty bn value: ${key}`);
  }
  return errors;
}

const jsonFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
    : [];

/** Check every namespace under `<root>/en` and `<root>/bn`. */
export function checkLocaleDirs(root) {
  const read = (lng, file) => JSON.parse(readFileSync(`${root}/${lng}/${file}`, 'utf8'));
  const enFiles = jsonFiles(`${root}/en`);
  const bnFiles = jsonFiles(`${root}/bn`);
  const errors = [];
  for (const f of enFiles) if (!bnFiles.includes(f)) errors.push(`${f}: file present in en only`);
  for (const f of bnFiles) if (!enFiles.includes(f)) errors.push(`${f}: file present in bn only`);
  for (const f of enFiles) {
    if (bnFiles.includes(f)) errors.push(...compareLocales(read('en', f), read('bn', f), f));
  }
  return errors;
}

/** The `NAMESPACES` list declared in src/i18n/index.ts (parsed from source; no TS loader needed). */
export function declaredNamespaces(indexSource) {
  const m = /export const NAMESPACES = \[([^\]]*)\]/.exec(indexSource);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/**
 * Every locale file must be a registered namespace and every registered namespace must have a file (in en; the
 * en/bn pairing is checked by checkLocaleDirs). Catches a new namespace that i18next would never load.
 */
export function checkRegistered(root, indexSource) {
  const declared = declaredNamespaces(indexSource);
  if (declared === null) return ['src/i18n/index.ts: NAMESPACES list not found'];
  const files = jsonFiles(`${root}/en`).map((f) => f.replace(/\.json$/, ''));
  const errors = [];
  for (const f of files)
    if (!declared.includes(f)) errors.push(`${f}.json: not registered in NAMESPACES`);
  for (const ns of declared)
    if (!files.includes(ns)) errors.push(`${ns}: registered in NAMESPACES but has no locale file`);
  return errors;
}

function main() {
  const root = fileURLToPath(new URL('../src/i18n/locales', import.meta.url));
  const index = readFileSync(
    fileURLToPath(new URL('../src/i18n/index.ts', import.meta.url)),
    'utf8',
  );
  const errors = [...checkLocaleDirs(root), ...checkRegistered(root, index)];
  if (errors.length > 0) {
    console.error(`i18n:check failed (${errors.length})`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('i18n:check ok');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
