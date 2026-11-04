import { http, HttpResponse, type HttpHandler, type JsonBodyType } from 'msw';
import type { Role, WhEventWithStatus } from '@/domain';
import type { ApiRequest, ApiResponse } from '../mock/core/api';
import { iso } from '../mock/core/clock';
import { getSimRuntime, type SimRuntime } from '../mock/runtime';
import { peopleRows, type PresenceRow } from './people';
import { renderPlaceholder } from './placeholder';
import { actorOf, createSession, loginAs, natsCreds, publicUser, type Session } from './session';

const MIN = 60_000;

export interface MockApiOptions {
  /** Path prefix of the REST API (VITE_API_BASE). */
  apiBase?: string;
  runtime?: SimRuntime;
  session?: Session;
}

const json = (res: ApiResponse): Response => {
  if (res.status === 204) return new HttpResponse(null, { status: 204 });
  if (res.contentType && typeof res.body === 'string') {
    return new HttpResponse(res.body, {
      status: res.status,
      headers: { 'content-type': res.contentType, ...res.headers },
    });
  }
  return HttpResponse.json(res.body as JsonBodyType, { status: res.status, headers: res.headers });
};

const apiError = (status: number, code: string, message: string): Response =>
  HttpResponse.json({ error: { code, message } }, { status });

/** [method, msw path] for everything the simulator core answers. */
const CORE_ROUTES: readonly (readonly ['get' | 'post' | 'put', string])[] = [
  ['get', '/sites'],
  ['get', '/sites/:site/config'],
  ['get', '/sites/:site/snapshot'],
  ['get', '/events'],
  ['get', '/events/:id'],
  ['post', '/events/:id/ack'],
  ['post', '/events/:id/close'],
  ['post', '/events/:id/note'],
  ['get', '/visits'],
  ['get', '/visits/:visitId'],
  ['get', '/analytics/throughput'],
  ['get', '/analytics/dwell'],
  ['get', '/analytics/belt-utilisation'],
  ['get', '/analytics/sku'],
  ['get', '/analytics/compliance'],
  ['get', '/analytics/hygiene'],
  ['get', '/analytics/productivity'],
  ['get', '/analytics/camera-uptime'],
  ['get', '/analytics/bay-performance'],
  ['get', '/leaderboard'],
  ['get', '/reports/shift'],
  ['get', '/reports/daily'],
  ['get', '/reports/:kind/export'],
  ['get', '/replay'],
  ['get', '/admin/shifts'],
  ['put', '/admin/shifts'],
  ['get', '/admin/roster'],
  ['put', '/admin/roster'],
  ['get', '/admin/employees'],
  ['get', '/admin/skus'],
  ['put', '/admin/skus'],
  ['get', '/admin/bays'],
  ['put', '/admin/bays'],
  ['get', '/admin/cameras'],
  ['put', '/admin/cameras'],
  ['get', '/admin/thresholds'],
  ['put', '/admin/thresholds'],
  ['get', '/admin/alert-rules'],
  ['put', '/admin/alert-rules'],
  ['post', '/admin/alert-rules/:id/test'],
  ['get', '/admin/telegram'],
  ['put', '/admin/telegram'],
  ['get', '/admin/users'],
  ['put', '/admin/users'],
];

