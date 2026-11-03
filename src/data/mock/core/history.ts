import type { EventStatus, Severity, WhEvent } from '@/domain';
import { TIMELINE_EVENTS } from './catalog';
import { HOUR, iso } from './clock';
import type { HistoryLike } from './ctx';
import type { BeltInterval, CameraIncident, EventRec, VisitRec } from './types';

const SEV_RANK: Record<Severity, number> = { info: 0, warn: 1, critical: 2 };
export const CURVE_SLOT_MS = 600_000;
const SLOTS_PER_DAY = 144;

export type Curve = { out: Int32Array; in: Int32Array };

/** Trailing history the simulator keeps. One day over the 7 it starts with, so a 7-day report stays complete. */
export const HISTORY_RETENTION_DAYS = 8;

/** In place, keeping the order. */
function removeWhere<T>(list: T[], drop: (item: T) => boolean): void {
  let kept = 0;
  for (const item of list) if (!drop(item)) list[kept++] = item;
  list.length = kept;
}

/**
 * Everything the simulator remembers for REST: events, visits, belt intervals, hourly counts, camera incidents.
 * Written by the bays; read by the API router. Nothing here is ever published on a live channel.
 */
export class HistoryStore implements HistoryLike {
  readonly events: EventRec[] = [];
  readonly eventById = new Map<string, EventRec>();
  readonly visits: VisitRec[] = [];
  readonly visitById = new Map<string, VisitRec>();
  readonly belt = new Map<string, BeltInterval[]>();
  /** `${bay}|${dir}|${hour}` -> items, hour = floor(epoch / 1h). */
  readonly hourCounts = new Map<string, number>();
  /** `${hour}|${bay}|${sku}` -> tally. */
  readonly skuHour = new Map<string, { count: number; confSum: number }>();
  readonly incidents: CameraIncident[] = [];
  private readonly open = new Map<string, Set<string>>();
  private readonly curves = new Map<string, Curve>();

  addVisit(v: VisitRec): void {
    this.visits.push(v);
    this.visitById.set(v.visitId, v);
  }

  addBeltInterval(bay: string, i: BeltInterval): void {
    if (i.end <= i.start) return;
    let list = this.belt.get(bay);
    if (!list) {
      list = [];
      this.belt.set(bay, list);
    }
    list.push(i);
  }

  countCase(bay: string, dir: 'OUT' | 'IN', ts: number, sku: string, conf: number): void {
    const hour = Math.floor(ts / HOUR);
    const k = `${bay}|${dir}|${hour}`;
    this.hourCounts.set(k, (this.hourCounts.get(k) ?? 0) + 1);
    const sk = `${hour}|${bay}|${sku}`;
    const cur = this.skuHour.get(sk);
    if (cur) {
      cur.count += 1;
      cur.confSum += conf;
    } else {
      this.skuHour.set(sk, { count: 1, confSum: conf });
    }
  }

  /** Records an event. Timeline events (arrived, docked, ...) are closed by the system at creation. */
  addEvent(ev: WhEvent): EventRec {
    const timeline = TIMELINE_EVENTS.has(`${ev.category}.${ev.type}`);
    const rec: EventRec = {
      ...ev,
      status: timeline ? 'CLOSED' : 'OPEN',
      ack: null,
      closed: timeline ? { by: 'system', at: ev.ts, note: 'auto-closed' } : null,
      notes: [],
    };
    // events are produced in near-time order; insert from the end to keep the list sorted by ts
    let i = this.events.length;
    const t = Date.parse(rec.ts);
    while (i > 0 && Date.parse((this.events[i - 1] as EventRec).ts) > t) i -= 1;
    this.events.splice(i, 0, rec);
    this.eventById.set(rec.id, rec);
    if (!timeline) this.openSet(rec.bay).add(rec.id);
    return rec;
  }

  private openSet(bay: string | null): Set<string> {
    const key = bay ?? '_';
    let s = this.open.get(key);
    if (!s) {
      s = new Set();
      this.open.set(key, s);
    }
    return s;
  }

