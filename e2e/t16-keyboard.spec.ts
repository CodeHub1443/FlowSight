import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Task 16: arrow keys pan the view, relative to where the camera looks. The debug build exposes the camera's pose, so the
// target itself is read. Headless WebGL runs on SwiftShader at a few frames per second: a key is held long enough for
// several frames, and a settled camera is detected by polling, never by a fixed wait alone.

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];
const HOLD_MS = 600;

// A moving camera costs 2-5 s per frame on SwiftShader, on the Task 15 build with a mouse drag too (measured in Task 16),
// and the next page can wait on the GPU process behind it: generous limits, and every wait counts rendered frames.
test.describe.configure({ timeout: 600_000 });

type Triple = [number, number, number];
interface Pose {
  position: Triple;
  target: Triple;
}

const readPose = (page: Page) =>
  page.evaluate(() => {
    const cam = (window as unknown as { __sceneCamera?: { pose(): Pose | null } }).__sceneCamera;
    return cam?.pose() ?? null;
  });

async function pose(page: Page): Promise<Pose> {
  const p = await readPose(page);
  if (!p) throw new Error('no camera pose');
  return p;
}

/** Wait for `n` rendered frames: on SwiftShader a frame can stall for over a second, so wall time proves nothing. */
const frames = (page: Page, n = 3) =>
  page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        let i = 0;
        const tick = () => {
          i += 1;
          if (i >= count) done();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    n,
  );

/** Wait until the camera stops, the coast after a release included: unchanged across rendered frames. */
async function settled(page: Page): Promise<Pose> {
  let last = await pose(page);
  await expect
    .poll(
      async () => {
        await frames(page);
        const now = await pose(page);
        const change = Math.hypot(
          now.target[0] - last.target[0],
          now.target[2] - last.target[2],
          now.position[0] - last.position[0],
          now.position[1] - last.position[1],
          now.position[2] - last.position[2],
        );
        last = now;
        return change;
      },
      { timeout: 60_000, intervals: [200] },
    )
    .toBeLessThan(0.001);
  return last;
}

async function openLive(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/live');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('[data-testid="scene-canvas"][data-scene-ready="true"]')).toHaveCount(
    1,
    { timeout: 180_000 },
  );
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
}

async function hold(page: Page, key: string, ms = HOLD_MS) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await frames(page, 2);
  await page.keyboard.up(key);
}

/** The target's move split along the camera's own floor axes: `forward` along the view, `right` across it. */
function moved(from: Pose, to: Pose) {
  const dx = to.target[0] - from.target[0];
  const dz = to.target[2] - from.target[2];
  const ox = from.target[0] - from.position[0];
  const oz = from.target[2] - from.position[2];
  const len = Math.hypot(ox, oz);
  const fx = ox / len;
  const fz = oz / len;
  return { forward: dx * fx + dz * fz, right: dx * -fz + dz * fx, length: Math.hypot(dx, dz) };
}

function expectSame(a: Triple, b: Triple) {
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i] ?? NaN, 3));
}

const offsetOf = (p: Pose): Triple => [
  p.position[0] - p.target[0],
  p.position[1] - p.target[1],
  p.position[2] - p.target[2],
];

/** A real click on Home that ends once the flight is over. `force`: "stable" takes two frames, minutes on a stalled page. */
async function goHome(page: Page): Promise<Pose> {
  await page.getByTestId('map-home').click({ force: true });
  await page.waitForTimeout(1000);
  return settled(page);
}

test('screenshots: initial view, after panning left, after panning up', async ({ page }) => {
  await openLive(page, 1920, 1080);
  const shoot = (name: string) =>
    page.screenshot({ path: path.join(SCREENS, `t16-${name}-1920x1080.png`) });
  await shoot('initial');
  await hold(page, 'ArrowLeft');
  await settled(page);
  await shoot('after-left');
  await goHome(page);
  await hold(page, 'ArrowUp');
  await settled(page);
  await shoot('after-up');
});

for (const { width, height } of SIZES) {
  test(`arrows move the target relative to the view; Home resets (${width}x${height})`, async ({
    page,
  }) => {
    await openLive(page, width, height);
    const home = await pose(page);

    const cases = [
      ['ArrowLeft', 'right', -1],
      ['ArrowRight', 'right', 1],
      ['ArrowUp', 'forward', 1],
      ['ArrowDown', 'forward', -1],
    ] as const;
    for (const [key, axis, sign] of cases) {
      const from = await pose(page);
      await hold(page, key);
      const to = await settled(page);
      const m = moved(from, to);
      const other = axis === 'right' ? m.forward : m.right;
      expect(m[axis] * sign, `${key} along ${axis}`).toBeGreaterThan(1);
      // from the hero pose none of these holds reaches an edge, which would bend the path
      expect(Math.abs(other), `${key} stays on its axis`).toBeLessThan(0.05 * m.length);
      // a pure translation: the view direction and the distance do not change
      expectSame(offsetOf(to), offsetOf(from));
      await goHome(page);
    }

    // the keys work again after a Home that ended a motion, and Home lands exactly on the hero pose
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(600);
    await page.keyboard.up('ArrowRight');
    const back = await goHome(page);
    expectSame(back.target, home.target);
    expectSame(back.position, home.position);
    await hold(page, 'ArrowLeft', 800);
    expect(moved(back, await settled(page)).length).toBeGreaterThan(0.5);
  });
}

