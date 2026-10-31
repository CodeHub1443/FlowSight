// Shared-budget simplification: all primitives of an asset get the same absolute geometric error, found by bisection
// so that their total lands at or just under the budget. A big flat panel therefore gives up triangles before a small
// wheel does, which a per-primitive ratio would not do.

const RELATIVE_FLOOR = 1e-5;

function bboxDiagonal(positions) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], positions[i + k]);
      hi[k] = Math.max(hi[k], positions[i + k]);
    }
  }
  return Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
}

/** Compacts vertices to those the triangles use, keeping the order of first use (deterministic). */
function compact(positions, uvs, indices) {
  const remap = new Int32Array(positions.length / 3).fill(-1);
  const order = [];
  const out = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (remap[v] < 0) {
      remap[v] = order.length;
      order.push(v);
    }
    out[i] = remap[v];
  }
  const p = new Float32Array(order.length * 3);
  const t = uvs ? new Float32Array(order.length * 2) : null;
  order.forEach((v, i) => {
    p.set(positions.subarray(v * 3, v * 3 + 3), i * 3);
    if (t) t.set(uvs.subarray(v * 2, v * 2 + 2), i * 2);
  });
  return { positions: p, uvs: t, indices: out };
}

function simplifyOne(simplifier, part, error) {
  const { positions, uvs, indices } = part;
  const flags = ['ErrorAbsolute', 'Prune'];
  let result;
  if (uvs) {
    // the UV weight keeps texture seams from sliding: a seam is what the truck's texture is painted against
    [result] = simplifier.simplifyWithAttributes(
      indices,
      positions,
      3,
      uvs,
      2,
      [part.uvWeight ?? 0.5, part.uvWeight ?? 0.5],
      null,
      0,
      error,
      flags,
    );
  } else {
    [result] = simplifier.simplify(indices, positions, 3, 0, error, flags);
  }
  return result;
}

/**
 * @param {{prim: unknown, positions: Float32Array, uvs: Float32Array|null, indices: Uint32Array}[]} prims
 * @returns {{prim: unknown, result: {positions: Float32Array, uvs: Float32Array|null, indices: Uint32Array}}[]}
 */
export function simplifyToBudget(simplifier, prims, targetTris) {
  const total = prims.reduce((n, p) => n + p.indices.length / 3, 0);
  const diag = Math.max(...prims.map((p) => bboxDiagonal(p.positions)));
  const finish = (lists) =>
    prims.map((p, i) => ({ prim: p.prim, result: compact(p.positions, p.uvs, lists[i]) }));
  if (total <= targetTris) return finish(prims.map((p) => p.indices));

  let lo = RELATIVE_FLOOR * diag;
  let hi = diag;
  let best = null;
  for (let step = 0; step < 26; step++) {
    const mid = Math.sqrt(lo * hi);
    const lists = prims.map((p) => simplifyOne(simplifier, p, mid));
    const tris = lists.reduce((n, l) => n + l.length / 3, 0);
    if (tris <= targetTris) {
      best = lists;
      hi = mid;
    } else {
      lo = mid;
    }
    if (hi / lo < 1.002) break;
  }
  if (!best) {
    throw new Error(`cannot reach ${targetTris} tris (${total} source) even at full error`);
  }
  return finish(best);
}
