/// <reference lib="webworker" />

import {
  assertCodecDimensions,
  encodeCodecPixels,
  type CodecMimeType
} from './codecPipeline';

export type ImageCodecOperation =
  | { type: 'convert' }
  | { type: 'max-side'; maxSide: number }
  | { type: 'resize'; width: number | null; height: number | null; maxSide: number | null }
  | { type: 'rotate'; rotate: 0 | 90 | 180 | 270; flipH: boolean; flipV: boolean };

export type ImageCodecWorkerRequest = {
  type: 'process';
  jobId: string;
  file: Blob;
  operation: ImageCodecOperation;
  outType: CodecMimeType;
  quality?: number;
};

export type ImageCodecWorkerResponse =
  | { type: 'success'; jobId: string; blob: Blob; width: number; height: number }
  | { type: 'failed'; jobId: string; error: string };

export const CODEC_IMAGE_ORIENTATION: ImageOrientation = 'from-image';

export const resolveCodecDimensions = (width: number, height: number, operation: ImageCodecOperation) => {
  if (operation.type === 'convert') return { width, height };
  if (operation.type === 'max-side') {
    const maxSide = Math.max(1, Math.floor(operation.maxSide));
    const ratio = Math.min(1, maxSide / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
  }
  if (operation.type === 'rotate') {
    return operation.rotate === 90 || operation.rotate === 270
      ? { width: height, height: width }
      : { width, height };
  }
  const requestedWidth = operation.width && operation.width > 0 ? Math.floor(operation.width) : null;
  const requestedHeight = operation.height && operation.height > 0 ? Math.floor(operation.height) : null;
  if (requestedWidth && requestedHeight) return { width: requestedWidth, height: requestedHeight };
  if (requestedWidth) return { width: requestedWidth, height: Math.max(1, Math.round(height * requestedWidth / width)) };
  if (requestedHeight) return { width: Math.max(1, Math.round(width * requestedHeight / height)), height: requestedHeight };
  if (operation.maxSide && operation.maxSide > 0) {
    const ratio = Math.min(1, operation.maxSide / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
  }
  throw new Error('RESIZE_DIMENSIONS_REQUIRED');
};

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<ImageCodecWorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'process') return;
  let bitmap: ImageBitmap | null = null;
  try {
    // Browser decoding applies EXIF orientation before the transform. The
    // encoder therefore always receives top-left-oriented RGBA pixels.
    bitmap = await createImageBitmap(request.file, { imageOrientation: CODEC_IMAGE_ORIENTATION });
    const resolved = resolveCodecDimensions(bitmap.width, bitmap.height, request.operation);
    const target = assertCodecDimensions(resolved.width, resolved.height);
    const canvas = new OffscreenCanvas(target.width, target.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('CANVAS_CONTEXT_FAIL');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    if (request.operation.type === 'rotate') {
      context.translate(target.width / 2, target.height / 2);
      context.rotate((request.operation.rotate * Math.PI) / 180);
      context.scale(request.operation.flipH ? -1 : 1, request.operation.flipV ? -1 : 1);
      context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      context.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      context.drawImage(bitmap, 0, 0, target.width, target.height);
    }
    const imageData = context.getImageData(0, 0, target.width, target.height);
    const blob = await encodeCodecPixels({
      width: target.width,
      height: target.height,
      data: imageData.data
    }, request.outType, request.quality);
    const response: ImageCodecWorkerResponse = {
      type: 'success', jobId: request.jobId, blob, width: target.width, height: target.height
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: ImageCodecWorkerResponse = {
      type: 'failed',
      jobId: request.jobId,
      error: error instanceof Error ? error.message : 'IMAGE_CODEC_FAILED'
    };
    workerScope.postMessage(response);
  } finally {
    bitmap?.close();
  }
};

export {};
