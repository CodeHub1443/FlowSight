import type { Subscribable, Unsub } from '../DataSource';

/** Tiny writable Subscribable, shared by sources. */
export class Observable<T> implements Subscribable<T> {
  private value: T;
  private readonly subs = new Set<(v: T) => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    if (Object.is(next, this.value)) return;
    this.value = next;
    for (const cb of [...this.subs]) cb(next);
  }

  subscribe(cb: (v: T) => void): Unsub {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }
}
