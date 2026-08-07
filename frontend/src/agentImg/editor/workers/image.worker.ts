/// <reference lib="webworker" />

import type {
  PixelBuffer,
  PixelJob,
  PixelJobIdentity,
  PixelWorkerRequest,
  PixelWorkerResult
} from './protocol';
import {
  applyPolygonCutout,
  enhanceClarity,
  removeUniformBackground
} from './imageProcessors';

const cancelledJobs = new Set<string>();

self.onmessage = (event: MessageEvent<PixelWorkerRequest>) => {
  if (event.data.type === 'cancel') {
    cancelledJobs.add(event.data.jobId);
    return;
  }
  void runJob(event.data.job);
};

async function runJob(job: PixelJob): Promise<void> {
  try {
    assertValidInput(job.input);
    let output: PixelBuffer;
    if (job.operation.type === 'upscale') {
      output = await upscaleBilinear(job, job.operation.scale);
    } else if (job.operation.type === 'adjustments') {
      output = await applyAdjustments(job);
    } else if (job.operation.type === 'remove-background') {
      output = removeUniformBackground(job.input, job.operation.tolerance, job.operation.feather);
    } else if (job.operation.type === 'clarity') {
      output = enhanceClarity(job.input, job.operation.amount);
    } else {
      output = applyPolygonCutout(job.input, job.operation.points);
    }
    if (cancelledJobs.has(job.jobId)) {
      postResult({ ...jobIdentity(job), type: 'cancelled' });
      return;
    }
    postResult({ ...jobIdentity(job), type: 'success', output }, [output.data]);
  } catch (value) {
    const message = value instanceof Error ? value.message : 'Pixel processing failed';
    postResult({
      ...jobIdentity(job),
      type: 'failed',
      code: message === 'INVALID_INPUT' ? 'INVALID_INPUT' : 'PROCESSING_FAILED',
      message
    });
  } finally {
    cancelledJobs.delete(job.jobId);
  }
}

async function applyAdjustments(job: PixelJob): Promise<PixelBuffer> {
  if (job.operation.type !== 'adjustments') throw new Error('INVALID_INPUT');
  const { width, height } = job.input;
  const source = new Uint8ClampedArray(job.input.data);
  const output = new Uint8ClampedArray(source.length);
  const adjustment = job.operation.adjustments;
  const contrast = 1 + adjustment.contrast;
  const saturation = 1 + adjustment.saturation;
  const hue = (adjustment.hue * Math.PI) / 180;
  const cosHue = Math.cos(hue);
  const sinHue = Math.sin(hue);

  for (let y = 0; y < height; y += 1) {
    if (cancelledJobs.has(job.jobId)) return { width, height, data: output.buffer };
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      let red = source[offset] ?? 0;
      let green = source[offset + 1] ?? 0;
      let blue = source[offset + 2] ?? 0;
      const alpha = source[offset + 3] ?? 255;

      red = (red - 128) * contrast + 128 + adjustment.brightness * 255;
      green = (green - 128) * contrast + 128 + adjustment.brightness * 255;
      blue = (blue - 128) * contrast + 128 + adjustment.brightness * 255;

      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      red = luminance + (red - luminance) * saturation;
      green = luminance + (green - luminance) * saturation;
      blue = luminance + (blue - luminance) * saturation;

      const hueRed =
        red * (0.213 + cosHue * 0.787 - sinHue * 0.213) +
        green * (0.715 - cosHue * 0.715 - sinHue * 0.715) +
        blue * (0.072 - cosHue * 0.072 + sinHue * 0.928);
      const hueGreen =
        red * (0.213 - cosHue * 0.213 + sinHue * 0.143) +
        green * (0.715 + cosHue * 0.285 + sinHue * 0.14) +
        blue * (0.072 - cosHue * 0.072 - sinHue * 0.283);
      const hueBlue =
        red * (0.213 - cosHue * 0.213 - sinHue * 0.787) +
        green * (0.715 - cosHue * 0.715 + sinHue * 0.715) +
        blue * (0.072 + cosHue * 0.928 + sinHue * 0.072);

      const gray = hueRed * 0.2126 + hueGreen * 0.7152 + hueBlue * 0.0722;
      red = mix(hueRed, gray, adjustment.grayscale);
      green = mix(hueGreen, gray, adjustment.grayscale);
      blue = mix(hueBlue, gray, adjustment.grayscale);

      const sepiaRed = red * 0.393 + green * 0.769 + blue * 0.189;
      const sepiaGreen = red * 0.349 + green * 0.686 + blue * 0.168;
      const sepiaBlue = red * 0.272 + green * 0.534 + blue * 0.131;
      output[offset] = clampByte(mix(red, sepiaRed, adjustment.sepia));
      output[offset + 1] = clampByte(mix(green, sepiaGreen, adjustment.sepia));
      output[offset + 2] = clampByte(mix(blue, sepiaBlue, adjustment.sepia));
      output[offset + 3] = alpha;
    }
    if (y % 24 === 0) await yieldToWorkerQueue();
  }
  const blurred = adjustment.blur >= 1
    ? await boxBlur(output, width, height, Math.min(12, Math.round(adjustment.blur)), job.jobId)
    : output;
  return { width, height, data: blurred.buffer as ArrayBuffer };
}

