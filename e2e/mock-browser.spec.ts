import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { expect, test } from './fixtures';

// Real-browser check of the step-3 simulator: Web Worker + MockSource, the MSW service worker, generated placeholder
// JPEGs and the MockControls panel. The app does not mount any of this yet, so the spec serves a harness page
// (e2e/mock-harness) from its own Vite dev server, one port above the preview server.

const PORT = Number(process.env.E2E_PORT ?? 4173) + 1;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCREENS = fileURLToPath(new URL('../docs/screens', import.meta.url));

let server: ViteDevServer;

test.beforeAll(async () => {
  server = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { host: 'localhost', port: PORT, strictPort: true },
  });
  await server.listen();
  mkdirSync(SCREENS, { recursive: true });
});

test.afterAll(async () => {
  await server.close();
});

type MockWindow = {
  __mock: {
    ready: boolean;
    error: string | null;
    counts: Record<string, number>;
    lifecycle: { id: string; status: string }[];
    control: () => {
      dropped: number;
      ready: boolean;
      simNow: number;
      historyMs: number;
      rates: Record<string, number>;
    };
    setLang: (lng: string) => Promise<unknown>;
    workerLoaded: () => boolean;
  };
};

async function openHarness(page: Page) {
  await page.goto(`http://localhost:${PORT}/e2e/mock-harness/index.html`);
  await page.waitForFunction(
    () => {
      const m = (window as unknown as MockWindow).__mock;
      return m.ready || m.error !== null;
    },
    undefined,
    { timeout: 60_000 },
  );
  const error = await page.evaluate(() => (window as unknown as MockWindow).__mock.error);
  expect(error).toBeNull();
}

test('the simulator runs in a Web Worker, MSW answers REST, evidence is a real JPEG', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openHarness(page);

  expect(await page.evaluate(() => (window as unknown as MockWindow).__mock.workerLoaded())).toBe(
    true,
  );

  // live channels are flowing and nothing was dropped at the validation boundary
  await page.waitForFunction(
    () => {
      const c = (window as unknown as MockWindow).__mock.counts;
      return (
        (c.bayState ?? 0) > 14 &&
        (c.actors ?? 0) > 14 &&
        (c.siteState ?? 0) > 2 &&
        (c.health ?? 0) >= 1
      );
    },
    undefined,
    { timeout: 30_000 },
  );
  const control = await page.evaluate(() => (window as unknown as MockWindow).__mock.control());
  expect(control.dropped).toBe(0);
  expect(control.historyMs).toBeGreaterThan(0);
  console.log(`7-day history generated in the worker in ${control.historyMs} ms`);

  // REST through the service worker
  const rest = await page.evaluate(async () => {
    type Ev = {
      id: string;
      status: string;
      category: string;
      media: { snapshotKey: string } | null;
    };
    const get = async (p: string) => {
      const r = await fetch(`/api${p}`);
      return { status: r.status, body: (await r.json()) as unknown };
    };
    const snapshot = await get('/sites/dhk-depot/snapshot');
    const events = await get('/events?limit=100');
    const lb = await get('/leaderboard?period=week');
    const items = (events.body as { items: Ev[] }).items;
    const open = items.find((e) => e.status === 'OPEN' && e.category === 'hygiene');
    const media = items.find((e) => e.media);
    const acked = open ? await fetch(`/api/events/${open.id}/ack`, { method: 'POST' }) : null;
    let img: { w: number; h: number; url: string } | null = null;
    if (media?.media) {
      const key = encodeURIComponent(media.media.snapshotKey);
      const p = (await (await fetch(`/api/media/presign?key=${key}`)).json()) as { url: string };
      img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve({ w: el.naturalWidth, h: el.naturalHeight, url: p.url });
        el.onerror = () => reject(new Error('placeholder JPEG did not decode'));
        el.src = p.url;
      });
    }
    return {
      snapshotStatus: snapshot.status,
      bays: (snapshot.body as { bays: unknown[] }).bays.length,
      eventCount: items.length,
      lbStatus: lb.status,
      ackStatus: acked?.status ?? null,
      ackedId: open?.id ?? null,
      img,
    };
  });
  expect(rest.snapshotStatus).toBe(200);
  expect(rest.bays).toBe(7);
  expect(rest.eventCount).toBe(100);
  expect(rest.lbStatus).toBe(200);
  expect(rest.ackStatus).toBe(200);
  expect(rest.img?.url.startsWith('blob:')).toBe(true);
  expect(rest.img?.w).toBe(640);

  // look at the generated evidence image (grey frame, bounding box, label, timestamp)
  await page.evaluate((url) => {
    document.body.innerHTML = `<img id="evidence" src="${url}" style="display:block;margin:16px;width:640px">`;
  }, rest.img?.url ?? '');
  await page
    .locator('#evidence')
    .screenshot({ path: `${SCREENS}/step-03-evidence-placeholder.png` });

  // the acknowledgement came back on the lifecycle channel
  await page.waitForFunction(
    (id) =>
      (window as unknown as MockWindow).__mock.lifecycle.some(
        (u) => u.id === id && u.status === 'ACK',
      ),
    rest.ackedId,
    { timeout: 15_000 },
  );
});

for (const [width, height] of [
  [1920, 1080],
  [1366, 768],
] as const) {
  test(`MockControls renders in EN and Bangla at ${width}x${height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    await openHarness(page);
    await page.waitForFunction(
      () => ((window as unknown as MockWindow).__mock.control().rates.bayState ?? 0) > 0,
      undefined,
      { timeout: 30_000 },
    );
    await expect(page.getByRole('region', { name: 'Simulator' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hygiene' })).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/step-03-mockcontrols-en-${width}.png` });

    await page.evaluate(() => (window as unknown as MockWindow).__mock.setLang('bn'));
    const bn = page.getByRole('region', { name: 'সিমুলেটর' });
    await expect(bn).toBeVisible();
    await expect(page.getByRole('button', { name: 'পণ্যের মান' })).toBeVisible();
    // no horizontal overflow or clipped panel
    const box = await bn.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await page.screenshot({ path: `${SCREENS}/step-03-mockcontrols-bn-${width}.png` });
  });
}
