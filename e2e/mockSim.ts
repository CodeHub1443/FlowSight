import { expect, type Page } from '@playwright/test';

// Drives the mock simulator through its dev panel (Ctrl+Shift+D; compiled into the e2e build by VITE_DEBUG_PANEL=1).

export const BAYS = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07'] as const;

/**
 * Restart the simulator on the fixed evening-peak day (2026-10-24 19:20 Dhaka, default seed 1) and set the speed.
 * The page must be in English. Leaves the readout and simulator panel open when `keepPanel` is true.
 */
export async function startPeak(
  page: Page,
  { speed = 1, keepPanel = false }: { speed?: 1 | 10 | 60; keepPanel?: boolean } = {},
): Promise<void> {
  await page.keyboard.press('Control+Shift+D');
  const panel = page.getByRole('region', { name: 'Simulator' });
  await expect(panel).toContainText('History ready', { timeout: 60_000 });
  await panel.getByLabel('Start at').selectOption('peak');
  // the stores start fresh and the newest message time jumps back to the peak day
  await expect(page.getByTestId('debug-last-ts')).toHaveText(/^19:[2-5]\d:\d\d$/, {
    timeout: 60_000,
  });
  await expect(page.getByTestId('debug-bays')).toHaveText('7');
  if (speed !== 1) await panel.getByRole('button', { name: `${speed}×` }).click();
  if (!keepPanel) await page.keyboard.press('Control+Shift+D');
}

/** Belt status text of every bay, read from the tray's Bays tab. */
export async function beltStatuses(page: Page): Promise<string[]> {
  return Promise.all(
    BAYS.map(async (b) =>
      (
        (await page.getByTestId(`tray-bay-${b}`).locator('[data-tone]').first().textContent()) ?? ''
      ).trim(),
    ),
  );
}

export async function settle(page: Page, ms = 500): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}
