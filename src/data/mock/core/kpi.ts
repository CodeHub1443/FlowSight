import type { Turnaround } from '@/domain';

// Site KPIs the simulator derives from its own records (contract rev 1.1, docs/03 section 3.1). Pure.

/**
 * PPE compliance, 0-100. The contract defines it as the % of evaluated person-observations with all mandatory PPE;
 * the mock keeps no per-observation history, so it uses a penalty proxy on the day's PPE violations. PPE only:
 * safety events (compliance.on_belt, crowding, forklift_proximity) do not lower it.
 */
export function complianceScoreOf(ppeViolations: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - 1.5 * ppeViolations)));
}

/** The five visit timestamps, epoch ms (null = not reached). */
export interface VisitTimes {
  arrivedAt: number;
  dockedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  departedAt: number | null;
}

const MIN = 60_000;

/** Mean of `to - from` in minutes over the visits where both are known (negative spans are clock noise: 0). */
function meanMin(
  visits: readonly VisitTimes[],
  from: (v: VisitTimes) => number | null,
  to: (v: VisitTimes) => number | null,
): number | null {
  let sum = 0;
  let n = 0;
  for (const v of visits) {
    const a = from(v);
    const b = to(v);
    if (a === null || b === null) continue;
    sum += Math.max(0, b - a) / MIN;
    n += 1;
  }
  return n > 0 ? Math.round(sum / n) : null;
}

/**
 * The turnaround breakdown over the visits completed in one business day. The caller passes that day's visits;
 * visits without `departedAt` are not in the sample. Whole minutes, the same rounding as `kpi.avgTatMin`.
 */
export function aggregateTurnaround(visits: readonly VisitTimes[]): Turnaround {
  const done = visits.filter((v) => v.departedAt !== null);
  return {
    n: done.length,
    depotTatMin: meanMin(
      done,
      (v) => v.arrivedAt,
      (v) => v.departedAt,
    ),
    waitForDockMin: meanMin(
      done,
      (v) => v.arrivedAt,
      (v) => v.dockedAt,
    ),
    occupancyMin: meanMin(
      done,
      (v) => v.dockedAt,
      (v) => v.departedAt,
    ),
    preOpDelayMin: meanMin(
      done,
      (v) => v.dockedAt,
      (v) => v.startedAt,
    ),
    activeMin: meanMin(
      done,
      (v) => v.startedAt,
      (v) => v.finishedAt,
    ),
    postOpDelayMin: meanMin(
      done,
      (v) => v.finishedAt,
      (v) => v.departedAt,
    ),
  };
}
