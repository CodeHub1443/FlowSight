import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { startPeak } from './mockSim';

// Task 19A (spec 5A): KPI chip detail popovers. Written in the parallel phase, RUN ONLY IN 19.9.
// 2560 px wide so all six chips show (PPE compliance from 2000 px, turnaround from 1700 px).
// Every popover value carries its raw store value in `data-value`; the checks read text and value in one evaluate (one
// consistent snapshot) and compare the text with the app's formatting of that value, in English and Bangla.

type Lang = 'en' | 'bn';
const POPOVERS = ['cartons', 'turnaround', 'ppe', 'alerts'] as const;

async function openLive(page: Page) {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/live');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
  await startPeak(page);
  await expect(page.getByTestId('kpi-cases')).toHaveText(/Cartons today\D*\d/);
}

const intl = (lang: Lang, pad = 1, grouping = true) =>
  new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-IN', {
    numberingSystem: lang === 'bn' ? 'beng' : 'latn',
    maximumFractionDigits: 0,
    minimumIntegerDigits: pad,
    useGrouping: grouping,
  });
const int = (n: number, lang: Lang) => intl(lang).format(n);
/** formatDurationMin: rounded minutes, "1h 05m" / "১ ঘ ০৫ মি", "45m" / "৪৫ মি". */
function durHM(min: number, lang: Lang): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const n = (v: number, pad = 1) => intl(lang, pad, false).format(v);
  if (lang === 'en') return h === 0 ? `${n(m)}m` : `${n(h)}h ${n(m, 2)}m`;
  return h === 0 ? `${n(m)} মি` : `${n(h)} ঘ ${n(m, 2)} মি`;
}

/** Text and raw store value of one popover value, read together. */
async function shown(page: Page, testId: string) {
  return page.getByTestId(`${testId}-value`).evaluate((el) => ({
    text: (el.textContent ?? '').trim(),
    raw: el.getAttribute('data-value'),
  }));
}

/** The displayed text equals `format(store value)`, or "—" when the store value is unknown. */
async function expectShowsStoreValue(
  page: Page,
  testId: string,
  format: (v: number) => string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const { text, raw } = await shown(page, testId);
        return raw === null ? text === '—' : text === format(Number(raw));
      },
      { message: testId },
    )
    .toBe(true);
}

async function openByKeyboard(page: Page, id: string): Promise<Locator> {
  await page.getByTestId(`kpi-open-${id}`).focus();
  await page.keyboard.press('Enter');
  const panel = page.getByTestId(`kpidetail-${id}`);
  await expect(panel).toBeVisible();
  // lazy body loaded
  await expect(panel.getByRole('status')).toHaveCount(0);
  return panel;
}

async function close(page: Page, id: string) {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(`kpidetail-${id}`)).toHaveCount(0);
}

const focusedPanel = (page: Page) =>
  page.evaluate(
    () =>
      document.activeElement?.closest('[data-testid^="kpidetail-"]')?.getAttribute('data-testid') ??
      null,
  );

async function setLang(page: Page, lang: Lang) {
  await page.getByRole('button', { name: lang === 'bn' ? 'বাং' : 'EN', exact: true }).click();
  await expect(page.getByTestId('kpi-label-alerts')).toHaveText(
    lang === 'bn' ? 'মনোযোগ দরকার' : 'Needs attention',
  );
}

