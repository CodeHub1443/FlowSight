import type { z } from 'zod';
import { parseWhEvent } from './events';
import {
  ActorsFrameSchema,
  BayStateSchema,
  CaseTickSchema,
  EventLifecycleUpdateSchema,
} from './schemas';
import { BayPerformanceSchema, HealthFrameSchema, SiteStateSchema } from './schemas';
import { issuesOf, type ParseIssue } from './result';

// Maps each JSON example in docs/03-data-contract.md to the schema that must accept it, by section heading.
// Used by scripts/contract-check.mjs (loaded through Vite SSR) so the document and the code cannot drift.

type Validate = (json: unknown) => ParseIssue[];

function viaSchema(schema: z.ZodType): Validate {
  return (json) => {
    const r = schema.safeParse(json);
    return r.success ? [] : issuesOf(r.error);
  };
}

const viaEvent: Validate = (json) => {
  const r = parseWhEvent(json);
  return r.ok
    ? []
    : r.error.issues.length
      ? r.error.issues
      : [{ path: '', message: r.error.message }];
};

export type ContractBlockSpec = {
  /** Heading text the block sits under starts with this. */
  heading: string;
  /** Fixture file (in src/domain/fixtures) that must equal the block. */
  fixture: string;
  validate: Validate;
};

export const CONTRACT_BLOCKS: readonly ContractBlockSpec[] = [
  { heading: '3.1 SiteState', fixture: 'site-state.json', validate: viaSchema(SiteStateSchema) },
  { heading: '3.2 BayState', fixture: 'bay-state.json', validate: viaSchema(BayStateSchema) },
  {
    heading: '3.3 ActorsFrame',
    fixture: 'actors-frame.json',
    validate: viaSchema(ActorsFrameSchema),
  },
  { heading: '3.4 CaseTick', fixture: 'case-tick.json', validate: viaSchema(CaseTickSchema) },
  { heading: '3.5 WhEvent', fixture: 'wh-event.json', validate: viaEvent },
  {
    heading: '3.6 EventLifecycleUpdate',
    fixture: 'lifecycle-update.json',
    validate: viaSchema(EventLifecycleUpdateSchema),
  },
  {
    heading: '3.7 HealthFrame',
    fixture: 'health-frame.json',
    validate: viaSchema(HealthFrameSchema),
  },
  {
    heading: '4.4 Bay performance',
    fixture: 'bay-performance.json',
    validate: viaSchema(BayPerformanceSchema),
  },
];

export function findContractBlock(heading: string): ContractBlockSpec | undefined {
  return CONTRACT_BLOCKS.find((b) => heading === b.heading || heading.startsWith(`${b.heading} `));
}
