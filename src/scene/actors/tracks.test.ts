// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Actor, ActorsFrame } from '@/domain';
import {
  ActorTracks,
  capActors,
  carriesPallet,
  FADE_OUT_MS,
  lerpAngle,
  MAX_PEOPLE_PER_BAY,
  showsPpeRing,
  TELEPORT_M,
  UNSEEN_MS,
} from './tracks';

const person = (over: Partial<Actor> = {}): Actor => ({
  id: 't-1',
  kind: 'PERSON',
  role: 'WORKER',
  x: 0,
  y: 8,
  h: 0,
  act: 'WALKING',
  ppeOk: true,
  ...over,
});

const frame = (actors: Actor[], bay = 'B01'): ActorsFrame => ({
  v: 1,
  ts: '2026-10-24T19:50:45.500+06:00',
  site: 'dhk-depot',
  bay,
  actors,
});

describe('interpolation between frames', () => {
  it('moves linearly from the rendered pose to the new frame over the time between frames', () => {
    const w = new ActorTracks();
    w.applyFrame(frame([person({ x: 0 })]), 0);
    w.update(0, 16, true);
    w.applyFrame(frame([person({ x: 2 })]), 500);
    w.update(750, 16, true);
    const t = w.tracks.get('t-1');
    expect(t?.x).toBeCloseTo(1, 5);
    w.update(1000, 16, true);
    expect(t?.x).toBeCloseTo(2, 5);
    // holds at the last frame rather than extrapolating
    w.update(1500, 16, true);
    expect(t?.x).toBeCloseTo(2, 5);
  });

  it('continues from where the actor is drawn when a frame lands mid-leg', () => {
    const w = new ActorTracks();
    w.applyFrame(frame([person({ x: 0 })]), 0);
    w.applyFrame(frame([person({ x: 2 })]), 500);
    w.update(750, 16, true);
    w.applyFrame(frame([person({ x: 3 })]), 750);
    w.update(750, 16, true);
    expect(w.tracks.get('t-1')?.x).toBeCloseTo(1, 5);
  });

  it('turns the short way round across the +-pi seam', () => {
    expect(lerpAngle(3.0, -3.0, 0.5)).toBeCloseTo(Math.PI, 1);
    expect(Math.abs(lerpAngle(3.0, -3.0, 0.25))).toBeGreaterThan(3.0);
    expect(lerpAngle(-0.5, 0.5, 0.5)).toBeCloseTo(0, 5);
  });

  it('snaps a step too long to be movement', () => {
    const w = new ActorTracks();
    w.applyFrame(frame([person({ x: 0 })]), 0);
    w.update(0, 16, true);
    w.applyFrame(frame([person({ x: TELEPORT_M + 1 })]), 500);
    w.update(500, 16, true);
    expect(w.tracks.get('t-1')?.x).toBeCloseTo(TELEPORT_M + 1, 5);
  });

  it('places actors on their latest frame without interpolating when not animated (Low tier)', () => {
    const w = new ActorTracks();
    w.applyFrame(frame([person({ x: 0 })]), 0);
    w.update(0, 16, false);
    w.applyFrame(frame([person({ x: 2 })]), 500);
    w.update(501, 16, false);
    expect(w.tracks.get('t-1')?.x).toBe(2);
  });
});

describe('fade', () => {
  it('fades in, holds, fades out after 5 s unseen and then forgets the actor', () => {
    const w = new ActorTracks();
    w.applyFrame(frame([person()]), 0);
    w.update(0, 16, true);
    expect(w.tracks.get('t-1')?.fade).toBe(0);
    w.update(1000, 16, true);
    expect(w.tracks.get('t-1')?.fade).toBe(1);
    w.update(UNSEEN_MS, 16, true);
    expect(w.tracks.get('t-1')?.fade).toBe(1);
    w.update(UNSEEN_MS + FADE_OUT_MS / 2, 16, true);
    expect(w.tracks.get('t-1')?.fade).toBeCloseTo(0.5, 5);
    w.update(UNSEEN_MS + FADE_OUT_MS + 1, 16, true);
    expect(w.tracks.has('t-1')).toBe(false);
  });

  it('never fades on the Low tier, where a figure caught mid-fade would stay dithered, but still forgets the unseen', () => {
    const w = new ActorTracks();
    w.applyFrame(frame([person()]), 0);
    w.update(1, 16, false);
    expect(w.tracks.get('t-1')?.fade).toBe(1);
    w.update(UNSEEN_MS + FADE_OUT_MS / 2, 16, false);
    expect(w.tracks.get('t-1')?.fade).toBe(1);
    w.update(UNSEEN_MS + FADE_OUT_MS + 1, 16, false);
    expect(w.tracks.has('t-1')).toBe(false);
  });

  it('a frame without the actor does not refresh it, a frame with it does', () => {
    const w = new ActorTracks();
    w.applyFrame(frame([person()]), 0);
    w.applyFrame(frame([]), 4000);
    w.update(UNSEEN_MS + 1, 16, true);
    expect(w.tracks.get('t-1')?.fade).toBeLessThan(1);
    w.applyFrame(frame([person()]), UNSEEN_MS + 2);
    w.update(UNSEEN_MS + 3000, 16, true);
    expect(w.tracks.get('t-1')?.fade).toBe(1);
  });
});

describe('state mapping', () => {
  it('shows the amber PPE ring only on a known violation of a person', () => {
    expect(showsPpeRing(person({ ppeOk: false }))).toBe(true);
    expect(showsPpeRing(person({ ppeOk: true }))).toBe(false);
    expect(showsPpeRing(person({ ppeOk: null }))).toBe(false);
    expect(showsPpeRing({ kind: 'FORKLIFT', ppeOk: false })).toBe(false);
  });

  it('puts a pallet on the forks only when a forklift is CARRYING', () => {
    expect(carriesPallet({ kind: 'FORKLIFT', act: 'CARRYING' })).toBe(true);
    expect(carriesPallet({ kind: 'FORKLIFT', act: 'DRIVING' })).toBe(false);
    expect(carriesPallet({ kind: 'FORKLIFT', act: 'STATIONARY' })).toBe(false);
    expect(carriesPallet({ kind: 'PERSON', act: 'CARRYING' })).toBe(false);
  });

  it('caps the actors of a bay, keeping the first of each kind', () => {
    const many = Array.from({ length: MAX_PEOPLE_PER_BAY + 5 }, (_, i) => person({ id: `t-${i}` }));
    const lifts = ['f-1', 'f-2'].map((id): Actor => ({
      ...person({ id }),
      kind: 'FORKLIFT',
      role: 'FORKLIFT_OP',
      ppeOk: null,
    }));
    const kept = capActors([...many, ...lifts]);
    expect(kept.filter((a) => a.kind === 'PERSON').length).toBe(MAX_PEOPLE_PER_BAY);
    expect(kept.filter((a) => a.kind === 'FORKLIFT').map((a) => a.id)).toEqual(['f-1']);
    expect(kept[0]?.id).toBe('t-0');
  });
});
