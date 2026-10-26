import type { BuildJob, BuildResult } from '../geometry/buildPart';

export interface WorkerRequest {
  id: number;
  job: BuildJob;
}

export type WorkerResponse = { id: number; ok: true; result: BuildResult } | { id: number; ok: false; error: string };
