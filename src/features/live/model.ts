import type { BayState, BayVisit, Lang, UiLang, VisitPhase, WhEventWithStatus } from '@/domain';
import type { Selection, VisitRecord } from '@/stores';
import { formatPlate } from '@/lib/format';

// Pure view-model helpers for the live screen. No React, no stores: everything takes its inputs as arguments.

export interface ActiveVisit {
  bay: string;
  visit: BayVisit;
}

/** Visits currently attached to a bay (arrived, docked, loading/unloading or finished but not yet gone). */
export function activeVisits(bays: readonly BayState[]): ActiveVisit[] {
  return bays.flatMap((b) => (b.visit ? [{ bay: b.bay, visit: b.visit }] : []));
}

const isWorking = (v: BayVisit) => v.phase === 'LOADING' || v.phase === 'UNLOADING';

/**
 * The visit the tracker shows.
 *  - truck selected: that visit (fresh bay data first, then the kept visit record);
 *  - bay / belt / staging selected: that bay's visit, or null when no truck is there;
 *  - anything else (nothing, site, event, person, forklift): the first loading/unloading visit, else the first visit.
 */
export function resolveVisit(
  selection: Selection | null,
  bays: readonly BayState[],
  visits: Readonly<Record<string, VisitRecord>>,
): ActiveVisit | null {
  const active = activeVisits(bays);
  if (selection?.kind === 'truck') {
    const live = active.find((a) => a.visit.visitId === selection.id);
    if (live) return live;
    const kept = visits[selection.id];
    return kept ? { bay: kept.bay, visit: kept.visit } : null;
  }
  if (selection?.kind === 'bay' || selection?.kind === 'belt' || selection?.kind === 'staging') {
    return active.find((a) => a.bay === selection.id) ?? null;
  }
  return active.find((a) => isWorking(a.visit)) ?? active[0] ?? null;
}

export type TrackerKey = 'arrived' | 'docked' | 'loading' | 'finished' | 'departed';
export type StepState = 'done' | 'current' | 'pending';
export interface TrackerStep {
  key: TrackerKey;
  /** ISO timestamp, or null when the step has not happened (or was not observed). */
  at: string | null;
  state: StepState;
}

const PHASE_STEP: Record<VisitPhase, number> = {
  ARRIVED: 0,
  DOCKED: 1,
  LOADING: 2,
  UNLOADING: 2,
  FINISHED: 3,
  DEPARTED: 4,
};

/** Arrived -> Docked -> Loading -> Finished -> Departed, with each step's state derived from `phase`. */
export function trackerSteps(visit: BayVisit): TrackerStep[] {
  const at = [visit.arrivedAt, visit.dockedAt, visit.startedAt, visit.finishedAt, visit.departedAt];
  const keys: TrackerKey[] = ['arrived', 'docked', 'loading', 'finished', 'departed'];
  const current = PHASE_STEP[visit.phase];
  return keys.map((key, i) => ({
    key,
    at: at[i] ?? null,
    // The last step is terminal: once reached it is done, not "in progress".
    state:
      i < current || (i === current && i === 4) ? 'done' : i === current ? 'current' : 'pending',
  }));
}

/** Seconds from arrival to departure (or to `nowMs` while the truck is still here). Never negative. */
export function dwellSec(visit: BayVisit, nowMs: number): number {
  const end = visit.departedAt ? Date.parse(visit.departedAt) : nowMs;
  return Math.max(0, (end - Date.parse(visit.arrivedAt)) / 1000);
}

/** Cases moved so far: inbound count for UNLOADING, outbound otherwise. */
export function visitCount(visit: BayVisit): number {
  return visit.phase === 'UNLOADING' ? visit.casesIn : visit.casesOut;
}

/** Progress 0-100, or null when the expected quantity is unknown (never guessed). */
export function visitProgress(visit: BayVisit): number | null {
  if (visit.expected === null || visit.expected === 0) return null;
  return (visitCount(visit) / visit.expected) * 100;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchGroup = 'bays' | 'trucks' | 'captains' | 'events';
export interface SearchHit {
  group: SearchGroup;
  /** Unique within a result list. */
  key: string;
  title: string;
  subtitle: string | null;
  selection: Selection;
}

export interface SearchContext {
  bays: readonly BayState[];
  events: readonly WhEventWithStatus[];
  lang: UiLang;
  showCaptainNames: boolean;
  bayLabel: (bayId: string, lang: keyof Lang) => string;
  bayConveyor: (bayId: string) => string | null;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Lower-case, Bangla digits to Latin, so "২১৭১" finds "2171". */
export function normalizeSearch(text: string): string {
  return text
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .toLowerCase()
    .trim();
}

const PER_GROUP = 5;

function matches(tokens: readonly string[], ...fields: (string | null | undefined)[]): boolean {
  const hay = normalizeSearch(fields.filter((f): f is string => !!f).join(' | '));
  return tokens.every((t) => hay.includes(t));
}

/** Grouped search over live store data: bays, trucks (plate bn/en, agency), captains (only when names are allowed), events. */
export function searchEntities(query: string, ctx: SearchContext): SearchHit[] {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const label = (id: string) => ctx.bayLabel(id, ctx.lang);
  const hits: SearchHit[] = [];

  for (const b of ctx.bays) {
    if (
      matches(
        tokens,
        b.bay,
        ctx.bayLabel(b.bay, 'en'),
        ctx.bayLabel(b.bay, 'bn'),
        ctx.bayConveyor(b.bay),
      )
    )
      hits.push({
        group: 'bays',
        key: `bay:${b.bay}`,
        title: label(b.bay),
        subtitle: ctx.bayConveyor(b.bay),
        selection: { kind: 'bay', id: b.bay },
      });
  }

  for (const { bay, visit } of activeVisits(ctx.bays)) {
    if (
      matches(
        tokens,
        visit.plate.bn,
        visit.plate.en,
        visit.agency?.en,
        visit.agency?.bn,
        visit.visitId,
      )
    ) {
      const plate = formatPlate(visit.plate);
      hits.push({
        group: 'trucks',
        key: `truck:${visit.visitId}`,
        title: plate.primary,
        subtitle: [plate.secondary, label(bay)].filter(Boolean).join(' · '),
        selection: { kind: 'truck', id: visit.visitId },
      });
    }
  }

  if (ctx.showCaptainNames) {
    for (const b of ctx.bays) {
      const c = b.crew.captain;
      if (c?.name && matches(tokens, c.name.en, c.name.bn)) {
        hits.push({
          group: 'captains',
          key: `captain:${b.bay}`,
          title: c.name[ctx.lang] || c.name.en,
          subtitle: label(b.bay),
          selection: c.trackId ? { kind: 'person', id: c.trackId } : { kind: 'bay', id: b.bay },
        });
      }
    }
  }

  for (const e of ctx.events) {
    if (
      matches(
        tokens,
        e.id,
        e.title.en,
        e.title.bn,
        e.refs.plateEn,
        `${e.category}.${e.type}`,
        e.bay,
      )
    ) {
      hits.push({
        group: 'events',
        key: `event:${e.id}`,
        title: e.title[ctx.lang] || e.title.en,
        subtitle: [e.bay ? label(e.bay) : null, e.id].filter(Boolean).join(' · '),
        selection: { kind: 'event', id: e.id },
      });
    }
  }

  const counts: Record<SearchGroup, number> = { bays: 0, trucks: 0, captains: 0, events: 0 };
  return hits.filter((h) => ++counts[h.group] <= PER_GROUP);
}
