import { describe, expect, it } from 'vitest';
import { makeBay, makeEvent, ulid } from '@/stores/testUtils';
import {
  activeVisits,
  dwellSec,
  normalizeSearch,
  onSiteCount,
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

describe('activeVisits and the apron queue', () => {
  // B02 (fixture): loading -0007 with -0008 queued in slot 1; B03: reversing truck that is also its queue head
  const reversing = makeBay('B03', T0, (b) => {
    if (!b.visit) return;
    Object.assign(b.visit, { visitId: 'V-20261024-B03-0004', phase: 'ARRIVED', dockedAt: null });
    b.queue = [
      { visitId: b.visit.visitId, plate: b.visit.plate, arrivedAt: b.visit.arrivedAt, slot: 2 },
      {
        visitId: 'V-20261024-B03-0005',
        plate: { bn: 'ঢাকা মেট্রো-ন ১২-০০০১', en: 'DHAKA METRO-NA 12-0001', conf: 0.9 },
        arrivedAt: '2026-10-24T19:40:00+06:00',
        slot: null,
      },
    ];
  });
  const empty = makeBay('B01', T0, (b) => {
    b.visit = null;
    b.queue = [];
  });

  it('lists bay visits first, then queued trucks by arrival; a reversing truck appears once, as the visit', () => {
    const got = activeVisits([empty, bay2, reversing]);
    expect(got.map((a) => [a.visit.visitId, a.waiting?.slot])).toEqual([
      ['V-20261024-B02-0007', undefined],
      ['V-20261024-B03-0004', undefined],
      ['V-20261024-B03-0005', null],
      ['V-20261024-B02-0008', 1],
    ]);
    const q = got[3]?.visit;
    expect(q?.phase).toBe('ARRIVED');
    expect(q?.dockedAt).toBeNull();
    expect(q?.etaSource).toBe('NONE');
  });

  it('counts trucks on site as docked + waiting (a departed truck is not counted)', () => {
    const departed = makeBay('B04', T0, (b) => {
      b.queue = [];
      if (b.visit) Object.assign(b.visit, { phase: 'DEPARTED', departedAt: T0 });
    });
    expect(onSiteCount(activeVisits([empty, bay2, reversing, departed]))).toBe(4);
  });

  it('a truck selection finds a queued truck; a bay selection never resolves to one', () => {
    expect(resolveVisit({ kind: 'truck', id: 'V-20261024-B02-0008' }, [bay2], {})?.waiting).toEqual(
      { slot: 1 },
    );
    const queuedOnly = makeBay('B02', T0, (b) => (b.visit = null));
    expect(resolveVisit({ kind: 'bay', id: 'B02' }, [queuedOnly], {})).toBeNull();
  });

  it('a queued truck is searchable by plate', () => {
    const hit = searchEntities('4815', ctx()).find((h) => h.group === 'trucks');
    expect(hit?.selection).toEqual({ kind: 'truck', id: 'V-20261024-B02-0008' });
  });

  it('the tracker starts a waiting truck at "waiting" instead of "arrived"', () => {
    const v = activeVisits([bay2])[1]?.visit;
    if (!v) throw new Error('queued truck expected');
    expect(trackerSteps(v, true).map((s) => [s.key, s.state])).toEqual([
      ['waiting', 'current'],
      ['docked', 'pending'],
      ['loading', 'pending'],
      ['finished', 'pending'],
      ['departed', 'pending'],
    ]);
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
