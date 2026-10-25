import path from 'node:path';
import { expect, test } from './fixtures';

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
const KINDS = ['siteState', 'bayState', 'actors', 'case', 'event', 'lifecycle', 'health'];

test('Ctrl+Shift+D shows status live, 7 bays received and 0 dropped', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/live');
  // mock mode renders after the MSW service worker has started
  await expect(page.getByTestId('live-page')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('debug-readout')).toHaveCount(0);

  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByTestId('debug-readout')).toBeVisible();
  await expect(page.getByTestId('debug-status')).toHaveText('live');
  await expect(page.getByTestId('debug-bays')).toHaveText('7');
  for (const kind of KINDS) {
    await expect(page.getByTestId(`debug-dropped-${kind}`)).toHaveText('0');
  }
  await expect(page.getByTestId('debug-received-bayState')).not.toHaveText('0');

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SCREENS, 'step-04-debug.png') });
});
