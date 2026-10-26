import type { MeshData } from '../core/mesh';

type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Separating-axis test for two triangles. Returns true only when they overlap
 * by more than eps along every candidate axis (touching does not count).
 * Axes: both face normals, the 9 edge-edge cross products, and the in-plane
 * edge normals (covers the coplanar case).
 */
export function trianglesIntersect(t1: [V3, V3, V3], t2: [V3, V3, V3], eps: number): boolean {
  const e1 = [sub(t1[1], t1[0]), sub(t1[2], t1[1]), sub(t1[0], t1[2])];
  const e2 = [sub(t2[1], t2[0]), sub(t2[2], t2[1]), sub(t2[0], t2[2])];
  const n1 = cross(e1[0], e1[1]);
  const n2 = cross(e2[0], e2[1]);
  const axes: V3[] = [n1, n2];
  for (const a of e1) for (const b of e2) axes.push(cross(a, b));
  for (const a of e1) axes.push(cross(n1, a));
  for (const b of e2) axes.push(cross(n2, b));
  for (const axis of axes) {
    const len = Math.hypot(axis[0], axis[1], axis[2]);
    if (len < 1e-12) continue;
    const ax: V3 = [axis[0] / len, axis[1] / len, axis[2] / len];
    let min1 = Infinity, max1 = -Infinity, min2 = Infinity, max2 = -Infinity;
    for (const v of t1) {
      const d = dot(v, ax);
      if (d < min1) min1 = d;
      if (d > max1) max1 = d;
    }
    for (const v of t2) {
      const d = dot(v, ax);
      if (d < min2) min2 = d;
      if (d > max2) max2 = d;
    }
    if (max1 - eps <= min2 || max2 - eps <= min1) return false;
  }
  return true;
}

export interface SelfIntersectionResult {
  count: number;
  /** Centroids of up to `maxReport` offending triangle pairs. */
  locations: V3[];
  truncated: boolean;
}

/**
 * Find intersecting, non-adjacent triangle pairs using a uniform spatial hash.
 * Triangle pairs that share a vertex index are skipped (adjacent faces).
 */
export function findSelfIntersections(mesh: MeshData, maxReport = 50, maxPairs = 200): SelfIntersectionResult {
  const p = mesh.positions;
  const idx = mesh.indices;
  const triCount = idx.length / 3;
  if (triCount === 0) return { count: 0, locations: [], truncated: false };

  const tmin = new Float64Array(triCount * 3);
  const tmax = new Float64Array(triCount * 3);
  const extents: number[] = [];
  let gmin: V3 = [Infinity, Infinity, Infinity];
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      let lo = Infinity, hi = -Infinity;
      for (let v = 0; v < 3; v++) {
        const c = p[idx[t * 3 + v] * 3 + k];
        if (c < lo) lo = c;
        if (c > hi) hi = c;
      }
      tmin[t * 3 + k] = lo;
      tmax[t * 3 + k] = hi;
      if (lo < gmin[k]) gmin[k] = lo;
    }
    extents.push(Math.max(tmax[t * 3] - tmin[t * 3], tmax[t * 3 + 1] - tmin[t * 3 + 1], tmax[t * 3 + 2] - tmin[t * 3 + 2]));
  }
  extents.sort((a, b) => a - b);
  const cell = Math.max(extents[Math.floor(extents.length * 0.5)], 1e-3);
  let diag = 0;
  for (const e of extents) diag = Math.max(diag, e);
  const eps = Math.max(cell * 1e-6, 1e-7);

  const grid = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    const i0 = Math.floor((tmin[t * 3] - gmin[0]) / cell), i1 = Math.floor((tmax[t * 3] - gmin[0]) / cell);
    const j0 = Math.floor((tmin[t * 3 + 1] - gmin[1]) / cell), j1 = Math.floor((tmax[t * 3 + 1] - gmin[1]) / cell);
    const k0 = Math.floor((tmin[t * 3 + 2] - gmin[2]) / cell), k1 = Math.floor((tmax[t * 3 + 2] - gmin[2]) / cell);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (let k = k0; k <= k1; k++) {
          const key = `${i},${j},${k}`;
          let list = grid.get(key);
          if (!list) grid.set(key, (list = []));
          list.push(t);
        }
  }

  const tri = (t: number): [V3, V3, V3] => {
    const out: V3[] = [];
    for (let v = 0; v < 3; v++) {
      const o = idx[t * 3 + v] * 3;
      out.push([p[o], p[o + 1], p[o + 2]]);
    }
    return out as [V3, V3, V3];
  };

  const tested = new Set<number>();
  const locations: V3[] = [];
  let count = 0;
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const t1 = Math.min(list[a], list[b]);
        const t2 = Math.max(list[a], list[b]);
        const pairKey = t1 * triCount + t2;
        if (tested.has(pairKey)) continue;
        tested.add(pairKey);
        let disjointAabb = false;
        for (let k = 0; k < 3; k++) {
          if (tmax[t1 * 3 + k] < tmin[t2 * 3 + k] || tmax[t2 * 3 + k] < tmin[t1 * 3 + k]) disjointAabb = true;
        }
        if (disjointAabb) continue;
        const a0 = idx[t1 * 3], a1 = idx[t1 * 3 + 1], a2 = idx[t1 * 3 + 2];
        const b0 = idx[t2 * 3], b1 = idx[t2 * 3 + 1], b2 = idx[t2 * 3 + 2];
        if (a0 === b0 || a0 === b1 || a0 === b2 || a1 === b0 || a1 === b1 || a1 === b2 || a2 === b0 || a2 === b1 || a2 === b2) continue;
        const A = tri(t1);
        const B = tri(t2);
        if (trianglesIntersect(A, B, eps)) {
          count++;
          if (locations.length < maxReport) {
            locations.push([
              (A[0][0] + A[1][0] + A[2][0]) / 3,
              (A[0][1] + A[1][1] + A[2][1]) / 3,
              (A[0][2] + A[1][2] + A[2][2]) / 3,
            ]);
          }
          if (count >= maxPairs) return { count, locations, truncated: true };
        }
      }
    }
  }
  return { count, locations, truncated: false };
}
