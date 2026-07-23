import type { FormatFactoryToolId } from './types';

const MIB = 1024 * 1024;
const MIN_DEVICE_MEMORY_GB = 1;
const DEFAULT_DEVICE_MEMORY_GB = 4;
const MAX_DEVICE_MEMORY_GB = 16;

export type ResourceBudgetProfile = {
  deviceMemoryGb: number;
  maxEstimatedOutputBytes: number;
  maxTotalInputBytes: number;
  maxTotalPixels: number;
  maxWorkingBytes: number;
};

export type ResourceInputMetric = {
  bytes: number;
  pixels: number;
  outputPixels?: number;
};

export type ImageOutputMime = 'image/png' | 'image/jpeg' | 'image/webp';

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const createResourceBudgetProfile = (
  deviceMemoryGb = DEFAULT_DEVICE_MEMORY_GB
): ResourceBudgetProfile => {
  const safeMemoryGb = clamp(
    Number.isFinite(deviceMemoryGb) ? deviceMemoryGb : DEFAULT_DEVICE_MEMORY_GB,
    MIN_DEVICE_MEMORY_GB,
    MAX_DEVICE_MEMORY_GB
  );
  const deviceBytes = safeMemoryGb * 1024 * MIB;
  const maxWorkingBytes = Math.floor(clamp(deviceBytes * 0.1, 128 * MIB, 768 * MIB));
  return {
    deviceMemoryGb: safeMemoryGb,
    maxWorkingBytes,
    maxTotalInputBytes: Math.floor(clamp(maxWorkingBytes * 0.6, 80 * MIB, 320 * MIB)),
    maxTotalPixels: Math.floor(clamp(maxWorkingBytes / 12, 10_000_000, 64_000_000)),
    maxEstimatedOutputBytes: Math.floor(
      clamp(maxWorkingBytes * 0.7, 96 * MIB, 512 * MIB)
    )
  };
};

export const getRuntimeResourceBudget = (): ResourceBudgetProfile => {
  const deviceMemory = Number(
    (globalThis.navigator as Navigator & { deviceMemory?: number })?.deviceMemory
  );
  return createResourceBudgetProfile(
    Number.isFinite(deviceMemory) && deviceMemory > 0
      ? deviceMemory
      : DEFAULT_DEVICE_MEMORY_GB
  );
};

const estimatedBytesPerPixel = (mimeType: ImageOutputMime) => {
  if (mimeType === 'image/png') return 4;
  if (mimeType === 'image/jpeg') return 1.25;
  return 1.5;
};

export const hasImageCodecWorkerCapability = () =>
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof OffscreenCanvas.prototype?.getContext === 'function' &&
  typeof createImageBitmap === 'function';

export const hasFilterWorkerCapability = hasImageCodecWorkerCapability;

export const assertFormatFactoryResourceBudget = (input: {
  filterWorkerAvailable?: boolean;
  metrics: readonly ResourceInputMetric[];
  outputMimeType?: ImageOutputMime;
  profile?: ResourceBudgetProfile;
  toolId: FormatFactoryToolId;
}) => {
  const profile = input.profile || getRuntimeResourceBudget();
  const metrics = input.metrics.map((metric) => ({
    bytes: Math.max(0, Number(metric.bytes) || 0),
    pixels: Math.max(0, Number(metric.pixels) || 0),
    outputPixels: Math.max(
      0,
      Number(metric.outputPixels === undefined ? metric.pixels : metric.outputPixels) || 0
    )
  }));
  const totalBytes = metrics.reduce((sum, metric) => sum + metric.bytes, 0);
  const totalInputPixels = metrics.reduce((sum, metric) => sum + metric.pixels, 0);
  const totalOutputPixels = metrics.reduce((sum, metric) => sum + metric.outputPixels, 0);
  const totalPixels = Math.max(totalInputPixels, totalOutputPixels);
  const largestPixels = metrics.reduce(
    (largest, metric) => Math.max(largest, metric.pixels, metric.outputPixels),
    0
  );
  if (totalBytes > profile.maxTotalInputBytes) throw new Error('BATCH_TOTAL_BYTES_LIMIT');
  if (totalPixels > profile.maxTotalPixels) throw new Error('BATCH_TOTAL_PIXELS_LIMIT');

  if (input.toolId === 'filter' && input.filterWorkerAvailable === false) {
    if (largestPixels > 2_000_000 || totalPixels > 8_000_000) {
      throw new Error('FILTER_WORKER_UNAVAILABLE');
    }
  }

  const outputMimeType = input.outputMimeType || 'image/png';
  const estimatedOutputBytes = Math.ceil(
    totalOutputPixels * estimatedBytesPerPixel(outputMimeType)
  );
  if (estimatedOutputBytes > profile.maxEstimatedOutputBytes) {
    throw new Error('OUTPUT_BUDGET_EXCEEDED');
  }

  // Processing is sequential, but completed output Blobs stay resident for ZIP/download.
  // Budget source/destination RGBA plus one intermediate/encoder buffer and all outputs.
  const estimatedWorkingBytes = largestPixels * 12 + estimatedOutputBytes;
  if (estimatedWorkingBytes > profile.maxWorkingBytes) {
    throw new Error('DEVICE_MEMORY_BUDGET_EXCEEDED');
  }
  return {
    estimatedOutputBytes,
    estimatedWorkingBytes,
    totalBytes,
    totalInputPixels,
    totalOutputPixels,
    totalPixels
  };
};

