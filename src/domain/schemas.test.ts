// @vitest-environment node
import { describe, expect, it } from 'vitest';
import actorsFrame from './fixtures/actors-frame.json';
import bayState from './fixtures/bay-state.json';
import caseTick from './fixtures/case-tick.json';
import healthFrame from './fixtures/health-frame.json';
import lifecycleUpdate from './fixtures/lifecycle-update.json';
import siteState from './fixtures/site-state.json';
import whEvent from './fixtures/wh-event.json';
import { REMOVE, mutate } from './testing';
import { safeParseMessage, type MessageKind } from './validate';

type Case = {
  name: string;
  kind: MessageKind;
  fixture: unknown;
  /** A required field to remove. */
  required: (string | number)[];
  /** An enum field and the value to corrupt it with (SiteState has no enum: wrong type instead). */
  enumPath: (string | number)[];
  enumBad: unknown;
  /** A timestamp field. */
  tsPath: (string | number)[];
};

const cases: Case[] = [
  {
    name: 'SiteState',
    kind: 'siteState',
    fixture: siteState,
    required: ['kpi', 'casesOut'],
    enumPath: ['kpi', 'trucksDocked'],
    enumBad: 'six',
    tsPath: ['ts'],
  },
  {
    name: 'BayState',
    kind: 'bayState',
    fixture: bayState,
    required: ['belt', 'status'],
    enumPath: ['door', 'status'],
    enumBad: 'AJAR',
    tsPath: ['ts'],
  },
  {
    name: 'ActorsFrame',
    kind: 'actors',
    fixture: actorsFrame,
    required: ['actors', 0, 'x'],
    enumPath: ['actors', 0, 'kind'],
    enumBad: 'ROBOT',
    tsPath: ['ts'],
  },
  {
    name: 'CaseTick',
    kind: 'case',
    fixture: caseTick,
    required: ['sku'],
    enumPath: ['dir'],
    enumBad: 'SIDEWAYS',
    tsPath: ['ts'],
  },
  {
    name: 'WhEvent',
    kind: 'event',
    fixture: whEvent,
    required: ['title'],
    enumPath: ['sev'],
    enumBad: 'fatal',
    tsPath: ['ts'],
  },
  {
    name: 'EventLifecycleUpdate',
    kind: 'lifecycle',
    fixture: lifecycleUpdate,
    required: ['by'],
    enumPath: ['status'],
    enumBad: 'DELETED',
    tsPath: ['at'],
  },
  {
    name: 'HealthFrame',
    kind: 'health',
    fixture: healthFrame,
    required: ['pipeline', 'lagMs'],
    enumPath: ['cams', 0, 'status'],
    enumBad: 'BROKEN',
    tsPath: ['ts'],
  },
];

