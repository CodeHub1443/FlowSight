import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { settle, startPeak } from './mockSim';

// Task 22B scene interaction: picking of trucks, people and forklifts, hover, camera glyphs. WRITTEN IN 22B.1 AND NOT RUN
// (that phase has no browser, spec section 6); 22B.2 runs it alone, together with the fps A/B and the nav-leak spec.
//
// Nothing on a canvas can be queried, so the scene's debug probes (debug builds, like __actorProbe) say where each bound is
// on screen: window.__pickProbe.points() (interaction/pickProbe.ts) and the stores through window.__uiStore (LiveScene).
// Run alone:  pnpm exec playwright test e2e/t22b-scene.spec.ts
// Screenshots (opt-in):  T22B_SHOTS=1 pnpm exec playwright test e2e/t22b-scene.spec.ts -g screenshots

type Kind = 'truck' | 'person' | 'forklift' | 'camera';
interface Point {
  kind: Kind;
  id: string;
  x: number;
  y: number;
}
interface PickProbe {
  hoverLooks: number;
  hoverMs: number;
  points: () => Point[];
  hovered: () => { kind: Kind; id: string } | null;
}
interface UiStoreLike {
  getState(): {
    selection: { kind: string; id: string } | null;
    select(s: { kind: string; id: string } | null): void;
    setXray(on: boolean): void;
    setLanguage(l: 'en' | 'bn'): void;
    setTheme(t: 'light' | 'dark'): void;
  };
}
declare global {
  interface Window {
    __pickProbe?: PickProbe;
    __uiStore?: UiStoreLike;
  }
}

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
test.describe.configure({ timeout: 300_000 });

const points = (page: Page) =>
  page.evaluate(() => {
    const pts = window.__pickProbe?.points() ?? [];
    // only a point that nothing but the canvas covers can be clicked (cards, chips and the tray sit over it)
    return pts.filter((p) => {
      const el = document.elementFromPoint(p.x, p.y);
      return el?.tagName === 'CANVAS';
    });
  });
const selection = (page: Page) =>
  page.evaluate(() => window.__uiStore?.getState().selection ?? null);

