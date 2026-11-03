import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { BAYS, settle, startPeak } from './mockSim';

// Task 19.9 / 19.9b screenshots, docs/screens/t19-*. Opt-in (PowerShell):
//   $env:T19_SHOTS='1'; pnpm exec playwright test e2e/t19-shots.spec.ts
// 1. KPI chip row and every reachable popover at 1366x768, 1920x1080, 2560x1440, EN and BN, light and dark, with a bay
//    inspector open (turnaround chip from 1700 px, PPE chip from 2000 px). Each popover is checked to stay inside the viewport
//    and off the chip row, the inspector card and the tray (decision D1).
// 2. Bay inspector: truck docked and waiting, loading, finished (post-op running), no truck; EN and BN; light and dark;
//    1366x768 and 1920x1080; plus the loading bay with "More details" open.
// 3. Tray filtered to an alert group after a click in the alerts popover, EN and BN.

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
test.skip(process.env.T19_SHOTS !== '1', 'screenshot pass, opt-in');
test.describe.configure({ timeout: 600_000 });

type Lang = 'en' | 'bn';
type Theme = 'light' | 'dark';
const VIEWPORTS = [
  { w: 1366, h: 768, chips: ['cartons', 'alerts'] },
  { w: 1920, h: 1080, chips: ['cartons', 'turnaround', 'alerts'] },
  { w: 2560, h: 1440, chips: ['cartons', 'turnaround', 'ppe', 'alerts'] },
] as const;

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(SCREENS, `t19-${name}.png`), animations: 'disabled' });

async function setLang(page: Page, lang: Lang) {
  await page.getByRole('button', { name: lang === 'bn' ? 'বাং' : 'EN', exact: true }).click();
  await expect(page.getByTestId('kpi-label-alerts')).toHaveText(
    lang === 'bn' ? 'মনোযোগ দরকার' : 'Needs attention',
  );
}

async function setTheme(page: Page, theme: Theme) {
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
  if ((await isDark()) !== (theme === 'dark')) await page.getByTestId('theme-toggle').click();
  await expect.poll(isDark).toBe(theme === 'dark');
}

async function simButton(page: Page, name: 'Pause' | 'Resume' | '1×' | '10×') {
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('region', { name: 'Simulator' }).getByRole('button', { name }).click();
  await page.keyboard.press('Control+Shift+D');
}

async function openLive(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/live');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 90_000 });
  await startPeak(page);
}

/** What the open popover covers or leaves (D1): the chip row, the inspector card, the tray, the viewport edge. */
async function popoverClashes(page: Page, id: string): Promise<string[]> {
  return page.evaluate((pid) => {
    const box = (tid: string) =>
      document.querySelector(`[data-testid="${tid}"]`)?.getBoundingClientRect();
    const pop = box(`kpidetail-${pid}`);
    if (!pop) return ['no popover'];
    const hit = (r: DOMRect | undefined) =>
      !!r && pop.left < r.right && r.left < pop.right && pop.top < r.bottom && r.top < pop.bottom;
    const out: string[] = [];
    for (const tid of ['kpi-chips', 'inspector', 'tray']) if (hit(box(tid))) out.push(tid);
    if (pop.left < 0 || pop.top < 0 || pop.right > innerWidth || pop.bottom > innerHeight)
      out.push('viewport');
    return out;
  }, id);
}

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`chips and popovers ${vp.w}x${vp.h} ${theme}`, async ({ page }) => {
      await openLive(page, vp.w, vp.h);
      await setTheme(page, theme);
      // a fixed picture for both languages, with a bay inspector open (D1: popovers never cover it)
      await simButton(page, 'Pause');
      await page.getByTestId('tray-bay-B02').click();
      await expect(page.getByTestId('inspector-bay')).toBeVisible();
      for (const lang of ['en', 'bn'] as const) {
        await setLang(page, lang);
        await settle(page, 1500);
        await shot(page, `chips-${vp.w}x${vp.h}-${theme}-${lang}`);
        for (const id of vp.chips) {
          await page.getByTestId(`kpi-open-${id}`).click();
          const panel = page.getByTestId(`kpidetail-${id}`);
          await expect(panel).toBeVisible();
          await expect(panel.getByRole('status')).toHaveCount(0);
          await settle(page, 600);
          expect(await popoverClashes(page, id), `${id} ${vp.w}x${vp.h} ${lang}`).toEqual([]);
          await shot(page, `pop-${id}-${vp.w}x${vp.h}-${theme}-${lang}`);
          await page.keyboard.press('Escape');
          await expect(panel).toHaveCount(0, { timeout: 20_000 }); // exit animation can start late under SwiftShader
        }
      }
      await setLang(page, 'en');
    });
  }
}

