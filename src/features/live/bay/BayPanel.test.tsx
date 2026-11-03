import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { uiStore } from '@/stores';
import { makeBay, makeSite } from '@/stores/testUtils';
import type { BayState } from '@/domain';
import { Inspector } from '../Inspector';
import { push, renderWithProviders, resetStores, T0 } from '../testHarness';

// Bay inspector sections (T19 spec 5B). The bay-state fixture: docked 19:18:05, started 19:31:02, loading OUT,
// 412 cartons out, 14.2 cartons/min, etaMin 13, skuCount 1. T0 = 19:50:00, so the stream clock reads 19:50:00.

async function show(
  patch: (b: BayState) => void = () => {},
  opts: { lang?: 'en' | 'bn'; role?: Parameters<typeof resetStores>[0] } = {},
) {
  await resetStores(opts.role ?? 'DC_MANAGER', opts.lang ?? 'en');
  push(
    { kind: 'siteState', value: makeSite(T0) },
    { kind: 'bayState', value: makeBay('B02', T0, patch) },
  );
  renderWithProviders(<Inspector />);
  act(() => uiStore.getState().select({ kind: 'bay', id: 'B02' }));
}

const seg = (id: 'preOp' | 'work' | 'postOp') => screen.getByTestId(`bay-seg-${id}`);
const expandMore = () =>
  userEvent.click(
    within(screen.getByTestId('bay-more')).getByRole('button', { name: 'Show more details' }),
  );

beforeEach(() => resetStores());

describe('Bay inspector: section order', () => {
  it('a loading truck shows timeline, throughput, workforce, then More details', async () => {
    await show();
    const body = screen.getByTestId('inspector-bay');
    const ids = [...body.querySelectorAll('[data-testid^="bay-"]')]
      .map((e) => e.getAttribute('data-testid'))
      .filter((id) =>
        ['bay-timeline', 'bay-throughput', 'bay-workforce', 'bay-more'].includes(id ?? ''),
      );
    expect(ids).toEqual(['bay-timeline', 'bay-throughput', 'bay-workforce', 'bay-more']);
  });

  it('keeps the always-visible rows: plate, phase, door, belt direction, captain line, PPE now', async () => {
    await show();
    const body = screen.getByTestId('inspector-bay');
    expect(within(body).getByTestId('inspector-plate')).toHaveTextContent('ঢাকা মেট্রো-ড ১১-২১৭১');
    expect(body).toHaveTextContent('Phase');
    expect(body).toHaveTextContent('Door');
    expect(body).toHaveTextContent('Outbound');
    expect(within(body).getByTestId('inspector-captain')).toHaveTextContent('Md. Rahim Uddin');
    expect(body).toHaveTextContent('PPE violations now');
  });
});

