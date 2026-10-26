import type { BuildJob, BuildResult } from '../geometry/buildPart';
import type { WorkerRequest, WorkerResponse } from '../workers/protocol';

/**
 * Runs geometry builds in a Web Worker so mesh generation, Booleans and
 * validation never block the UI thread.
 */
class GeometryClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: BuildResult) => void; reject: (e: Error) => void }>();
  private latestByChannel = new Map<string, number>();

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/geometry.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const msg = ev.data;
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error));
      };
      this.worker.onerror = (ev) => {
        for (const p of this.pending.values()) p.reject(new Error(ev.message || 'Geometry worker crashed'));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    }
    return this.worker;
  }

  build(job: BuildJob): Promise<BuildResult> {
    const id = this.nextId++;
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const req: WorkerRequest = { id, job };
      worker.postMessage(req);
    });
  }

  /**
   * Latest-wins build: resolves null if a newer request on the same channel
   * was issued before this one finished (e.g. during slider drags).
   */
  async buildLatest(channel: string, job: BuildJob): Promise<BuildResult | null> {
    const ticket = this.nextId;
    this.latestByChannel.set(channel, ticket);
    const result = await this.build(job);
    return this.latestByChannel.get(channel) === ticket ? result : null;
  }
}

export const geometryClient = new GeometryClient();
