export interface CutoutPixelInput {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  maskWidth: number;
  maskHeight: number;
  maskPixels: Uint8ClampedArray;
}

interface LabColor {
  l: number;
  a: number;
  b: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const assertPixels = (pixels: Uint8ClampedArray, width: number, height: number, name: string) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`${name}_INVALID_DIMENSIONS`);
  }
  if (pixels.length !== width * height * 4) throw new RangeError(`${name}_INVALID_PIXELS`);
};

const rgbToLab = (r8: number, g8: number, b8: number): LabColor => {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const rl = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gl = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bl = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) * 100;
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) * 100;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) * 100;
  const delta = 6 / 29;
  const delta3 = delta * delta * delta;
  const convert = (value: number) =>
    value > delta3 ? Math.cbrt(value) : value / (3 * delta * delta) + 4 / 29;
  const fx = convert(x / 95.047);
  const fy = convert(y / 100);
  const fz = convert(z / 108.883);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
};

const collectBorderIndices = (width: number, height: number): number[] => {
  const result: number[] = [];
  const borderBand = Math.min(3, Math.max(1, Math.round(Math.min(width, height) / 120)));
  const step = Math.max(1, Math.round(Math.min(width, height) / 240));
  for (let x = 0; x < width; x += step) {
    for (let band = 0; band < borderBand; band += 1) {
      result.push(band * width + x);
      result.push((height - 1 - band) * width + x);
    }
  }
  for (let y = 0; y < height; y += step) {
    for (let band = 0; band < borderBand; band += 1) {
      result.push(y * width + band);
      result.push(y * width + (width - 1 - band));
    }
  }
  return result;
};

const kMeans = (points: Float32Array, requestedClusters: number, iterations: number) => {
  const pointCount = Math.trunc(points.length / 3);
  const clusterCount = Math.max(1, Math.min(requestedClusters, pointCount));
  const centers = new Float32Array(clusterCount * 3);
  const initial = new Int32Array(clusterCount);
  initial[0] = 0;

  for (let cluster = 1; cluster < clusterCount; cluster += 1) {
    let farthestPoint = 0;
    let farthestDistance = -1;
    for (let point = 0; point < pointCount; point += 1) {
      const offset = point * 3;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let existing = 0; existing < cluster; existing += 1) {
        const centerOffset = initial[existing] * 3;
        const dl = points[offset] - points[centerOffset];
        const da = points[offset + 1] - points[centerOffset + 1];
        const db = points[offset + 2] - points[centerOffset + 2];
        nearestDistance = Math.min(nearestDistance, dl * dl + da * da + db * db);
      }
      if (nearestDistance > farthestDistance) {
        farthestDistance = nearestDistance;
        farthestPoint = point;
      }
    }
    initial[cluster] = farthestPoint;
  }

  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const source = initial[cluster] * 3;
    centers[cluster * 3] = points[source];
    centers[cluster * 3 + 1] = points[source + 1];
    centers[cluster * 3 + 2] = points[source + 2];
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sums = new Float32Array(clusterCount * 3);
    const counts = new Int32Array(clusterCount);
    for (let point = 0; point < pointCount; point += 1) {
      const offset = point * 3;
      let nearestCluster = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let cluster = 0; cluster < clusterCount; cluster += 1) {
        const centerOffset = cluster * 3;
        const dl = points[offset] - centers[centerOffset];
        const da = points[offset + 1] - centers[centerOffset + 1];
        const db = points[offset + 2] - centers[centerOffset + 2];
        const distance = dl * dl + da * da + db * db;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestCluster = cluster;
        }
      }
      counts[nearestCluster] += 1;
      sums[nearestCluster * 3] += points[offset];
      sums[nearestCluster * 3 + 1] += points[offset + 1];
      sums[nearestCluster * 3 + 2] += points[offset + 2];
    }
    for (let cluster = 0; cluster < clusterCount; cluster += 1) {
      const count = counts[cluster];
      if (!count) continue;
      centers[cluster * 3] = sums[cluster * 3] / count;
      centers[cluster * 3 + 1] = sums[cluster * 3 + 1] / count;
      centers[cluster * 3 + 2] = sums[cluster * 3 + 2] / count;
    }
  }
  return centers;
};

const nearestCenter = (
  l: number,
  a: number,
  b: number,
  centers: Float32Array
): { index: number; distance: number } => {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < centers.length / 3; index += 1) {
    const offset = index * 3;
    const dl = l - centers[offset];
    const da = a - centers[offset + 1];
    const db = b - centers[offset + 2];
    const distance = dl * dl + da * da + db * db;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return { index: nearestIndex, distance: nearestDistance };
};

