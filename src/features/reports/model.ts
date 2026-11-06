import type { Report, Role } from '@/domain';
import {
  selectBayRows,
  selectCaptains,
  selectEvidence,
  selectHandover,
  selectHeadlines,
  selectSku,
  selectTruckLog,
} from './selectors';

/** Everything the document and the CSV exports show, derived once from a Report and a role. */
export function buildReportModel(r: Report, role: Role) {
  const headlines = selectHeadlines(r);
  const { rows: bays, totals: bayTotals } = selectBayRows(r, headlines.occupancy.min);
  return {
    headlines,
    handover: selectHandover(r, role),
    bays,
    bayTotals,
    truckLog: selectTruckLog(r.visits),
    evidence: selectEvidence(r, role),
    sku: selectSku(r.sku),
    captains: selectCaptains(r.captains, role),
  };
}

export type ReportModel = ReturnType<typeof buildReportModel>;
