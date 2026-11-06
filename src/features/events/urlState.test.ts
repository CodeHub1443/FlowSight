import { describe, expect, it } from 'vitest';
import { ALERT_GROUP_IDS } from '@/features/live/kpiDetail/selectors';
import { visibleCategories } from '@/lib/rbac';
import {
  defaultEventFilters,
  eventPath,
  eventsPath,
  parseEventFilters,
  serializeEventFilters,
  type EventFilters,
} from './urlState';

const parse = (qs: string, role?: Parameters<typeof parseEventFilters>[1]) =>
  parseEventFilters(new URLSearchParams(qs), role);

const FULL: EventFilters = {
  status: ['OPEN', 'ACK', 'CLOSED'],
  sev: ['warn', 'critical'],
  category: ['truck', 'hygiene'],
  bay: ['B01', 'B04'],
  q: 'DHAKA METRO',
  from: Date.parse('2026-11-06T06:00:00+06:00'),
  to: Date.parse('2026-11-06T14:00:00+06:00'),
  group: 'hygiene',
  groupBy: 'visit',
};

describe('parseEventFilters', () => {
  it('an empty query is the default view: OPEN + ACK, nothing else', () => {
    expect(parse('')).toEqual(defaultEventFilters());
    expect(defaultEventFilters().status).toEqual(['OPEN', 'ACK']);
  });

  it('reads comma lists and repeated params, in canonical order without duplicates', () => {
    expect(parse('status=CLOSED,OPEN&status=ACK').status).toEqual(['OPEN', 'ACK', 'CLOSED']);
    expect(parse('sev=critical,warn,warn').sev).toEqual(['warn', 'critical']);
    expect(parse('bay=B04&bay=B01,B04').bay).toEqual(['B01', 'B04']);
  });

  it('ignores invalid values and keeps the valid ones', () => {
    const f = parse(
      'status=nope&sev=loud,warn&category=ghost,hygiene&bay=B1,X07,B07&group=nope&groupBy=truck&from=yesterday&to=',
    );
    expect(f.status).toEqual(['OPEN', 'ACK']);
    expect(f.sev).toEqual(['warn']);
    expect(f.category).toEqual(['hygiene']);
    expect(f.bay).toEqual(['B07']);
    expect(f.group).toBeNull();
    expect(f.groupBy).toBeNull();
    expect(f.from).toBeNull();
    expect(f.to).toBeNull();
  });

  it('drops a range whose start is not before its end', () => {
    const f = parse('from=2026-11-06T14:00:00%2B06:00&to=2026-11-06T06:00:00%2B06:00');
    expect(f.from).toBeNull();
    expect(f.to).toBeNull();
  });

  it('accepts a plain date as the start of that day in Dhaka, and a "+" turned into a space', () => {
    expect(parse('from=2026-11-06').from).toBe(Date.parse('2026-11-06T00:00:00+06:00'));
    expect(parse('from=2026-11-06T06:00:00 06:00').from).toBe(
      Date.parse('2026-11-06T06:00:00+06:00'),
    );
  });

  it('keeps every known group id and nothing else', () => {
    for (const g of ALERT_GROUP_IDS) expect(parse(`group=${g}`).group).toBe(g);
  });

  it('drops categories the role cannot view', () => {
    // KIOSK has no access to handling, roster, security; SECURITY has none to roster and staging
    expect(parse('category=handling,truck,roster,security', 'KIOSK').category).toEqual(['truck']);
    expect(parse('category=roster,staging,security', 'SECURITY').category).toEqual(['security']);
    expect(parse('category=roster,security').category).toEqual(['roster', 'security']);
  });

  it('every visible category survives for its own role', () => {
    for (const role of [
      'HQ_VIEWER',
      'DC_MANAGER',
      'SHIFT_SUPERVISOR',
      'SECURITY',
      'ADMIN',
    ] as const) {
      const cats = visibleCategories(role);
      expect(parse(`category=${cats.join(',')}`, role).category).toEqual(cats);
    }
  });

  it('caps the free text at 100 characters and trims it', () => {
    expect(parse(`q=${'x'.repeat(300)}`).q).toHaveLength(100);
    expect(parse('q=%20%20tape%20').q).toBe('tape');
  });
});

describe('serializeEventFilters', () => {
  it('the default view serialises to nothing', () => {
    expect(serializeEventFilters(defaultEventFilters())).toBe('');
    expect(eventsPath()).toBe('/events');
    expect(eventsPath(defaultEventFilters())).toBe('/events');
  });

  it('round-trips a full filter set', () => {
    const qs = serializeEventFilters(FULL);
    expect(parse(qs)).toEqual(FULL);
  });

  it('round-trips each field alone', () => {
    const base = defaultEventFilters();
    const cases: Partial<EventFilters>[] = [
      { status: ['CLOSED'] },
      { status: ['OPEN'] },
      { sev: ['info'] },
      { category: ['belt'] },
      { bay: ['B07'] },
      { q: 'RIN-PB-1KG & co/é' },
      { from: Date.parse('2026-11-06T00:00:00+06:00') },
      { to: Date.parse('2026-11-07T00:00:00+06:00') },
      { group: 'system' },
      { groupBy: 'visit' },
    ];
    for (const c of cases) {
      const f = { ...base, ...c };
      expect(parse(serializeEventFilters(f))).toEqual(f);
    }
  });

  it('round-trips Bangla free text', () => {
    const f = { ...defaultEventFilters(), q: 'ঢাকা মেট্রো' };
    expect(parse(serializeEventFilters(f)).q).toBe('ঢাকা মেট্রো');
  });

  it('normalises order and drops duplicates and invalid entries when writing', () => {
    const f: EventFilters = {
      ...defaultEventFilters(),
      status: ['ACK', 'OPEN'],
      bay: ['B04', 'B01', 'B04', 'zz'],
      sev: ['critical', 'warn'],
    };
    const qs = serializeEventFilters(f);
    expect(qs).toBe('sev=warn%2Ccritical&bay=B01%2CB04');
    expect(new URLSearchParams(qs).get('bay')).toBe('B01,B04');
  });

  it('writes the range with the Dhaka offset', () => {
    const qs = serializeEventFilters({ ...defaultEventFilters(), from: FULL.from });
    expect(new URLSearchParams(qs).get('from')).toBe('2026-11-06T06:00:00+06:00');
  });

  it('is stable: parse then serialize again gives the same string', () => {
    const once = serializeEventFilters(FULL);
    expect(serializeEventFilters(parse(once))).toBe(once);
  });
});

describe('paths', () => {
  it('eventsPath carries the filters', () => {
    expect(eventsPath({ ...defaultEventFilters(), group: 'ppe' })).toBe('/events?group=ppe');
  });

  it('eventPath is /events/:id, optionally with the list filters behind it', () => {
    expect(eventPath('01M5Q2V6W0M9S346Q3D25VT4F5')).toBe('/events/01M5Q2V6W0M9S346Q3D25VT4F5');
    expect(
      eventPath('01M5Q2V6W0M9S346Q3D25VT4F5', { ...defaultEventFilters(), bay: ['B02'] }),
    ).toBe('/events/01M5Q2V6W0M9S346Q3D25VT4F5?bay=B02');
    expect(eventPath('a/b')).toBe('/events/a%2Fb');
  });
});
