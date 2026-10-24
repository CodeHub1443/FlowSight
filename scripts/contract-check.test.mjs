// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkBlocks, extractJsonBlocks } from './contract-check.mjs';

const script = fileURLToPath(new URL('./contract-check.mjs', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));
const doc = readFileSync(join(root, 'docs/03-data-contract.md'), 'utf8');

function run(args = []) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
}

function withDoc(markdown) {
  const dir = mkdtempSync(join(tmpdir(), 'contract-check-'));
  const file = join(dir, 'doc.md');
  writeFileSync(file, markdown);
  return file;
}

describe('extractJsonBlocks', () => {
  it('collects json fences with their heading and skips other fences', () => {
    const md = [
      '# T',
      '### 1.1 One',
      '```json',
      '{"a":1}',
      '```',
      '### 1.2 Two',
      '```ts',
      'type X = 1',
      '```',
      '```json',
      '{"b":2}',
      '```',
    ].join('\n');
    const blocks = extractJsonBlocks(md);
    expect(blocks.map((b) => [b.heading, b.text])).toEqual([
      ['1.1 One', '{"a":1}'],
      ['1.2 Two', '{"b":2}'],
    ]);
  });

  it('finds the 7 examples in docs/03, all under section 3', () => {
    const blocks = extractJsonBlocks(doc);
    expect(blocks).toHaveLength(7);
    expect(blocks.every((b) => /^3\.\d /.test(b.heading))).toBe(true);
  });
});

describe('checkBlocks', () => {
  const find = (h) => (h === 'ok' ? { fixture: 'f.json', validate: () => [] } : undefined);
  const read = () => ({ a: 1 });

  it('reports unmapped, invalid JSON, schema issues and fixture drift', () => {
    const blocks = [
      { heading: 'nope', text: '{}', line: 1 },
      { heading: 'ok', text: '{', line: 2 },
      { heading: 'ok', text: '{"a":2}', line: 3 },
      { heading: 'ok', text: '{"a":1}', line: 4 },
    ];
    const failures = checkBlocks(blocks, find, read);
    expect(failures).toHaveLength(3);
    expect(failures[0]).toContain('unmapped');
    expect(failures[1]).toContain('not valid JSON');
    expect(failures[2]).toContain('differs from fixture');
  });
});

describe('pnpm contract:check', () => {
  it('passes on docs/03-data-contract.md with 0 unmapped blocks', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('7 json blocks, 0 unmapped');
  }, 60_000);

  it('exits non-zero on an unmapped json block', () => {
    const file = withDoc(`${doc}\n\n### 9.9 Surprise\n\`\`\`json\n{"x":1}\n\`\`\`\n`);
    const r = run(['--doc', file]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('unmapped json block');
  }, 60_000);

  it('exits non-zero when an example no longer validates', () => {
    const file = withDoc(
      doc.replace(
        '"v": 1, "ts": "2026-10-24T19:50:45.500+06:00"',
        '"v": 2, "ts": "2026-10-24T19:50:45.500+06:00"',
      ),
    );
    const r = run(['--doc', file]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('3.3 ActorsFrame');
  }, 60_000);
});
