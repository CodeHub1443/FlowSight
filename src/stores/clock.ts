// A shared 1 Hz wall clock for staleness selectors. It only runs while something is subscribed,
// and it is the only periodic trigger for staleness: no per-frame work, no setState loop.

const TICK_MS = 1000;

const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let cached = Date.now();

export function subscribeClock(cb: () => void): () => void {
  subs.add(cb);
  if (timer === null) {
    cached = Date.now();
    timer = setInterval(() => {
      cached = Date.now();
      for (const f of [...subs]) f();
    }, TICK_MS);
  }
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** The last tick while the clock is running (stable between ticks), else the real time. */
export function clockNow(): number {
  return timer === null ? Date.now() : cached;
}
