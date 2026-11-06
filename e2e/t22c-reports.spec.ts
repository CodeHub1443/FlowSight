import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Task 22C: /reports shift and daily reports (docs/tasks/t22-spec.md section 5).
// WRITTEN in the parallel phase, NOT RUN in 22C (no browser, no Playwright). 22.9 runs it first and reads the screenshots.
// Mock mode: the data is simulated, so the checks are structural (sections, page counts, bytes of the CSV), never sample numbers.
//
// Run: pnpm exec playwright test e2e/t22c-reports.spec.ts

const LANG_KEY = 'depot.pref.language';
/** A4 portrait at 96 dpi. */
const A4 = { width: 794, height: 1123 };
const MAX_PAGES = 3;

type Lang = 'en' | 'bn';

async function openReport(page: Page, lang: Lang, query = '') {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    [LANG_KEY, lang],
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/reports${query}`);
  await expect(page.getByTestId('report-document')).toBeVisible({ timeout: 60_000 });
  // the print button waits for the evidence thumbnails; it is the "ready" signal
  await expect(page.getByTestId('report-print')).toBeEnabled({ timeout: 60_000 });
}

/** Pages in a PDF buffer, without a library: count page objects, falling back to the largest /Count of the page tree. */
function pdfPageCount(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const pages = text.match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
  if (pages > 0) return pages;
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return counts.length > 0 ? Math.max(...counts) : 0;
}

/** Drop one leading byte-order mark (U+FEFF) from decoded text. */
const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

async function bytesOf(download: Download): Promise<Buffer> {
  const path = await download.path();
  return readFile(path);
}

for (const lang of ['en', 'bn'] as const) {
  test.describe(`/reports in ${lang}`, () => {
    test('screen: the document is readable at 1366 px with every section and no page overflow', async ({
      page,
    }) => {
      await openReport(page, lang);
      const doc = page.getByTestId('report-document');
      for (const id of ['header', 'headlines', 'handover', 'bays', 'trucks', 'evidence', 'sku']) {
        await expect(doc.getByTestId(`report-${id}`)).toBeVisible();
      }
      await expect(doc.getByTestId('report-bay-row')).toHaveCount(7);
      await expect(doc.getByTestId('report-bays-total')).toBeVisible();
      await expect(doc.getByTestId('report-simulated')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: `docs/screens/t22c-screen-${lang}-1366x768.png`,
        fullPage: true,
      });
    });

    test('print: bundled Bangla font is loaded, chrome is hidden, footer shows, A4 screenshot', async ({
      page,
    }) => {
      await openReport(page, lang);
      if (lang === 'bn') {
        const loaded = await page.evaluate(async () => {
          await document.fonts.ready;
          let ok = false;
          document.fonts.forEach((f) => {
            if (f.family.includes('Noto Sans Bengali') && f.status === 'loaded') ok = true;
          });
          return ok;
        });
        expect(loaded, 'Noto Sans Bengali must be loaded from the bundle, not a system font').toBe(
          true,
        );
      }
      await page.emulateMedia({ media: 'print' });
      await page.setViewportSize(A4);
      await expect(page.getByTestId('report-controls')).toBeHidden();
      await expect(page.getByTestId('report-footer')).toBeVisible();
      await expect(page.getByTestId('report-footer')).toContainText(
        lang === 'bn' ? 'কর্তৃক তৈরি' : 'Developed by',
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'nothing may run past the A4 width').toBeLessThanOrEqual(0);
      await page.screenshot({
        path: `docs/screens/t22c-print-${lang}-a4.png`,
        fullPage: true,
      });
    });

    for (const which of ['current', 'previous'] as const) {
      test(`print: the ${which} shift fits in ${MAX_PAGES} A4 pages (page.pdf)`, async ({
        page,
      }) => {
        await openReport(page, lang);
        if (which === 'previous') {
          await page
            .getByRole('radio', { name: lang === 'bn' ? 'আগের শিফট' : 'Previous shift' })
            .click();
          await expect(page.getByTestId('report-document')).toHaveAttribute(
            'data-state',
            'complete',
            { timeout: 60_000 },
          );
          await expect(page.getByTestId('report-print')).toBeEnabled({ timeout: 60_000 });
        }
        await page.emulateMedia({ media: 'print' });
        const pdf = await page.pdf({
          format: 'A4',
          preferCSSPageSize: true,
          printBackground: true,
        });
        const pages = pdfPageCount(pdf);
        expect(pages, 'the PDF has pages').toBeGreaterThan(0);
        expect(pages, `a full shift prints to at most ${MAX_PAGES} A4 pages`).toBeLessThanOrEqual(
          MAX_PAGES,
        );
        // Report the count so 22.9 can see how much room is left.
        test
          .info()
          .annotations.push({ type: 'pdf-pages', description: `${lang} ${which}: ${pages}` });
        await page.screenshot({
          path: `docs/screens/t22c-print-${lang}-${which}.png`,
          fullPage: true,
        });
      });
    }

    test('daily report: opens, prints (page count is reported, not asserted)', async ({ page }) => {
      await openReport(page, lang, '?kind=daily');
      await expect(page.getByTestId('report-document')).toHaveAttribute('data-kind', 'daily');
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
      test.info().annotations.push({
        type: 'pdf-pages',
        description: `${lang} daily: ${pdfPageCount(pdf)}`,
      });
      expect(pdfPageCount(pdf)).toBeGreaterThan(0);
    });
  });
}

test.describe('/reports CSV export', () => {
  test('Bays: a UTF-8 file with a byte-order mark, a header and seven bays in order', async ({
    page,
  }) => {
    await openReport(page, 'bn');
    await page.getByTestId('report-csv').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('report-csv-bays').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^report-shift-\d{4}-\d{2}-\d{2}-[A-Z]-bays\.csv$/,
    );
    const bytes = await bytesOf(download);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = stripBom(bytes.toString('utf8')).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(8);
    expect(lines[0]).toContain('বে');
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual([
      'B01',
      'B02',
      'B03',
      'B04',
      'B05',
      'B06',
      'B07',
    ]);
  });

  test('Truck log: a UTF-8 file with a byte-order mark and one line per finished truck', async ({
    page,
  }) => {
    await openReport(page, 'bn');
    await page.getByRole('radio', { name: 'আগের শিফট' }).click();
    await expect(page.getByTestId('report-document')).toHaveAttribute('data-state', 'complete', {
      timeout: 60_000,
    });
    const onScreen = await page.getByTestId('report-truck-row').count();
    await page.getByTestId('report-csv').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('report-csv-trucks').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/-truck-log\.csv$/);
    const bytes = await bytesOf(download);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = stripBom(bytes.toString('utf8'));
    // quoted cells may hold line breaks, so count records by the on-screen rows rather than by splitting
    expect(text.split('\r\n').filter(Boolean).length).toBeGreaterThanOrEqual(onScreen + 1);
    if (onScreen > 0) expect(text).toMatch(/[ঀ-৿]/); // Bangla plate text survives
  });
});
