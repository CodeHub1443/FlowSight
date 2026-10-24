// Test helpers for the domain layer (no runtime use).

export const REMOVE = Symbol('remove');

type Container = Record<string | number, unknown>;

function isContainer(x: unknown): x is Container {
  return typeof x === 'object' && x !== null;
}

/** Deep-clone `base` and set (or REMOVE) the value at `path`. Throws if the path does not exist. */
export function mutate(base: unknown, path: readonly (string | number)[], value: unknown): unknown {
  const root = structuredClone(base);
  let cur: unknown = root;
  for (const key of path.slice(0, -1)) {
    if (!isContainer(cur)) throw new Error(`bad path ${path.join('.')}`);
    cur = cur[key];
  }
  const last = path[path.length - 1];
  if (!isContainer(cur) || last === undefined) throw new Error(`bad path ${path.join('.')}`);
  if (value === REMOVE) Reflect.deleteProperty(cur, last);
  else cur[last] = value;
  return root;
}

/** Every object key (at any depth) in a JSON value. */
export function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, out);
  } else if (isContainer(value)) {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allKeys(v, out);
    }
  }
  return out;
}
