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
 * Each candidate pair is tested once: only in the grid cell that contains the
 * minimum corner of the two bounding boxes' overlap.
 */
export function findSelfIntersections(mesh: MeshData, maxReport = 50, maxPairs = 200): SelfIntersectionResult {
  const p = mesh.positions;
  const idx = mesh.indices;
  const triCount = idx.length / 3;
  if (triCount === 0) return { count: 0, locations: [], truncated: false };

  const box = new Float64Array(triCount * 6); // minx miny minz maxx maxy maxz
  const extents = new Float64Array(triCount);
  const gmin = [Infinity, Infinity, Infinity];
  const gmax = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < triCount; t++) {
    let e = 0;
    for (let k = 0; k < 3; k++) {
      const a = p[idx[t * 3] * 3 + k], b = p[idx[t * 3 + 1] * 3 + k], c = p[idx[t * 3 + 2] * 3 + k];
      const lo = Math.min(a, b, c), hi = Math.max(a, b, c);
      box[t * 6 + k] = lo;
      box[t * 6 + 3 + k] = hi;
      if (lo < gmin[k]) gmin[k] = lo;
      if (hi > gmax[k]) gmax[k] = hi;
      if (hi - lo > e) e = hi - lo;
    }
    extents[t] = e;
  }
  const sorted = Float64Array.from(extents).sort();
  const cell = Math.max(sorted[Math.floor(sorted.length * 0.5)] * 1.5, 1e-3);
  const eps = Math.max(cell * 1e-6, 1e-7);
  const nx = Math.floor((gmax[0] - gmin[0]) / cell) + 1;
  const ny = Math.floor((gmax[1] - gmin[1]) / cell) + 1;
  const cellOf = (v: number, k: number) => Math.floor((v - gmin[k]) / cell);

  const grid = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    const i0 = cellOf(box[t * 6], 0), i1 = cellOf(box[t * 6 + 3], 0);
    const j0 = cellOf(box[t * 6 + 1], 1), j1 = cellOf(box[t * 6 + 4], 1);
    const k0 = cellOf(box[t * 6 + 2], 2), k1 = cellOf(box[t * 6 + 5], 2);
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const key = i + nx * (j + ny * k);
          let list = grid.get(key);
          if (!list) grid.set(key, (list = []));
          list.push(t);
        }
  }

  const A: [V3, V3, V3] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const B: [V3, V3, V3] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const load = (t: number, out: [V3, V3, V3]) => {
    for (let v = 0; v < 3; v++) {
      const o = idx[t * 3 + v] * 3;
      out[v][0] = p[o];
      out[v][1] = p[o + 1];
      out[v][2] = p[o + 2];
    }
  };

  const locations: V3[] = [];
  let count = 0;
  for (const [key, list] of grid) {
    if (list.length < 2) continue;
    const ci = key % nx;
    const cj = Math.floor(key / nx) % ny;
    const ck = Math.floor(key / (nx * ny));
    for (let a = 0; a < list.length; a++) {
      const t1 = list[a];
      const o1 = t1 * 6;
      for (let b = a + 1; b < list.length; b++) {
        const t2 = list[b];
        const o2 = t2 * 6;
        if (box[o1 + 3] < box[o2] || box[o2 + 3] < box[o1] ||
            box[o1 + 4] < box[o2 + 1] || box[o2 + 4] < box[o1 + 1] ||
            box[o1 + 5] < box[o2 + 2] || box[o2 + 5] < box[o1 + 2]) continue;
        // Test the pair only in the cell holding the overlap's minimum corner.
        if (cellOf(Math.max(box[o1], box[o2]), 0) !== ci ||
            cellOf(Math.max(box[o1 + 1], box[o2 + 1]), 1) !== cj ||
            cellOf(Math.max(box[o1 + 2], box[o2 + 2]), 2) !== ck) continue;
        const a0 = idx[t1 * 3], a1 = idx[t1 * 3 + 1], a2 = idx[t1 * 3 + 2];
        const b0 = idx[t2 * 3], b1 = idx[t2 * 3 + 1], b2 = idx[t2 * 3 + 2];
        if (a0 === b0 || a0 === b1 || a0 === b2 || a1 === b0 || a1 === b1 || a1 === b2 || a2 === b0 || a2 === b1 || a2 === b2) continue;
        load(t1, A);
        load(t2, B);
        if (trianglesIntersect(A, B, eps)) {
          count++;
          if (locations.length < maxReport) {
            locations.push([(A[0][0] + A[1][0] + A[2][0]) / 3, (A[0][1] + A[1][1] + A[2][1]) / 3, (A[0][2] + A[1][2] + A[2][2]) / 3]);
          }
          if (count >= maxPairs) return { count, locations, truncated: true };
        }
      }
    }
  }
  return { count, locations, truncated: false };
}
