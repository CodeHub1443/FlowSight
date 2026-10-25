import { describe, expect, it } from 'vitest';
import { makeBay, makeEvent, ulid } from '@/stores/testUtils';
import {
  dwellSec,
  normalizeSearch,
  resolveVisit,
  searchEntities,
  trackerSteps,
  visitProgress,
  type SearchContext,
} from './model';
import { bayConveyor, bayLabel } from './siteInfo';
import { T0 } from './testHarness';

const bay2 = makeBay('B02', T0);
const bay1 = makeBay('B01', T0, (b) => (b.visit = null));
const event = makeEvent(ulid(5), { bay: 'B02' });

const ctx = (over: Partial<SearchContext> = {}): SearchContext => ({
  bays: [bay1, bay2],
  events: [{ ...event, status: 'OPEN', ack: null, closed: null, notes: [] }],
  lang: 'en',
  showCaptainNames: true,
  bayLabel,
  bayConveyor,
  ...over,
});

describe('searchEntities', () => {
  it('returns nothing for an empty query', () => {
    expect(searchEntities('  ', ctx())).toEqual([]);
  });

  it('finds a bay by label and by conveyor name', () => {
    expect(searchEntities('bay 2', ctx()).map((h) => h.key)).toContain('bay:B02');
    expect(searchEntities('conveyor-01', ctx()).map((h) => h.key)).toEqual(['bay:B01']);
  });

  it('finds a truck by Latin or Bangla plate digits, and by Bangla text', () => {
    expect(searchEntities('2171', ctx()).some((h) => h.group === 'trucks')).toBe(true);
    expect(searchEntities('২১৭১', ctx()).some((h) => h.group === 'trucks')).toBe(true);
    expect(searchEntities('ঢাকা মেট্রো', ctx()).some((h) => h.group === 'trucks')).toBe(true);
    const hit = searchEntities('metro', ctx()).find((h) => h.group === 'trucks');
    expect(hit?.title).toBe('ঢাকা মেট্রো-ড ১১-২১৭১'); // Bangla primary
    expect(hit?.subtitle).toContain('DHAKA METRO-DA 11-2171'); // English secondary
    expect(hit?.selection).toEqual({ kind: 'truck', id: 'V-20261024-B02-0007' });
  });

  it('finds captains by name only when names are allowed', () => {
    expect(searchEntities('rahim', ctx()).map((h) => h.group)).toContain('captains');
    expect(searchEntities('rahim', ctx({ showCaptainNames: false }))).toEqual([]);
    expect(searchEntities('রহিম', ctx()).map((h) => h.group)).toContain('captains');
  });

  it('finds an event by id and by title, and selects it', () => {
    const byId = searchEntities(event.id.slice(0, 12), ctx());
    expect(byId[0]?.selection).toEqual({ kind: 'event', id: event.id });
    expect(searchEntities('damaged case', ctx()).map((h) => h.group)).toContain('events');
  });

  it('requires every token to match', () => {
    expect(searchEntities('bay 2 zzz', ctx())).toEqual([]);
  });
});

describe('normalizeSearch', () => {
  it('converts Bangla digits and lower-cases', () => {
    expect(normalizeSearch(' DHAKA ১২৩ ')).toBe('dhaka 123');
  });
});

describe('resolveVisit', () => {
  it('a bay selection resolves to that bay only, never to another bay', () => {
    expect(resolveVisit({ kind: 'bay', id: 'B01' }, [bay1, bay2], {})).toBeNull();
    expect(resolveVisit({ kind: 'bay', id: 'B02' }, [bay1, bay2], {})?.bay).toBe('B02');
  });

  it('a truck selection falls back to the kept visit record', () => {
    const visit = bay2.visit;
    if (!visit) throw new Error('fixture has a visit');
    const got = resolveVisit({ kind: 'truck', id: visit.visitId }, [bay1], {
      [visit.visitId]: { bay: 'B02', visit, rxAt: 0 },
    });
    expect(got?.bay).toBe('B02');
  });

  it('no selection prefers a loading visit', () => {
    expect(resolveVisit(null, [bay1, bay2], {})?.bay).toBe('B02');
  });
});

describe('visit helpers', () => {
  const visit = (() => {
    if (!bay2.visit) throw new Error('fixture has a visit');
    return bay2.visit;
  })();

  it('progress is null (not 0) when expected is unknown', () => {
    expect(visitProgress(visit)).toBeNull();
    expect(visitProgress({ ...visit, expected: 824 })).toBeCloseTo(50);
  });

  it('dwell runs to now, or to departure, and is never negative', () => {
    expect(dwellSec(visit, Date.parse(T0))).toBe(37 * 60 + 20);
    expect(dwellSec({ ...visit, departedAt: '2026-10-24T19:20:40+06:00' }, Date.parse(T0))).toBe(
      8 * 60,
    );
    expect(dwellSec(visit, 0)).toBe(0);
  });

  it('tracker steps are ordered and the last step is terminal', () => {
    expect(trackerSteps(visit).map((s) => s.key)).toEqual([
      'arrived',
      'docked',
      'loading',
      'finished',
      'departed',
    ]);
    const departed = trackerSteps({ ...visit, phase: 'DEPARTED' });
    expect(departed.every((s) => s.state === 'done')).toBe(true);
  });
});
