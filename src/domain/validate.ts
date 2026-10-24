import type { z } from 'zod';
import { parseWhEvent, parseWhEventFromSubject, type WhEvent } from './events';
import { failure, fromZod, type ParseError, type ParseResult } from './result';
import {
  ActorsFrameSchema,
  BayStateSchema,
  CaseTickSchema,
  EventLifecycleUpdateSchema,
  HealthFrameSchema,
  SiteStateSchema,
} from './schemas';
import type {
  ActorsFrame,
  BayState,
  CaseTick,
  EventLifecycleUpdate,
  HealthFrame,
  SiteState,
} from './types';

/** Kinds of inbound NATS message (docs/03 section 2). */
export type MessageKind =
  'siteState' | 'bayState' | 'actors' | 'case' | 'event' | 'lifecycle' | 'health';

export type MessageValue = {
  siteState: SiteState;
  bayState: BayState;
  actors: ActorsFrame;
  case: CaseTick;
  event: WhEvent;
  lifecycle: EventLifecycleUpdate;
  health: HealthFrame;
};

export type DropInfo = { kind: MessageKind; subject?: string; error: ParseError };

let dropHandler: ((info: DropInfo) => void) | null = null;

/** Hook point for the dropped-message counter (wired up by the stores later). Pass null to clear. */
export function setDropHandler(handler: ((info: DropInfo) => void) | null): void {
  dropHandler = handler;
}

function parseWith<S extends z.ZodType>(schema: S) {
  return (raw: unknown): ParseResult<z.output<S>> => fromZod(schema.safeParse(raw));
}

const parsers: { [K in MessageKind]: (raw: unknown) => ParseResult<MessageValue[K]> } = {
  siteState: parseWith(SiteStateSchema),
  bayState: parseWith(BayStateSchema),
  actors: parseWith(ActorsFrameSchema),
  case: parseWith(CaseTickSchema),
  event: parseWhEvent,
  lifecycle: parseWith(EventLifecycleUpdateSchema),
  health: parseWith(HealthFrameSchema),
};

function report<T>(result: ParseResult<T>, kind: MessageKind, subject?: string): ParseResult<T> {
  if (!result.ok && dropHandler) {
    try {
      dropHandler({ kind, ...(subject === undefined ? {} : { subject }), error: result.error });
    } catch {
      // A faulty counter must never reach the UI.
    }
  }
  return result;
}

function guarded<T>(run: () => ParseResult<T>): ParseResult<T> {
  try {
    return run();
  } catch (e) {
    return failure('EXCEPTION', e instanceof Error ? e.message : 'parse threw');
  }
}

/** Validate an inbound message. Never throws; invalid input is returned as a typed failure and counted. */
export function safeParseMessage<K extends MessageKind>(
  kind: K,
  raw: unknown,
): ParseResult<MessageValue[K]> {
  const parse: (raw: unknown) => ParseResult<MessageValue[K]> = parsers[kind];
  return report(
    guarded(() => parse(raw)),
    kind,
  );
}

/** Validate an event that arrived on a subject, enforcing the subject and payload rule. Never throws. */
export function safeParseEventOnSubject(subject: string, raw: unknown): ParseResult<WhEvent> {
  return report(
    guarded(() => parseWhEventFromSubject(subject, raw)),
    'event',
    subject,
  );
}
