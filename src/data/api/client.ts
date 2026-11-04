import type { z } from 'zod';
import { ApiErrorSchema } from '@/domain';

// The single REST boundary (docs/02 section 3): UI code never calls fetch. Every response is validated with the zod
// schema of docs/03; an invalid body is dropped and counted, and the caller gets an ApiRequestError (an error state),
// never malformed data.

export type ApiErrorKind = 'http' | 'network' | 'invalid';

export class ApiRequestError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  constructor(
    kind: ApiErrorKind,
    message: string,
    status: number | null = null,
    code: string | null = null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

let invalidResponses = 0;

/** Responses dropped because they failed their schema (debug readout, tests). */
export function invalidResponseCount(): number {
  return invalidResponses;
}

export function resetInvalidResponseCount(): void {
  invalidResponses = 0;
}

export type Query = Record<string, string | number | undefined>;

/** API base path (VITE_API_BASE, default `/api`; same origin behind Nginx, ADR-5). */
export function apiBase(): string {
  return import.meta.env.VITE_API_BASE || '/api';
}

export function apiUrl(path: string, query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
  const qs = params.toString();
  return `${apiBase()}${path}${qs ? `?${qs}` : ''}`;
}

/** GET a JSON endpoint and parse it with `schema`. Throws ApiRequestError. */
export async function apiGet<S extends z.ZodType>(
  path: string,
  query: Query,
  schema: S,
  signal?: AbortSignal,
): Promise<z.output<S>> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path, query), {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiRequestError('network', e instanceof Error ? e.message : String(e));
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = ApiErrorSchema.safeParse(body);
    throw new ApiRequestError(
      'http',
      err.success ? err.data.error.message : `HTTP ${res.status}`,
      res.status,
      err.success ? err.data.error.code : null,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    invalidResponses += 1;
    console.warn(`[api] dropped an invalid response from ${path}`, parsed.error.issues.slice(0, 3));
    throw new ApiRequestError('invalid', `invalid response from ${path}`, res.status);
  }
  return parsed.data;
}
