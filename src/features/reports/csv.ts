import { isoDhaka } from '@/data/api/endpoints';
import type { BayRowView, TruckLogRow } from './selectors';

// Client-side CSV for the report tables (Task 22C). UTF-8 with a byte-order mark so Excel shows Bangla, CRLF line ends,
// RFC 4180 quoting. Numbers go out as plain latin digits with a dot (machine-readable); headers follow the UI language.

export const CSV_BOM = '﻿';

export type CsvCell = string | number | boolean | null | undefined;

/** A text cell that a spreadsheet would read as a formula gets a leading apostrophe (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell, quoted when it holds a comma, quote, CR or LF. Numbers are never altered. */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLine(cells: readonly CsvCell[]): string {
  return cells.map(csvCell).join(',');
}

/** BOM + header + rows, CRLF separated, with a closing CRLF. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return CSV_BOM + [csvLine(header), ...rows.map(csvLine)].join('\r\n') + '\r\n';
}

const round1 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10) / 10);

export interface BaysCsvLabels {
  bay: string;
  casesOut: string;
  casesIn: string;
  trucks: string;
  avgOccupancyMin: string;
  beltLoadedPct: string;
  detentions: string;
  productIssues: string;
  ppe: string;
}

/** The bay table, in bay order, one row per bay. No totals row, so a pivot never double counts. */
export function baysCsv(rows: readonly BayRowView[], l: BaysCsvLabels): string {
  return toCsv(
    [
      l.bay,
      l.casesOut,
      l.casesIn,
      l.trucks,
      l.avgOccupancyMin,
      l.beltLoadedPct,
      l.detentions,
      l.productIssues,
      l.ppe,
    ],
    rows.map((r) => [
      r.bay,
      r.casesOut,
      r.casesIn,
      r.trucks,
      round1(r.avgOccupancyMin),
      r.beltLoadedShare === null ? null : round1(r.beltLoadedShare * 100),
      r.detentions,
      r.productIssues,
      r.ppe,
    ]),
  );
}

export interface TruckCsvLabels {
  visitId: string;
  plateBn: string;
  plateEn: string;
  agency: string;
  bay: string;
  dir: string;
  arrival: string;
  docked: string;
  departed: string;
  waitMin: string;
  occupancyMin: string;
  casesOut: string;
  casesIn: string;
  detention: string;
  yes: string;
  no: string;
}

const isoOrNull = (ts: string | null): string | null =>
  ts === null ? null : isoDhaka(Date.parse(ts));

/** The truck log: both plate spellings, both agency names kept as the UI language shows them, times as ISO with +06:00. */
export function truckLogCsv(
  rows: readonly TruckLogRow[],
  l: TruckCsvLabels,
  text: { agency: (r: TruckLogRow) => string; dir: (r: TruckLogRow) => string },
): string {
  return toCsv(
    [
      l.visitId,
      l.plateBn,
      l.plateEn,
      l.agency,
      l.bay,
      l.dir,
      l.arrival,
      l.docked,
      l.departed,
      l.waitMin,
      l.occupancyMin,
      l.casesOut,
      l.casesIn,
      l.detention,
    ],
    rows.map((r) => [
      r.visitId,
      r.plate.bn,
      r.plate.en,
      r.agency ? text.agency(r) : '',
      r.bay,
      text.dir(r),
      isoOrNull(r.arrivedAt),
      isoOrNull(r.dockedAt),
      isoOrNull(r.departedAt),
      round1(r.waitForDockMin),
      round1(r.occupancyMin),
      r.casesOut,
      r.casesIn,
      r.detention ? l.yes : l.no,
    ]),
  );
}

/** Offer a CSV string as a file download. UI-side only: Blob + object URL, no network. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // revoke after the click has been handled
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
