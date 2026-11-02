import { describe, expect, it } from 'vitest';
import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema } from '@/domain';
import { buildSiteLayout } from '../site/layout';
import {
  focusAllowsSceneKeys,
  KEY_PAN,
  keyAction,
  KeyInput,
  ORBIT_DAMPING,
  PAN_MARGIN,
  panLimits,
  panSpeed,
  panVelocity,
  stepPan,
  stepZoom,
  type GroundVelocity,
  type KeyEventLike,
  type PanLimits,
  type PanState,
} from './keyboardPan';
import { presetPose, SCENE_PRESETS } from './presets';
import { SCENE_SAFE_AREA, viewFit } from './view';

const OPEN: PanLimits = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 };

/** Run `seconds` of pan at `fps`; the velocity starts at rest. */
function run(
  want: GroundVelocity,
  seconds: number,
  fps: number,
  limits = OPEN,
  from: PanState = { vx: 0, vz: 0, x: 0, z: 0 },
): PanState {
  let s = from;
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) s = stepPan(s, want, limits, 1 / fps);
  return s;
}

describe('pan direction, relative to the camera yaw', () => {
  const axes = {
    left: { x: -1, z: 0 },
    right: { x: 1, z: 0 },
    up: { x: 0, z: 1 },
    down: { x: 0, z: -1 },
  } as const;

  it('camera on the +z side of the target, looking along -z: the plain directions', () => {
    const v = (a: { x: -1 | 0 | 1; z: -1 | 0 | 1 }) => panVelocity(a, 0, 10, 1);
    expect(v(axes.left).x).toBeCloseTo(-1);
    expect(v(axes.left).z).toBeCloseTo(0);
    expect(v(axes.right).x).toBeCloseTo(1);
    expect(v(axes.up).z).toBeCloseTo(-1);
    expect(v(axes.up).x).toBeCloseTo(0);
    expect(v(axes.down).z).toBeCloseTo(1);
  });

  it('camera on the -z side of the target, looking along +z: all four turn with the view', () => {
    const v = (a: { x: -1 | 0 | 1; z: -1 | 0 | 1 }) => panVelocity(a, 0, -10, 1);
    expect(v(axes.left).x).toBeCloseTo(1);
    expect(v(axes.right).x).toBeCloseTo(-1);
    expect(v(axes.up).z).toBeCloseTo(1);
    expect(v(axes.down).z).toBeCloseTo(-1);
  });

  it('at every yaw: up moves along the view, right moves 90 degrees clockwise of it from above', () => {
    for (let yaw = 0; yaw < 2 * Math.PI; yaw += 0.37) {
      const offset = { x: Math.sin(yaw) * 50, z: Math.cos(yaw) * 50 };
      const look = { x: -offset.x / 50, z: -offset.z / 50 };
      const up = panVelocity(axes.up, offset.x, offset.z, 1);
      expect(up.x).toBeCloseTo(look.x);
      expect(up.z).toBeCloseTo(look.z);
      const right = panVelocity(axes.right, offset.x, offset.z, 1);
      expect(right.x * look.x + right.z * look.z).toBeCloseTo(0);
      // y component of look x right: negative means clockwise seen from above (y up)
      expect(look.z * right.x - look.x * right.z).toBeCloseTo(-1);
    }
  });

  it('a diagonal keeps the speed; opposite keys and a degenerate pose stand still', () => {
    const d = panVelocity({ x: 1, z: 1 }, 0, 10, 2);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(2);
    expect(panVelocity({ x: 0, z: 0 }, 0, 10, 2)).toEqual({ x: 0, z: 0 });
    expect(panVelocity({ x: 1, z: 0 }, 0, 0, 2)).toEqual({ x: 0, z: 0 });
  });
});

describe('pan speed', () => {
  it('scales with the camera distance, so it takes the same share of the view at any zoom', () => {
    expect(panSpeed(20, false)).toBeCloseTo(20 * KEY_PAN.speedPerMetre);
    expect(panSpeed(100, false) / panSpeed(20, false)).toBeCloseTo(5);
  });

  it('Shift is about 3x', () => {
    expect(panSpeed(50, true) / panSpeed(50, false)).toBeCloseTo(3);
  });
});

