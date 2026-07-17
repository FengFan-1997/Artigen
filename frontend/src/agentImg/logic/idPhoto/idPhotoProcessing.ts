export interface IdPhotoPixelBuffer {
  width: number;
  height: number;
  data: ArrayBuffer;
}

export interface IdPhotoBackgroundOptions {
  target: [number, number, number];
  tolerance: number;
}

export function replaceUniformEdgeBackground(
  input: IdPhotoPixelBuffer,
  options: IdPhotoBackgroundOptions
): IdPhotoPixelBuffer {
  const { width, height } = input;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    input.data.byteLength !== width * height * 4
  ) {
    throw new Error('INVALID_PIXEL_BUFFER');
  }
  const source = new Uint8ClampedArray(input.data);
  const output = new Uint8ClampedArray(source);
  const background = averageEdgeColor(source, width, height);
  const tolerance = Math.max(4, Math.min(180, options.tolerance));
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const enqueue = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    if (colorDistanceAt(source, index, background) <= tolerance || source[index * 4 + 3] < 16) {
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
    const offset = index * 4;
    const distance = colorDistanceAt(source, index, background);
    const blend = Math.max(0.25, Math.min(1, (tolerance - distance) / Math.max(1, tolerance * 0.55)));
    output[offset] = mix(source[offset], options.target[0], blend);
    output[offset + 1] = mix(source[offset + 1], options.target[1], blend);
    output[offset + 2] = mix(source[offset + 2], options.target[2], blend);
    output[offset + 3] = 255;

    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
  return { width, height, data: output.buffer };
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
  const stepX = Math.max(1, Math.floor(width / 256));
  const stepY = Math.max(1, Math.floor(height / 256));
  for (let x = 0; x < width; x += stepX) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = stepY; y < height - 1; y += stepY) {
    add(y * width);
    add(y * width + width - 1);
  }
  if (!count) return [255, 255, 255];
  return [Math.round(red / count), Math.round(green / count), Math.round(blue / count)];
}

function colorDistanceAt(
  data: Uint8ClampedArray,
  pixelIndex: number,
  target: [number, number, number]
): number {
  const offset = pixelIndex * 4;
  const red = (data[offset] ?? 0) - target[0];
  const green = (data[offset + 1] ?? 0) - target[1];
  const blue = (data[offset + 2] ?? 0) - target[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function mix(from: number | undefined, to: number, amount: number): number {
  const start = from ?? 0;
  return Math.round(start + (to - start) * amount);
}
