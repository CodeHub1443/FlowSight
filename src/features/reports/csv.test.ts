import { describe, expect, it } from 'vitest';
import {
  CSV_BOM,
  baysCsv,
  csvCell,
  csvLine,
  toCsv,
  truckLogCsv,
  type BaysCsvLabels,
  type TruckCsvLabels,
} from './csv';
import type { BayRowView, TruckLogRow } from './selectors';

const bayLabels: BaysCsvLabels = {
  bay: 'Bay',
  casesOut: 'Out',
  casesIn: 'In',
  trucks: 'Trucks',
  avgOccupancyMin: 'Occ',
  beltLoadedPct: 'Belt',
  detentions: 'Det',
  productIssues: 'Issues',
  ppe: 'PPE',
};
const truckLabels: TruckCsvLabels = {
  visitId: 'Visit',
  plateBn: 'Plate bn',
  plateEn: 'Plate en',
  agency: 'Agency',
  bay: 'Bay',
  dir: 'Dir',
  arrival: 'Arrival',
  docked: 'Docked',
  departed: 'Departed',
  waitMin: 'Wait',
  occupancyMin: 'Occ',
  casesOut: 'Out',
  casesIn: 'In',
  detention: 'Detention',
  yes: 'Yes',
  no: 'No',
};

describe('csvCell', () => {
  it('leaves plain text and numbers alone', () => {
    expect(csvCell('B01')).toBe('B01');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(0)).toBe('0');
  });
  it('quotes commas, quotes, CR and LF; doubles the quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });
  it('writes null, undefined and non-finite numbers as an empty cell', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe('');
  });
  it('keeps Bangla text intact', () => {
    expect(csvCell('ঢাকা মেট্রো-ট ১২-৫৯২৮')).toBe('ঢাকা মেট্রো-ট ১২-৫৯২৮');
    expect(csvCell('পদ্মা, লজিস্টিকস')).toBe('"পদ্মা, লজিস্টিকস"');
  });
  it('defuses text a spreadsheet would run as a formula, but not numbers', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@x')).toBe("'@x");
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell('=A,B')).toBe(`"'=A,B"`);
  });
});

describe('toCsv', () => {
  it('starts with the UTF-8 byte-order mark, uses CRLF and ends with a line break', () => {
    const out = toCsv(['a', 'b'], [[1, 'x,y']]);
    expect(out.startsWith(CSV_BOM)).toBe(true);
    expect(out).toBe(`${CSV_BOM}a,b\r\n1,"x,y"\r\n`);
  });
  it('encodes the BOM as EF BB BF and Bangla as UTF-8', () => {
    const bytes = new TextEncoder().encode(toCsv(['বে'], []));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('বে\r\n');
  });
  it('csvLine joins cells', () => {
    expect(csvLine(['a', 1, null])).toBe('a,1,');
  });
});

describe('baysCsv', () => {
  const row = (o: Partial<BayRowView>): BayRowView => ({
    bay: 'B01',
    casesOut: 10,
    casesIn: 5,
    trucks: 2,
    avgOccupancyMin: 61.74,
    beltLoadedShare: 0.5555,
    detentions: 1,
    productIssues: 3,
    ppe: 0,
    ...o,
  });
  it('writes one row per bay in the order given, rounding minutes and share to one decimal', () => {
    const csv = baysCsv(
      [row({}), row({ bay: 'B02', avgOccupancyMin: null, beltLoadedShare: null })],
      bayLabels,
    );
    expect(csv.split('\r\n')).toEqual([
      `${CSV_BOM}Bay,Out,In,Trucks,Occ,Belt,Det,Issues,PPE`,
      'B01,10,5,2,61.7,55.6,1,3,0',
      'B02,10,5,2,,,1,3,0',
      '',
    ]);
  });
});

describe('truckLogCsv', () => {
  const r: TruckLogRow = {
    visitId: 'V-1',
    plate: { bn: 'ঢাকা মেট্রো-ট ১২-৫৯২৮', en: 'DHAKA METRO-TA 12-5928', conf: 0.9 },
    agency: { en: 'PADMA, LOGISTICS', bn: 'পদ্মা' },
    bay: 'B07',
    dir: 'OUT',
    arrivedAt: '2026-10-24T07:19:28.954+06:00',
    dockedAt: '2026-10-24T07:21:20.168+06:00',
    departedAt: null,
    waitForDockMin: 1.94,
    occupancyMin: null,
    casesOut: 599,
    casesIn: 0,
    cartons: 599,
    detention: true,
  };
  it('has both plate spellings, an agency with a comma quoted, ISO +06:00 times and a detention word', () => {
    const csv = truckLogCsv([r], truckLabels, {
      agency: (x) => x.agency?.en ?? '',
      dir: (x) => x.dir,
    });
    const [head, line] = csv.split('\r\n');
    expect(head).toBe(
      `${CSV_BOM}Visit,Plate bn,Plate en,Agency,Bay,Dir,Arrival,Docked,Departed,Wait,Occ,Out,In,Detention`,
    );
    expect(line).toBe(
      'V-1,ঢাকা মেট্রো-ট ১২-৫৯২৮,DHAKA METRO-TA 12-5928,"PADMA, LOGISTICS",B07,OUT,2026-10-24T07:19:28+06:00,2026-10-24T07:21:20+06:00,,1.9,,599,0,Yes',
    );
  });
  it('writes No for a visit without detention and an empty agency for none', () => {
    const csv = truckLogCsv([{ ...r, agency: null, detention: false }], truckLabels, {
      agency: () => 'x',
      dir: (x) => x.dir,
    });
    const line = csv.split('\r\n')[1] ?? '';
    expect(line.endsWith(',No')).toBe(true);
    expect(line.split(',')[3]).toBe('');
  });
});
