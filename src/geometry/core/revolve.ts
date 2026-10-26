import type { MeshData } from './mesh';

/** A closed profile in the (r, z) half-plane, r > 0, counter-clockwise. */
export type Profile2D = ReadonlyArray<readonly [number, number]>;

/** Twice the signed area of a 2D polygon (positive when counter-clockwise). */
export function profileSignedArea2(profile: Profile2D): number {
  let a = 0;
  for (let i = 0; i < profile.length; i++) {
    const [x0, y0] = profile[i];
    const [x1, y1] = profile[(i + 1) % profile.length];
    a += x0 * y1 - x1 * y0;
  }
  return a;
}

function segmentsCross(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
): boolean {
  const o = (p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Checks a profile is a simple, CCW polygon strictly off the axis. Returns problems found. */
export function checkProfile(profile: Profile2D): string[] {
  const problems: string[] = [];
  if (profile.length < 3) problems.push('Profile has fewer than 3 points.');
  if (profile.some(([r, z]) => !Number.isFinite(r) || !Number.isFinite(z))) {
    problems.push('Profile contains non-finite coordinates.');
  }
  if (profile.some(([r]) => r <= 0)) problems.push('Profile touches or crosses the axis of revolution.');
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % profile.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) problems.push(`Profile has a zero-length edge at point ${i}.`);
  }
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(profile[i], profile[(i + 1) % n], profile[j], profile[(j + 1) % n])) {
        problems.push('Profile is self-intersecting.');
        return problems;
      }
    }
  }
  if (profileSignedArea2(profile) <= 0) problems.push('Profile winding is not counter-clockwise.');
  return problems;
}

/**
 * Revolve a closed (r, z) profile 360° about Z into a watertight indexed mesh.
 * Vertex (i, j) is profile point i at angle step j; every profile edge becomes
 * a ring of quads, so the result is closed and consistently outward-wound.
 */
export function revolveProfile(profile: Profile2D, segments: number): MeshData {
  const n = profile.length;
  const positions = new Float32Array(n * segments * 3);
  for (let j = 0; j < segments; j++) {
    const theta = (j / segments) * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    for (let i = 0; i < n; i++) {
      const [r, z] = profile[i];
      const o = (j * n + i) * 3;
      positions[o] = r * c;
      positions[o + 1] = r * s;
      positions[o + 2] = z;
    }
  }
  const indices = new Uint32Array(n * segments * 6);
  let k = 0;
  for (let j = 0; j < segments; j++) {
    const j1 = (j + 1) % segments;
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      const a = j * n + i;
      const b = j * n + i1;
      const c = j1 * n + i1;
      const d = j1 * n + i;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = a; indices[k++] = d; indices[k++] = c;
    }
  }
  return { positions, indices };
}
