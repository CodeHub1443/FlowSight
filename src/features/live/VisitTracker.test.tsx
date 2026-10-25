import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BayVisit } from '@/domain';
import { uiStore } from '@/stores';
import { makeBay } from '@/stores/testUtils';
import { VisitTracker } from './VisitTracker';
import { push, renderWithProviders, resetStores, T0 } from './testHarness';

function seedVisit(patch: (v: BayVisit) => void) {
  push({
    kind: 'bayState',
    value: makeBay('B02', T0, (b) => {
      if (b.visit) patch(b.visit);
    }),
  });
  uiStore.getState().select({ kind: 'bay', id: 'B02' });
}

const state = (key: string) => screen.getByTestId(`tracker-step-${key}`).getAttribute('data-state');

beforeEach(() => resetStores());

describe('VisitTracker', () => {
  it('LOADING: arrived and docked done, loading current with n/— when expected is unknown', () => {
    seedVisit(() => {});
    renderWithProviders(<VisitTracker />);
    expect(state('arrived')).toBe('done');
    expect(state('docked')).toBe('done');
    expect(state('loading')).toBe('current');
    expect(state('finished')).toBe('pending');
    expect(state('departed')).toBe('pending');
    expect(screen.getByTestId('tracker-step-loading')).toHaveTextContent('Loading 412/—');
    // Dhaka times under the steps.
    expect(screen.getByTestId('tracker-step-arrived')).toHaveTextContent('19:12');
    expect(screen.getByTestId('tracker-step-docked')).toHaveTextContent('19:18');
    expect(screen.getByTestId('tracker-step-loading')).toHaveTextContent('19:31');
    expect(screen.getByTestId('tracker-step-finished')).toHaveTextContent('—');
  });

  it('shows the expected quantity when known', () => {
    seedVisit((v) => (v.expected = 960));
    renderWithProviders(<VisitTracker />);
    expect(screen.getByTestId('tracker-step-loading')).toHaveTextContent('Loading 412/960');
  });

  it('ARRIVED: only the first step is current; docked and later are pending', () => {
    seedVisit((v) => {
      v.phase = 'ARRIVED';
      v.dockedAt = null;
      v.startedAt = null;
      v.casesOut = 0;
    });
    renderWithProviders(<VisitTracker />);
    expect(state('arrived')).toBe('current');
    expect(state('docked')).toBe('pending');
    expect(state('loading')).toBe('pending');
  });

  it('FINISHED: loading done, finished current', () => {
    seedVisit((v) => {
      v.phase = 'FINISHED';
      v.finishedAt = '2026-10-24T19:48:10+06:00';
    });
    renderWithProviders(<VisitTracker />);
    expect(state('loading')).toBe('done');
    expect(state('finished')).toBe('current');
    expect(screen.getByTestId('tracker-step-finished')).toHaveTextContent('19:48');
  });

  it('DEPARTED: every step is done and the dwell clock stops at departure', () => {
    seedVisit((v) => {
      v.phase = 'DEPARTED';
      v.finishedAt = '2026-10-24T19:48:10+06:00';
      v.departedAt = '2026-10-24T19:49:40+06:00';
    });
    renderWithProviders(<VisitTracker />);
    for (const k of ['arrived', 'docked', 'loading', 'finished', 'departed']) {
      expect(state(k)).toBe('done');
    }
    // 19:12:40 -> 19:49:40 = 37 minutes, regardless of "now".
    expect(screen.getByTestId('tracker-dwell')).toHaveTextContent('37m');
  });

  it('UNLOADING counts inbound cases', () => {
    seedVisit((v) => {
      v.phase = 'UNLOADING';
      v.casesIn = 230;
      v.casesOut = 0;
    });
    renderWithProviders(<VisitTracker />);
    expect(screen.getByTestId('tracker-step-loading')).toHaveTextContent('Unloading 230/—');
  });

  it('a queued truck starts at "Waiting" (current) with its apron slot; docked and later are pending', () => {
    push({ kind: 'bayState', value: makeBay('B02', T0) });
    uiStore.getState().select({ kind: 'truck', id: 'V-20261024-B02-0008' });
    renderWithProviders(<VisitTracker />);
    expect(screen.queryByTestId('tracker-step-arrived')).not.toBeInTheDocument();
    expect(state('waiting')).toBe('current');
    expect(screen.getByTestId('tracker-step-waiting')).toHaveTextContent('Waiting');
    expect(screen.getByTestId('tracker-step-waiting')).toHaveTextContent('19:41');
    expect(state('docked')).toBe('pending');
    expect(screen.getByTestId('tracker-subject')).toHaveTextContent('ঢাকা মেট্রো-ট ২২-৪৮১৫');
    expect(screen.getByTestId('tracker-info')).toHaveTextContent('Apron slot 1');
  });

  it('a bay with only a queued truck shows the empty state (the queue is not the truck at the door)', () => {
    push({ kind: 'bayState', value: makeBay('B02', T0, (b) => (b.visit = null)) });
    uiStore.getState().select({ kind: 'bay', id: 'B02' });
    renderWithProviders(<VisitTracker />);
    expect(screen.getByTestId('tracker-empty')).toBeInTheDocument();
  });

  it('shows an empty state for a bay with no truck', () => {
    push({ kind: 'bayState', value: makeBay('B01', T0, (b) => (b.visit = null)) });
    uiStore.getState().select({ kind: 'bay', id: 'B01' });
    renderWithProviders(<VisitTracker />);
    expect(screen.getByTestId('tracker-empty')).toBeInTheDocument();
  });

  it('follows a selected truck, and defaults to the active loading visit when nothing is selected', () => {
    push(
      { kind: 'bayState', value: makeBay('B02', T0) },
      {
        kind: 'bayState',
        value: makeBay('B03', T0, (b) => {
          if (b.visit) {
            b.visit.visitId = 'V-20261024-B03-0008';
            b.visit.phase = 'DOCKED';
            b.visit.startedAt = null;
          }
        }),
      },
    );
    renderWithProviders(<VisitTracker />);
    // No selection: the loading visit (B02) is shown.
    expect(screen.getByTestId('tracker-subject')).toHaveTextContent('Bay 2');
    uiStore.getState().select({ kind: 'truck', id: 'V-20261024-B03-0008' });
    // re-render via store subscription
    return screen.findByText(/Bay 3/, { selector: '[data-testid="tracker-subject"]' });
  });
});
