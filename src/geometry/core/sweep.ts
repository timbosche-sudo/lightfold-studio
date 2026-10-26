import type { MeshData } from './mesh';

/**
 * Stitch N closed loops (one per angular column, each with L points listed
 * counter-clockwise in the (r, z) half-plane) into a watertight tube.
 * `positions` holds column j, point k at index (j * L + k) * 3; columns must
 * be ordered by increasing angle. Same topology as a surface of revolution,
 * but every column may have its own shape.
 */
export function sweepLoops(positions: Float32Array, columns: number, loopLength: number): MeshData {
  const L = loopLength;
  const indices = new Uint32Array(columns * L * 6);
  let k = 0;
  for (let j = 0; j < columns; j++) {
    const j1 = (j + 1) % columns;
    for (let i = 0; i < L; i++) {
      const i1 = (i + 1) % L;
      const a = j * L + i;
      const b = j * L + i1;
      const c = j1 * L + i1;
      const d = j1 * L + i;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = a; indices[k++] = d; indices[k++] = c;
    }
  }
  return { positions, indices };
}