export const assertZipResourceBudget = (
  byteSizes: readonly number[],
  profile = getRuntimeResourceBudget()
) => {
  const totalBytes = byteSizes.reduce(
    (sum, size) => sum + Math.max(0, Number(size) || 0),
    0
  );
  if (totalBytes > profile.maxEstimatedOutputBytes) {
    throw new Error('OUTPUT_BUDGET_EXCEEDED');
  }
  // fflate holds source entries, compressed chunks, and the final contiguous archive.
  if (totalBytes * 2.25 > profile.maxWorkingBytes) {
    throw new Error('ZIP_MEMORY_BUDGET_EXCEEDED');
  }
  return { totalBytes, estimatedWorkingBytes: Math.ceil(totalBytes * 2.25) };
};

export const createPdfRangeBudgetTracker = (
  mimeType: ImageOutputMime,
  profile = getRuntimeResourceBudget()
) => {
  let totalPixels = 0;
  let estimatedOutputBytes = 0;
  return {
    reserve(width: number, height: number) {
      const pixels = Math.max(1, Math.floor(width)) * Math.max(1, Math.floor(height));
      totalPixels += pixels;
      estimatedOutputBytes += Math.ceil(pixels * estimatedBytesPerPixel(mimeType));
      if (totalPixels > profile.maxTotalPixels) throw new Error('BATCH_TOTAL_PIXELS_LIMIT');
      if (estimatedOutputBytes > profile.maxEstimatedOutputBytes) {
        throw new Error('OUTPUT_BUDGET_EXCEEDED');
      }
      if (pixels * 8 + estimatedOutputBytes > profile.maxWorkingBytes) {
        throw new Error('DEVICE_MEMORY_BUDGET_EXCEEDED');
      }
    },
    snapshot() {
      return { estimatedOutputBytes, totalPixels };
    }
  };
};

export const assertPdfStitchBudget = (
  pageSizes: readonly { width: number; height: number }[],
  profile = getRuntimeResourceBudget()
) => {
  const width = pageSizes.reduce(
    (largest, page) => Math.max(largest, Math.max(1, Math.floor(page.width))),
    1
  );
  const height = pageSizes.reduce(
    (total, page) => total + Math.max(1, Math.floor(page.height)),
    0
  );
  const outputPixels = width * height;
  const largestPagePixels = pageSizes.reduce(
    (largest, page) =>
      Math.max(
        largest,
        Math.max(1, Math.floor(page.width)) * Math.max(1, Math.floor(page.height))
      ),
    0
  );
  if (outputPixels > profile.maxTotalPixels) throw new Error('BATCH_TOTAL_PIXELS_LIMIT');
  if (outputPixels * 4 > profile.maxEstimatedOutputBytes) {
    throw new Error('OUTPUT_BUDGET_EXCEEDED');
  }
  if (outputPixels * 4 + largestPagePixels * 8 > profile.maxWorkingBytes) {
    throw new Error('DEVICE_MEMORY_BUDGET_EXCEEDED');
  }
  return { height, outputPixels, width };
};
