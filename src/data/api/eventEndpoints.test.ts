// @vitest-environment node
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MIN } from '../mock/core/clock';
import { PEAK } from '../mock/core/testing';
import { InlineHost, SimRuntime } from '../mock/runtime';
import { createHandlers } from '../msw/handlers';
import { createSession } from '../msw/session';
import { ApiRequestError } from './client';
import {
  EVENTS_PAGE_SIZE,
  ackEvent,
  closeEvent,
  getEvent,
  getEvents,
  getMediaUrl,
  getReport,
  getVisit,
  noteEvent,
} from './endpoints';

// The new event / visit / report / media endpoints against the simulator's REST surface (the same handlers the app uses in
// mock mode). Every response goes through the zod schema inside the endpoint function, so a contract drift fails here.

const host = new InlineHost({ autoTick: false, now: () => PEAK });
const runtime = new SimRuntime(host);
const server = setupServer(...createHandlers({ runtime, session: createSession() }));
const SITE = 'dhk-depot';

beforeAll(async () => {
  vi.stubEnv('VITE_API_BASE', 'http://localhost/api');
  server.listen({ onUnhandledRequest: 'error' });
  await runtime.ensure({ seed: 5, scenario: 'peak', speed: 1, startMs: PEAK });
  host.controller.advance(30 * MIN);
}, 60_000);

afterAll(() => {
  server.close();
  runtime.dispose();
  vi.unstubAllEnvs();
});

describe('events endpoints', { timeout: 60_000 }, () => {
  it('getEvents pages by cursor without gaps or repeats, 100 per page by default', async () => {
    expect(EVENTS_PAGE_SIZE).toBe(100);
    const first = await getEvents({ site: SITE });
    expect(first.items).toHaveLength(100);
    expect(first.nextCursor).not.toBeNull();
    const second = await getEvents({ site: SITE, cursor: first.nextCursor ?? undefined });
    const ids = [...first.items, ...second.items].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const ts = [...first.items, ...second.items].map((e) => Date.parse(e.ts));
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
  });

  it('getEvents sends the filters', async () => {
    const page = await getEvents({
      site: SITE,
      status: ['OPEN'],
      sev: ['warn', 'critical'],
      bay: ['B01', 'B02'],
      limit: 50,
    });
    expect(page.items.length).toBeGreaterThan(0);
    for (const e of page.items) {
      expect(e.status).toBe('OPEN');
      expect(e.sev).not.toBe('info');
      expect(['B01', 'B02']).toContain(e.bay);
    }
  });

  it('getEvent returns one event and a 404 is an http ApiRequestError', async () => {
    const one = (await getEvents({ site: SITE, limit: 1 })).items[0];
    expect(one).toBeDefined();
    expect((await getEvent(one?.id ?? '')).id).toBe(one?.id);
    await expect(getEvent('01M5Q2V6W0M9S346Q3D25VT4FZ')).rejects.toMatchObject({
      kind: 'http',
      status: 404,
    });
  });

  it('ack, note and close move an open event forward', async () => {
    const open = (await getEvents({ site: SITE, status: ['OPEN'], limit: 5 })).items[0];
    expect(open).toBeDefined();
    const id = open?.id ?? '';
    expect((await ackEvent(id)).status).toBe('ACK');
    const noted = await noteEvent(id, 'checked on site');
    expect(noted.notes.at(-1)?.text).toBe('checked on site');
    const closed = await closeEvent(id, 'resolved');
    expect(closed.status).toBe('CLOSED');
    expect(closed.closed?.note).toBe('resolved');
    // already closed: the backend answers 409, surfaced as an http error
    const again = await ackEvent(id).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(ApiRequestError);
    expect(again).toMatchObject({ status: 409 });
  });
});

describe('visit, report and media endpoints', { timeout: 60_000 }, () => {
  it('getVisit returns the visit and its events', async () => {
    const withEvent = (await getEvents({ site: SITE, limit: 100 })).items.find(
      (e) => e.refs.visitId !== null,
    );
    expect(withEvent).toBeDefined();
    const detail = await getVisit(withEvent?.refs.visitId ?? '');
    expect(detail.visit.visitId).toBe(withEvent?.refs.visitId);
  });

  it('getReport returns the shift and the daily report, with avgOccupancyMin on every bay row', async () => {
    const shift = await getReport('shift', { site: SITE });
    expect(shift.kind).toBe('shift');
    expect(shift.bays).toHaveLength(7);
    for (const b of shift.bays) expect(b.avgOccupancyMin).not.toBeUndefined();
    const daily = await getReport('daily', { site: SITE });
    expect(daily.kind).toBe('daily');
    expect(daily.shiftId).toBeNull();
  });

  it('getMediaUrl presigns a snapshot key', async () => {
    const withMedia = (await getEvents({ site: SITE, limit: 100 })).items.find((e) => e.media);
    expect(withMedia?.media).toBeDefined();
    const p = await getMediaUrl(withMedia?.media?.snapshotKey ?? '');
    expect(p.url.length).toBeGreaterThan(0);
    expect(Date.parse(p.expiresAt)).toBeGreaterThan(0);
  });
});