  /** Forward-only status change (OPEN -> ACK -> CLOSED). A note keeps the status and is appended. */
  setStatus(id: string, status: EventStatus, by: string, ts: number, note: string | null): void {
    const e = this.eventById.get(id);
    if (!e) return;
    const at = iso(ts);
    if (status === e.status) {
      if (note !== null) e.notes.push({ by, at, text: note });
      return;
    }
    if (status === 'ACK') {
      e.status = 'ACK';
      e.ack = { by, at };
      if (note !== null) e.notes.push({ by, at, text: note });
    } else if (status === 'CLOSED') {
      e.status = 'CLOSED';
      e.ack ??= { by, at };
      e.closed = { by, at, note: note ?? '' };
      this.openSet(e.bay).delete(id);
    }
  }

  /** Open (OPEN or ACK) alert count and worst severity for a bay, or the whole site when `bay` is null. */
  openStats(bay: string | null): { count: number; maxSev: Severity | null } {
    let count = 0;
    let max = -1;
    const sets = bay === null ? [...this.open.values()] : [this.open.get(bay)];
    for (const set of sets) {
      if (!set) continue;
      for (const id of set) {
        const e = this.eventById.get(id);
        if (!e) continue;
        count += 1;
        max = Math.max(max, SEV_RANK[e.sev]);
      }
    }
    const sev = (['info', 'warn', 'critical'] as const)[max] ?? null;
    return { count, maxSev: sev };
  }

  /** Ids of every event that is not closed yet (a copy: callers close while iterating). */
  openIds(): string[] {
    const out: string[] = [];
    for (const set of this.open.values()) out.push(...set);
    return out;
  }

  openBySeverity(): Record<Severity, number> {
    const out: Record<Severity, number> = { info: 0, warn: 0, critical: 0 };
    for (const set of this.open.values()) {
      for (const id of set) {
        const e = this.eventById.get(id);
        if (e) out[e.sev] += 1;
      }
    }
    return out;
  }

  curve(businessDay: string): Curve {
    let c = this.curves.get(businessDay);
    if (!c) {
      c = { out: new Int32Array(SLOTS_PER_DAY), in: new Int32Array(SLOTS_PER_DAY) };
      this.curves.set(businessDay, c);
    }
    return c;
  }

  hasCurve(businessDay: string): boolean {
    return this.curves.has(businessDay);
  }

  /**
   * Forget what ended before `cutoff` (the database's retention, in the simulator's memory). Anything still in progress
   * stays, whatever its age: open events and alerts, visits that have not departed, camera incidents without an end.
   */
  prune(cutoff: number, cutoffDay: string): void {
    removeWhere(this.events, (e) => {
      const drop = e.status === 'CLOSED' && Date.parse(e.ts) < cutoff;
      if (drop) this.eventById.delete(e.id);
      return drop;
    });
    removeWhere(this.visits, (v) => {
      const drop = v.departedAt !== null && v.departedAt < cutoff;
      if (drop) this.visitById.delete(v.visitId);
      return drop;
    });
    for (const list of this.belt.values()) removeWhere(list, (i) => i.end < cutoff);
    removeWhere(this.incidents, (i) => i.to !== null && i.to < cutoff);
    const cutoffHour = Math.floor(cutoff / HOUR);
    for (const k of this.hourCounts.keys()) {
      if (Number(k.slice(k.lastIndexOf('|') + 1)) < cutoffHour) this.hourCounts.delete(k);
    }
    for (const k of this.skuHour.keys()) {
      if (Number(k.slice(0, k.indexOf('|'))) < cutoffHour) this.skuHour.delete(k);
    }
    for (const day of this.curves.keys()) if (day < cutoffDay) this.curves.delete(day);
  }

  /** Counts of what prune bounds, for the soak report. */
  sizes(): Record<string, number> {
    let belt = 0;
    for (const list of this.belt.values()) belt += list.length;
    return {
      events: this.events.length,
      visits: this.visits.length,
      belt,
      incidents: this.incidents.length,
      hourCounts: this.hourCounts.size,
      skuHour: this.skuHour.size,
      curves: this.curves.size,
    };
  }

  /** Events in [from, to) by ts, ascending. */
  eventsBetween(from: number, to: number): EventRec[] {
    const out: EventRec[] = [];
    for (const e of this.events) {
      const t = Date.parse(e.ts);
      if (t >= to) break;
      if (t >= from) out.push(e);
    }
    return out;
  }
}