test('Shift is faster; the keys follow the camera after a rotate; + and - zoom', async ({
  page,
}) => {
  await openLive(page, 1366, 768);

  // On SwiftShader the frame times vary too much to compare two holds; the unit tests hold the 3x. Here: it still moves.
  const a = await pose(page);
  await page.keyboard.down('Shift');
  await hold(page, 'ArrowRight', 800);
  await page.keyboard.up('Shift');
  expect(moved(a, await settled(page)).right).toBeGreaterThan(1);

  // from the centre of the floor again: a limit would bend the path measured next
  await goHome(page);
  await page.getByTestId('map-rotate-left').click({ force: true });
  await page.waitForTimeout(600);
  await settled(page);
  const b = await pose(page);
  await hold(page, 'ArrowUp');
  const after = moved(b, await settled(page));
  expect(after.forward).toBeGreaterThan(1);
  expect(Math.abs(after.right)).toBeLessThan(0.05 * after.length);

  const distance = (p: Pose) =>
    Math.hypot(
      p.position[0] - p.target[0],
      p.position[1] - p.target[1],
      p.position[2] - p.target[2],
    );
  const c = await settled(page);
  await hold(page, '+');
  const closer = await settled(page);
  expect(distance(closer)).toBeLessThan(distance(c) - 1);
  await hold(page, '-');
  expect(distance(await settled(page))).toBeGreaterThan(distance(closer) + 1);
});

test('held against the pan limit the target rests inside it, with no jitter', async ({ page }) => {
  await openLive(page, 1366, 768);
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(
      async () => {
        const first = await pose(page);
        await frames(page, 3);
        const second = await pose(page);
        return Math.hypot(second.target[0] - first.target[0], second.target[2] - first.target[2]);
      },
      { timeout: 180_000, intervals: [100] },
    )
    .toBe(0);

  // from here on, still held: across rendered frames not one sample may differ, in the camera position either
  const rest = await pose(page);
  for (let i = 0; i < 6; i++) {
    await frames(page, 2);
    expect(await pose(page)).toEqual(rest);
  }
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  expect(await settled(page)).toEqual(rest);
});

test('the keys stay with the search box, the tray and shortcuts', async ({ page }) => {
  await openLive(page, 1366, 768);
  const search = page.getByTestId('global-search');
  const still = async (action: () => Promise<void>, why: string) => {
    const from = await pose(page);
    await action();
    await frames(page);
    expect(moved(from, await pose(page)).length, why).toBe(0);
  };

  // search box: arrows move through results, not the camera
  await search.click();
  await search.fill('B0');
  await still(() => hold(page, 'ArrowLeft', 600), 'typing');
  await still(() => hold(page, 'ArrowDown', 600), 'search results');
  await page.keyboard.press('Escape');
  await search.fill('');
  await page.keyboard.press('Escape');
  await expect(search).not.toBeFocused();

  // Escape left the focus on the page: the camera has the keys again
  const free = await pose(page);
  await hold(page, 'ArrowLeft', 800);
  expect(moved(free, await settled(page)).length).toBeGreaterThan(0.5);

  // the tray list scrolls with the arrows while a row has the focus
  const row = page.getByTestId('tray-bay-B01');
  const list = page.getByTestId('tray').locator('.overflow-y-auto');
  await list.evaluate((el) => (el.scrollTop = 0));
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await row.focus();
  await still(async () => {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
  }, 'tray row');
  await expect
    .poll(() => list.evaluate((el) => el.scrollTop), { timeout: 60_000 })
    .toBeGreaterThan(0);

  // after a press on the tray's empty padding the focus is on the page, and Chrome scrolls the panel under it
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await list.evaluate((el) => (el.scrollTop = 0));
  const box = await page.getByTestId('tray').boundingBox();
  if (!box) throw new Error('no tray');
  await page.mouse.click(box.x + 3, box.y + box.height / 2);
  await still(() => hold(page, 'ArrowDown', 400), 'tray padding');
  await expect
    .poll(() => list.evaluate((el) => el.scrollTop), { timeout: 60_000 })
    .toBeGreaterThan(0);

  // back on the scene the keys return, with Ctrl, Alt and Meta still not counting
  await page.getByTestId('scene-canvas').focus();
  await still(async () => {
    await page.keyboard.down('Control');
    await hold(page, 'ArrowLeft', 400);
    await page.keyboard.up('Control');
  }, 'Ctrl');
  await still(async () => {
    await page.keyboard.down('Alt');
    await hold(page, 'ArrowLeft', 400);
    await page.keyboard.up('Alt');
  }, 'Alt');
  expect(page.url()).toContain('/live');

  // Ctrl+Shift+D still opens the readout
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByTestId('debug-readout')).toBeVisible();
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByTestId('debug-readout')).toHaveCount(0);
});

