import path from 'node:path';
import { expect, test } from './fixtures';
import { settle, startPeak } from './mockSim';

// Task 18 screenshots: a bay close-up on the belt, per quality tier and theme, docs/screens/t18-*. Opt-in:
// T18_SHOTS=1 pnpm exec playwright test e2e/t18-shots.spec.ts. Low draws no belt items (static actors), by design.

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
test.skip(process.env.T18_SHOTS !== '1', 'screenshot pass, opt-in');
test.describe.configure({ timeout: 300_000 });

for (const tier of ['high', 'med', 'low'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`bay close-up on the belt, ${tier}, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(`/live?quality=${tier}`);
      await expect(page.getByTestId('tray-bay-B04')).toBeVisible({ timeout: 90_000 });
      const toggle = page.getByTestId('theme-toggle');
      const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
      if ((await isDark()) !== (theme === 'dark')) await toggle.click();
      await startPeak(page, { speed: 10 });
      if (tier !== 'low') {
        const probe = () =>
          page.evaluate(
            () =>
              (window as unknown as { __actorProbe?: { itemBays: string[] } }).__actorProbe
                ?.itemBays ?? [],
          );
        await expect
          .poll(async () => (await probe()).length, { timeout: 180_000 })
          .toBeGreaterThan(0);
        const bay = (await probe())[0] ?? 'B04';
        await page.getByTestId(`tray-bay-${bay}`).click();
      } else {
        await page.getByTestId('tray-bay-B04').click();
      }
      await settle(page, 2500);
      await page.screenshot({ path: path.join(SCREENS, `t18-belt-${tier}-${theme}.png`) });
    });
  }
}
