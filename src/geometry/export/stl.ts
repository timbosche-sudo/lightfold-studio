import type { MeshData } from '../core/mesh';

/** Binary STL (little-endian): 80-byte header, uint32 count, 50 bytes per facet. */
export function writeBinaryStl(mesh: MeshData, header = 'LightFold Studio'): ArrayBuffer {
  const p = mesh.positions;
  const idx = mesh.indices;
  const triCount = idx.length / 3;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  const head = new TextEncoder().encode(header.slice(0, 79));
  new Uint8Array(buffer, 0, 80).set(head);
  view.setUint32(80, triCount, true);
  let o = 84;
  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true);
    o += 12;
    for (const v of [a, b, c]) {
      view.setFloat32(o, p[v], true);
      view.setFloat32(o + 4, p[v + 1], true);
      view.setFloat32(o + 8, p[v + 2], true);
      o += 12;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return buffer;
}

/**
 * Parse a binary STL back into an indexed mesh, welding vertices with
 * identical float32 coordinates. Used by tests to verify exported files.
 */
export function parseBinaryStl(buffer: ArrayBuffer): { mesh: MeshData; header: string } {
  const view = new DataView(buffer);
  if (buffer.byteLength < 84) throw new Error('File too small to be a binary STL.');
  const triCount = view.getUint32(80, true);
  if (buffer.byteLength !== 84 + triCount * 50) {
    throw new Error(`STL size mismatch: header says ${triCount} triangles, file is ${buffer.byteLength} bytes.`);
  }
  const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 80)).replace(/\0+$/, '');
  const map = new Map<string, number>();
  const positions: number[] = [];
  const indices = new Uint32Array(triCount * 3);
  let o = 84;
  for (let t = 0; t < triCount; t++) {
    o += 12;
    for (let v = 0; v < 3; v++) {
      const x = view.getFloat32(o, true), y = view.getFloat32(o + 4, true), z = view.getFloat32(o + 8, true);
      o += 12;
      const key = `${x},${y},${z}`;
      let id = map.get(key);
      if (id === undefined) {
        id = positions.length / 3;
        map.set(key, id);
        positions.push(x, y, z);
      }
      indices[t * 3 + v] = id;
    }
    o += 2;
  }
  return { mesh: { positions: new Float32Array(positions), indices }, header };
}