type BayShot = 'waiting' | 'loading' | 'postop' | 'empty';

/** The bay state the open inspector shows, from the timeline's own markers. */
async function inspectorState(page: Page): Promise<BayShot | null> {
  return page.getByTestId('inspector-bay').evaluate((el) => {
    if (el.querySelector('[data-testid="bay-timeline-empty"]')) return 'empty';
    const running = (id: string) =>
      el.querySelector(`[data-testid="bay-seg-${id}"]`)?.getAttribute('data-in-progress') ===
      'true';
    if (running('preOp')) return 'waiting';
    if (running('work')) return 'loading';
    if (running('postOp')) return 'postop';
    return null;
  });
}

/** Click through the bays until one shows `want`, then pause the simulator on it. */
async function findBay(page: Page, want: BayShot): Promise<string> {
  let found = '';
  await expect(async () => {
    for (const bay of BAYS) {
      await page.getByTestId(`tray-bay-${bay}`).click();
      await expect(page.getByTestId('inspector-bay')).toBeVisible();
      if ((await inspectorState(page)) === want) {
        await simButton(page, 'Pause');
        await page.getByTestId(`tray-bay-${bay}`).click();
        if ((await inspectorState(page)) === want) {
          found = bay;
          return;
        }
        await simButton(page, 'Resume');
      }
    }
    throw new Error(`no bay is ${want} yet`);
  }).toPass({ timeout: 300_000, intervals: [1_000] });
  return found;
}

async function shootBoth(page: Page, name: string) {
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    for (const lang of ['en', 'bn'] as const) {
      await setLang(page, lang);
      await settle(page, 1200);
      await shot(page, `${name}-${theme}-${lang}`);
    }
  }
  await setTheme(page, 'light');
  await setLang(page, 'en');
}

for (const vp of VIEWPORTS.slice(0, 2)) {
  test(`bay inspector states ${vp.w}x${vp.h}`, async ({ page }) => {
    await openLive(page, vp.w, vp.h);
    await simButton(page, '10×');
    for (const state of ['loading', 'waiting', 'postop', 'empty'] as const) {
      const bay = await findBay(page, state);
      await shootBoth(page, `bay-${state}-${vp.w}x${vp.h}`);
      if (state === 'loading') {
        // the card-inside-card look of "More details", open
        const toggle = page
          .getByTestId('bay-more')
          .getByRole('button', { name: 'Show more details' });
        await toggle.click();
        await expect(page.getByTestId('bay-more-body')).toBeVisible();
        await page.getByTestId('bay-more').scrollIntoViewIfNeeded();
        await shootBoth(page, `bay-more-${vp.w}x${vp.h}`);
        await page
          .getByTestId('bay-more')
          .getByRole('button', { name: 'Hide more details' })
          .click();
        await expect(page.getByTestId('bay-more-body')).toHaveCount(0);
      }
      test.info().annotations.push({ type: 'bay', description: `${state}: ${bay}` });
      await simButton(page, 'Resume');
    }
  });
}

test('tray filtered to an alert group, EN and BN', async ({ page }) => {
  await openLive(page, 1366, 768);
  await simButton(page, 'Pause');
  await page.getByTestId('kpi-open-alerts').click();
  const first = page.getByTestId(/^kpidetail-group-/).first();
  await expect(first).toBeVisible({ timeout: 60_000 });
  await first.click();
  await expect(page.getByTestId('tray-filter')).toBeVisible();
  for (const lang of ['en', 'bn'] as const) {
    await setLang(page, lang);
    await settle(page, 1200);
    await shot(page, `tray-filter-1366x768-${lang}`);
  }
  await setLang(page, 'en');
});
