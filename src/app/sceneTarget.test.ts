import { describe, expect, it } from 'vitest';
import actorsJson from '@/domain/fixtures/actors-frame.json';
import { safeParseMessage, type ActorsFrame, type WhEventWithStatus } from '@/domain';
import { makeBay, makeEvent } from '@/stores/testUtils';
import { bayOfSelection, flyTargetFor, type SceneTargetContext } from './sceneTarget';

const parsed = safeParseMessage('actors', actorsJson);
if (!parsed.ok) throw new Error(parsed.error.message);
const actorsB02: ActorsFrame = parsed.value;

const TS = '2026-10-24T13:50:00Z';
const b02 = makeBay('B02', TS);
const b05 = makeBay('B05', TS, (b) => {
  b.visit = null;
});
const event = makeEvent('01M5Q2V6W0M9S346Q3D25VT4F5', { bay: 'B05' });
const noBayEvent = makeEvent('01M5Q2V6W0M9S346Q3D25VT4F6', { bay: null });
const withStatus = (e: typeof event): WhEventWithStatus => ({
  ...e,
  status: 'OPEN',
  ack: null,
  closed: null,
  notes: [],
});

const ctx: SceneTargetContext = {
  bayIds: new Set(['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07']),
  bays: { B02: b02, B05: b05 },
  visits: {
    'V-OLD-B07': {
      bay: 'B07',
      visit: { ...(b02.visit as NonNullable<typeof b02.visit>), visitId: 'V-OLD-B07' },
      rxAt: 0,
    },
  },
  actors: {
    B02: actorsB02,
    B06: { ...actorsB02, bay: 'B06' },
  },
  events: { [event.id]: withStatus(event), [noBayEvent.id]: withStatus(noBayEvent) },
};

const target = (kind: Parameters<typeof flyTargetFor>[0]['kind'], id: string | null) =>
  flyTargetFor({ kind, id, seq: 1 }, ctx);

describe('flyTargetFor', () => {
  it('flies to bay ids directly (bay, belt and staging selections)', () => {
    expect(target('bay', 'B03')).toBe('B03');
    expect(target('belt', 'B06')).toBe('B06');
    expect(target('staging', 'B01')).toBe('B01');
  });

  it('resolves a truck (visit id) to its bay, from the live bay or the kept visit record', () => {
    expect(target('truck', 'V-20261024-B02-0007')).toBe('B02');
    expect(target('truck', 'V-OLD-B07')).toBe('B07');
  });

  it('resolves people and forklifts through the actors frames (first bay by id wins)', () => {
    expect(target('person', 't-88')).toBe('B02');
    expect(target('forklift', 'f-2')).toBe('B02');
  });

  it('resolves an event to its bay', () => {
    expect(target('event', event.id)).toBe('B05');
  });

  it('flies home for site and home targets', () => {
    expect(target('home', null)).toBe('floorOverview');
    expect(target('site', 'dhk-depot')).toBe('floorOverview');
  });

  it('does nothing for unknown ids, unknown bays and events without a bay', () => {
    expect(target('bay', 'B99')).toBeNull();
    expect(target('truck', 'V-NOPE')).toBeNull();
    expect(target('person', 't-404')).toBeNull();
    expect(target('event', 'nope')).toBeNull();
    expect(target('event', noBayEvent.id)).toBeNull();
    expect(target('bay', null)).toBeNull();
  });
});

describe('bayOfSelection', () => {
  it('gives the bay used for the selection ring', () => {
    expect(bayOfSelection({ kind: 'truck', id: 'V-20261024-B02-0007' }, ctx)).toBe('B02');
    expect(bayOfSelection({ kind: 'site', id: 'dhk-depot' }, ctx)).toBeNull();
  });
});
