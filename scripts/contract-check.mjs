// Doc <-> code guard: every ```json block in docs/03-data-contract.md must be mapped (by its section heading) to a
// schema, validate against it, and equal its fixture in src/domain/fixtures. Exits non-zero otherwise.
// TypeScript sources are loaded through Vite SSR, so no extra dependency is needed.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Extract every ```json fenced block with the heading it sits under. Other fences are skipped. */
export function extractJsonBlocks(markdown) {
  const blocks = [];
  let heading = '';
  let fence = null; // { lang, lines, heading, line }
  const lines = markdown.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (fence) {
      if (/^```\s*$/.test(line)) {
        if (fence.lang === 'json') {
          blocks.push({ heading: fence.heading, text: fence.lines.join('\n'), line: fence.line });
        }
        fence = null;
      } else {
        fence.lines.push(line);
      }
      return;
    }
    const open = /^```(\w*)\s*$/.exec(line);
    if (open) {
      fence = { lang: open[1], lines: [], heading, line: i + 1 };
      return;
    }
    const h = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (h) heading = h[1];
  });
  return blocks;
}

/**
 * Check blocks with a resolver `find(heading) -> { fixture, validate } | undefined` and a `readFixture(name)`.
 * Returns a list of human-readable failures (empty = ok).
 */
export function checkBlocks(blocks, find, readFixture) {
  const failures = [];
  for (const block of blocks) {
    const where = `docs/03 line ${block.line} ("${block.heading}")`;
    const spec = find(block.heading);
    if (!spec) {
      failures.push(`${where}: unmapped json block`);
      continue;
    }
    let json;
    try {
      json = JSON.parse(block.text);
    } catch (e) {
      failures.push(`${where}: not valid JSON (${e.message})`);
      continue;
    }
    const issues = spec.validate(json);
    for (const issue of issues) {
      failures.push(`${where}: ${issue.path || '(root)'}: ${issue.message}`);
    }
    if (issues.length === 0) {
      let fixture;
      try {
        fixture = readFixture(spec.fixture);
      } catch (e) {
        failures.push(`${where}: fixture ${spec.fixture} unreadable (${e.message})`);
        continue;
      }
      if (!isDeepStrictEqual(json, fixture)) {
        failures.push(`${where}: differs from fixture ${spec.fixture}`);
      }
    }
  }
  return failures;
}

async function main() {
  const args = process.argv.slice(2);
  const docIndex = args.indexOf('--doc');
  const docPath =
    docIndex >= 0
      ? args[docIndex + 1]
      : fileURLToPath(new URL('../docs/03-data-contract.md', import.meta.url));
  if (!docPath) {
    console.error('contract:check: --doc needs a path');
    process.exit(2);
  }
  const blocks = extractJsonBlocks(readFileSync(docPath, 'utf8'));

  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  let failures;
  try {
    const map = await server.ssrLoadModule('/src/domain/contractMap.ts');
    const readFixture = (name) =>
      JSON.parse(
        readFileSync(
          fileURLToPath(new URL(`../src/domain/fixtures/${name}`, import.meta.url)),
          'utf8',
        ),
      );
    failures = checkBlocks(blocks, map.findContractBlock, readFixture);
  } finally {
    await server.close();
  }

  if (failures.length > 0) {
    console.error(`contract:check failed (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`contract:check ok (${blocks.length} json blocks, 0 unmapped)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