const percentile = (values: number[], ratio: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return sorted[index] || 0;
};

const calculateEdges = (pixels: Uint8ClampedArray, width: number, height: number) => {
  const gray = new Float32Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    gray[pixel] =
      0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
  }
  const edges = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const g00 = gray[index - width - 1];
      const g01 = gray[index - width];
      const g02 = gray[index - width + 1];
      const g10 = gray[index - 1];
      const g12 = gray[index + 1];
      const g20 = gray[index + width - 1];
      const g21 = gray[index + width];
      const g22 = gray[index + width + 1];
      const gx = -g00 - 2 * g10 - g20 + g02 + 2 * g12 + g22;
      const gy = -g00 - 2 * g01 - g02 + g20 + 2 * g21 + g22;
      edges[index] = Math.min(255, (Math.abs(gx) + Math.abs(gy)) / 8);
    }
  }
  return edges;
};

export const retainMeaningfulForegroundComponents = (
  background: Uint8Array,
  width: number,
  height: number
): Uint8Array => {
  if (background.length !== width * height) throw new RangeError('INVALID_BACKGROUND_MASK');
  const result = background.slice();
  const labels = new Int32Array(result.length);
  labels.fill(-1);
  const queue = new Int32Array(result.length);
  const areas: number[] = [];
  const touchesFocus: boolean[] = [];
  const focusX0 = Math.round(width * 0.16);
  const focusX1 = Math.round(width * 0.84);
  const focusY0 = Math.round(height * 0.12);
  const focusY1 = Math.round(height * 0.88);

  for (let start = 0; start < result.length; start += 1) {
    if (result[start] || labels[start] !== -1) continue;
    const label = areas.length;
    let head = 0;
    let tail = 0;
    let area = 0;
    let inFocus = false;
    labels[start] = label;
    queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++];
      area += 1;
      const y = Math.trunc(index / width);
      const x = index - y * width;
      if (x >= focusX0 && x <= focusX1 && y >= focusY0 && y <= focusY1) inFocus = true;
      if (x > 0) {
        const neighbour = index - 1;
        if (!result[neighbour] && labels[neighbour] === -1) {
          labels[neighbour] = label;
          queue[tail++] = neighbour;
        }
      }
      if (x + 1 < width) {
        const neighbour = index + 1;
        if (!result[neighbour] && labels[neighbour] === -1) {
          labels[neighbour] = label;
          queue[tail++] = neighbour;
        }
      }
      if (y > 0) {
        const neighbour = index - width;
        if (!result[neighbour] && labels[neighbour] === -1) {
          labels[neighbour] = label;
          queue[tail++] = neighbour;
        }
      }
      if (y + 1 < height) {
        const neighbour = index + width;
        if (!result[neighbour] && labels[neighbour] === -1) {
          labels[neighbour] = label;
          queue[tail++] = neighbour;
        }
      }
    }
    areas.push(area);
    touchesFocus.push(inFocus);
  }

  if (!areas.length) return result;
  let largestArea = 0;
  let largestLabel = 0;
  for (let label = 0; label < areas.length; label += 1) {
    if (areas[label] > largestArea) {
      largestArea = areas[label];
      largestLabel = label;
    }
  }
  const minimumArea = Math.max(2, Math.floor(largestArea * 0.04), Math.floor(result.length * 0.0003));
  const keep = new Uint8Array(areas.length);
  keep[largestLabel] = 1;
  if (largestArea >= 2) {
    for (let label = 0; label < areas.length; label += 1) {
      if (areas[label] >= minimumArea || (touchesFocus[label] && areas[label] >= 2)) keep[label] = 1;
    }
  }
  for (let index = 0; index < result.length; index += 1) {
    const label = labels[index];
    if (label >= 0 && !keep[label]) result[index] = 1;
  }
  return result;
};

