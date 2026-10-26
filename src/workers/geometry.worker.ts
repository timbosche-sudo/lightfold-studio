/// <reference lib="webworker" />
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { buildPart, type BuildJob } from '../geometry/buildPart';
import { loadKernel, type Kernel } from '../geometry/kernel/manifoldKernel';
import type { WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let kernel: Kernel | null = null;
let kernelError: string | null = null;
const ready = loadKernel(wasmUrl)
  .then((k) => {
    kernel = k;
  })
  .catch((e: unknown) => {
    kernelError = e instanceof Error ? e.message : String(e);
  });

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  await ready;
  try {
    const result = buildPart(msg.job as BuildJob, kernel);
    if (kernelError) {
      result.report.checks.push({ id: 'kernel-load', label: 'Geometry kernel', status: 'warning', message: `Manifold kernel failed to load: ${kernelError}` });
    }
    const res: WorkerResponse = { id: msg.id, ok: true, result };
    self.postMessage(res, [
      result.mesh.positions.buffer,
      result.mesh.indices.buffer,
      result.report.problemEdges.buffer,
      result.report.problemPoints.buffer,
    ]);
  } catch (e) {
    const res: WorkerResponse = { id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    self.postMessage(res);
  }
};