test('the scene is reachable with Tab and with a click; the ring shows for the keyboard', async ({
  page,
}) => {
  await openLive(page, 1366, 768);
  const region = page.getByRole('region', { name: /3D view of the depot/ });
  await expect(region).toHaveAttribute('tabindex', '0');

  let reached = false;
  for (let i = 0; i < 30 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await region.evaluate((el) => el === document.activeElement);
  }
  expect(reached, 'Tab reaches the scene').toBe(true);
  await expect(region).toHaveCSS('outline-style', 'none');
  const ring = await region.evaluate((el) => getComputedStyle(el, '::after').boxShadow);
  expect(ring).not.toBe('none');
  const a = await pose(page);
  await hold(page, 'ArrowLeft', 800);
  expect(moved(a, await settled(page)).right).toBeLessThan(-0.5);

  // a click on the floor gives it the focus too, and still selects what it hits
  const box = await region.boundingBox();
  if (!box) throw new Error('no region');
  await page.keyboard.press('Tab');
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.55);
  await expect(region).toBeFocused();
  const b = await pose(page);
  await hold(page, 'ArrowRight', 800);
  expect(moved(b, await settled(page)).right).toBeGreaterThan(0.5);

  await page.getByRole('button', { name: 'বাং' }).click();
  await expect(page.getByRole('region', { name: /ত্রিমাত্রিক দৃশ্য/ })).toHaveCount(1);
});

test('a running fly-to cancels key motion until it ends', async ({ page }) => {
  await openLive(page, 1366, 768);
  const fly = (to: string) =>
    page.evaluate((target) => {
      (window as unknown as { __sceneCamera: { flyTo(t: string): void } }).__sceneCamera.flyTo(
        target,
      );
    }, to);
  await fly('B04');
  await page.waitForTimeout(1000);
  const clean = await settled(page);
  await fly('floorOverview');
  await page.waitForTimeout(1000);
  const hero = await settled(page);

  // press and release inside the 800 ms flight: the landing must be exactly the flight's own
  await fly('B04');
  await page.keyboard.press('ArrowLeft', { delay: 150 });
  await page.waitForTimeout(1000);
  const landed = await settled(page);
  expectSame(landed.target, clean.target);
  expectSame(landed.position, clean.position);

  // held across the landing, the keys take over after it
  await fly('floorOverview');
  await page.keyboard.down('ArrowLeft');
  // past the 800 ms flight, then frames rendered after it
  await page.waitForTimeout(1000);
  await frames(page, 6);
  await page.keyboard.up('ArrowLeft');
  const end = await settled(page);
  expect(moved(hero, end).length).toBeGreaterThan(0.5);
});

test('the keyboard hint in the map controls, EN and BN', async ({ page }) => {
  await openLive(page, 1920, 1080);
  const shots = [
    ['en', 'Keyboard shortcuts', 'Arrow keys: move the view'],
    ['bn', 'কীবোর্ড শর্টকাট', 'তীর চিহ্নের কী: দৃশ্য সরান'],
  ] as const;
  for (const [lang, title, line] of shots) {
    if (lang === 'bn') await page.getByRole('button', { name: 'বাং' }).click();
    await page.mouse.move(960, 600);
    await page.getByTestId('map-keys').hover();
    const hint = page.getByTestId('map-keys-hint');
    await expect(hint).toContainText(title);
    await expect(hint).toContainText(line);
    // off and back by keyboard focus, which must open it too
    // in steps like a real mouse: the tooltip closes on the moves after the one that leaves the button
    await page.mouse.move(960, 600, { steps: 6 });
    await expect(hint).toHaveCount(0, { timeout: 60_000 });
    await page.keyboard.press('Tab');
    await page.getByTestId('map-keys').focus();
    await expect(hint).toContainText(title);
    await page.evaluate(() => document.fonts.ready);
    // an element at opacity 0 counts as visible, and a stalled frame can hold the fade-in at its start
    await hint.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    await expect(hint).toHaveCSS('opacity', '1');
    await page.screenshot({ path: path.join(SCREENS, `t16-hint-${lang}-1920x1080.png`) });
    await expect(hint).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(hint).toHaveCount(0, { timeout: 60_000 });
  }
});
