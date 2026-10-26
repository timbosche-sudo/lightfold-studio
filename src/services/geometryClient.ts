import type { BuildJob, BuildResult } from '../geometry/buildPart';
import type { WorkerRequest, WorkerResponse } from '../workers/protocol';

/**
 * Lanes are separate Web Workers so a fast draft never waits behind a full
 * union + validation:
 * - `interactive`: draft previews while the user drags.
 * - `full`: validated previews and exports.
 */
export type Lane = 'interactive' | 'full';

interface Pending {
  resolve: (r: BuildResult | null) => void;
  reject: (e: Error) => void;
}

class LaneWorker {
  private worker: Worker | null = null;
  private nextId = 1;
  private inflight = new Map<number, { resolve: (r: BuildResult) => void; reject: (e: Error) => void }>();
  /** Coalesced requests: at most one waiting job per channel; newer ones replace it. */
  private waiting = new Map<string, { job: BuildJob; pending: Pending }>();

  private ensure(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/geometry.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const msg = ev.data;
        const p = this.inflight.get(msg.id);
        if (!p) return;
        this.inflight.delete(msg.id);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error));
        this.flush();
      };
      this.worker.onerror = (ev) => {
        for (const p of this.inflight.values()) p.reject(new Error(ev.message || 'Geometry worker crashed'));
        this.inflight.clear();
        this.worker?.terminate();
        this.worker = null;
        this.flush();
      };
    }
    return this.worker;
  }

  build(job: BuildJob): Promise<BuildResult> {
    const id = this.nextId++;
    const worker = this.ensure();
    return new Promise((resolve, reject) => {
      this.inflight.set(id, { resolve, reject });
      const req: WorkerRequest = { id, job };
      worker.postMessage(req);
    });
  }

  /**
   * Latest-wins: if the worker is busy, the job waits; a newer job on the same
   * channel replaces it (the replaced promise resolves null), so rapid slider
   * moves never pile up stale builds.
   */
  buildCoalesced(channel: string, job: BuildJob): Promise<BuildResult | null> {
    return new Promise((resolve, reject) => {
      const prev = this.waiting.get(channel);
      if (prev) prev.pending.resolve(null);
      this.waiting.set(channel, { job, pending: { resolve, reject } });
      this.flush();
    });
  }

  private flush() {
    if (this.inflight.size > 0) return;
    const next = this.waiting.entries().next();
    if (next.done) return;
    const [channel, { job, pending }] = next.value;
    this.waiting.delete(channel);
    this.build(job).then(pending.resolve, pending.reject);
  }
}

class GeometryClient {
  private lanes: Record<Lane, LaneWorker> = { interactive: new LaneWorker(), full: new LaneWorker() };

  /** One-off build (exports) on the full lane. */
  build(job: BuildJob): Promise<BuildResult> {
    return this.lanes.full.build(job);
  }

  buildCoalesced(lane: Lane, channel: string, job: BuildJob): Promise<BuildResult | null> {
    return this.lanes[lane].buildCoalesced(channel, job);
  }
}

export const geometryClient = new GeometryClient();
