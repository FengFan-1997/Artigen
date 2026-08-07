import {
  createPixelJobId,
  type PixelBuffer,
  type PixelJob,
  type PixelJobIdentity,
  type PixelOperation,
  type PixelWorkerRequest,
  type PixelWorkerResult
} from './protocol';
import { PixelResultGate } from './staleResultGuard';

interface PendingJob {
  identity: PixelJobIdentity;
  resolve: (result: PixelWorkerResult) => void;
  reject: (error: Error) => void;
}

export class PixelWorkerClient {
  readonly gate = new PixelResultGate();
  private worker: Worker | null = null;
  private pending = new Map<string, PendingJob>();

  async run(input: {
    identity: Omit<PixelJobIdentity, 'jobId'>;
    pixels: PixelBuffer;
    operation: PixelOperation;
  }): Promise<PixelWorkerResult> {
    const job: PixelJob = {
      ...input.identity,
      jobId: createPixelJobId(),
      input: input.pixels,
      operation: input.operation
    };
    const replacedJobId = this.gate.begin(job);
    if (replacedJobId) this.cancel(replacedJobId);

    return new Promise((resolve, reject) => {
      this.pending.set(job.jobId, { identity: job, resolve, reject });
      const request: PixelWorkerRequest = { type: 'run', job };
      this.getWorker().postMessage(request, [job.input.data]);
    });
  }

  cancel(jobId: string): void {
    if (!this.pending.has(jobId)) return;
    this.terminatePendingJobs();
  }

  invalidateLayer(projectId: string, layerId: string): void {
    const jobId = this.gate.invalidateLayer(projectId, layerId);
    if (jobId) this.cancel(jobId);
  }

  invalidateProject(projectId: string): void {
    for (const jobId of this.gate.invalidateProject(projectId)) this.cancel(jobId);
  }

  dispose(): void {
    this.gate.clear();
    this.terminatePendingJobs();
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<PixelWorkerResult>) => {
      const result = event.data;
      const pending = this.pending.get(result.jobId);
      if (!pending) return;
      this.pending.delete(result.jobId);
      pending.resolve(result);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'PIXEL_WORKER_FAILED');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      worker.terminate();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private terminatePendingJobs(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      pending.resolve({ ...pending.identity, type: 'cancelled' });
    }
    this.pending.clear();
  }
}