const floodFromEdges = (
  candidates: Uint8Array,
  strongCandidates: Uint8Array,
  width: number,
  height: number
) => {
  const background = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (index: number) => {
    if (index < 0 || index >= background.length || background[index] || !candidates[index]) return;
    background[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const y = Math.trunc(index / width);
    const x = index - y * width;
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  head = 0;
  tail = 0;
  for (let index = 0; index < background.length; index += 1) {
    if (background[index]) queue[tail++] = index;
  }
  const enqueueStrong = (index: number) => {
    if (
      index < 0 ||
      index >= background.length ||
      background[index] ||
      !strongCandidates[index]
    ) {
      return;
    }
    background[index] = 1;
    queue[tail++] = index;
  };
  while (head < tail) {
    const index = queue[head++];
    const y = Math.trunc(index / width);
    const x = index - y * width;
    if (x > 0) enqueueStrong(index - 1);
    if (x + 1 < width) enqueueStrong(index + 1);
    if (y > 0) enqueueStrong(index - width);
    if (y + 1 < height) enqueueStrong(index + width);
  }
  return background;
};

const expandMask = (mask: Uint8Array, width: number, height: number) => {
  const expanded = mask.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      expanded[index - 1] = 1;
      expanded[index + 1] = 1;
      expanded[index - width] = 1;
      expanded[index + width] = 1;
      expanded[index - width - 1] = 1;
      expanded[index - width + 1] = 1;
      expanded[index + width - 1] = 1;
      expanded[index + width + 1] = 1;
    }
  }
  return expanded;
};

const blurMask = (source: Float32Array, width: number, height: number, radius = 2) => {
  const target = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        const sampleY = y + offsetY;
        if (sampleY < 0 || sampleY >= height) continue;
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = x + offsetX;
          if (sampleX < 0 || sampleX >= width) continue;
          sum += source[sampleY * width + sampleX];
          count += 1;
        }
      }
      target[y * width + x] = sum / Math.max(1, count);
    }
  }
  return target;
};

const averageCornerColor = (pixels: Uint8ClampedArray, width: number, height: number) => {
  const block = Math.max(1, Math.min(Math.min(width, height), Math.round(Math.min(width, height) * 0.02)));
  const starts = [
    [0, 0],
    [Math.max(0, width - block), 0],
    [0, Math.max(0, height - block)],
    [Math.max(0, width - block), Math.max(0, height - block)]
  ];
  const means = starts.map(([startX, startY]) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let y = startY; y < Math.min(height, startY + block); y += 1) {
      for (let x = startX; x < Math.min(width, startX + block); x += 1) {
        const offset = (y * width + x) * 4;
        r += pixels[offset];
        g += pixels[offset + 1];
        b += pixels[offset + 2];
        count += 1;
      }
    }
    return { r: r / Math.max(1, count), g: g / Math.max(1, count), b: b / Math.max(1, count) };
  });
  const mean = means.reduce(
    (sum, color) => ({ r: sum.r + color.r, g: sum.g + color.g, b: sum.b + color.b }),
    { r: 0, g: 0, b: 0 }
  );
  mean.r /= means.length;
  mean.g /= means.length;
  mean.b /= means.length;
  const maxCornerDistance = means.reduce((maximum, color) => {
    const dr = color.r - mean.r;
    const dg = color.g - mean.g;
    const db = color.b - mean.b;
    return Math.max(maximum, Math.sqrt(dr * dr + dg * dg + db * db));
  }, 0);
  return { mean, maxCornerDistance };
};

const applyCornerFallback = (
  output: Uint8ClampedArray,
  original: Uint8ClampedArray,
  width: number,
  height: number
) => {
  const { mean, maxCornerDistance } = averageCornerColor(original, width, height);
  const transparentDistance = clamp(14 + maxCornerDistance * 1.05, 16, 46);
  const opaqueDistance = clamp(transparentDistance + 50, transparentDistance + 16, 110);
  for (let offset = 0; offset < output.length; offset += 4) {
    const dr = original[offset] - mean.r;
    const dg = original[offset + 1] - mean.g;
    const db = original[offset + 2] - mean.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    const matte = clamp((distance - transparentDistance) / (opaqueDistance - transparentDistance), 0, 1);
    output[offset + 3] = Math.round((original[offset + 3] * matte));
  }
};

