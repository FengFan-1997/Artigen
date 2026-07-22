/// <reference lib="webworker" />

import { assertCodecDimensions, encodeCodecPixels } from './codecPipeline';

export type ImageFilterWorkerRequest = {
  type: 'process';
  jobId: string;
  file: Blob;
  preset: 'grayscale' | 'sepia' | 'invert';
  intensity: number;
  outType: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
};

export type ImageFilterWorkerResponse =
  | {
      type: 'success';
      jobId: string;
      blob: Blob;
      width: number;
      height: number;
    }
  | {
      type: 'failed';
      jobId: string;
      error: string;
    };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const applyFilter = (
  data: Uint8ClampedArray,
  preset: ImageFilterWorkerRequest['preset'],
  intensity: number
) => {
  const amount = clamp01(Number(intensity) || 0);
  if (amount <= 0) return;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    let nextRed = red;
    let nextGreen = green;
    let nextBlue = blue;

    if (preset === 'grayscale') {
      const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
      nextRed = luminance;
      nextGreen = luminance;
      nextBlue = luminance;
    } else if (preset === 'sepia') {
      nextRed = Math.min(255, Math.round(0.393 * red + 0.769 * green + 0.189 * blue));
      nextGreen = Math.min(255, Math.round(0.349 * red + 0.686 * green + 0.168 * blue));
      nextBlue = Math.min(255, Math.round(0.272 * red + 0.534 * green + 0.131 * blue));
    } else {
      nextRed = 255 - red;
      nextGreen = 255 - green;
      nextBlue = 255 - blue;
    }

    data[index] = Math.round(red * (1 - amount) + nextRed * amount);
    data[index + 1] = Math.round(green * (1 - amount) + nextGreen * amount);
    data[index + 2] = Math.round(blue * (1 - amount) + nextBlue * amount);
  }
};

self.onmessage = async (event: MessageEvent<ImageFilterWorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'process') return;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(request.file, { imageOrientation: 'from-image' });
    const { width, height } = assertCodecDimensions(bitmap.width, bitmap.height);

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('CANVAS_CONTEXT_FAIL');
    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    applyFilter(imageData.data, request.preset, request.intensity);
    const blob = await encodeCodecPixels(
      { width, height, data: imageData.data },
      request.outType,
      request.quality
    );
    const response: ImageFilterWorkerResponse = {
      type: 'success',
      jobId: request.jobId,
      blob,
      width,
      height
    };
    self.postMessage(response);
  } catch (error) {
    const response: ImageFilterWorkerResponse = {
      type: 'failed',
      jobId: request.jobId,
      error:
        typeof (error as { message?: unknown })?.message === 'string'
          ? String((error as { message: string }).message)
          : 'FILTER_WORKER_FAILED'
    };
    self.postMessage(response);
  } finally {
    bitmap?.close();
  }
};

export {};
