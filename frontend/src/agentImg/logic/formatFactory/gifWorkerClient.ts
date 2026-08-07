type GifWorkerResponse = {
  requestId: number;
  type: 'ready' | 'frame-complete' | 'result' | 'error';
  bytes?: ArrayBuffer;
  error?: string;
};

type GifWorkerSession = {
  addFrame: (rgba: ArrayBuffer) => Promise<void>;
  finish: () => Promise<Uint8Array>;
  terminate: () => void;
};

const emitWorkerLifecycle = (phase: 'constructed' | 'terminated') => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(
    new CustomEvent('artigen:format-worker-lifecycle', {
      detail: { worker: 'gif', phase }
    })
  );
};

export const createGifWorkerSession = async (input: {
  width: number;
  height: number;
  delayMilliseconds: number;
  maxColors: number;
  signal?: AbortSignal;
  workerFactory?: () => Worker;
}): Promise<GifWorkerSession> => {
  const worker = input.workerFactory
    ? input.workerFactory()
    : new Worker(new URL('./gifEncoder.worker.ts', import.meta.url), { type: 'module' });
  emitWorkerLifecycle('constructed');
  let requestId = 0;
  let terminated = false;

  const terminate = () => {
    if (terminated) return;
    terminated = true;
    worker.terminate();
    emitWorkerLifecycle('terminated');
  };

  const request = <T extends GifWorkerResponse>(
    message: Record<string, unknown>,
    transfer: Transferable[] = [],
    timeoutMs = 15_000
  ) =>
    new Promise<T>((resolve, reject) => {
      if (terminated || input.signal?.aborted) {
        terminate();
        reject(new Error('ABORTED'));
        return;
      }
      const id = ++requestId;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onWorkerError);
        worker.removeEventListener('messageerror', onMessageError);
        input.signal?.removeEventListener('abort', onAbort);
        if (timer !== null) clearTimeout(timer);
      };
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onMessage = (event: MessageEvent<GifWorkerResponse>) => {
        const response = event.data;
        if (!response || response.requestId !== id) return;
        cleanup();
        if (response.type === 'error') {
          reject(new Error(response.error || 'GIF_WORKER_FAILED'));
          return;
        }
        resolve(response as T);
      };
      const onWorkerError = () => fail(new Error('GIF_WORKER_FAILED'));
      const onMessageError = () => fail(new Error('GIF_WORKER_MESSAGE_FAILED'));
      const onAbort = () => {
        terminate();
        fail(new Error('ABORTED'));
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onWorkerError, { once: true });
      worker.addEventListener('messageerror', onMessageError, { once: true });
      input.signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        terminate();
        fail(new Error(`GIF_WORKER_${String(message.type || 'REQUEST').toUpperCase()}_TIMEOUT`));
      }, Math.max(1_000, timeoutMs));
      worker.postMessage({ ...message, requestId: id }, transfer);
    });

  try {
    await request({
      type: 'init',
      width: input.width,
      height: input.height,
      delayMilliseconds: input.delayMilliseconds,
      maxColors: input.maxColors
    });
  } catch (error) {
    terminate();
    throw error;
  }

  return {
    async addFrame(rgba: ArrayBuffer) {
      await request({ type: 'frame', rgba }, [rgba], 30_000);
    },
    async finish() {
      const response = await request<GifWorkerResponse>({ type: 'finish' });
      if (!(response.bytes instanceof ArrayBuffer)) throw new Error('GIF_WORKER_FAILED');
      return new Uint8Array(response.bytes);
    },
    terminate
  };
};
