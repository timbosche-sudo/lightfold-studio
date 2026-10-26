/** Indexed triangle mesh with shared vertices. Units: millimetres, Z up. */
export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export function triangleCount(mesh: MeshData): number {
  return mesh.indices.length / 3;
}

export function vertexCount(mesh: MeshData): number {
  return mesh.positions.length / 3;
}

export function computeBounds(mesh: MeshData): Bounds {
  const p = mesh.positions;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = p[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

export function boundsSize(b: Bounds): [number, number, number] {
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}

/** Signed enclosed volume via the divergence theorem (positive for outward winding). */
export function signedVolume(mesh: MeshData): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const cx = p[c], cy = p[c + 1], cz = p[c + 2];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

export function surfaceArea(mesh: MeshData): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  let area = 0;
  for (let t = 0; t < idx.length; t += 3) {
    area += triangleArea(p, idx[t], idx[t + 1], idx[t + 2]);
  }
  return area;
}

export function triangleArea(p: Float32Array, i: number, j: number, k: number): number {
  const a = i * 3, b = j * 3, c = k * 3;
  const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
  const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  return 0.5 * Math.hypot(nx, ny, nz);
}

/** Rigid transform helpers (rotations only, so winding is preserved). */
export function translateMesh(mesh: MeshData, dx: number, dy: number, dz: number): MeshData {
  const positions = new Float32Array(mesh.positions);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += dx;
    positions[i + 1] += dy;
    positions[i + 2] += dz;
  }
  return { positions, indices: mesh.indices };
}

/** Rotate 180° about the X axis and re-seat on z = 0 (flip for printing upside down). */
export function flipForPrinting(mesh: MeshData): MeshData {
  const b = computeBounds(mesh);
  const positions = new Float32Array(mesh.positions.length);
  const src = mesh.positions;
  for (let i = 0; i < src.length; i += 3) {
    positions[i] = src[i];
    positions[i + 1] = -src[i + 1];
    positions[i + 2] = b.max[2] - src[i + 2];
  }
  return { positions, indices: mesh.indices };
}
