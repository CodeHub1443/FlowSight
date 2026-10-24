// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  EVENT_KEYS,
  EVENT_REGISTRY,
  WhEventSchema,
  WhEventWithStatusSchema,
  defaultSeverity,
  parseWhEvent,
  parseWhEventFromSubject,
  subjectFor,
  subjectMatchesEvent,
  type EventKey,
} from './events';
import whEventFixture from './fixtures/wh-event.json';
import { mutate } from './testing';

// The 33 rows of the docs/03 section 3.5 catalogue.
const EXPECTED_KEYS = [
  'truck.arrived',
  'truck.docked',
  'truck.started',
  'truck.finished',
  'truck.departed',
  'truck.detention',
  'truck.unknown_plate',
  'belt.state_changed',
  'belt.empty_run',
  'belt.fall_off',
  'hygiene.damaged',
  'hygiene.open_tape',
  'hygiene.torn_sack',
  'hygiene.wet_stained',
  'hygiene.spillage',
  'hygiene.debris',
  'handling.rough_handling',
  'ppe.violation',
  'compliance.on_belt',
  'compliance.crowding',
  'compliance.forklift_proximity',
  'roster.captain_detected',
  'roster.captain_absent',
  'staging.pallet_wait',
  'security.after_hours_presence',
  'security.door_open_idle',
  'security.truck_entry_no_loading',
  'system.camera_offline',
  'system.camera_obstructed',
  'system.camera_defocus',
  'system.camera_moved',
  'system.camera_ok',
  'system.pipeline_lag',
] as const satisfies readonly EventKey[];

const visitAt = {
  visitId: 'V-20261024-B02-0007',
  plateEn: 'DHAKA METRO-DA 11-2171',
  at: '2026-10-24T19:12:40+06:00',
};
const skuPack = { sku: 'RIN-PB-1KG', pack: 'SACK' };
const cam = { cam: 'B02-BELT' };

/** A valid `data` and the catalogue default severity per key (exhaustive by type). */
const SAMPLES: Record<EventKey, { sev: 'info' | 'warn' | 'critical'; data: unknown }> = {
  'truck.arrived': { sev: 'info', data: visitAt },
  'truck.docked': { sev: 'info', data: visitAt },
  'truck.started': { sev: 'info', data: { ...visitAt, dir: 'OUT' } },
  'truck.finished': { sev: 'info', data: { ...visitAt, casesOut: 412, casesIn: 0 } },
  'truck.departed': { sev: 'info', data: { ...visitAt, tatMin: 58 } },
  'truck.detention': {
    sev: 'warn',
    data: { visitId: visitAt.visitId, phase: 'LOADING', minutes: 95, thresholdMin: 90 },
  },
  'truck.unknown_plate': {
    sev: 'warn',
    data: { plateBn: 'ঢাকা মেট্রো-?', plateEn: 'DHAKA METRO-?', conf: 0.41 },
  },
  'belt.state_changed': { sev: 'info', data: { from: 'RUNNING_LOADED', to: 'STOPPED' } },
  'belt.empty_run': { sev: 'warn', data: { minutes: 11 } },
  'belt.fall_off': { sev: 'warn', data: skuPack },
  'hygiene.damaged': { sev: 'warn', data: skuPack },
  'hygiene.open_tape': { sev: 'warn', data: skuPack },
  'hygiene.torn_sack': { sev: 'warn', data: skuPack },
  'hygiene.wet_stained': { sev: 'warn', data: skuPack },
  'hygiene.spillage': { sev: 'info', data: { areaM2: 0.8 } },
  'hygiene.debris': { sev: 'info', data: { areaM2: null } },
  'handling.rough_handling': { sev: 'warn', data: { trackId: 't-91', dropHeightM: null } },
  'ppe.violation': {
    sev: 'warn',
    data: { trackId: 't-95', role: 'WORKER', missing: ['vest', 'gloves'] },
  },
  'compliance.on_belt': { sev: 'critical', data: { trackId: 't-91' } },
  'compliance.crowding': { sev: 'warn', data: { count: 9, limit: 8 } },
  'compliance.forklift_proximity': {
    sev: 'critical',
    data: { trackId: 't-91', forkliftId: 'f-2', distM: 1.2 },
  },
  'roster.captain_detected': { sev: 'info', data: { employeeId: 'EMP-1043', trackId: 't-88' } },
  'roster.captain_absent': { sev: 'warn', data: { employeeId: null, minutes: 12 } },
  'staging.pallet_wait': { sev: 'warn', data: { palletsWaiting: 5, oldestWaitSec: 420 } },
  'security.after_hours_presence': { sev: 'critical', data: { count: 2 } },
  'security.door_open_idle': { sev: 'warn', data: { minutes: 16 } },
  'security.truck_entry_no_loading': { sev: 'warn', data: { trackId: null } },
  'system.camera_offline': { sev: 'critical', data: cam },
  'system.camera_obstructed': { sev: 'warn', data: cam },
  'system.camera_defocus': { sev: 'warn', data: cam },
  'system.camera_moved': { sev: 'warn', data: cam },
  'system.camera_ok': { sev: 'info', data: cam },
  'system.pipeline_lag': { sev: 'warn', data: { lagMs: 2400 } },
};

