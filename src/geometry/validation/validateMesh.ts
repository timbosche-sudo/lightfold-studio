import type { MeshData, Bounds } from '../core/mesh';
import { computeBounds, boundsSize, signedVolume, surfaceArea, triangleArea } from '../core/mesh';
import { findSelfIntersections } from './selfIntersection';
import type { Kernel } from '../kernel/manifoldKernel';
import { toManifold } from '../kernel/manifoldKernel';

export type CheckStatus = 'pass' | 'warning' | 'error' | 'skipped';

export interface ValidationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
}

export interface MeshStats {
  vertices: number;
  triangles: number;
  edges: number;
  volume: number;
  surfaceArea: number;
  components: number;
  genus: number | null;
  bounds: Bounds;
  size: [number, number, number];
}

export interface ValidationReport {
  checks: ValidationCheck[];
  /** True if any check is an error; standard export is blocked. */
  fatal: boolean;
  warningCount: number;
  stats: MeshStats;
  /** Line-segment pairs (x,y,z,x,y,z) marking open / non-manifold edges, for inspection view. */
  problemEdges: Float32Array;
  /** Points marking self-intersections. */
  problemPoints: Float32Array;
}

export interface ValidationOptions {
  buildVolume?: [number, number, number];
  safetyMargin?: number;
  /** Area below which a triangle is considered degenerate (mm²). */
  degenerateArea?: number;
  kernel?: Kernel | null;
  /** Extra checks contributed by the part builder (e.g. parameter checks). */
  extraChecks?: ValidationCheck[];
  expectedComponents?: number;
}

const MAX_PROBLEM_EDGES = 2000;

/**
 * Topological and geometric validation from the actual triangle data.
 * Does not rely on bounding boxes or rendering for watertightness.
 */