async function bodyOf(request: Request): Promise<unknown> {
  if (request.method === 'GET') return undefined;
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

/** Placeholder images kept alive for the presign mock. */
const MAX_EVIDENCE_BLOBS = 200;

/** Handlers for every endpoint of docs/03 section 4. The REST data comes from the simulator's 7-day history. */
export function createHandlers(opts: MockApiOptions = {}): HttpHandler[] {
  const base = opts.apiBase ?? '/api';
  const runtime = opts.runtime ?? getSimRuntime();
  const session = opts.session ?? createSession();
  const at = (path: string): string => `*${base}${path}`;
  const blobUrls = new Map<string, string>();

  const request = async (r: Request, role?: Role): Promise<ApiResponse | null> => {
    const actor = actorOf(session);
    if (!actor) return null;
    const url = new URL(r.url);
    const path = url.pathname.slice(url.pathname.indexOf(base) + base.length) || '/';
    const req: ApiRequest = {
      method: r.method,
      path,
      query: Object.fromEntries(url.searchParams),
      body: await bodyOf(r),
      actor: role ? { ...actor, role } : actor,
    };
    return runtime.request(req);
  };

  const core = CORE_ROUTES.map(([method, path]) =>
    http[method](at(path), async ({ request: r }) => {
      const res = await request(r);
      return res ? json(res) : apiError(401, 'UNAUTHENTICATED', 'sign in first');
    }),
  );

  const auth = [
    http.post(at('/auth/login'), async ({ request: r }) => {
      const b = (await bodyOf(r)) as { username?: unknown; password?: unknown } | undefined;
      const user =
        typeof b?.username === 'string' && typeof b.password === 'string'
          ? loginAs(session, b.username, b.password)
          : null;
      if (!user) return apiError(401, 'BAD_CREDENTIALS', 'unknown user or empty password');
      return HttpResponse.json({ user: publicUser(user), natsCreds: natsCreds() });
    }),
    http.post(at('/auth/logout'), () => {
      session.user = null;
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(at('/me'), () =>
      session.user
        ? HttpResponse.json(publicUser(session.user))
        : apiError(401, 'UNAUTHENTICATED', 'sign in first'),
    ),
    http.post(at('/auth/nats-refresh'), () =>
      session.user
        ? HttpResponse.json(natsCreds())
        : apiError(401, 'UNAUTHENTICATED', 'sign in first'),
    ),
  ];

  const people = http.get(at('/analytics/people'), async ({ request: r }) => {
    const actor = actorOf(session);
    if (!actor) return apiError(401, 'UNAUTHENTICATED', 'sign in first');
    // privacy rule: worker behaviour is reports-only, for DC_MANAGER and ADMIN
    if (actor.role !== 'DC_MANAGER' && actor.role !== 'ADMIN') {
      return apiError(
        403,
        'FORBIDDEN',
        'worker behaviour data is restricted to DC_MANAGER and ADMIN',
      );
    }
    const url = new URL(r.url);
    const q = Object.fromEntries(url.searchParams);
    const res = await runtime.request({ method: 'GET', path: '/__mock/presence', query: q, actor });
    const presence = ((res.body as { rows?: PresenceRow[] } | null)?.rows ?? []).filter(
      (p) => !q.bay || p.bay === q.bay,
    );
    return HttpResponse.json({ rows: peopleRows(runtime.options.seed, presence) });
  });

  const presign = http.get(at('/media/presign'), async ({ request: r }) => {
    const actor = actorOf(session);
    if (!actor) return apiError(401, 'UNAUTHENTICATED', 'sign in first');
    const key = new URL(r.url).searchParams.get('key') ?? '';
    const m = /^evidence\/[a-z0-9-]+\/\d{4}-\d{2}-\d{2}\/([0-9A-Z]{26})\.(jpg|mp4)$/.exec(key);
    if (!m) return apiError(400, 'BAD_REQUEST', 'unknown media key');
    // the mock stores snapshots only (clipKey is null); a clip request cannot have come from a mock event
    if (m[2] === 'mp4') return apiError(404, 'NOT_FOUND', 'clips are not available in mock mode');
    let url = blobUrls.get(key);
    if (!url) {
      const res = await runtime.request({
        method: 'GET',
        path: `/events/${m[1]}`,
        query: {},
        actor,
      });
      const ev = res.status === 200 ? (res.body as WhEventWithStatus) : null;
      if (!ev?.media) return apiError(404, 'NOT_FOUND', 'no evidence for that key');
      const blob = await renderPlaceholder({
        title: ev.title.en,
        bay: ev.bay,
        ts: ev.ts,
        bbox: ev.media.bbox,
        frameW: ev.media.frameW,
        frameH: ev.media.frameH,
      });
      url = URL.createObjectURL(blob);
      blobUrls.set(key, url);
      // insertion order: the oldest placeholder goes first
      const oldest = blobUrls.size > MAX_EVIDENCE_BLOBS ? blobUrls.entries().next().value : null;
      if (oldest) {
        URL.revokeObjectURL(oldest[1]);
        blobUrls.delete(oldest[0]);
      }
    }
    return HttpResponse.json({ url, expiresAt: iso(Date.now() + 15 * MIN) });
  });

  return [...auth, ...core, people, presign];
}
