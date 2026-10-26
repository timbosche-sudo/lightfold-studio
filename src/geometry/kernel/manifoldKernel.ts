import Module from 'manifold-3d';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { MeshData } from '../core/mesh';

/**
 * Thin wrapper around the Manifold WebAssembly library (github.com/elalish/manifold),
 * used for robust Boolean operations and as an independent manifoldness check.
 */
export type Kernel = ManifoldToplevel;

let kernelPromise: Promise<Kernel> | null = null;

/**
 * Load the WASM kernel once. In the browser, pass the bundled .wasm URL;
 * under Node (tests) Emscripten finds manifold.wasm next to manifold.js.
 */
export function loadKernel(wasmUrl?: string): Promise<Kernel> {
  if (!kernelPromise) {
    kernelPromise = Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined).then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return kernelPromise;
}

export function toManifold(kernel: Kernel, mesh: MeshData): Manifold {
  const m = new kernel.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices });
  return new kernel.Manifold(m);
}

export function fromManifold(manifold: Manifold): MeshData {
  const m = manifold.getMesh();
  const stride = m.numProp;
  const count = m.vertProperties.length / stride;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = m.vertProperties[i * stride];
    positions[i * 3 + 1] = m.vertProperties[i * stride + 1];
    positions[i * 3 + 2] = m.vertProperties[i * stride + 2];
  }
  return { positions, indices: new Uint32Array(m.triVerts) };
}

/** Run fn with a list that collects WASM objects, deleting them all afterwards. */
export function withScope<T>(fn: (keep: <M extends { delete(): void }>(m: M) => M) => T): T {
  const owned: { delete(): void }[] = [];
  try {
    return fn((m) => {
      owned.push(m);
      return m;
    });
  } finally {
    for (const m of owned) m.delete();
  }
}