export function validateMesh(mesh: MeshData, opts: ValidationOptions = {}): ValidationReport {
  const p = mesh.positions;
  const idx = mesh.indices;
  const vCount = p.length / 3;
  const tCount = idx.length / 3;
  const checks: ValidationCheck[] = [...(opts.extraChecks ?? [])];
  const add = (id: string, label: string, status: CheckStatus, message: string) => checks.push({ id, label, status, message });

  // Finite coordinates and index range.
  let nonFinite = 0;
  for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) nonFinite++;
  let badIndex = 0;
  for (let i = 0; i < idx.length; i++) if (idx[i] >= vCount) badIndex++;
  if (tCount === 0) add('empty', 'Mesh present', 'error', 'Mesh has no triangles.');
  add('finite', 'Finite coordinates', nonFinite || badIndex ? 'error' : 'pass',
    nonFinite || badIndex ? `${nonFinite} non-finite coordinates, ${badIndex} out-of-range indices.` : 'All vertex coordinates are finite.');
  if (nonFinite || badIndex || tCount === 0) {
    const bounds = { min: [0, 0, 0], max: [0, 0, 0] } as Bounds;
    return finish(checks, { vertices: vCount, triangles: tCount, edges: 0, volume: 0, surfaceArea: 0, components: 0, genus: null, bounds, size: [0, 0, 0] }, new Float32Array(), new Float32Array());
  }

  // Degenerate triangles.
  const minArea = opts.degenerateArea ?? 1e-8;
  let degenerate = 0;
  for (let t = 0; t < tCount; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    if (a === b || b === c || a === c || triangleArea(p, a, b, c) < minArea) degenerate++;
  }
  add('degenerate', 'Degenerate triangles', degenerate ? 'error' : 'pass',
    degenerate ? `${degenerate} zero-area or collapsed triangles.` : 'No degenerate triangles.');

  // Edge topology. Key = lo * vCount + hi (safe for < ~94M vertices).
  const undirected = new Map<number, number>();
  const directed = new Map<number, number>();
  for (let t = 0; t < tCount; t++) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t * 3 + e];
      const b = idx[t * 3 + ((e + 1) % 3)];
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const uk = lo * vCount + hi;
      undirected.set(uk, (undirected.get(uk) ?? 0) + 1);
      const dk = a * vCount + b;
      directed.set(dk, (directed.get(dk) ?? 0) + 1);
    }
  }
  let boundary = 0, nonManifold = 0, misoriented = 0;
  const problem: number[] = [];
  const pushEdge = (a: number, b: number) => {
    if (problem.length / 6 >= MAX_PROBLEM_EDGES) return;
    problem.push(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2]);
  };
  for (const [key, count] of undirected) {
    const lo = Math.floor(key / vCount), hi = key % vCount;
    if (count === 1) { boundary++; pushEdge(lo, hi); }
    else if (count > 2) { nonManifold++; pushEdge(lo, hi); }
    else {
      const f = directed.get(lo * vCount + hi) ?? 0;
      const r = directed.get(hi * vCount + lo) ?? 0;
      if (f !== 1 || r !== 1) { misoriented++; pushEdge(lo, hi); }
    }
  }
  add('watertight', 'Watertight (closed)', boundary ? 'error' : 'pass',
    boundary ? `${boundary} open boundary edges — the surface has holes.` : 'Every edge is shared by exactly two triangles.');
  add('manifold', 'Manifold edges', nonManifold ? 'error' : 'pass',
    nonManifold ? `${nonManifold} edges are shared by more than two triangles (non-manifold).` : 'No non-manifold edges.');
  add('orientation', 'Consistent face orientation', misoriented ? 'error' : 'pass',
    misoriented ? `${misoriented} edges join triangles with inconsistent winding (flipped faces).` : 'Adjacent triangles have consistent winding.');

  // Connected components (by shared vertices).
  const parent = new Int32Array(vCount);
  for (let i = 0; i < vCount; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const used = new Uint8Array(vCount);
  for (let t = 0; t < tCount; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    used[a] = used[b] = used[c] = 1;
    const ra = find(a), rb = find(b), rc = find(c);
    parent[rb] = ra;
    parent[find(rc)] = find(ra);
  }
  const roots = new Set<number>();
  for (let i = 0; i < vCount; i++) if (used[i]) roots.add(find(i));
  const components = roots.size;
  const expected = opts.expectedComponents ?? 1;
  add('components', 'Single connected solid', components === expected ? 'pass' : 'error',
    components === expected ? `${components} connected shell.` : `${components} disconnected shells found (expected ${expected}).`);

  // Volume / normals.
  const volume = signedVolume(mesh);
  const area = surfaceArea(mesh);
  const closed = !boundary && !nonManifold && !misoriented;
  if (!closed) {
    add('volume', 'Positive enclosed volume', 'skipped', 'Volume is undefined for an open or non-manifold mesh.');
  } else if (volume > 0) {
    add('volume', 'Positive enclosed volume', 'pass', `Encloses ${(volume / 1000).toFixed(2)} cm³; normals face outward.`);
  } else {
    add('volume', 'Positive enclosed volume', 'error', 'Enclosed volume is negative or zero — normals are inverted.');
  }

  // Euler characteristic → genus (only meaningful for closed meshes).
  const edges = undirected.size;
  let genus: number | null = null;
  if (closed) {
    const usedVerts = used.reduce((s, u) => s + u, 0);
    const chi = usedVerts - edges + tCount;
    genus = components - chi / 2;
  }

  // Self-intersection.
  const si = findSelfIntersections(mesh);
  add('self-intersection', 'No self-intersections', si.count ? 'error' : 'pass',
    si.count
      ? `${si.truncated ? 'At least ' : ''}${si.count} intersecting triangle pairs, first near (${si.locations[0].map((v) => v.toFixed(1)).join(', ')}) mm.`
      : 'No intersecting non-adjacent triangles.');

  // Independent check with the Manifold kernel.
  if (opts.kernel) {
    try {
      const m = toManifold(opts.kernel, mesh);
      const status = m.status();
      m.delete();
      add('kernel', 'Manifold kernel acceptance', status === 'NoError' ? 'pass' : 'error',
        status === 'NoError' ? 'Accepted as a valid solid by the Manifold geometry kernel.' : `Manifold kernel rejected the mesh: ${status}.`);
    } catch (e) {
      add('kernel', 'Manifold kernel acceptance', 'error', `Manifold kernel rejected the mesh: ${(e as Error).message}`);
    }
  } else {
    add('kernel', 'Manifold kernel acceptance', 'skipped', 'Geometry kernel not loaded.');
  }

  const bounds = computeBounds(mesh);
  const size = boundsSize(bounds);
  if (opts.buildVolume) {
    const margin = opts.safetyMargin ?? 0;
    const usable = opts.buildVolume.map((v) => v - 2 * margin);
    const over = size.some((s, i) => s > usable[i]);
    add('build-volume', 'Fits build volume', over ? 'error' : 'pass',
      over
        ? `Part is ${size.map((s) => s.toFixed(1)).join(' × ')} mm; usable volume is ${usable.map((s) => s.toFixed(0)).join(' × ')} mm.`
        : `Part ${size.map((s) => s.toFixed(1)).join(' × ')} mm fits within ${usable.map((s) => s.toFixed(0)).join(' × ')} mm usable.`);
  }

  const points: number[] = [];
  for (const l of si.locations) points.push(...l);
  return finish(checks, { vertices: vCount, triangles: tCount, edges, volume, surfaceArea: area, components, genus, bounds, size }, new Float32Array(problem), new Float32Array(points));
}

function finish(checks: ValidationCheck[], stats: MeshStats, problemEdges: Float32Array, problemPoints: Float32Array): ValidationReport {
  return {
    checks,
    fatal: checks.some((c) => c.status === 'error'),
    warningCount: checks.filter((c) => c.status === 'warning').length,
    stats,
    problemEdges,
    problemPoints,
  };
}