describe.each(cases)('$name', (c) => {
  it('accepts the contract fixture', () => {
    const r = safeParseMessage(c.kind, c.fixture);
    expect(r.ok, r.ok ? '' : JSON.stringify(r.error)).toBe(true);
  });

  it('rejects a missing required field', () => {
    expect(safeParseMessage(c.kind, mutate(c.fixture, c.required, REMOVE)).ok).toBe(false);
  });

  it('rejects a wrong enum value / wrong type', () => {
    expect(safeParseMessage(c.kind, mutate(c.fixture, c.enumPath, c.enumBad)).ok).toBe(false);
  });

  it('rejects a timestamp without offset', () => {
    expect(
      safeParseMessage(c.kind, mutate(c.fixture, c.tsPath, '2026-10-24T19:50:45.120')).ok,
    ).toBe(false);
  });

  it('rejects a timestamp that is not a date', () => {
    expect(safeParseMessage(c.kind, mutate(c.fixture, c.tsPath, 'yesterday')).ok).toBe(false);
  });

  it('rejects a wrong version', () => {
    expect(safeParseMessage(c.kind, mutate(c.fixture, ['v'], 2)).ok).toBe(false);
    expect(safeParseMessage(c.kind, mutate(c.fixture, ['v'], '1')).ok).toBe(false);
    expect(safeParseMessage(c.kind, mutate(c.fixture, ['v'], REMOVE)).ok).toBe(false);
  });

  it('strips unknown keys instead of rejecting (forward compatibility)', () => {
    const r = safeParseMessage(c.kind, mutate(c.fixture, ['futureField'], 'x'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).not.toHaveProperty('futureField');
  });

  it('accepts Z and other offsets', () => {
    expect(safeParseMessage(c.kind, mutate(c.fixture, c.tsPath, '2026-10-24T13:50:45Z')).ok).toBe(
      true,
    );
  });
});

describe('SiteState nullability', () => {
  it('allows null deltas, nothing else', () => {
    for (const key of ['casesOutDeltaPct', 'casesInDeltaPct', 'avgTatDeltaMin']) {
      expect(safeParseMessage('siteState', mutate(siteState, ['kpi', key], null)).ok).toBe(true);
    }
    expect(safeParseMessage('siteState', mutate(siteState, ['kpi', 'casesOut'], null)).ok).toBe(
      false,
    );
  });
});

describe('BayState nullability and ranges', () => {
  it('visit may be null (no truck)', () => {
    expect(safeParseMessage('bayState', mutate(bayState, ['visit'], null)).ok).toBe(true);
  });

  it('captain and captain name may be null', () => {
    expect(safeParseMessage('bayState', mutate(bayState, ['crew', 'captain'], null)).ok).toBe(true);
    expect(
      safeParseMessage('bayState', mutate(bayState, ['crew', 'captain', 'name'], null)).ok,
    ).toBe(true);
  });

  it('rejects null where the contract does not allow it', () => {
    expect(safeParseMessage('bayState', mutate(bayState, ['belt', 'since'], null)).ok).toBe(false);
    expect(safeParseMessage('bayState', mutate(bayState, ['door'], null)).ok).toBe(false);
  });

  it('rejects out-of-range numbers', () => {
    expect(
      safeParseMessage('bayState', mutate(bayState, ['staging', 'occupancyPct'], 140)).ok,
    ).toBe(false);
    expect(safeParseMessage('bayState', mutate(bayState, ['visit', 'plate', 'conf'], 1.5)).ok).toBe(
      false,
    );
  });

  it('rejects an unknown phase and a bad visit id', () => {
    expect(safeParseMessage('bayState', mutate(bayState, ['visit', 'phase'], 'PARKED')).ok).toBe(
      false,
    );
    expect(safeParseMessage('bayState', mutate(bayState, ['visit', 'visitId'], 'V-1')).ok).toBe(
      false,
    );
  });
});

describe('ActorsFrame privacy and ranges', () => {
  it.each(['PHONE', 'IDLE'])('rejects act %s (worker behaviour is never on NATS)', (act) => {
    expect(safeParseMessage('actors', mutate(actorsFrame, ['actors', 1, 'act'], act)).ok).toBe(
      false,
    );
  });

  it('rejects heading outside (-pi, pi]', () => {
    expect(safeParseMessage('actors', mutate(actorsFrame, ['actors', 0, 'h'], 3.5)).ok).toBe(false);
    expect(safeParseMessage('actors', mutate(actorsFrame, ['actors', 0, 'h'], -Math.PI)).ok).toBe(
      false,
    );
    expect(safeParseMessage('actors', mutate(actorsFrame, ['actors', 0, 'h'], Math.PI)).ok).toBe(
      true,
    );
  });

  it('allows ppeOk null only', () => {
    expect(safeParseMessage('actors', mutate(actorsFrame, ['actors', 0, 'ppeOk'], null)).ok).toBe(
      true,
    );
    expect(safeParseMessage('actors', mutate(actorsFrame, ['actors', 0, 'ppeOk'], 'yes')).ok).toBe(
      false,
    );
  });

  it('strips names and employee ids if a producer sends them', () => {
    const dirty = mutate(
      mutate(actorsFrame, ['actors', 0, 'name'], 'Md. Rahim Uddin'),
      ['actors', 0, 'employeeId'],
      'EMP-1043',
    );
    const r = safeParseMessage('actors', dirty);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const first = r.value.actors[0];
      expect(first).toBeDefined();
      expect(first).not.toHaveProperty('name');
      expect(first).not.toHaveProperty('employeeId');
    }
  });
});

describe('CaseTick', () => {
  it('allows a flag or null', () => {
    expect(safeParseMessage('case', mutate(caseTick, ['flag'], 'DAMAGED')).ok).toBe(true);
    expect(safeParseMessage('case', mutate(caseTick, ['flag'], 'BROKEN')).ok).toBe(false);
  });
});
