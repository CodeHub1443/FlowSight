// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as schemas from './schemas';

// Nothing in the domain may be left unvalidated: no z.unknown() / z.any(), except ApiError.details.

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Count unknown/any nodes in a zod schema tree (follows lazy getters, guards against cycles). */
function countUnknown(value: unknown, seen: WeakSet<object> = new WeakSet()): number {
  if (!isObject(value) || seen.has(value)) return 0;
  seen.add(value);
  const internals = value['_zod'];
  if (isObject(internals)) {
    const def = internals['def'];
    if (!isObject(def)) return 0;
    let n = def['type'] === 'unknown' || def['type'] === 'any' ? 1 : 0;
    const getter = def['getter'];
    if (def['type'] === 'lazy' && typeof getter === 'function') n += countUnknown(getter(), seen);
    return n + countUnknown(def, seen);
  }
  let n = 0;
  for (const v of Array.isArray(value) ? value : Object.values(value)) n += countUnknown(v, seen);
  return n;
}

describe('no unvalidated values in the domain schemas', () => {
  const exported = Object.entries(schemas).filter(([name]) => name.endsWith('Schema'));

  it('walks a meaningful number of schemas', () => {
    expect(exported.length).toBeGreaterThan(80);
  });

  it('ApiError.details is the single allowed unknown (also proves the walker works)', () => {
    expect(countUnknown(schemas.ApiErrorSchema)).toBe(1);
  });

  it.each(exported.filter(([name]) => name !== 'ApiErrorSchema'))(
    '%s has no unknown/any',
    (_name, schema) => {
      expect(countUnknown(schema)).toBe(0);
    },
  );

  it('event schemas (transform wrappers) are covered too', () => {
    expect(exported.map(([n]) => n)).toContain('WhEventSchema');
    expect(exported.map(([n]) => n)).toContain('WhEventWithStatusSchema');
  });
});