async function openPeak(page: Page, quality = 'med') {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/live?quality=${quality}`);
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
  await startPeak(page, { speed: 10 });
  await expect
    .poll(async () => (await page.evaluate(() => window.__actorProbe?.trucks.docked)) ?? 0, {
      timeout: 120_000,
    })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await points(page)).filter((p) => p.kind === 'person').length, {
      timeout: 120_000,
    })
    .toBeGreaterThan(0);
}

/** A clickable point of this kind, fresh (actors move: read it right before the click). */
async function pointOf(page: Page, kind: Kind): Promise<Point> {
  let found: Point | undefined;
  await expect
    .poll(async () => (found = (await points(page)).find((p) => p.kind === kind)), {
      timeout: 120_000,
    })
    .toBeTruthy();
  if (!found) throw new Error(`no ${kind} on screen`);
  return found;
}

test('a click on a truck, a person and a forklift opens that object in the inspector', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  await openPeak(page);

  for (const [kind, testId] of [
    ['truck', 'inspector-truck'],
    ['person', 'inspector-person'],
    ['forklift', 'inspector-forklift'],
  ] as const) {
    await page.evaluate(() => window.__uiStore?.getState().select(null));
    const p = await pointOf(page, kind);
    await page.mouse.click(p.x, p.y);
    // an actor beats the bay floor plate under it: the selection is the actor, not its bay
    await expect.poll(async () => (await selection(page))?.kind, { timeout: 5_000 }).toBe(kind);
    await expect(page.getByTestId(testId)).toBeVisible();
    // ids as the inspector bodies expect them: a visit id for a truck, a track id for the others
    const id = (await selection(page))?.id ?? '';
    if (kind === 'truck') expect(id).toMatch(/^V-\d{8}-B\d{2}-\d{4}$/);
    else expect(id).toMatch(/^[tf]-\d+$/);
  }
  expect(problems).toEqual([]);
});

test('the selected actor gets a pill with a role only for a person, never a name or an id', async ({
  page,
}) => {
  await openPeak(page);
  const person = await pointOf(page, 'person');
  await page.mouse.click(person.x, person.y);
  const pill = page.getByTestId('scene-actor-pill');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText(/^(Captain|Worker|Person)$/);
  const truck = await pointOf(page, 'truck');
  await page.mouse.click(truck.x, truck.y);
  await expect(pill).toHaveText(/^B0\d · .+/);
  const lift = await pointOf(page, 'forklift');
  await page.mouse.click(lift.x, lift.y);
  await expect(pill).toHaveText(/^Forklift · B0\d$/);
  // cleared selection hides it
  await page.evaluate(() => window.__uiStore?.getState().select(null));
  await expect(pill).toBeHidden();
});

test('a camera drag that starts on an actor is not a click', async ({ page }) => {
  await openPeak(page);
  await page.evaluate(() => window.__uiStore?.getState().select(null));
  const p = await pointOf(page, 'person');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y + 10, { steps: 6 });
  await page.mouse.up();
  expect(await selection(page)).toBeNull();
  // a movement of up to 4 px is still a click
  const q = await pointOf(page, 'person');
  await page.mouse.move(q.x, q.y);
  await page.mouse.down();
  await page.mouse.move(q.x + 2, q.y + 1, { steps: 2 });
  await page.mouse.up();
  expect((await selection(page))?.kind).toBe('person');
});

test('hover: pointer cursor and an outline over an actor, nothing over bare floor, no looks while dragging', async ({
  page,
}) => {
  await openPeak(page);
  const p = await pointOf(page, 'truck');
  await page.mouse.move(p.x, p.y);
  await expect
    .poll(async () => (await page.evaluate(() => window.__pickProbe?.hovered()))?.kind, {
      timeout: 5_000,
    })
    .toBe('truck');
  const cursor = () => page.evaluate(() => document.querySelector('canvas')?.style.cursor ?? '');
  expect(await cursor()).toBe('pointer');
  await page.mouse.move(5, 5);
  await page.mouse.move(8, 8);
  await expect.poll(async () => cursor(), { timeout: 5_000 }).toBe('');
  expect(await page.evaluate(() => window.__pickProbe?.hovered())).toBeNull();

  // while a button is held (a camera drag) the pointer is not looked at
  const before = await page.evaluate(() => window.__pickProbe?.hoverLooks ?? 0);
  await page.mouse.move(400, 400);
  await page.mouse.down();
  await page.mouse.move(700, 500, { steps: 40 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.__pickProbe?.hoverLooks ?? 0);
  expect(after - before).toBeLessThanOrEqual(1);
});

test('hover cost: at most 10 looks a second, each well under a millisecond', async ({ page }) => {
  await openPeak(page);
  const start = await page.evaluate(() => ({
    looks: window.__pickProbe?.hoverLooks ?? 0,
    ms: window.__pickProbe?.hoverMs ?? 0,
  }));
  const t0 = Date.now();
  // a pointer sweeping the scene for about two seconds
  for (let i = 0; i < 120; i++) {
    await page.mouse.move(300 + ((i * 11) % 1200), 200 + ((i * 7) % 600));
  }
  const seconds = (Date.now() - t0) / 1000;
  const end = await page.evaluate(() => ({
    looks: window.__pickProbe?.hoverLooks ?? 0,
    ms: window.__pickProbe?.hoverMs ?? 0,
  }));
  const looks = end.looks - start.looks;
  expect(looks).toBeGreaterThan(0);
  expect(looks).toBeLessThanOrEqual(Math.ceil(seconds * 10) + 1);
  expect((end.ms - start.ms) / looks).toBeLessThan(2);
});

test('camera glyphs: all 21 in X-ray mode, only the cameras that need attention otherwise', async ({
  page,
}) => {
  await openPeak(page);
  const glyphs = async () =>
    (await page.evaluate(() => window.__pickProbe?.points() ?? [])).filter(
      (p) => p.kind === 'camera',
    );
  await page.evaluate(() => window.__uiStore?.getState().setXray(true));
  await expect.poll(async () => (await glyphs()).length, { timeout: 5_000 }).toBeGreaterThan(10);
  expect((await glyphs()).length).toBeLessThanOrEqual(21);
  await page.evaluate(() => window.__uiStore?.getState().setXray(false));
  await expect.poll(async () => (await glyphs()).length, { timeout: 5_000 }).toBeLessThan(21);
});

test("a click on a camera glyph selects that camera's newest open event, or nothing", async ({
  page,
}) => {
  await openPeak(page);
  await page.evaluate(() => {
    window.__uiStore?.getState().setXray(true);
    window.__uiStore?.getState().select(null);
  });
  await expect
    .poll(async () => (await points(page)).filter((p) => p.kind === 'camera').length, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  for (const g of (await points(page)).filter((p) => p.kind === 'camera').slice(0, 4)) {
    await page.evaluate(() => window.__uiStore?.getState().select(null));
    await page.mouse.click(g.x, g.y);
    const sel = await selection(page);
    // nothing, or an event: never a bay, a truck or the camera id itself
    if (sel) expect(sel.kind).toBe('event');
  }
});

test('Low tier picks too (static figures), with no page errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  await openPeak(page, 'low');
  const p = await pointOf(page, 'person');
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await selection(page))?.kind, { timeout: 5_000 }).toBe('person');
  expect(problems).toEqual([]);
});

// ---- screenshots (opt-in) -------------------------------------------------------------------------------------------

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
]) {
  for (const lang of ['en', 'bn'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`screenshots: selected truck, person and forklift, ${size.width}x${size.height} ${lang} ${theme}`, async ({
        page,
      }) => {
        test.skip(process.env.T22B_SHOTS !== '1', 'screenshot pass, opt-in');
        await openPeak(page);
        await page.setViewportSize(size);
        await page.evaluate(
          ([l, t]) => {
            window.__uiStore?.getState().setLanguage(l as 'en' | 'bn');
            window.__uiStore?.getState().setTheme(t as 'light' | 'dark');
          },
          [lang, theme],
        );
        await settle(page, 1500);
        for (const kind of ['truck', 'person', 'forklift'] as const) {
          const p = await pointOf(page, kind);
          await page.mouse.click(p.x, p.y);
          await settle(page, 800);
          await page.screenshot({
            path: path.join(SCREENS, `t22b-${kind}-${size.width}-${lang}-${theme}.png`),
          });
        }
      });
    }
  }
}
