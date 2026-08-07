import { CutoutJobGate } from './cutoutJobGate';
import type {
  CutoutCancelRequest,
  CutoutJobIdentity,
  CutoutProcessRequest,
  CutoutWorkerResult
} from './cutoutProtocol';

interface ActiveCutoutJob {
  identity: CutoutJobIdentity;
  worker: Worker;
  resolve: (output: Blob) => void;
  reject: (error: Error) => void;
}

export class CutoutCancelledError extends Error {
  constructor(message = 'AI_BACKGROUND_CUTOUT_CANCELLED') {
    super(message);
    this.name = 'CutoutCancelledError';
  }
}

export class AiBackgroundCutoutWorkerClient {
  private readonly gate = new CutoutJobGate();
  private active: ActiveCutoutJob | null = null;

  constructor(
    private readonly createWorker: () => Worker = () =>
      new Worker(new URL('./aiBackgroundCutout.worker.ts', import.meta.url), { type: 'module' })
  ) {}

  run(input: { source: Blob; sourceRevision: number }): Promise<Blob> {
    this.cancelCurrent('AI_BACKGROUND_CUTOUT_SUPERSEDED');
    const identity = this.gate.begin(input.sourceRevision);

    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this.createWorker();
      } catch (value) {
        this.gate.cancel();
        reject(
          value instanceof Error ? value : new Error('AI_BACKGROUND_CUTOUT_WORKER_UNAVAILABLE')
        );
        return;
      }

      const active: ActiveCutoutJob = { identity, worker, resolve, reject };
      this.active = active;

      worker.onmessage = (event: MessageEvent<CutoutWorkerResult>) => {
        const result = event.data;
        if (!this.matches(active, result)) return;
        if (!this.gate.complete(result)) return;
        this.active = null;
        this.stopWorker(worker);
        if (result.type === 'failed') {
          reject(new Error(result.message || 'AI_BACKGROUND_CUTOUT_FAILED'));
          return;
        }
        if (!(result.output instanceof Blob) || !result.output.size) {
          reject(new Error('AI_BACKGROUND_CUTOUT_EMPTY_RESULT'));
          return;
        }
        resolve(result.output);
      };

      worker.onerror = (event) => {
        if (this.active !== active) return;
        this.gate.cancel();
        this.active = null;
        this.stopWorker(worker);
        reject(new Error(event.message || 'AI_BACKGROUND_CUTOUT_WORKER_FAILED'));
      };

      const request: CutoutProcessRequest = {
        type: 'process',
        ...identity,
        source: input.source
      };
      try {
        worker.postMessage(request);
      } catch (value) {
        if (this.active === active) {
          this.gate.cancel();
          this.active = null;
        }
        this.stopWorker(worker);
        reject(value instanceof Error ? value : new Error('AI_BACKGROUND_CUTOUT_POST_FAILED'));
      }
    });
  }

  cancelCurrent(reason = 'AI_BACKGROUND_CUTOUT_CANCELLED'): void {
    const active = this.active;
    const cancelled = this.gate.cancel();
    this.active = null;
    if (!active) return;
    if (cancelled) {
      const request: CutoutCancelRequest = { type: 'cancel', ...cancelled };
      try {
        active.worker.postMessage(request);
      } catch {}
    }
    this.stopWorker(active.worker);
    active.reject(new CutoutCancelledError(reason));
  }

  dispose(): void {
    this.cancelCurrent('AI_BACKGROUND_CUTOUT_DISPOSED');
  }

  private matches(active: ActiveCutoutJob, result: CutoutWorkerResult): boolean {
    return (
      this.active === active &&
      result.jobId === active.identity.jobId &&
      result.sourceRevision === active.identity.sourceRevision
    );
  }

  private stopWorker(worker: Worker): void {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
}
