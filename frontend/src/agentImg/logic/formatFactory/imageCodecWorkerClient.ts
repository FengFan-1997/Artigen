import type {
  ImageCodecOperation,
  ImageCodecWorkerRequest,
  ImageCodecWorkerResponse
} from './imageCodec.worker';
import type { CodecMimeType } from './codecPipeline';

type WorkerFactory = () => Worker;

export const processImageWithCodecWorker = (input: {
  file: Blob;
  operation: ImageCodecOperation;
  outType: CodecMimeType;
  quality?: number;
  signal?: AbortSignal;
  workerFactory?: WorkerFactory;
}) => {
  if (input.signal?.aborted) return Promise.reject(new Error('ABORTED'));
  return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = input.workerFactory
        ? input.workerFactory()
        : new Worker(new URL('./imageCodec.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      reject(new Error('IMAGE_CODEC_WORKER_FAILED'));
      return;
    }
    const jobId = globalThis.crypto?.randomUUID?.() || `codec-${Date.now()}-${Math.random()}`;
    let settled = false;
    const cleanup = () => {
      input.signal?.removeEventListener('abort', onAbort);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.terminate();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => reject(new Error('ABORTED')));
    const onError = () => finish(() => reject(new Error('IMAGE_CODEC_WORKER_FAILED')));
    const onMessage = (event: MessageEvent<ImageCodecWorkerResponse>) => {
      const response = event.data;
      if (!response || response.jobId !== jobId) return;
      if (response.type === 'failed') {
        finish(() => reject(new Error(response.error || 'IMAGE_CODEC_WORKER_FAILED')));
        return;
      }
      if (!(response.blob instanceof Blob) || !response.blob.size) {
        finish(() => reject(new Error('IMAGE_OUTPUT_INVALID')));
        return;
      }
      finish(() => resolve({ blob: response.blob, width: response.width, height: response.height }));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError, { once: true });
    input.signal?.addEventListener('abort', onAbort, { once: true });
    const request: ImageCodecWorkerRequest = {
      type: 'process',
      jobId,
      file: input.file,
      operation: input.operation,
      outType: input.outType,
      quality: input.quality
    };
    try {
      worker.postMessage(request);
    } catch {
      finish(() => reject(new Error('IMAGE_CODEC_WORKER_FAILED')));
    }
  });
};
