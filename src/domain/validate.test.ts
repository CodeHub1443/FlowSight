// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import bayState from './fixtures/bay-state.json';
import whEvent from './fixtures/wh-event.json';
import {
  safeParseEventOnSubject,
  safeParseMessage,
  setDropHandler,
  type MessageKind,
} from './validate';

const KINDS: MessageKind[] = [
  'siteState',
  'bayState',
  'actors',
  'case',
  'event',
  'lifecycle',
  'health',
];

afterEach(() => setDropHandler(null));

describe('safeParseMessage', () => {
  it.each(KINDS)('%s never throws on garbage and returns a typed failure', (kind) => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    for (const raw of [null, undefined, 0, 'x', true, [], {}, circular, { v: 1 }, Symbol('s')]) {
      const r = safeParseMessage(kind, raw);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(typeof r.error.message).toBe('string');
        expect(Array.isArray(r.error.issues)).toBe(true);
      }
    }
  });

  it('returns the typed value on success', () => {
    const r = safeParseMessage('bayState', bayState);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.bay).toBe('B02');
  });

  it('reports each dropped message through the hook, with its kind', () => {
    const drops = vi.fn();
    setDropHandler(drops);
    safeParseMessage('bayState', { nope: true });
    safeParseMessage('bayState', bayState);
    expect(drops).toHaveBeenCalledTimes(1);
    expect(drops.mock.calls[0]?.[0]).toMatchObject({ kind: 'bayState', error: { code: 'SCHEMA' } });
  });

  it('survives a throwing hook', () => {
    setDropHandler(() => {
      throw new Error('counter broke');
    });
    expect(() => safeParseMessage('case', {})).not.toThrow();
  });

  it('works with no hook installed', () => {
    setDropHandler(null);
    expect(safeParseMessage('health', null).ok).toBe(false);
  });
});

describe('safeParseEventOnSubject', () => {
  it('accepts a matching subject', () => {
    expect(safeParseEventOnSubject('wh.dhk-depot.evt.hygiene.damaged', whEvent).ok).toBe(true);
  });

  it('drops and counts a subject mismatch', () => {
    const drops = vi.fn();
    setDropHandler(drops);
    const r = safeParseEventOnSubject('wh.dhk-depot.evt.hygiene.open_tape', whEvent);
    expect(r.ok).toBe(false);
    expect(drops).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'event',
        subject: 'wh.dhk-depot.evt.hygiene.open_tape',
        error: expect.objectContaining({ code: 'SUBJECT_MISMATCH' }),
      }),
    );
  });
});
