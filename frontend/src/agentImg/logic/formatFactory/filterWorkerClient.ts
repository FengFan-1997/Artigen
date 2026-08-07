import type {
  ImageFilterWorkerRequest,
  ImageFilterWorkerResponse
} from './imageFilter.worker';

type FilterWorkerFactory = () => Worker;

const createJobId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `filter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const processImageFilterInWorker = (input: {
  file: Blob;
  preset: ImageFilterWorkerRequest['preset'];
  intensity: number;
  outType: ImageFilterWorkerRequest['outType'];
  quality?: number;
  signal?: AbortSignal;
  workerFactory?: FilterWorkerFactory;
}) => {
  if (input.signal?.aborted) return Promise.reject(new Error('ABORTED'));

  return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = input.workerFactory
        ? input.workerFactory()
        : new Worker(new URL('./imageFilter.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      reject(new Error('FILTER_WORKER_FAILED'));
      return;
    }

    const jobId = createJobId();
    let settled = false;
    const cleanup = () => {
      input.signal?.removeEventListener('abort', onAbort);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.terminate();
    };
    const finish = (
      callback: () => void
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => reject(new Error('ABORTED')));
    const onError = () => finish(() => reject(new Error('FILTER_WORKER_FAILED')));
    const onMessage = (event: MessageEvent<ImageFilterWorkerResponse>) => {
      const response = event.data;
      if (!response || response.jobId !== jobId) return;
      if (response.type === 'failed') {
        finish(() => reject(new Error(response.error || 'FILTER_WORKER_FAILED')));
        return;
      }
      if (!(response.blob instanceof Blob) || !response.blob.size) {
        finish(() => reject(new Error('IMAGE_OUTPUT_INVALID')));
        return;
      }
      finish(() =>
        resolve({
          blob: response.blob,
          width: response.width,
          height: response.height
        })
      );
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError, { once: true });
    input.signal?.addEventListener('abort', onAbort, { once: true });

    const request: ImageFilterWorkerRequest = {
      type: 'process',
      jobId,
      file: input.file,
      preset: input.preset,
      intensity: input.intensity,
      outType: input.outType,
      quality: input.quality
    };
    try {
      worker.postMessage(request);
    } catch {
      finish(() => reject(new Error('FILTER_WORKER_FAILED')));
    }
  });
};
