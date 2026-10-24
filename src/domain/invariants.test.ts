// @vitest-environment node
import { describe, expect, it } from 'vitest';
import actorsFrame from './fixtures/actors-frame.json';
import bayState from './fixtures/bay-state.json';
import siteState from './fixtures/site-state.json';
import whEvent from './fixtures/wh-event.json';
import { parseWhEvent, subjectFor } from './events';
import { allKeys } from './testing';
import { safeParseMessage } from './validate';
import { secondsSince } from '../lib/time';

describe('fixture invariants (docs/03)', () => {
  it('BayState belt.shiftSec sums to seconds since SiteState.shift.start at the fixture ts', () => {
    const site = safeParseMessage('siteState', siteState);
    const bay = safeParseMessage('bayState', bayState);
    expect(site.ok && bay.ok).toBe(true);
    if (!site.ok || !bay.ok) return;
    const sum = Object.values(bay.value.belt.shiftSec).reduce((a, b) => a + b, 0);
    const elapsed = secondsSince(site.value.shift.start, bay.value.ts);
    // The fixture rounds to whole seconds (21045 vs 21045.12).
    expect(Math.abs(sum - elapsed)).toBeLessThan(1);
  });

  it('the shift window contains the fixture timestamp', () => {
    const site = safeParseMessage('siteState', siteState);
    expect(site.ok).toBe(true);
    if (!site.ok) return;
    const t = Date.parse(site.value.ts);
    expect(Date.parse(site.value.shift.start)).toBeLessThanOrEqual(t);
    expect(t).toBeLessThan(Date.parse(site.value.shift.end));
  });

  it('SiteState and BayState agree on site, and the bay visit id carries the bay', () => {
    expect(siteState.site).toBe(bayState.site);
    expect(bayState.visit.visitId).toContain(`-${bayState.bay}-`);
  });

  it('event subject matches category and type', () => {
    const r = parseWhEvent(whEvent);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(subjectFor(r.value)).toBe(
        `wh.${whEvent.site}.evt.${whEvent.category}.${whEvent.type}`,
      );
    }
  });

  it('ActorsFrame fixture carries no name or employee fields', () => {
    const keys = allKeys(actorsFrame);
    expect(keys.filter((k) => /name|employee/i.test(k))).toEqual([]);
  });

  it('ActorsFrame output never has name or employee fields, even if the input does', () => {
    const dirty = {
      ...actorsFrame,
      name: 'x',
      actors: actorsFrame.actors.map((a) => ({ ...a, name: 'x', employeeId: 'EMP-1' })),
    };
    const r = safeParseMessage('actors', dirty);
    expect(r.ok).toBe(true);
    if (r.ok) expect(allKeys(r.value).filter((k) => /name|employee/i.test(k))).toEqual([]);
  });
});