describe('frame-rate independence', () => {
  const want = { x: 10, z: -4 };

  it('the distance covered while a key is held does not depend on the frame rate', () => {
    const at60 = run(want, 2, 60);
    for (const fps of [8, 30, 144, 240]) {
      const s = run(want, 2, fps);
      expect(s.x).toBeCloseTo(at60.x, 6);
      expect(s.z).toBeCloseTo(at60.z, 6);
    }
  });

  it('the coast after release does not depend on the frame rate either', () => {
    const moving = run(want, 2, 60);
    const at60 = run({ x: 0, z: 0 }, 0.5, 60, OPEN, moving);
    const at144 = run({ x: 0, z: 0 }, 0.5, 144, OPEN, moving);
    expect(at144.x).toBeCloseTo(at60.x, 6);
    expect(at144.vx).toBeCloseTo(at60.vx, 6);
  });

  it('holding reaches the full speed in under a second', () => {
    const s = run(want, 1, 60);
    expect(Math.hypot(s.vx, s.vz)).toBeGreaterThan(0.99 * Math.hypot(want.x, want.z));
  });
});

describe('release', () => {
  it('stops with the OrbitControls damping: one 60 fps frame keeps 1 - damping of the speed', () => {
    const moving: PanState = { vx: 10, vz: 0, x: 0, z: 0 };
    const s = stepPan(moving, { x: 0, z: 0 }, OPEN, 1 / 60);
    expect(s.vx / moving.vx).toBeCloseTo(1 - ORBIT_DAMPING, 6);
  });

  it('comes to a full rest, and then stays exactly where it is', () => {
    const moving: PanState = { vx: 40, vz: -40, x: 0, z: 0 };
    const rest = run({ x: 0, z: 0 }, 3, 60, OPEN, moving);
    expect(rest.vx).toBe(0);
    expect(rest.vz).toBe(0);
    expect(run({ x: 0, z: 0 }, 1, 60, OPEN, rest)).toEqual(rest);
  });
});

describe('pan limits', () => {
  const limits: PanLimits = { minX: -10, maxX: 10, minZ: -5, maxZ: 5 };

  it('derive from the layout bounds and the margin', () => {
    expect(panLimits({ minX: 0, maxX: 4, minZ: 1, maxZ: 2 }, 3)).toEqual({
      minX: -3,
      maxX: 7,
      minZ: -2,
      maxZ: 5,
    });
  });

  it('never let the target out, at any frame rate or speed', () => {
    for (const fps of [4, 30, 60, 144]) {
      let s: PanState = { vx: 0, vz: 0, x: 0, z: 0 };
      for (let i = 0; i < 3 * fps; i++) {
        s = stepPan(s, { x: 500, z: -500 }, limits, 1 / fps);
        expect(s.x).toBeLessThanOrEqual(limits.maxX);
        expect(s.z).toBeGreaterThanOrEqual(limits.minZ);
      }
      expect(s.x).toBe(limits.maxX);
      expect(s.z).toBe(limits.minZ);
    }
  });

  it('pressed against a limit nothing moves and no velocity builds up (no jitter, no later lurch)', () => {
    let s: PanState = { vx: 0, vz: 0, x: limits.maxX, z: 0 };
    for (let i = 0; i < 120; i++) {
      s = stepPan(s, { x: 30, z: 0 }, limits, 1 / 60);
      expect(s.x).toBe(limits.maxX);
      expect(s.vx).toBe(0);
    }
  });

  it('slides along an edge when the view is diagonal to it', () => {
    const s = run({ x: 30, z: 3 }, 0.5, 60, limits, { vx: 0, vz: 0, x: limits.maxX, z: 0 });
    expect(s.x).toBe(limits.maxX);
    expect(s.z).toBeGreaterThan(0);
  });

  it('every camera preset rests inside the limits, so a key press never makes a preset jump', () => {
    const layout = buildSiteLayout(SiteConfigSchema.parse(siteConfigJson));
    const l = panLimits(layout.bounds, PAN_MARGIN);
    const fit = viewFit(1920, 1031, SCENE_SAFE_AREA);
    for (const name of [...SCENE_PRESETS, ...layout.bays.map((b) => b.id)]) {
      const [x, , z] = presetPose(layout, name, fit)?.target ?? [NaN, 0, NaN];
      expect(x, name).toBeGreaterThanOrEqual(l.minX);
      expect(x, name).toBeLessThanOrEqual(l.maxX);
      expect(z, name).toBeGreaterThanOrEqual(l.minZ);
      expect(z, name).toBeLessThanOrEqual(l.maxZ);
    }
  });
});

