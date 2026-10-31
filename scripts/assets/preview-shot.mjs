// Screenshots of the dev asset preview (/dev/assets) from a Vite dev server on a real GPU; the route is not in builds.
//   node scripts/assets/preview-shot.mjs <out-prefix> "<query>" [...more "name|query" pairs]
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 5179;
const [, , outDir, ...shots] = process.argv;
const server = await createServer({
  root: ROOT,
  logLevel: 'warn',
  server: { port: PORT, strictPort: true, host: '127.0.0.1' },
});
await server.listen();
const browser = await chromium.launch({
  args: [
    '--use-angle=d3d11',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--force_high_performance_gpu',
  ],
});
const page = await (
  await browser.newContext({ viewport: { width: 1920, height: 1080 } })
).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
for (const shot of shots) {
  const [name, query] = shot.split('|');
  await page.goto(`http://127.0.0.1:${PORT}/dev/assets?${query}`, {
    timeout: 240_000,
    waitUntil: 'commit',
  });
  await page.getByTestId('asset-preview').waitFor({ timeout: 240_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('shot', name);
}
if (errors.length) console.log('ERRORS', errors.slice(0, 8));
await browser.close();
await server.close();
process.exit(0);
