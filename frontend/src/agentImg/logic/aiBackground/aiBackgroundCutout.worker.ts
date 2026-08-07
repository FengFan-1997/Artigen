/// <reference lib="webworker" />

import { createCutoutPixels } from './cutoutProcessing';
import type {
  CutoutProcessRequest,
  CutoutWorkerFailure,
  CutoutWorkerRequest,
  CutoutWorkerSuccess
} from './cutoutProtocol';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const cancelledJobs = new Set<string>();

const cancellationKey = (request: { jobId: string; sourceRevision: number }) =>
  `${request.jobId}:${request.sourceRevision}`;

const isCancelled = (request: CutoutProcessRequest) => cancelledJobs.has(cancellationKey(request));

const processCutout = async (request: CutoutProcessRequest) => {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(request.source);
    if (isCancelled(request)) return;

    const width = Math.max(1, Math.round(bitmap.width));
    const height = Math.max(1, Math.round(bitmap.height));
    const maskScale = Math.min(1, 760 / Math.max(width, height));
    const maskWidth = Math.max(1, Math.round(width * maskScale));
    const maskHeight = Math.max(1, Math.round(height * maskScale));

    const sourceCanvas = new OffscreenCanvas(width, height);
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const maskCanvas = new OffscreenCanvas(maskWidth, maskHeight);
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext || !maskContext) throw new Error('AI_BACKGROUND_CANVAS_UNAVAILABLE');

    sourceContext.drawImage(bitmap, 0, 0, width, height);
    maskContext.drawImage(bitmap, 0, 0, maskWidth, maskHeight);
    const sourceImage = sourceContext.getImageData(0, 0, width, height);
    const maskImage = maskContext.getImageData(0, 0, maskWidth, maskHeight);
    const output = createCutoutPixels({
      width,
      height,
      pixels: sourceImage.data,
      maskWidth,
      maskHeight,
      maskPixels: maskImage.data
    });
    if (isCancelled(request)) return;

    sourceImage.data.set(output);
    sourceContext.putImageData(sourceImage, 0, 0);
    const outputBlob = await sourceCanvas.convertToBlob({ type: 'image/png' });
    if (isCancelled(request)) return;
    const result: CutoutWorkerSuccess = {
      type: 'success',
      jobId: request.jobId,
      sourceRevision: request.sourceRevision,
      output: outputBlob
    };
    workerScope.postMessage(result);
  } catch (value) {
    if (isCancelled(request)) return;
    const result: CutoutWorkerFailure = {
      type: 'failed',
      jobId: request.jobId,
      sourceRevision: request.sourceRevision,
      message: value instanceof Error ? value.message : 'AI_BACKGROUND_CUTOUT_FAILED'
    };
    workerScope.postMessage(result);
  } finally {
    bitmap?.close();
    cancelledJobs.delete(cancellationKey(request));
  }
};

workerScope.onmessage = (event: MessageEvent<CutoutWorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    cancelledJobs.add(cancellationKey(request));
    return;
  }
  void processCutout(request);
};

export {};
