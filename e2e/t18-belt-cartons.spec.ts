import { expect, test } from './fixtures';
import { startPeak } from './mockSim';

// Task 18: the only thing on a belt is a carton. Through the actor probe, every item of every bay, at 1x and 60x speed,
// has a variant id from the carton set (3 sizes x 2 kraft tones). The look is checked by eye (docs/screens/t18-*).

const CARTON_VARIANTS = [
  'small-light',
  'small-medium',
  'medium-light',
  'medium-medium',
  'large-light',
  'large-medium',
];
const BAYS = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07'];

test.describe.configure({ timeout: 400_000 });

for (const speed of [1, 60] as const) {
  // at 1x on the CPU renderer a bay's belt is idle most of the time: 3 bays with items is the floor there, all 7 at 60x
  test(`belt items are cartons only (${speed === 60 ? 'all 7 bays' : 'at least 3 bays'}) at ${speed}x`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/live?quality=med');
    await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
    await startPeak(page, { speed });

    const seen = new Map<string, Set<string>>();
    await expect
      .poll(
        async () => {
          const v = await page.evaluate(
            () =>
              (
                window as unknown as {
                  __actorProbe?: { itemVariants: Record<string, string[]> };
                }
              ).__actorProbe?.itemVariants ?? {},
          );
          for (const [bay, list] of Object.entries(v)) {
            const set = seen.get(bay) ?? new Set<string>();
            for (const id of list) set.add(id);
            seen.set(bay, set);
          }
          return BAYS.filter((b) => seen.has(b)).length;
        },
        { timeout: 300_000, intervals: [500] },
      )
      .toBeGreaterThanOrEqual(speed === 60 ? BAYS.length : 3);

    for (const set of seen.values()) {
      for (const id of set) expect(CARTON_VARIANTS).toContain(id);
    }
  });
}
