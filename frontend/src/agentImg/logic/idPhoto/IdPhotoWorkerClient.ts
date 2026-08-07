import { IdPhotoJobGuard } from './idPhotoMath';
import type {
  IdPhotoWorkerRequest,
  IdPhotoWorkerResult
} from './idPhoto.worker';

interface PendingJob {
  resolve: (value: { accepted: boolean; result: IdPhotoWorkerResult }) => void;
  reject: (error: Error) => void;
}

export class IdPhotoWorkerClient {
  private worker: Worker | null = null;
  private readonly guard = new IdPhotoJobGuard();
  private pending = new Map<string, PendingJob>();

  run(input: {
    revision: number;
    width: number;
    height: number;
    data: ArrayBuffer;
    target: [number, number, number];
    tolerance: number;
  }): Promise<{ accepted: boolean; result: IdPhotoWorkerResult }> {
    this.cancelCurrent('ID_PHOTO_SUPERSEDED');
    const identity = this.guard.start(input.revision);
    const request: IdPhotoWorkerRequest = {
      type: 'process',
      ...identity,
      width: input.width,
      height: input.height,
      data: input.data,
      target: input.target,
      tolerance: input.tolerance
    };
    return new Promise((resolve, reject) => {
      this.pending.set(identity.jobId, { resolve, reject });
      this.getWorker().postMessage(request, [request.data]);
    });
  }

  cancelCurrent(reason = 'ID_PHOTO_CANCELLED'): void {
    this.guard.invalidate();
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.pending.values()) job.reject(new Error(reason));
    this.pending.clear();
  }

  dispose(): void {
    this.cancelCurrent('ID_PHOTO_DISPOSED');
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./idPhoto.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<IdPhotoWorkerResult>) => {
      const result = event.data;
      const pending = this.pending.get(result.jobId);
      if (!pending) return;
      this.pending.delete(result.jobId);
      const accepted = this.guard.complete(result);
      pending.resolve({ accepted, result });
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'ID_PHOTO_WORKER_FAILED');
      for (const job of this.pending.values()) job.reject(error);
      this.pending.clear();
      this.guard.invalidate();
      worker.terminate();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }
}