/** Every number in the four popovers equals its store value, formatted for `lang`. */
async function checkNumbers(page: Page, lang: Lang) {
  const perHour = (v: number) =>
    lang === 'bn' ? `${int(Math.round(v), lang)}/ঘণ্টা` : `${int(Math.round(v), lang)}/h`;

  await openByKeyboard(page, 'cartons');
  await expectShowsStoreValue(page, 'kpidetail-cartons-out', (v) => int(v, lang));
  await expectShowsStoreValue(page, 'kpidetail-cartons-in', (v) => int(v, lang));
  await expectShowsStoreValue(page, 'kpidetail-rate-out', perHour);
  await expectShowsStoreValue(page, 'kpidetail-rate-in', perHour);
  // the chip headline is the same store value (the chip number tweens: poll)
  await expect
    .poll(async () => {
      const chip = (await page.getByTestId('kpi-cases').textContent()) ?? '';
      return chip.includes((await shown(page, 'kpidetail-cartons-out')).text);
    })
    .toBe(true);
  await close(page, 'cartons');

  const kind = await page.getByTestId('kpi-tat').getAttribute('data-kind');
  await openByKeyboard(page, 'turnaround');
  const dur = (v: number) => durHM(v, lang);
  await expectShowsStoreValue(page, 'kpidetail-turnaround-depot', dur);
  if (kind === 'full') {
    for (const row of ['occupancy', 'preop', 'work', 'postop'])
      await expectShowsStoreValue(page, `kpidetail-turnaround-${row}`, dur);
    await expectShowsStoreValue(page, 'kpidetail-turnaround-visits', (v) => int(v, lang));
    if ((await page.getByTestId('kpidetail-turnaround-waitdock').count()) > 0)
      await expectShowsStoreValue(page, 'kpidetail-turnaround-waitdock', dur);
    // the chip headline is the occupancy
    const occ = (await shown(page, 'kpidetail-turnaround-occupancy')).text;
    await expect(page.getByTestId('kpi-tat')).toContainText(occ);
  }
  await close(page, 'turnaround');

  await openByKeyboard(page, 'ppe');
  await expectShowsStoreValue(page, 'kpidetail-ppe-score', (v) => `${int(Math.round(v), lang)}%`);
  const worst = await shown(page, 'kpidetail-ppe-worst');
  if (worst.raw !== null) expect(worst.text).toContain(`(${int(Number(worst.raw), lang)})`);
  await close(page, 'ppe');

  await openByKeyboard(page, 'alerts');
  const split = page.getByTestId('kpidetail-alerts-split');
  await expect
    .poll(async () => {
      const s = await split.evaluate((el) => ({
        critical: Number(el.getAttribute('data-critical')),
        warn: Number(el.getAttribute('data-warn')),
        info: Number(el.getAttribute('data-info')),
        text: (el.textContent ?? '').trim(),
      }));
      const head = await shown(page, 'kpidetail-alerts-attention');
      const sev =
        lang === 'bn'
          ? `${int(s.critical, lang)} জরুরি, ${int(s.warn, lang)} সতর্কতা, ${int(s.info, lang)} তথ্য`
          : `${int(s.critical, lang)} critical, ${int(s.warn, lang)} warning, ${int(s.info, lang)} info`;
      // needs attention = warn + critical; info never inflates it
      return (
        Number(head.raw) === s.critical + s.warn &&
        head.text === int(s.critical + s.warn, lang) &&
        s.text === sev
      );
    })
    .toBe(true);
  // the chip shows the same counts
  for (const sev of ['critical', 'warn', 'info'] as const) {
    const el = page.getByTestId(`kpi-sev-${sev}`);
    await expect
      .poll(async () => {
        const raw = Number(await el.getAttribute('data-value'));
        return (await el.textContent()) === int(raw, lang);
      })
      .toBe(true);
  }
  await close(page, 'alerts');
}

test.describe('Task 19A: KPI chips and detail popovers', () => {
  test.setTimeout(240_000);

  test('popovers open by Enter, trap focus, close by Esc and outside click, never move the chip row', async ({
    page,
  }) => {
    await openLive(page);
    const row = page.getByTestId('kpi-chips');
    const before = await row.boundingBox();

    for (const id of POPOVERS) {
      const panel = await openByKeyboard(page, id);
      expect(await focusedPanel(page)).toBe(`kpidetail-${id}`);
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        expect(await focusedPanel(page), `focus trapped in ${id}`).toBe(`kpidetail-${id}`);
      }
      // anchored under its chip; the row did not move or grow
      const chip = await page.getByTestId(`kpi-open-${id}`).boundingBox();
      const box = await panel.boundingBox();
      expect((box?.y ?? 0) >= (chip?.y ?? 0) + (chip?.height ?? 0)).toBe(true);
      expect(await row.boundingBox()).toEqual(before);
      await close(page, id);
      await expect(page.getByTestId(`kpi-open-${id}`)).toBeFocused();
    }

    // outside click closes
    await page.getByTestId('kpi-open-cartons').click();
    await expect(page.getByTestId('kpidetail-cartons')).toBeVisible();
    const vp = page.viewportSize();
    await page.mouse.click((vp?.width ?? 0) / 2, (vp?.height ?? 0) / 2);
    await expect(page.getByTestId('kpidetail-cartons')).toHaveCount(0);
  });

  test('displayed numbers equal the store values, in English and Bangla', async ({ page }) => {
    await openLive(page);
    await checkNumbers(page, 'en');
    await setLang(page, 'bn');
    // Bangla labels in the popovers too
    await openByKeyboard(page, 'turnaround');
    await expect(page.getByTestId('kpidetail-turnaround')).toContainText('টার্নঅ্যারাউন্ড');
    await close(page, 'turnaround');
    await checkNumbers(page, 'bn');
    await setLang(page, 'en');
  });

  test('an alert group opens the Alerts tray filtered to that group', async ({ page }) => {
    await openLive(page);
    const panel = await openByKeyboard(page, 'alerts');
    const first = panel.getByTestId(/^kpidetail-group-/).first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    const group = await first.getAttribute('data-group');
    expect(group).not.toBeNull();
    await first.click();

    await expect(page.getByTestId('kpidetail-alerts')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /^Alerts/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const bar = page.getByTestId('tray-filter');
    await expect(bar).toHaveAttribute('data-group', group ?? '');
    const rows = page.locator('[data-testid^="tray-alert-"][data-alert-group]');
    await expect
      .poll(async () => {
        const groups = await rows.evaluateAll((els) =>
          els.map((e) => e.getAttribute('data-alert-group')),
        );
        return groups.length > 0 && groups.every((g) => g === group);
      })
      .toBe(true);

    // English and Bangla label on the filter bar
    await expect(bar).toContainText('Showing:');
    await setLang(page, 'bn');
    await expect(bar).toContainText('দেখানো হচ্ছে:');
    await setLang(page, 'en');

    await page.getByTestId('tray-filter-clear').click();
    await expect(page.getByTestId('tray-filter')).toHaveCount(0);
  });
});
