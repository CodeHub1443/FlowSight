// Fails when a key is missing from en.json or bn.json, or when a bn value is empty.
import { readFileSync } from 'node:fs';
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

export function compareLocales(en, bn) {
  const flatEn = flatten(en);
  const flatBn = flatten(bn);
  const errors = [];
  for (const key of Object.keys(flatEn)) {
    if (!(key in flatBn)) errors.push(`missing in bn.json: ${key}`);
  }
  for (const key of Object.keys(flatBn)) {
    if (!(key in flatEn)) errors.push(`missing in en.json: ${key}`);
  }
  for (const [key, value] of Object.entries(flatBn)) {
    if (typeof value !== 'string' || value.trim() === '') errors.push(`empty bn value: ${key}`);
  }
  return errors;
}

function main() {
  const read = (name) =>
    JSON.parse(
      readFileSync(fileURLToPath(new URL(`../src/i18n/${name}`, import.meta.url)), 'utf8'),
    );
  const errors = compareLocales(read('en.json'), read('bn.json'));
  if (errors.length > 0) {
    console.error(`i18n:check failed (${errors.length})`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('i18n:check ok');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
