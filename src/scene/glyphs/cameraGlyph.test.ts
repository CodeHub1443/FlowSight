// @vitest-environment node
import { describe, expect, it } from 'vitest';
import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { CameraStatusSchema, SiteConfigSchema } from '@/domain';
import { buildSiteLayout } from '../site/layout';
import {
  glyphState,
  GlyphBoard,
  lookDirection,
  newestOpenEventForCamera,
  PULSE_DEPTH,
  PULSE_PERIOD_S,
  pulseScale,
} from './cameraGlyph';

describe('glyph state from camera health (B6)', () => {
  it('a healthy camera shows only in X-ray mode', () => {
    expect(glyphState('OK', false)).toEqual({ visible: false, tint: 'neutral', pulse: false });
    expect(glyphState('OK', true)).toEqual({ visible: true, tint: 'neutral', pulse: false });
  });

  it('obstructed, defocused and moved always show, as a warning', () => {
    for (const status of ['OBSTRUCTED', 'DEFOCUS', 'MOVED'] as const) {
      for (const xray of [false, true]) {
        expect(glyphState(status, xray)).toEqual({ visible: true, tint: 'warn', pulse: false });
      }
    }
  });

  it('offline always shows, critical, and pulses', () => {
    for (const xray of [false, true]) {
      expect(glyphState('OFFLINE', xray)).toEqual({ visible: true, tint: 'critical', pulse: true });
    }
  });

  it('a camera nobody has reported yet is taken as healthy', () => {
    expect(glyphState(undefined, false).visible).toBe(false);
    expect(glyphState(undefined, true)).toEqual({ visible: true, tint: 'neutral', pulse: false });
  });

  it('covers every status the contract has', () => {
    for (const status of CameraStatusSchema.options) {
      expect(() => glyphState(status, false)).not.toThrow();
    }
  });
});

describe('the offline pulse', () => {
  it('is slow and gentle', () => {
    expect(PULSE_PERIOD_S).toBeGreaterThanOrEqual(2);
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < PULSE_PERIOD_S * 2; t += 0.01) {
      const k = pulseScale(t, false);
      min = Math.min(min, k);
      max = Math.max(max, k);
    }
    expect(max).toBeCloseTo(1 + PULSE_DEPTH, 2);
    expect(min).toBeCloseTo(1 - PULSE_DEPTH, 2);
    expect(PULSE_DEPTH).toBeLessThanOrEqual(0.25);
  });

  it('stands still under prefers-reduced-motion', () => {
    for (const t of [0, 0.3, 1.7, 99]) expect(pulseScale(t, true)).toBe(1);
  });
});

describe('click on a glyph selects the newest open event of that camera', () => {
  const ev = (id: string, ts: string, cam: string | null, status = 'OPEN') => ({
    id,
    ts,
    status,
    src: { cam },
  });
  const events = {
    a: ev('a', '2026-11-06T10:00:00+06:00', 'B04-CREW'),
    b: ev('b', '2026-11-06T11:00:00+06:00', 'B04-CREW'),
    c: ev('c', '2026-11-06T12:00:00+06:00', 'B04-CREW', 'ACK'),
    d: ev('d', '2026-11-06T12:30:00+06:00', 'B04-BELT'),
    e: ev('e', '2026-11-06T13:00:00+06:00', null),
    f: ev('f', '2026-11-06T09:00:00+06:00', 'B04-CREW', 'CLOSED'),
  };

  it('is the newest OPEN event of that camera, not an acknowledged or closed one, not another camera', () => {
    expect(newestOpenEventForCamera(events, 'B04-CREW')).toBe('b');
    expect(newestOpenEventForCamera(events, 'B04-BELT')).toBe('d');
  });

  it('is null (select nothing) when the camera has no open event', () => {
    expect(newestOpenEventForCamera(events, 'B04-DOCK')).toBeNull();
    expect(newestOpenEventForCamera({}, 'B04-CREW')).toBeNull();
    expect(newestOpenEventForCamera({ c: events.c, f: events.f }, 'B04-CREW')).toBeNull();
  });

  it('skips events the session may not see', () => {
    expect(newestOpenEventForCamera(events, 'B04-CREW', (e) => e.id !== 'b')).toBe('a');
    expect(newestOpenEventForCamera(events, 'B04-CREW', () => false)).toBeNull();
  });

  it('breaks a tie of time by id, so the answer does not depend on object order', () => {
    const t = '2026-11-06T10:00:00+06:00';
    const x = { p: ev('01A', t, 'B01-DOCK'), q: ev('01B', t, 'B01-DOCK') };
    const y = { q: x.q, p: x.p };
    expect(newestOpenEventForCamera(x, 'B01-DOCK')).toBe('01B');
    expect(newestOpenEventForCamera(y, 'B01-DOCK')).toBe('01B');
  });
});

describe('GlyphBoard', () => {
  const ids = ['B01-DOCK', 'B01-CREW', 'B01-BELT'];

  it('reports a change once, and only when a state differs', () => {
    const board = new GlyphBoard();
    expect(board.update(ids, () => 'OK', false)).toBe(true);
    const v = board.version;
    expect(board.update(ids, () => 'OK', false)).toBe(false);
    expect(board.version).toBe(v);
    expect(board.isVisible('B01-DOCK')).toBe(false);
    expect(board.update(ids, () => 'OK', true)).toBe(true);
    expect(board.isVisible('B01-DOCK')).toBe(true);
  });

  it('shows the camera that needs attention without X-ray, and not the others', () => {
    const board = new GlyphBoard();
    board.update(ids, (id) => (id === 'B01-CREW' ? 'OFFLINE' : 'OK'), false);
    expect(ids.map((id) => board.isVisible(id))).toEqual([false, true, false]);
    expect(board.states.get('B01-CREW')?.tint).toBe('critical');
    board.update(ids, () => 'OK', false);
    expect(board.isVisible('B01-CREW')).toBe(false);
  });

  it('knows nothing about a camera it was not told of', () => {
    expect(new GlyphBoard().isVisible('B09-DOCK')).toBe(false);
  });
});

describe('camera mounts from the site config', () => {
  const layout = buildSiteLayout(SiteConfigSchema.parse(siteConfigJson));

  it('every bay has its three cameras, named as the health frame names them', () => {
    expect(layout.bays.flatMap((b) => b.cameras.map((c) => c.id))).toEqual(
      layout.bays.flatMap((b) => ['DOCK', 'CREW', 'BELT'].map((r) => `${b.id}-${r}`)),
    );
    expect(layout.bays.flatMap((b) => b.cameras)).toHaveLength(21);
  });

  it('puts each at its config mount in the site frame (z above the dock floor)', () => {
    const b4 = layout.bays[3] as (typeof layout.bays)[number];
    const crew = b4.cameras.find((c) => c.role === 'CREW');
    // bay B04 stands on the south face at X = 0, Z = 38; the CREW camera is 13 m into the building, 6 m up
    expect(crew?.at).toEqual({ X: 0, Y: layout.floorLevel + 6, Z: 38 - 13 });
    const dock = b4.cameras.find((c) => c.role === 'DOCK');
    expect(dock?.at.X).toBeCloseTo(1.8, 9);
    expect(dock?.at.Z).toBeCloseTo(38 - 0.3, 9);
  });

  it('looks along the floor towards the door, or straight down', () => {
    expect(lookDirection('yard')).toEqual([0, -1, 0]);
    expect(lookDirection('door')).toEqual([0, -1, 0]);
    expect(lookDirection('down')).toEqual([0, 0, -1]);
    expect(lookDirection('anything else')).toEqual([0, -1, 0]);
  });
});
