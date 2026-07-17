/// <reference lib="webworker" />

import { GIFEncoder, applyPalette, quantize } from 'gifenc';

type WorkerRequest =
  | {
      requestId: number;
      type: 'init';
      width: number;
      height: number;
      delayMilliseconds: number;
      maxColors: number;
    }
  | { requestId: number; type: 'frame'; rgba: ArrayBuffer }
  | { requestId: number; type: 'finish' };

let encoder: ReturnType<typeof GIFEncoder> | null = null;
let width = 0;
let height = 0;
let delayMilliseconds = 100;
let maxColors = 256;

const postError = (requestId: number, error: unknown) => {
  self.postMessage({
    requestId,
    type: 'error',
    error: typeof (error as any)?.message === 'string' ? (error as any).message : 'GIF_WORKER_FAILED'
  });
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      width = Math.max(1, Math.floor(message.width));
      height = Math.max(1, Math.floor(message.height));
      delayMilliseconds = Math.max(20, Math.floor(message.delayMilliseconds));
      maxColors = Math.max(16, Math.min(256, Math.floor(message.maxColors)));
      encoder = GIFEncoder();
      self.postMessage({ requestId: message.requestId, type: 'ready' });
      return;
    }

    if (!encoder || !width || !height) throw new Error('GIF_WORKER_NOT_READY');
    if (message.type === 'frame') {
      const rgba = new Uint8ClampedArray(message.rgba);
      if (rgba.byteLength !== width * height * 4) throw new Error('GIF_FRAME_INVALID');
      const palette = quantize(rgba, maxColors);
      const index = applyPalette(rgba, palette);
      encoder.writeFrame(index, width, height, {
        palette,
        delay: delayMilliseconds,
        repeat: 0
      });
      self.postMessage({ requestId: message.requestId, type: 'frame-complete' });
      return;
    }

    encoder.finish();
    const encoded = encoder.bytes();
    const bytes = new Uint8Array(encoded.byteLength);
    bytes.set(encoded);
    encoder = null;
    self.postMessage(
      { requestId: message.requestId, type: 'result', bytes: bytes.buffer },
      [bytes.buffer]
    );
  } catch (error) {
    postError(message.requestId, error);
  }
};

export {};