describe('Bay inspector: truck timeline', () => {
  it('loading: pre-op closed, loading "so far", post-op not started, occupancy so far, finish ETA', async () => {
    await show();
    const tl = screen.getByTestId('bay-timeline');
    expect(tl).toHaveAttribute('data-work', 'loading');
    expect(tl).toHaveTextContent('Pre-operation delay');
    expect(tl).toHaveTextContent('Loading');
    expect(tl).toHaveTextContent('Post-operation delay');
    // 19:18:05 -> 19:31:02 = 12.95 min, rounded
    expect(seg('preOp')).toHaveTextContent(/^13m$/);
    expect(seg('preOp')).toHaveAttribute('data-in-progress', 'false');
    // 19:31:02 -> 19:50:00 = 18.97 min, an elapsed counter: floored
    expect(seg('work')).toHaveTextContent(/^18m so far$/);
    expect(seg('work')).toHaveAttribute('data-in-progress', 'true');
    expect(seg('postOp')).toHaveTextContent(/^—$/);
    expect(screen.getByTestId('bay-occupancy')).toHaveTextContent(/^31m so far$/);
    expect(screen.getByTestId('bay-eta')).toHaveTextContent(/^13 min left · \d{2}:\d{2}$/);
    const bar = screen.getByTestId('bay-timeline-bar');
    const widths = [...bar.children].map((c) => parseFloat((c as HTMLElement).style.width));
    expect(widths[0]).toBeCloseTo((12.95 / 31.917) * 100, 0);
    expect(widths[2]).toBe(0);
  });

  it('the running segment ticks with the stream clock (shared 1 Hz), no timer of its own', async () => {
    await show();
    expect(seg('work')).toHaveTextContent('18m so far');
    act(() => push({ kind: 'bayState', value: makeBay('B02', '2026-10-24T19:52:30+06:00') }));
    expect(seg('work')).toHaveTextContent('21m so far');
    expect(screen.getByTestId('bay-occupancy')).toHaveTextContent('34m so far');
    expect(seg('preOp')).toHaveTextContent(/^13m$/);
  });

  it('DOCKED: pre-op counts up, loading and post-op not started, no ETA row when etaMin is null', async () => {
    await show((b) => {
      if (!b.visit) return;
      b.visit.phase = 'DOCKED';
      b.visit.startedAt = null;
      b.visit.casesOut = 0;
      b.visit.etaMin = null;
      b.visit.etaSource = 'NONE';
    });
    expect(seg('preOp')).toHaveTextContent(/^31m so far$/);
    expect(seg('preOp')).toHaveAttribute('data-in-progress', 'true');
    expect(seg('work')).toHaveTextContent(/^—$/);
    expect(seg('postOp')).toHaveTextContent(/^—$/);
    expect(screen.queryByTestId('bay-eta')).not.toBeInTheDocument();
  });

  it('FINISHED: post-op so far, loading closed', async () => {
    await show((b) => {
      if (!b.visit) return;
      b.visit.phase = 'FINISHED';
      b.visit.finishedAt = '2026-10-24T19:45:02+06:00';
      b.visit.etaMin = null;
      b.visit.etaSource = 'NONE';
    });
    expect(seg('work')).toHaveTextContent(/^14m$/);
    expect(seg('postOp')).toHaveTextContent(/^4m so far$/);
  });

  it('inbound belt labels the work segment Unloading and counts cartons in', async () => {
    await show((b) => {
      b.belt.direction = 'IN';
      if (!b.visit) return;
      b.visit.phase = 'UNLOADING';
      b.visit.casesIn = 150;
      b.visit.casesOut = 0;
    });
    expect(screen.getByTestId('bay-timeline')).toHaveAttribute('data-work', 'unloading');
    expect(screen.getByTestId('bay-timeline')).toHaveTextContent('Unloading');
    expect(screen.getByTestId('bay-visit-cartons')).toHaveTextContent(/^150$/);
  });

  it('a truck that has not docked yet: no bar, a note instead', async () => {
    await show((b) => {
      if (!b.visit) return;
      b.visit.phase = 'ARRIVED';
      b.visit.dockedAt = null;
      b.visit.startedAt = null;
      b.visit.etaMin = null;
      b.visit.etaSource = 'NONE';
    });
    expect(screen.getByTestId('bay-timeline-not-docked')).toHaveTextContent('not docked yet');
    expect(screen.queryByTestId('bay-timeline-bar')).not.toBeInTheDocument();
  });

  it('no truck: the empty state, and cartons this visit is "—"', async () => {
    await show((b) => {
      b.visit = null;
      b.belt.status = 'NO_TRUCK';
      b.belt.direction = 'NONE';
      b.belt.rateCpm = 0;
    });
    expect(screen.getByTestId('bay-timeline-empty')).toHaveTextContent('No truck at this bay');
    expect(screen.queryByTestId('bay-timeline-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('bay-visit-cartons')).toHaveTextContent(/^—$/);
    expect(screen.getByTestId('bay-throughput')).toBeInTheDocument();
    expect(screen.getByTestId('bay-workforce')).toBeInTheDocument();
  });
});

describe('Bay inspector: throughput and workforce', () => {
  it('throughput: cartons this visit, cartons/min, bay today', async () => {
    await show();
    const tp = screen.getByTestId('bay-throughput');
    expect(screen.getByTestId('bay-visit-cartons')).toHaveTextContent(/^412$/);
    expect(screen.getByTestId('bay-rate')).toHaveTextContent(/^14\.2$/);
    expect(tp).toHaveTextContent('2,410 out · 380 in');
    expect(tp).toHaveTextContent('Trucks today9');
    expect(tp).toHaveTextContent('Avg turnaround today58m');
  });

  it('cartons this visit shows the expected quantity when known', async () => {
    await show((b) => {
      if (b.visit) b.visit.expected = 600;
    });
    expect(screen.getByTestId('bay-visit-cartons')).toHaveTextContent('412 / 600');
  });

  it('workforce: workers, storekeeper and forklift operator Yes/No; no names, no behaviour', async () => {
    await show();
    expect(screen.getByTestId('bay-workers')).toHaveTextContent('4');
    expect(screen.getByTestId('bay-storekeeper')).toHaveAttribute('data-value', 'yes');
    expect(screen.getByTestId('bay-forklift-op')).toHaveAttribute('data-value', 'yes');
    expect(screen.getByTestId('bay-workforce')).not.toHaveTextContent('Rahim');
  });

  it('workforce: No when the captain is not present and no forklift operator is detected', async () => {
    await show((b) => {
      b.crew.forkliftOps = 0;
      if (b.crew.captain) {
        b.crew.captain.present = false;
        b.crew.captain.trackId = null;
      }
    });
    expect(screen.getByTestId('bay-storekeeper')).toHaveAttribute('data-value', 'no');
    expect(screen.getByTestId('bay-storekeeper')).toHaveTextContent('No');
    expect(screen.getByTestId('bay-forklift-op')).toHaveAttribute('data-value', 'no');
  });
});

describe('Bay inspector: More details', () => {
  it('is collapsed by default and opens on its chevron: belt, crew, staging, today, cameras, SKUs', async () => {
    await show();
    const more = screen.getByTestId('bay-more');
    expect(more).toHaveTextContent('More details');
    expect(screen.queryByTestId('bay-more-body')).not.toBeInTheDocument();
    expect(within(more).getByRole('button', { name: 'Show more details' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expandMore();
    const body = screen.getByTestId('bay-more-body');
    expect(body).toHaveTextContent('In this state since');
    expect(body).toHaveTextContent('6 (1 captain, 4 workers, 1 forklift)');
    expect(body).toHaveTextContent('Pallets waiting');
    expect(body).toHaveTextContent('Damaged');
    expect(body).toHaveTextContent('3/3 OK');
    expect(screen.getByTestId('bay-skus')).toHaveTextContent(/^1$/);
  });

  it('SKUs detected is "—" when an older backend omits skuCount', async () => {
    await show((b) => {
      if (b.visit) delete b.visit.skuCount;
    });
    await expandMore();
    expect(screen.getByTestId('bay-skus')).toHaveTextContent(/^—$/);
    expect(
      within(screen.getByTestId('bay-skus')).getByLabelText('Not reported by the backend yet'),
    ).toBeInTheDocument();
  });

  it('never shows phone-use or idle behaviour, expanded included', async () => {
    await show();
    await expandMore();
    expect(screen.getByTestId('inspector')).not.toHaveTextContent(/phone|idle/i);
  });
});

describe('Bay inspector: Bangla', () => {
  it('renders every section in Bangla with Bangla digits', async () => {
    await show(() => {}, { lang: 'bn' });
    const tl = screen.getByTestId('bay-timeline');
    expect(tl).toHaveTextContent('ট্রাকের সময়রেখা');
    expect(tl).toHaveTextContent('কাজ শুরুর আগের দেরি');
    expect(seg('preOp')).toHaveTextContent(/^১৩ মি$/);
    expect(seg('work')).toHaveTextContent(/^এ পর্যন্ত ১৮ মি$/);
    expect(screen.getByTestId('bay-eta')).toHaveTextContent(/^আর ১৩ মিনিট · [০-৯]{2}:[০-৯]{2}$/);
    expect(screen.getByTestId('bay-throughput')).toHaveTextContent('থ্রুপুট');
    expect(screen.getByTestId('bay-visit-cartons')).toHaveTextContent(/^৪১২$/);
    expect(screen.getByTestId('bay-throughput')).toHaveTextContent('বাইরে ২,৪১০ · ভেতরে ৩৮০');
    expect(screen.getByTestId('bay-workforce')).toHaveTextContent('জনবল');
    expect(screen.getByTestId('bay-storekeeper')).toHaveTextContent('হ্যাঁ');
    expect(screen.getByTestId('bay-more')).toHaveTextContent('আরও বিস্তারিত');
    await userEvent.click(
      within(screen.getByTestId('bay-more')).getByRole('button', { name: 'আরও বিস্তারিত দেখান' }),
    );
    expect(screen.getByTestId('bay-skus')).toHaveTextContent(/^১$/);
  });
});
