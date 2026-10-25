// Seeded PRNG (mulberry32) plus the helpers the simulator needs. No Math.random anywhere in src/data/mock.

/** FNV-1a over the string form of the parts: a stable 32-bit hash for seeding forks. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  private s: number;

  constructor(readonly seed: number) {
    this.s = seed >>> 0 || 1;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Triangular distribution on [lo, hi] with the given mode. */
  tri(lo: number, mode: number, hi: number): number {
    const u = this.next();
    const c = (mode - lo) / (hi - lo);
    return u < c
      ? lo + Math.sqrt(u * (hi - lo) * (mode - lo))
      : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
  }

  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error('pick from empty list');
    return item;
  }

  /** Index drawn with the given non-negative weights. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i] ?? 0;
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Exponential with the given mean. */
  exp(mean: number): number {
    return -Math.log(1 - this.next()) * mean;
  }

  /** Normal (Box-Muller), mean and standard deviation. */
  normal(mean: number, sd: number): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** An independent stream that does not consume from this one. */
  fork(label: string): Rng {
    return new Rng(hashSeed(this.seed, label));
  }
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID (48-bit ms time + 80 random bits), randomness drawn from the seeded stream. */
export function makeUlid(ms: number, rng: Rng): string {
  let t = Math.floor(ms);
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = (CROCKFORD[t % 32] ?? '0') + time;
    t = Math.floor(t / 32);
  }
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD[rng.int(0, 31)] ?? '0';
  return time + rand;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const round = (v: number, digits = 0): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
