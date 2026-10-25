// @vitest-environment node
import { describe, expect, it } from 'vitest';
import siteConfigJson from '../../config/sites/dhk-depot.json';
import { REMOVE, mutate } from './testing';
import { SiteConfigSchema } from './siteConfig';

const raw: unknown = siteConfigJson;

describe('SiteConfig', () => {
  it('parses config/sites/dhk-depot.json', () => {
    const r = SiteConfigSchema.safeParse(raw);
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
    if (r.success) {
      expect(r.data.dockFaces[0]?.bays).toHaveLength(7);
      expect(r.data.businessDayStart).toBe('06:00');
      expect(r.data.shiftsPlaceholder.map((s) => s.id)).toEqual(['A', 'B', 'C']);
      expect(r.data.privacy.showCaptainNames).toBe(false);
      expect(r.data.thresholds.detentionMin).toBe(90);
    }
  });

  it('keeps the view block with exact values', () => {
    const r = SiteConfigSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.view).toEqual({
        focus: 'interior',
        cutawayWallHeight: 2.0,
        apronDepth: 12,
        showRoof: false,
        showExteriorContext: false,
        columnGrid: 12,
      });
    }
  });

  it.each([
    [['view'], REMOVE],
    [['view', 'focus'], 'aerial'],
    [['view', 'cutawayWallHeight'], 0],
    [['view', 'apronDepth'], -1],
    [['view', 'columnGrid'], 0],
  ])('rejects view %j = %j', (path, value) => {
    expect(SiteConfigSchema.safeParse(mutate(raw, path, value)).success).toBe(false);
  });

  it('keeps notes and context entries', () => {
    const r = SiteConfigSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.geo.note).toContain('verify on site');
      expect(r.data.context.map((c) => c.type)).toEqual(['road', 'building', 'trees', 'trees']);
    }
  });

  it.each([
    [['thresholds', 'detentionMin']],
    [['privacy']],
    [['businessDayStart']],
    [['dockFaces', 0, 'bays', 0, 'id']],
    [['bayInterior', 'conveyor', 'boomMaxReach']],
  ])('rejects a missing %j', (path) => {
    expect(SiteConfigSchema.safeParse(mutate(raw, path, REMOVE)).success).toBe(false);
  });

  it('rejects bad values', () => {
    expect(SiteConfigSchema.safeParse(mutate(raw, ['units'], 'ft')).success).toBe(false);
    expect(SiteConfigSchema.safeParse(mutate(raw, ['businessDayStart'], '6am')).success).toBe(
      false,
    );
    expect(
      SiteConfigSchema.safeParse(mutate(raw, ['dockFaces', 0, 'bays', 0, 'directionMode'], 'BOTH'))
        .success,
    ).toBe(false);
    expect(SiteConfigSchema.safeParse(mutate(raw, ['context', 0, 'type'], 'river')).success).toBe(
      false,
    );
    expect(
      SiteConfigSchema.safeParse(mutate(raw, ['building', 'facade', 'colors', 0], 'blue')).success,
    ).toBe(false);
  });
});