function eventFor(key: EventKey, data: unknown = SAMPLES[key].data): unknown {
  const [category, type] = key.split('.');
  return {
    ...whEventFixture,
    category,
    type,
    sev: SAMPLES[key].sev,
    data,
  };
}

describe('event registry', () => {
  it('covers exactly the 33 catalogue rows', () => {
    expect(EXPECTED_KEYS).toHaveLength(33);
    expect([...EVENT_KEYS]).toEqual([...EXPECTED_KEYS]);
    expect(new Set(EVENT_KEYS).size).toBe(33);
    expect(EVENT_REGISTRY).toHaveLength(33);
  });

  it.each(EXPECTED_KEYS)('%s: default severity matches the catalogue', (key) => {
    expect(defaultSeverity(key)).toBe(SAMPLES[key].sev);
  });

  it.each(EXPECTED_KEYS)('%s: parses a valid event', (key) => {
    const r = parseWhEvent(eventFor(key));
    expect(r.ok, r.ok ? '' : JSON.stringify(r.error)).toBe(true);
    if (r.ok) expect(`${r.value.category}.${r.value.type}`).toBe(key);
  });

  it.each(EXPECTED_KEYS)('%s: rejects empty data', (key) => {
    expect(parseWhEvent(eventFor(key, {})).ok).toBe(false);
  });
});

