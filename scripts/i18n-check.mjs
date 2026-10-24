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

function main() {
  const root = fileURLToPath(new URL('../src/i18n/locales', import.meta.url));
  const errors = checkLocaleDirs(root);
  if (errors.length > 0) {
    console.error(`i18n:check failed (${errors.length})`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('i18n:check ok');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