describe('keyboard zoom', () => {
  const zoom = (axis: -1 | 0 | 1, seconds: number, from = { rate: 0, distance: 50 }, fps = 60) => {
    let s = from;
    for (let i = 0; i < seconds * fps; i++) s = stepZoom(s, axis, 10, 120, 1 / fps);
    return s;
  };

  it('moves in the asked direction and stays inside the distance limits', () => {
    expect(zoom(-1, 0.5).distance).toBeLessThan(50);
    expect(zoom(1, 0.5).distance).toBeGreaterThan(50);
    const near = zoom(-1, 10);
    expect(near).toEqual({ rate: 0, distance: 10 });
    expect(zoom(1, 10)).toEqual({ rate: 0, distance: 120 });
  });

  it('does not depend on the frame rate, and rests after release', () => {
    expect(zoom(1, 2, undefined, 144).distance).toBeCloseTo(zoom(1, 2).distance, 6);
    expect(zoom(0, 3, zoom(1, 1)).rate).toBe(0);
  });
});

describe('KeyInput', () => {
  const event = (key: string, code = key, extra: Partial<KeyEventLike> = {}): KeyEventLike => ({
    key,
    code,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    defaultPrevented: false,
    ...extra,
  });

  it('maps the arrows and the zoom keys, and nothing else', () => {
    expect(keyAction('ArrowLeft')).toBe('left');
    expect(keyAction('ArrowUp')).toBe('forward');
    expect(keyAction('+')).toBe('zoomIn');
    expect(keyAction('=')).toBe('zoomIn');
    expect(keyAction('-')).toBe('zoomOut');
    expect(keyAction('a')).toBeNull();
    expect(keyAction('/')).toBeNull();
    expect(keyAction('Escape')).toBeNull();
    expect(keyAction('constructor')).toBeNull();
  });

  it('holds from keydown to keyup, consumes the key and combines axes', () => {
    const k = new KeyInput();
    expect(k.keydown(event('ArrowLeft'), document.body)).toBe(true);
    expect(k.axes()).toMatchObject({ x: -1, z: 0 });
    expect(k.keydown(event('ArrowUp'), document.body)).toBe(true);
    expect(k.axes()).toMatchObject({ x: -1, z: 1 });
    expect(k.keydown(event('ArrowRight'), document.body)).toBe(true);
    expect(k.axes()).toMatchObject({ x: 0, z: 1 });
    k.keyup(event('ArrowLeft'));
    k.keyup(event('ArrowRight'));
    k.keyup(event('ArrowUp'));
    expect(k.axes()).toEqual({ x: 0, z: 0, zoom: 0 });
  });

  it('does not consume other keys', () => {
    const k = new KeyInput();
    expect(k.keydown(event('a'), document.body)).toBe(false);
    expect(k.keydown(event('Escape'), document.body)).toBe(false);
    expect(k.axes()).toEqual({ x: 0, z: 0, zoom: 0 });
  });

  it('repeat events start nothing, but a held key keeps consuming them', () => {
    const k = new KeyInput();
    expect(k.keydown(event('ArrowLeft', 'ArrowLeft', { repeat: true }), document.body)).toBe(false);
    expect(k.axes().x).toBe(0);
    k.keydown(event('ArrowLeft'), document.body);
    expect(k.keydown(event('ArrowLeft', 'ArrowLeft', { repeat: true }), document.body)).toBe(true);
    expect(k.axes().x).toBe(-1);
  });

  it('follows Shift through press and release, on any key event', () => {
    const k = new KeyInput();
    k.keydown(event('Shift', 'ShiftLeft', { shiftKey: true }), document.body);
    expect(k.shift).toBe(true);
    k.keydown(event('ArrowLeft', 'ArrowLeft', { shiftKey: true }), document.body);
    expect(k.axes().x).toBe(-1);
    k.keyup({ code: 'ShiftLeft', shiftKey: false });
    expect(k.shift).toBe(false);
    expect(k.axes().x).toBe(-1);
  });

  it('releases + by its code, although Shift changed the character in between', () => {
    const k = new KeyInput();
    k.keydown(event('+', 'Equal', { shiftKey: true }), document.body);
    expect(k.axes().zoom).toBe(-1);
    k.keyup({ code: 'Equal', shiftKey: false });
    expect(k.axes().zoom).toBe(0);
  });

  it.each(['ctrlKey', 'altKey', 'metaKey'] as const)(
    'ignores keys with %s held, and drops what was held',
    (flag) => {
      const k = new KeyInput();
      k.keydown(event('ArrowUp'), document.body);
      expect(k.keydown(event('ArrowLeft', 'ArrowLeft', { [flag]: true }), document.body)).toBe(
        false,
      );
      expect(k.axes()).toEqual({ x: 0, z: 0, zoom: 0 });
    },
  );

  it('leaves Ctrl+Shift+D alone', () => {
    const k = new KeyInput();
    expect(k.keydown(event('D', 'KeyD', { ctrlKey: true, shiftKey: true }), document.body)).toBe(
      false,
    );
  });

  it('leaves a key another handler already consumed', () => {
    const k = new KeyInput();
    expect(k.keydown(event('ArrowUp', 'ArrowUp', { defaultPrevented: true }), document.body)).toBe(
      false,
    );
    expect(k.axes().z).toBe(0);
  });

  it('losing the window drops everything, because the keyups will not arrive', () => {
    const k = new KeyInput();
    k.keydown(event('ArrowUp', 'ArrowUp', { shiftKey: true }), document.body);
    k.clear();
    expect(k.axes().z).toBe(0);
    expect(k.shift).toBe(false);
  });

  describe('focus', () => {
    const html = `
      <div data-scene-keys tabindex="0" id="region">
        <button id="map-button"></button>
        <canvas id="canvas"></canvas>
        <input id="inner-input" />
        <div role="dialog"><button id="inner-dialog"></button></div>
      </div>
      <input id="search" />
      <textarea id="text"></textarea>
      <select id="select"></select>
      <div contenteditable="true"><span id="editable"></span></div>
      <div role="dialog"><button id="dialog-button"></button></div>
      <div role="menu"><div id="menu-item" tabindex="-1"></div></div>
      <div id="tray" tabindex="0" style="overflow-y:auto"><button id="tray-row"></button><p id="tray-text"></p></div>
    `;
    const el = (id: string) => document.getElementById(id);

    it.each(['region', 'map-button', 'canvas'])('the camera takes the keys from #%s', (id) => {
      document.body.innerHTML = html;
      expect(focusAllowsSceneKeys(el(id))).toBe(true);
    });

    it('the camera takes the keys when nothing has the focus', () => {
      document.body.innerHTML = html;
      expect(focusAllowsSceneKeys(document.body)).toBe(true);
      expect(focusAllowsSceneKeys(document.documentElement)).toBe(true);
      expect(focusAllowsSceneKeys(null)).toBe(true);
    });

    it.each([
      'search',
      'text',
      'select',
      'editable',
      'dialog-button',
      'menu-item',
      'tray',
      'tray-row',
      'inner-input',
      'inner-dialog',
    ])('the camera leaves the keys to #%s', (id) => {
      document.body.innerHTML = html;
      const k = new KeyInput();
      expect(focusAllowsSceneKeys(el(id))).toBe(false);
      expect(k.keydown(event('ArrowDown'), el(id))).toBe(false);
      expect(k.axes().z).toBe(0);
    });

    it('a press on a panel leaves focus on the page, and the arrows to that panel', () => {
      document.body.innerHTML = html;
      const k = new KeyInput();
      k.pointerdown(el('tray-text'));
      expect(k.keydown(event('ArrowDown'), document.body)).toBe(false);
      // back on the scene the keys work again
      k.pointerdown(el('canvas'));
      expect(k.keydown(event('ArrowDown'), el('region'))).toBe(true);
    });

    it('leaving the search box with Escape gives the keys back to the camera', () => {
      document.body.innerHTML = html;
      const k = new KeyInput();
      k.pointerdown(el('search'));
      k.focusin(el('search'));
      expect(k.keydown(event('ArrowDown'), document.body)).toBe(true);
    });

    it('moving the focus to a list while a key is down stops the motion', () => {
      document.body.innerHTML = html;
      const k = new KeyInput();
      k.keydown(event('ArrowDown'), el('region'));
      k.focusin(el('tray-row'));
      expect(k.axes().z).toBe(0);
    });

    it('a press on a panel while a key is down stops the motion', () => {
      document.body.innerHTML = html;
      const k = new KeyInput();
      k.keydown(event('ArrowDown'), el('region'));
      k.pointerdown(el('tray-text'));
      expect(k.axes().z).toBe(0);
    });
  });
});
