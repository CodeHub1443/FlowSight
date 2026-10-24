import { z } from 'zod';

export type ParseIssue = { path: string; message: string };

export type ParseErrorCode = 'SCHEMA' | 'UNKNOWN_EVENT_TYPE' | 'SUBJECT_MISMATCH' | 'EXCEPTION';

export type ParseError = { code: ParseErrorCode; message: string; issues: ParseIssue[] };

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError };

export function failure(
  code: ParseErrorCode,
  message: string,
  issues: ParseIssue[] = [],
): { ok: false; error: ParseError } {
  return { ok: false, error: { code, message, issues } };
}

export function issuesOf(error: z.ZodError): ParseIssue[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}

export function fromZod<T>(result: z.ZodSafeParseResult<T>): ParseResult<T> {
  if (result.success) return { ok: true, value: result.data };
  const issues = issuesOf(result.error);
  const first = issues[0];
  return failure('SCHEMA', first ? `${first.path || '(root)'}: ${first.message}` : 'invalid', issues);
}