describe('parseWhEvent', () => {
  it('accepts the contract fixture and narrows by category and type', () => {
    const r = parseWhEvent(whEventFixture);
    expect(r.ok).toBe(true);
    if (r.ok && r.value.category === 'hygiene' && r.value.type === 'damaged') {
      expect(r.value.data.pack).toBe('SACK');
      expect(r.value.data.sku).toBe('RIN-PB-1KG');
    } else {
      throw new Error('fixture should be hygiene.damaged');
    }
  });

  it('narrows truck.started data to a typed direction', () => {
    const r = parseWhEvent(eventFor('truck.started'));
    expect(r.ok).toBe(true);
    if (r.ok && r.value.category === 'truck' && r.value.type === 'started') {
      const dir: 'OUT' | 'IN' = r.value.data.dir;
      expect(dir).toBe('OUT');
    }
  });

  it('rejects an unknown type with a typed failure', () => {
    const r = parseWhEvent({ ...whEventFixture, type: 'exploded' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('UNKNOWN_EVENT_TYPE');
  });

  it('rejects an unknown category and a known type under the wrong category', () => {
    expect(parseWhEvent({ ...whEventFixture, category: 'weather' }).ok).toBe(false);
    expect(parseWhEvent({ ...whEventFixture, category: 'truck', type: 'damaged' }).ok).toBe(false);
  });

  it('rejects a data shape that belongs to another type', () => {
    const r = parseWhEvent({ ...whEventFixture, data: { minutes: 3 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SCHEMA');
  });

  it('rejects a wrong enum inside data', () => {
    expect(parseWhEvent(mutate(whEventFixture, ['data', 'pack'], 'BOX')).ok).toBe(false);
  });

  it('allows null for bay, refs.*, media, pos and clipKey', () => {
    for (const path of [['bay'], ['refs', 'visitId'], ['refs', 'trackId'], ['refs', 'sku']]) {
      expect(parseWhEvent(mutate(whEventFixture, path, null)).ok).toBe(true);
    }
    expect(parseWhEvent(mutate(whEventFixture, ['media'], null)).ok).toBe(true);
    expect(parseWhEvent(mutate(whEventFixture, ['pos'], null)).ok).toBe(true);
    expect(parseWhEvent(mutate(whEventFixture, ['media', 'clipKey'], null)).ok).toBe(true);
  });

  it('rejects null for title and a malformed ULID', () => {
    expect(parseWhEvent(mutate(whEventFixture, ['title'], null)).ok).toBe(false);
    expect(parseWhEvent(mutate(whEventFixture, ['id'], 'not-a-ulid')).ok).toBe(false);
  });

  it('never throws on garbage', () => {
    for (const raw of [null, undefined, 5, 'x', [], {}, { category: 1, type: 2 }]) {
      expect(parseWhEvent(raw).ok).toBe(false);
    }
  });
});

describe('subject <-> payload rule', () => {
  const parsed = parseWhEvent(whEventFixture);
  if (!parsed.ok) throw new Error('fixture must parse');
  const event = parsed.value;

  it('builds wh.{site}.evt.{category}.{type}', () => {
    expect(subjectFor(event)).toBe('wh.dhk-depot.evt.hygiene.damaged');
  });

  it('matches only its own subject', () => {
    expect(subjectMatchesEvent('wh.dhk-depot.evt.hygiene.damaged', event)).toBe(true);
    expect(subjectMatchesEvent('wh.dhk-depot.evt.hygiene.open_tape', event)).toBe(false);
    expect(subjectMatchesEvent('wh.other-site.evt.hygiene.damaged', event)).toBe(false);
  });

  it('parseWhEventFromSubject accepts a match and rejects a mismatch', () => {
    expect(parseWhEventFromSubject('wh.dhk-depot.evt.hygiene.damaged', event).ok).toBe(true);
    const bad = parseWhEventFromSubject('wh.dhk-depot.evt.hygiene.torn_sack', event);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe('SUBJECT_MISMATCH');
  });

  it('every sample event matches its own subject', () => {
    for (const key of EXPECTED_KEYS) {
      const r = parseWhEvent(eventFor(key));
      expect(r.ok).toBe(true);
      if (r.ok) expect(subjectFor(r.value)).toBe(`wh.dhk-depot.evt.${key}`);
    }
  });
});

describe('schema forms', () => {
  it('WhEventSchema validates inside zod containers and keeps the typed union', () => {
    expect(WhEventSchema.safeParse(whEventFixture).success).toBe(true);
    expect(WhEventSchema.safeParse({ ...whEventFixture, type: 'exploded' }).success).toBe(false);
  });

  const status = {
    status: 'ACK',
    ack: { by: 'u-07', at: '2026-10-24T19:52:10+06:00' },
    closed: null,
    notes: [],
  };

  it('WhEventWithStatusSchema merges event and status fields', () => {
    const r = WhEventWithStatusSchema.safeParse({ ...whEventFixture, ...status });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe('ACK');
  });

  it('WhEventWithStatusSchema rejects a bad status and an unknown type', () => {
    expect(
      WhEventWithStatusSchema.safeParse({ ...whEventFixture, ...status, status: 'X' }).success,
    ).toBe(false);
    expect(
      WhEventWithStatusSchema.safeParse({ ...whEventFixture, ...status, type: 'nope' }).success,
    ).toBe(false);
    expect(WhEventWithStatusSchema.safeParse(whEventFixture).success).toBe(false);
  });
});
