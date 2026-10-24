// @vitest-environment node
import { describe, expect, it } from 'vitest';
import bayState from './fixtures/bay-state.json';
import siteState from './fixtures/site-state.json';
import whEvent from './fixtures/wh-event.json';
import { parseWhEvent } from './events';
import { REMOVE, mutate } from './testing';
import { safeParseMessage } from './validate';

const bay = (raw: unknown) => safeParseMessage('bayState', raw).ok;
const site = (raw: unknown) => safeParseMessage('siteState', raw).ok;

describe('nullable fields (docs/03 v1 clarifications)', () => {
  it.each([
    ['kpi', 'avgTatMin'],
    ['kpi', 'complianceScore'],
    ['kpi', 'casesOutDeltaPct'],
    ['kpi', 'casesInDeltaPct'],
    ['kpi', 'avgTatDeltaMin'],
  ])('SiteState %s.%s may be null but not missing', (a, b) => {
    expect(site(mutate(siteState, [a, b], null))).toBe(true);
    expect(site(mutate(siteState, [a, b], REMOVE))).toBe(false);
  });

  it('SiteState counts may not be null', () => {
    expect(site(mutate(siteState, ['kpi', 'casesOut'], null))).toBe(false);
  });

  it.each([['agency'], ['expected'], ['dockedAt'], ['startedAt'], ['finishedAt'], ['departedAt']])(
    'BayState visit.%s may be null',
    (key) => {
      expect(bay(mutate(bayState, ['visit', key], null))).toBe(true);
    },
  );

  it('visit.arrivedAt and visit.phase may not be null', () => {
    expect(bay(mutate(bayState, ['visit', 'arrivedAt'], null))).toBe(false);
    expect(bay(mutate(bayState, ['visit', 'phase'], null))).toBe(false);
  });

  it('today.avgTatMin may be null', () => {
    expect(bay(mutate(bayState, ['today', 'avgTatMin'], null))).toBe(true);
    expect(bay(mutate(bayState, ['today', 'casesOut'], null))).toBe(false);
  });

  it('src.cam, src.model and src.conf may be null on events', () => {
    for (const key of ['cam', 'model', 'conf']) {
      expect(parseWhEvent(mutate(whEvent, ['src', key], null)).ok).toBe(true);
    }
    expect(parseWhEvent(mutate(whEvent, ['src'], null)).ok).toBe(false);
  });
});

describe('etaSource NONE implies etaMin null', () => {
  it('accepts NONE with null', () => {
    const none = mutate(
      mutate(bayState, ['visit', 'etaSource'], 'NONE'),
      ['visit', 'etaMin'],
      null,
    );
    expect(bay(none)).toBe(true);
  });

  it('accepts a number with a real source, and null with a real source', () => {
    expect(bay(bayState)).toBe(true);
    expect(bay(mutate(bayState, ['visit', 'etaMin'], null))).toBe(true);
  });

  it('rejects NONE with a number', () => {
    const r = safeParseMessage('bayState', mutate(bayState, ['visit', 'etaSource'], 'NONE'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.issues.map((i) => i.path)).toContain('visit.etaMin');
  });
});

describe('alerts.open 0 implies maxSev null', () => {
  it('accepts open 0 with null', () => {
    const quiet = mutate(mutate(bayState, ['alerts', 'open'], 0), ['alerts', 'maxSev'], null);
    expect(bay(quiet)).toBe(true);
  });

  it('rejects open 0 with a severity', () => {
    expect(bay(mutate(bayState, ['alerts', 'open'], 0))).toBe(false);
  });

  it('accepts open > 0 with a severity', () => {
    expect(bay(bayState)).toBe(true);
  });
});

describe('captain refinements', () => {
  it('present false: null trackId is valid, a trackId is not', () => {
    const absent = mutate(bayState, ['crew', 'captain', 'present'], false);
    expect(bay(absent)).toBe(false);
    expect(bay(mutate(absent, ['crew', 'captain', 'trackId'], null))).toBe(true);
  });

  it('present true with a trackId is valid (fixture)', () => {
    expect(bay(bayState)).toBe(true);
  });

  it('idSource UNCONFIRMED: null employeeId is valid, an employeeId is not', () => {
    const unconfirmed = mutate(bayState, ['crew', 'captain', 'idSource'], 'UNCONFIRMED');
    expect(bay(unconfirmed)).toBe(false);
    expect(bay(mutate(unconfirmed, ['crew', 'captain', 'employeeId'], null))).toBe(true);
  });

  it('captain trackId and employeeId are nullable fields', () => {
    expect(bay(mutate(bayState, ['crew', 'captain', 'employeeId'], null))).toBe(true);
    expect(bay(mutate(bayState, ['crew', 'captain', 'trackId'], null))).toBe(true);
  });
});

describe('event data tightening', () => {
  const forklift = {
    ...whEvent,
    category: 'compliance',
    type: 'forklift_proximity',
    sev: 'critical',
    data: { trackId: 't-91', forkliftId: 'f-2', distM: 1.2 },
  };

  it('forkliftId must be f-{n}', () => {
    expect(parseWhEvent(forklift).ok).toBe(true);
    expect(parseWhEvent(mutate(forklift, ['data', 'forkliftId'], 't-2')).ok).toBe(false);
  });

  it('ppe.violation role is the ActorsFrame role enum', () => {
    const ppe = {
      ...whEvent,
      category: 'ppe',
      type: 'violation',
      data: { trackId: 't-1', role: 'WORKER', missing: [] },
    };
    expect(parseWhEvent(ppe).ok).toBe(true);
    expect(parseWhEvent(mutate(ppe, ['data', 'role'], 'MANAGER')).ok).toBe(false);
  });
});