export const createCutoutPixels = (input: CutoutPixelInput): Uint8ClampedArray => {
  assertPixels(input.pixels, input.width, input.height, 'SOURCE');
  assertPixels(input.maskPixels, input.maskWidth, input.maskHeight, 'MASK');
  const width = input.maskWidth;
  const height = input.maskHeight;
  const pixelCount = width * height;
  const borderIndices = collectBorderIndices(width, height);
  const borderPoints = new Float32Array(borderIndices.length * 3);
  for (let sample = 0; sample < borderIndices.length; sample += 1) {
    const offset = borderIndices[sample] * 4;
    const lab = rgbToLab(
      input.maskPixels[offset],
      input.maskPixels[offset + 1],
      input.maskPixels[offset + 2]
    );
    borderPoints[sample * 3] = lab.l;
    borderPoints[sample * 3 + 1] = lab.a;
    borderPoints[sample * 3 + 2] = lab.b;
  }

  const centers = kMeans(borderPoints, 6, 12);
  const clusterCount = centers.length / 3;
  const labL = new Float32Array(pixelCount);
  const labA = new Float32Array(pixelCount);
  const labB = new Float32Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const lab = rgbToLab(
      input.maskPixels[offset],
      input.maskPixels[offset + 1],
      input.maskPixels[offset + 2]
    );
    labL[pixel] = lab.l;
    labA[pixel] = lab.a;
    labB[pixel] = lab.b;
  }

  const borderCounts = new Int32Array(clusterCount);
  for (const pixel of borderIndices) {
    const nearest = nearestCenter(labL[pixel], labA[pixel], labB[pixel], centers);
    borderCounts[nearest.index] += 1;
  }
  const centerCounts = new Int32Array(clusterCount);
  const centerX0 = Math.round(width * 0.28);
  const centerX1 = Math.round(width * 0.72);
  const centerY0 = Math.round(height * 0.28);
  const centerY1 = Math.round(height * 0.72);
  const centerStep = Math.max(1, Math.round(Math.min(width, height) / 220));
  for (let y = centerY0; y < centerY1; y += centerStep) {
    for (let x = centerX0; x < centerX1; x += centerStep) {
      const pixel = y * width + x;
      const nearest = nearestCenter(labL[pixel], labA[pixel], labB[pixel], centers);
      centerCounts[nearest.index] += 1;
    }
  }

  const clusterOrder = Array.from({ length: clusterCount }, (_, index) => index).sort((a, b) => {
    const scoreA = borderCounts[a] - centerCounts[a] * 0.85;
    const scoreB = borderCounts[b] - centerCounts[b] * 0.85;
    return scoreB - scoreA || borderCounts[b] - borderCounts[a];
  });
  const backgroundClusters: number[] = [];
  for (const cluster of clusterOrder) {
    if (borderCounts[cluster] / Math.max(1, borderIndices.length) < 0.08) continue;
    backgroundClusters.push(cluster);
    if (backgroundClusters.length === 3) break;
  }
  if (!backgroundClusters.length) backgroundClusters.push(clusterOrder[0] || 0);

  const backgroundDistances = new Float32Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const cluster of backgroundClusters) {
      const offset = cluster * 3;
      const dl = labL[pixel] - centers[offset];
      const da = labA[pixel] - centers[offset + 1];
      const db = labB[pixel] - centers[offset + 2];
      nearestDistance = Math.min(nearestDistance, dl * dl + da * da + db * db);
    }
    backgroundDistances[pixel] = nearestDistance;
  }
  const edges = calculateEdges(input.maskPixels, width, height);
  const borderDistances = borderIndices.map((pixel) => backgroundDistances[pixel]);
  const borderEdges = borderIndices.map((pixel) => edges[pixel]);
  const centerDistances: number[] = [];
  const centerEdges: number[] = [];
  for (let y = centerY0; y < centerY1; y += centerStep) {
    for (let x = centerX0; x < centerX1; x += centerStep) {
      const pixel = y * width + x;
      centerDistances.push(backgroundDistances[pixel]);
      centerEdges.push(edges[pixel]);
    }
  }

  const distanceP95 = percentile(borderDistances, 0.95);
  const distanceP80 = percentile(borderDistances, 0.8);
  const distanceP60 = percentile(borderDistances, 0.6);
  const centerP30 = percentile(centerDistances, 0.3);
  const centerP60 = percentile(centerDistances, 0.6);
  const centerP80 = percentile(centerDistances, 0.8);
  const edgeP90 = percentile(borderEdges, 0.9);
  const edgeP60 = percentile(borderEdges, 0.6);
  const edgeP40 = percentile(borderEdges, 0.4);
  const centerEdgeP70 = percentile(centerEdges, 0.7);
  let distanceThreshold = clamp(
    distanceP95 * 2 + distanceP80 * 0.55 + distanceP60 * 0.25,
    180,
    56000
  );
  if (centerDistances.length && centerP30 > distanceP80 * 1.15) {
    distanceThreshold = Math.min(distanceThreshold, centerP30 * 1.25);
  }
  if (centerDistances.length && centerP60 < distanceP60 * 0.9) distanceThreshold *= 0.88;
  if (centerDistances.length && centerP80 > distanceP80 * 1.4) distanceThreshold *= 1.08;
  if (edgeP60 < 12) distanceThreshold *= 1.05;
  distanceThreshold = clamp(distanceThreshold, 160, 60000);
  let edgeThreshold = clamp(edgeP90 + 14, 16, 140);
  if (centerEdgeP70 > edgeThreshold * 0.9) edgeThreshold *= 0.88;
  if (edgeP40 < 8) edgeThreshold *= 0.9;
  if (edgeP90 > 70 && edgeP60 > 25) edgeThreshold *= 1.12;
  edgeThreshold = clamp(edgeThreshold, 12, 140);

  const candidates = new Uint8Array(pixelCount);
  const strongCandidates = new Uint8Array(pixelCount);
  const strongThreshold = clamp(Math.min(distanceThreshold * 0.3, distanceP80 * 1.05), 80, distanceThreshold);
  const guardX0 = Math.round(width * 0.18);
  const guardX1 = Math.round(width * 0.82);
  const guardY0 = Math.round(height * 0.18);
  const guardY1 = Math.round(height * 0.82);
  const edgeBand = Math.max(2, Math.round(Math.min(width, height) / 60));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const distance = backgroundDistances[pixel];
      const edge = edges[pixel];
      const transparent = input.maskPixels[pixel * 4 + 3] <= 8;
      let isBackground =
        transparent ||
        (distance <= distanceThreshold &&
          (edge <= edgeThreshold || distance <= distanceThreshold * 0.48));
      if (
        !transparent &&
        x >= guardX0 &&
        x <= guardX1 &&
        y >= guardY0 &&
        y <= guardY1 &&
        edge >= edgeThreshold * 0.75 &&
        distance >= distanceThreshold * 0.22
      ) {
        isBackground = false;
      }
      const nearEdge = x < edgeBand || y < edgeBand || x >= width - edgeBand || y >= height - edgeBand;
      if (
        !isBackground &&
        nearEdge &&
        distance <= distanceThreshold * 1.22 &&
        edge <= edgeThreshold * 0.65
      ) {
        isBackground = true;
      }
      candidates[pixel] = isBackground ? 1 : 0;
      strongCandidates[pixel] =
        transparent || (distance <= strongThreshold && edge <= edgeThreshold * 0.75) ? 1 : 0;
    }
  }

  const floodedBackground = floodFromEdges(candidates, strongCandidates, width, height);
  const background = retainMeaningfulForegroundComponents(floodedBackground, width, height);
  let backgroundCount = 0;
  for (const value of background) backgroundCount += value ? 1 : 0;
  const backgroundRatio = backgroundCount / Math.max(1, pixelCount);
  const output = input.pixels.slice();

  if (backgroundRatio < 0.002 || backgroundRatio > 0.998) {
    applyCornerFallback(output, input.pixels, input.width, input.height);
    return output;
  }

  const expanded = expandMask(background, width, height);
  let softMask = new Float32Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) softMask[pixel] = expanded[pixel];
  softMask = blurMask(softMask, width, height);
  softMask = blurMask(softMask, width, height);

  const sampleMask = (sourceX: number, sourceY: number) => {
    const x0 = clamp(Math.floor(sourceX), 0, width - 1);
    const y0 = clamp(Math.floor(sourceY), 0, height - 1);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const fractionX = clamp(sourceX - x0, 0, 1);
    const fractionY = clamp(sourceY - y0, 0, 1);
    const top = softMask[y0 * width + x0] * (1 - fractionX) + softMask[y0 * width + x1] * fractionX;
    const bottom = softMask[y1 * width + x0] * (1 - fractionX) + softMask[y1 * width + x1] * fractionX;
    return top * (1 - fractionY) + bottom * fractionY;
  };

  for (let y = 0; y < input.height; y += 1) {
    const maskY = (y / Math.max(1, input.height - 1)) * (height - 1);
    for (let x = 0; x < input.width; x += 1) {
      const maskX = (x / Math.max(1, input.width - 1)) * (width - 1);
      const backgroundAmount = sampleMask(maskX, maskY);
      const subjectAlpha = Math.pow(clamp(1 - backgroundAmount, 0, 1), 1.15);
      const offset = (y * input.width + x) * 4 + 3;
      output[offset] = Math.round(input.pixels[offset] * subjectAlpha);
    }
  }
  return output;
};
