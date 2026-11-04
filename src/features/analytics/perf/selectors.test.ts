import { describe, expect, it } from 'vitest';
import fixture from '@/domain/fixtures/bay-performance.json';
import { BayPerformanceSchema } from '@/domain';
import { INDEX_BAND, INDEX_BAND_TONE, MIN_INCLUDED_DEFAULT } from './constants';
import {
  axisMaxWith,
  confidenceNote,
  indexBand,
  noComparableBays,
  noFinishedTrucks,
  siteMedianLine,
  widgetStatus,
} from './selectors';

const perf = BayPerformanceSchema.parse(fixture);

describe('indexBand', () => {
  it('90 to 110 inclusive is comparable; under is slower, over is faster', () => {
    expect(indexBand(89.9)).toBe('slower');
    expect(indexBand(INDEX_BAND.low)).toBe('comparable');
    expect(indexBand(100)).toBe('comparable');
    expect(indexBand(INDEX_BAND.high)).toBe('comparable');
    expect(indexBand(110.1)).toBe('faster');
  });

  it('no index, no band', () => {
    expect(indexBand(null)).toBeNull();
    expect(indexBand(undefined)).toBeNull();
    expect(indexBand(Number.NaN)).toBeNull();
  });

  it('never uses the critical or ok tone (no red/green shouting)', () => {
    expect(Object.values(INDEX_BAND_TONE)).not.toContain('critical');
    expect(Object.values(INDEX_BAND_TONE)).not.toContain('ok');
    expect(INDEX_BAND_TONE.slower).toBe('warn');
  });
});

describe('confidenceNote', () => {
  it('OK: index shown plainly, no note', () => {
    expect(confidenceNote('OK', 10, 8)).toEqual({
      level: 'OK',
      muted: false,
      showIndex: true,
      key: null,
      params: { n: 10, min: 8 },
    });
  });

  it('LOW: index shown muted with "few trucks (n of min)"', () => {
    const n = confidenceNote('LOW', 5, MIN_INCLUDED_DEFAULT);
    expect(n).toMatchObject({ muted: true, showIndex: true, key: 'confidence.few' });
    expect(n.params).toEqual({ n: 5, min: 8 });
  });

  it('NONE: no index, "not enough comparable trucks"', () => {
    expect(confidenceNote('NONE', 2, 8)).toMatchObject({
      showIndex: false,
      muted: false,
      key: 'confidence.none',
    });
  });

  it('follows the fixture rows', () => {
    const b03 = perf.rows.find((r) => r.bay === 'B03');
    expect(b03 && confidenceNote(b03.confidence, b03.included, perf.minIncluded).muted).toBe(true);
  });
});

describe('siteMedianLine', () => {
  it('is a dashed, silent markLine at the median on the x axis by default', () => {
    const line = siteMedianLine(124, { label: 'Site median', color: '#556377' });
    expect(line).toMatchObject({
      silent: true,
      symbol: 'none',
      lineStyle: { type: 'dashed', color: '#556377' },
      label: { show: true, formatter: 'Site median', color: '#556377' },
      data: [{ xAxis: 124 }],
    });
    expect(siteMedianLine(5, { label: '', color: 'x', axis: 'y' })?.data).toEqual([{ yAxis: 5 }]);
    expect(siteMedianLine(5, { label: '', color: 'x' })?.label.show).toBe(false);
  });

  it('no median, no line', () => {
    expect(siteMedianLine(null, { label: 'm', color: 'x' })).toBeNull();
    expect(siteMedianLine(undefined, { label: 'm', color: 'x' })).toBeNull();
  });

  it('axisMaxWith keeps the median in view', () => {
    expect(axisMaxWith([10, null, 30], 50)).toBe(50);
    expect(axisMaxWith([10, 80], 50)).toBe(80);
    expect(axisMaxWith([], null)).toBe(0);
  });
});

describe('widgetStatus', () => {
  const judge = (p: typeof perf) =>
    noFinishedTrucks(p) ? 'empty' : noComparableBays(p) ? 'insufficient' : 'ready';

  it('loading, then error only when nothing is on screen', () => {
    expect(widgetStatus({ data: undefined, isError: false }, judge)).toBe('loading');
    expect(widgetStatus({ data: undefined, isError: true }, judge)).toBe('error');
    // a failed refetch keeps the data (no flicker)
    expect(widgetStatus({ data: perf, isError: true }, judge)).toBe('ready');
  });

  it('empty and insufficient from the data', () => {
    const empty = { ...perf, site: { ...perf.site, visits: 0 } };
    expect(widgetStatus({ data: empty, isError: false }, judge)).toBe('empty');
    const none = {
      ...perf,
      rows: perf.rows.map((r) => ({ ...r, index: null, confidence: 'NONE' as const })),
    };
    expect(widgetStatus({ data: none, isError: false }, judge)).toBe('insufficient');
  });
});
