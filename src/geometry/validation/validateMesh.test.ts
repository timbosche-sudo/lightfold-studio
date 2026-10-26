import { describe, expect, it } from 'vitest';
import { revolveProfile } from '../core/revolve';
import { validateMesh } from './validateMesh';
import type { MeshData } from '../core/mesh';
import { signedVolume } from '../core/mesh';

const ring = (): MeshData => revolveProfile([[10, 0], [12, 0], [12, 5], [10, 5]], 64);

const status = (mesh: MeshData, id: string) => validateMesh(mesh).checks.find((c) => c.id === id)?.status;

describe('validateMesh', () => {
  it('accepts a closed revolved ring with correct volume', () => {
    const m = ring();
    const r = validateMesh(m);
    expect(r.fatal).toBe(false);
    expect(r.stats.components).toBe(1);
    expect(r.stats.genus).toBe(1);
    const exact = Math.PI * (12 ** 2 - 10 ** 2) * 5;
    // 64-gon underestimates the circle slightly.
    expect(signedVolume(m)).toBeGreaterThan(exact * 0.99);
    expect(signedVolume(m)).toBeLessThan(exact);
  });

  it('detects holes', () => {
    const m = ring();
    const holed = { positions: m.positions, indices: m.indices.slice(3) };
    expect(status(holed, 'watertight')).toBe('error');
  });

  it('detects inverted normals', () => {
    const m = ring();
    const flipped = new Uint32Array(m.indices);
    for (let i = 0; i < flipped.length; i += 3) [flipped[i + 1], flipped[i + 2]] = [flipped[i + 2], flipped[i + 1]];
    expect(status({ positions: m.positions, indices: flipped }, 'volume')).toBe('error');
  });

  it('detects a single flipped face', () => {
    const m = ring();
    const idx = new Uint32Array(m.indices);
    [idx[1], idx[2]] = [idx[2], idx[1]];
    expect(status({ positions: m.positions, indices: idx }, 'orientation')).toBe('error');
  });

  it('detects disconnected shells', () => {
    const a = ring();
    const b = revolveProfile([[30, 0], [32, 0], [32, 5], [30, 5]], 64);
    const positions = new Float32Array(a.positions.length + b.positions.length);
    positions.set(a.positions);
    positions.set(b.positions, a.positions.length);
    const offset = a.positions.length / 3;
    const indices = new Uint32Array(a.indices.length + b.indices.length);
    indices.set(a.indices);
    indices.set(b.indices.map((i) => i + offset), a.indices.length);
    expect(status({ positions, indices }, 'components')).toBe('error');
  });

  it('detects self-intersections between overlapping shells', () => {
    const a = ring();
    const b = revolveProfile([[11, 2], [13, 2], [13, 7], [11, 7]], 64);
    const positions = new Float32Array(a.positions.length + b.positions.length);
    positions.set(a.positions);
    positions.set(b.positions, a.positions.length);
    const offset = a.positions.length / 3;
    const indices = new Uint32Array(a.indices.length + b.indices.length);
    indices.set(a.indices);
    indices.set(b.indices.map((i) => i + offset), a.indices.length);
    expect(status({ positions, indices }, 'self-intersection')).toBe('error');
  });

  it('detects degenerate triangles and build-volume overflow', () => {
    const m = ring();
    const p = new Float32Array(m.positions);
    // Collapse vertex 1 onto vertex 0.
    p[3] = p[0]; p[4] = p[1]; p[5] = p[2];
    expect(status({ positions: p, indices: m.indices }, 'degenerate')).toBe('error');
    const big = validateMesh(m, { buildVolume: [20, 20, 20], safetyMargin: 0 });
    expect(big.checks.find((c) => c.id === 'build-volume')?.status).toBe('error');
  });
});
