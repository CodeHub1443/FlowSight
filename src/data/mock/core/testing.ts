// Shared helpers for the simulator tests (no runtime use).
import { SiteConfigSchema, type SiteConfig } from '@/domain';
import siteConfigJson from '../../../../config/sites/dhk-depot.json';
import { Depot } from './depot';
import type { SimMessage } from './types';

export const CFG: SiteConfig = SiteConfigSchema.parse(siteConfigJson);

/** 2026-10-24 19:20 Asia/Dhaka: the evening peak, same date as the contract fixtures. */
export const PEAK = Date.parse('2026-10-24T19:20:00+06:00');

export function makeDepot(seed = 1, startMs = PEAK, historyDays = 7): Depot {
  const d = new Depot({ seed, startMs, cfg: structuredClone(CFG), historyDays });
  d.runHistory();
  return d;
}

/** The connect snapshot followed by `simMs` of live messages. */
export function stream(d: Depot, simMs: number): SimMessage[] {
  const out: SimMessage[] = [...d.snapshot()];
  d.advanceTo(d.now + simMs);
  out.push(...d.drain());
  return out;
}