async function upscaleBilinear(job: PixelJob, scale: 2): Promise<PixelBuffer> {
  const source = new Uint8ClampedArray(job.input.data);
  const sourceWidth = job.input.width;
  const sourceHeight = job.input.height;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const output = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    if (cancelledJobs.has(job.jobId)) return { width, height, data: output.buffer };
    const sourceY = y / scale;
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const fy = sourceY - y0;
    for (let x = 0; x < width; x += 1) {
      const sourceX = x / scale;
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const fx = sourceX - x0;
      const destinationOffset = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = mix(
          source[(y0 * sourceWidth + x0) * 4 + channel] ?? 0,
          source[(y0 * sourceWidth + x1) * 4 + channel] ?? 0,
          fx
        );
        const bottom = mix(
          source[(y1 * sourceWidth + x0) * 4 + channel] ?? 0,
          source[(y1 * sourceWidth + x1) * 4 + channel] ?? 0,
          fx
        );
        output[destinationOffset + channel] = clampByte(mix(top, bottom, fy));
      }
    }
    if (y % 24 === 0) await yieldToWorkerQueue();
  }
  return { width, height, data: output.buffer };
}

async function boxBlur(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  jobId: string
): Promise<Uint8ClampedArray> {
  const horizontal = new Uint8ClampedArray(input.length);
  const output = new Uint8ClampedArray(input.length);
  for (let y = 0; y < height; y += 1) {
    if (cancelledJobs.has(jobId)) return horizontal;
    const totals = [0, 0, 0, 0];
    let count = 0;
    for (let sampleX = 0; sampleX <= Math.min(width - 1, radius); sampleX += 1) {
      const offset = (y * width + sampleX) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        totals[channel] += input[offset + channel] ?? 0;
      }
      count += 1;
    }
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        horizontal[offset + channel] = Math.round(totals[channel] / count);
      }
      const removeX = x - radius;
      const addX = x + radius + 1;
      if (removeX >= 0) {
        const removeOffset = (y * width + removeX) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          totals[channel] -= input[removeOffset + channel] ?? 0;
        }
        count -= 1;
      }
      if (addX < width) {
        const addOffset = (y * width + addX) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          totals[channel] += input[addOffset + channel] ?? 0;
        }
        count += 1;
      }
    }
    if (y % 8 === 0) await yieldToWorkerQueue();
  }

  for (let x = 0; x < width; x += 1) {
    if (cancelledJobs.has(jobId)) return output;
    const totals = [0, 0, 0, 0];
    let count = 0;
    for (let sampleY = 0; sampleY <= Math.min(height - 1, radius); sampleY += 1) {
      const offset = (sampleY * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        totals[channel] += horizontal[offset + channel] ?? 0;
      }
      count += 1;
    }
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        output[offset + channel] = Math.round(totals[channel] / count);
      }
      const removeY = y - radius;
      const addY = y + radius + 1;
      if (removeY >= 0) {
        const removeOffset = (removeY * width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          totals[channel] -= horizontal[removeOffset + channel] ?? 0;
        }
        count -= 1;
      }
      if (addY < height) {
        const addOffset = (addY * width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          totals[channel] += horizontal[addOffset + channel] ?? 0;
        }
        count += 1;
      }
    }
    if (x % 8 === 0) await yieldToWorkerQueue();
  }
  return output;
}

function assertValidInput(input: PixelBuffer): void {
  const expected = input.width * input.height * 4;
  if (
    !Number.isInteger(input.width) ||
    !Number.isInteger(input.height) ||
    input.width < 1 ||
    input.height < 1 ||
    expected !== input.data.byteLength
  ) {
    throw new Error('INVALID_INPUT');
  }
}

function jobIdentity(job: PixelJob): PixelJobIdentity {
  return {
    jobId: job.jobId,
    projectId: job.projectId,
    layerId: job.layerId,
    sourceAssetId: job.sourceAssetId,
    revision: job.revision
  };
}

function postResult(result: PixelWorkerResult, transfer: Transferable[] = []): void {
  self.postMessage(result, { transfer });
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function yieldToWorkerQueue(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export {};
