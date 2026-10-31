// Normals rebuilt after simplification, because the source's are gone by then: a vertex is split wherever the faces
// around it meet at more than `creaseDeg`, smooth elsewhere. This keeps crisp edges on boxes and pallets at low
// triangle counts while wheels and cab corners stay soft. Pure and deterministic.

/**
 * @param {Float32Array} positions
 * @param {Float32Array|null} uvs
 * @param {Uint32Array} indices
 * @param {number} creaseDeg
 */
export function creaseNormals(positions, uvs, indices, creaseDeg) {
  const triCount = indices.length / 3;
  const faceNormals = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3] * 3;
    const b = indices[t * 3 + 1] * 3;
    const c = indices[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    // length = 2 * area: an area-weighted sum needs no further weight
    faceNormals[t * 3] = uy * vz - uz * vy;
    faceNormals[t * 3 + 1] = uz * vx - ux * vz;
    faceNormals[t * 3 + 2] = ux * vy - uy * vx;
  }

  // triangles around each position (a seam splits a position in two vertices that must still share a normal)
  const positionKey = new Map();
  const positionOf = new Int32Array(positions.length / 3);
  for (let v = 0; v < positionOf.length; v++) {
    const key = `${positions[v * 3]},${positions[v * 3 + 1]},${positions[v * 3 + 2]}`;
    let id = positionKey.get(key);
    if (id === undefined) {
      id = positionKey.size;
      positionKey.set(key, id);
    }
    positionOf[v] = id;
  }
  const around = Array.from({ length: positionKey.size }, () => []);
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) around[positionOf[indices[t * 3 + k]]].push(t);
  }

  const cosLimit = Math.cos((creaseDeg * Math.PI) / 180);
  const unit = (t) => {
    const x = faceNormals[t * 3];
    const y = faceNormals[t * 3 + 1];
    const z = faceNormals[t * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  };

  const outPositions = [];
  const outUvs = [];
  const outNormals = [];
  const outIndices = new Uint32Array(indices.length);
  const emitted = new Map();
  for (let t = 0; t < triCount; t++) {
    const self = unit(t);
    for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k];
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const other of around[positionOf[v]]) {
        const o = unit(other);
        if (self[0] * o[0] + self[1] * o[1] + self[2] * o[2] < cosLimit) continue;
        nx += faceNormals[other * 3];
        ny += faceNormals[other * 3 + 1];
        nz += faceNormals[other * 3 + 2];
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      // identical vertex + normal: share it, which is what keeps the index buffer small
      const key = `${v}|${nx.toFixed(4)},${ny.toFixed(4)},${nz.toFixed(4)}`;
      let id = emitted.get(key);
      if (id === undefined) {
        id = emitted.size;
        emitted.set(key, id);
        outPositions.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
        if (uvs) outUvs.push(uvs[v * 2], uvs[v * 2 + 1]);
        outNormals.push(nx, ny, nz);
      }
      outIndices[t * 3 + k] = id;
    }
  }
  return {
    positions: Float32Array.from(outPositions),
    uvs: uvs ? Float32Array.from(outUvs) : null,
    normals: Float32Array.from(outNormals),
    indices: outIndices,
  };
}
