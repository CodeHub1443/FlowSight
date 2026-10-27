import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BayState } from '@/domain';
import { uiStore, type TrayTab } from '@/stores';
import { makeBay, makeSite } from '@/stores/testUtils';
import { LivePage } from './LivePage';
import { push, renderWithProviders, resetStores, T0 } from './testHarness';

// docs/06 §4 (no flicker): a fake store ticking at 10 Hz for 5 s of stream time must update the overlay in place.
//  - no row, chip, tracker step or inspector row is unmounted or remounted (same DOM node, no element removed);
//  - no layout-bearing class or style changes on numeric updates, and every tweened number reserves at least the
//    width of the widest value it showed (tabular figures are 1ch each), so no element changes width.

const BAYS = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07'] as const;
const TICKS = 50; // 5 s at 10 Hz
const TICK_MS = 100;

function bayAt(bay: string, i: number, ts: string): BayState {
  return makeBay(bay, ts, (b) => {
    b.belt.status = 'RUNNING_LOADED';
    b.belt.rateCpm = 10 + (i % 5) + Number(bay.slice(1)) / 10;
    b.staging.occupancyPct = 30 + ((i * 3) % 50);
    b.staging.palletsWaiting = i % 4;
    b.staging.oldestWaitSec = 30 + i * 2;
    b.today.casesOut = 1_000 + i * 11;
    b.queue = b.queue.map((q, n) => ({ ...q, visitId: `V-20261024-${bay}-01${n}` }));
    if (b.visit) {
      b.visit.visitId = `V-20261024-${bay}-0001`;
      b.visit.phase = 'LOADING';
      b.visit.expected = 960;
      b.visit.casesOut = 90 + i * 9;
    }
  });
}

function tick(i: number) {
  const ts = new Date(Date.parse(T0) + i * TICK_MS).toISOString();
  const site = makeSite(ts);
  site.kpi.casesOut = 18_000 + i * 13;
  site.kpi.casesOutDeltaPct = ((i % 7) - 3) * 1.5;
  site.kpi.complianceScore = 85 + (i % 10);
  push(
    { kind: 'siteState', value: site },
    ...BAYS.map((b) => ({ kind: 'bayState' as const, value: bayAt(b, i, ts) })),
  );
}

/** Elements whose identity must survive every tick. */
const STABLE =
  '[data-testid^="tray-"], [data-testid^="kpi-"], [data-testid^="tracker-step-"], [data-testid="inspector"], [data-testid="inspector-bay"] dd, [data-num]';
/** Layout-bearing elements whose class and style must not change on a numeric update. */
const LAYOUT =
  '[data-testid^="tray-bay-B"], [data-testid^="tray-truck-V"], [data-testid^="kpi-"]:not([data-testid="kpi-delta"]), [data-testid^="tracker-step-"], [data-testid="inspector"], [data-num]';

const layoutOf = (el: Element) => `${el.getAttribute('class')}|${el.getAttribute('style') ?? ''}`;

async function runTicks(tab: TrayTab) {
  tick(0);
  uiStore.setState({ trayTab: tab, selection: { kind: 'bay', id: 'B02' } });
  renderWithProviders(<LivePage />);
  const page = screen.getByTestId('live-page');

  const stable = [...page.querySelectorAll(STABLE)];
  const layout = new Map([...page.querySelectorAll(LAYOUT)].map((el) => [el, layoutOf(el)]));
  const widest = new Map<Element, number>();
  const measure = () => {
    for (const el of page.querySelectorAll('[data-num]'))
      widest.set(el, Math.max(widest.get(el) ?? 0, el.textContent?.length ?? 0));
  };
  measure();

  const removed: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.removedNodes)
        if (n.nodeType === Node.ELEMENT_NODE) removed.push((n as Element).outerHTML.slice(0, 120));
  });
  observer.observe(page, { childList: true, subtree: true });

  for (let i = 1; i <= TICKS; i++) {
    await act(async () => tick(i));
    measure();
  }
  for (const r of observer.takeRecords())
    for (const n of r.removedNodes)
      if (n.nodeType === Node.ELEMENT_NODE) removed.push((n as Element).outerHTML.slice(0, 120));
  observer.disconnect();

  return { page, stable, layout, widest, removed };
}

beforeEach(() => resetStores());

describe('live overlay under a 10 Hz store (docs/06 §4)', () => {
  for (const tab of ['bays', 'trucks'] as const) {
    it(`keeps every element mounted and every width fixed (tray on ${tab})`, async () => {
      const { page, stable, layout, widest, removed } = await runTicks(tab);

      // the updates did land
      expect(screen.getByTestId('kpi-cases')).toHaveTextContent('18,650');
      expect(stable.length).toBeGreaterThan(40);
      expect(
        page.querySelectorAll(`[data-testid^="tray-${tab === 'bays' ? 'bay' : 'truck'}-"]`).length,
      ).toBeGreaterThanOrEqual(7);

      // no unmount / remount: no element left the tree, and every tracked node is still connected
      expect(removed).toEqual([]);
      for (const el of stable) expect(el.isConnected, el.outerHTML.slice(0, 120)).toBe(true);

      // no layout change on numeric updates
      for (const [el, before] of layout)
        expect(layoutOf(el), el.outerHTML.slice(0, 120)).toBe(before);
      const reserved = [...widest].filter(([el]) => (el as HTMLElement).dataset.minCh);
      expect(reserved.length).toBeGreaterThan(5);
      for (const [el, len] of reserved)
        expect(Number((el as HTMLElement).dataset.minCh), el.outerHTML).toBeGreaterThanOrEqual(len);
    }, 30_000); // 50 full overlay renders: heavier than a unit test
  }
});
