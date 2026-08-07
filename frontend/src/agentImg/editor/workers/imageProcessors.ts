import type { NormalizedPixelPoint, PixelBuffer } from './protocol';

export function removeUniformBackground(
  input: PixelBuffer,
  toleranceValue = 54,
  featherValue = 0.35
): PixelBuffer {
  assertPixelBuffer(input);
  const { width, height } = input;
  const source = new Uint8ClampedArray(input.data);
  const output = new Uint8ClampedArray(source);
  const background = averageEdgeColor(source, width, height);
  const tolerance = clamp(toleranceValue, 8, 180);
  const feather = clamp(featherValue, 0, 1);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const enqueue = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    if (distanceAt(source, index, background) <= tolerance || (source[index * 4 + 3] ?? 0) < 16) {
      queue[tail] = index;
      tail += 1;
    }
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const distance = distanceAt(source, index, background);
    const featherStart = tolerance * (1 - feather);
    const retainedAlpha = feather > 0 && distance > featherStart
      ? Math.round(255 * ((distance - featherStart) / Math.max(1, tolerance - featherStart)))
      : 0;
    output[index * 4 + 3] = Math.min(output[index * 4 + 3] ?? 255, retainedAlpha);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
  return { width, height, data: output.buffer };
}

export function applyPolygonCutout(
  input: PixelBuffer,
  rawPoints: NormalizedPixelPoint[]
): PixelBuffer {
  assertPixelBuffer(input);
  if (rawPoints.length < 3) throw new Error('POLYGON_REQUIRES_THREE_POINTS');
  const points = rawPoints.map((point) => ({
    x: clamp(point.x, 0, 1),
    y: clamp(point.y, 0, 1)
  }));
  const { width, height } = input;
  const output = new Uint8ClampedArray(input.data);
  for (let y = 0; y < height; y += 1) {
    const normalizedY = (y + 0.5) / height;
    const intersections: number[] = [];
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const crosses = (start.y <= normalizedY && end.y > normalizedY) ||
        (end.y <= normalizedY && start.y > normalizedY);
      if (!crosses) continue;
      const progress = (normalizedY - start.y) / (end.y - start.y);
      intersections.push(clamp(start.x + progress * (end.x - start.x), 0, 1));
    }
    intersections.sort((left, right) => left - right);
    let pairIndex = 0;
    for (let x = 0; x < width; x += 1) {
      const normalizedX = (x + 0.5) / width;
      while (
        pairIndex + 1 < intersections.length &&
        normalizedX > (intersections[pairIndex + 1] ?? 1)
      ) pairIndex += 2;
      const inside = pairIndex + 1 < intersections.length &&
        normalizedX >= (intersections[pairIndex] ?? 1) &&
        normalizedX <= (intersections[pairIndex + 1] ?? 0);
      if (!inside) output[(y * width + x) * 4 + 3] = 0;
    }
  }
  return { width, height, data: output.buffer };
}

export function enhanceClarity(input: PixelBuffer, amountValue = 0.7): PixelBuffer {
  assertPixelBuffer(input);
  const { width, height } = input;
  const source = new Uint8ClampedArray(input.data);
  const output = new Uint8ClampedArray(source.length);
  const amount = clamp(amountValue, 0, 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[offset + channel] ?? 0;
        const left = source[(y * width + Math.max(0, x - 1)) * 4 + channel] ?? center;
        const right = source[(y * width + Math.min(width - 1, x + 1)) * 4 + channel] ?? center;
        const top = source[(Math.max(0, y - 1) * width + x) * 4 + channel] ?? center;
        const bottom = source[(Math.min(height - 1, y + 1) * width + x) * 4 + channel] ?? center;
        const localAverage = (center + left + right + top + bottom) / 5;
        output[offset + channel] = clampByte(center + (center - localAverage) * amount);
      }
      output[offset + 3] = source[offset + 3] ?? 255;
    }
  }
  return { width, height, data: output.buffer };
}

function assertPixelBuffer(input: PixelBuffer): void {
  if (
    !Number.isInteger(input.width) ||
    !Number.isInteger(input.height) ||
    input.width < 1 ||
    input.height < 1 ||
    input.data.byteLength !== input.width * input.height * 4
  ) throw new Error('INVALID_INPUT');
}

function averageEdgeColor(
  data: Uint8ClampedArray,
  width: number,
  height: number
): [number, number, number] {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  const add = (index: number) => {
    const offset = index * 4;
    if ((data[offset + 3] ?? 0) < 16) return;
    red += data[offset] ?? 0;
    green += data[offset + 1] ?? 0;
    blue += data[offset + 2] ?? 0;
    count += 1;
  };
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 256))) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += Math.max(1, Math.floor(height / 256))) {
    add(y * width);
    add(y * width + width - 1);
  }
  return count
    ? [Math.round(red / count), Math.round(green / count), Math.round(blue / count)]
    : [255, 255, 255];
}

function distanceAt(
  data: Uint8ClampedArray,
  index: number,
  target: [number, number, number]
): number {
  const offset = index * 4;
  const red = (data[offset] ?? 0) - target[0];
  const green = (data[offset + 1] ?? 0) - target[1];
  const blue = (data[offset + 2] ?? 0) - target[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}
