import type { ImageAdjustments } from '../domain/types';

export type AdjustmentColorMatrix = [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number
];

const IDENTITY_MATRIX: AdjustmentColorMatrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0
];

export function normalizeImageAdjustments(value: ImageAdjustments): ImageAdjustments {
  return {
    brightness: clamp(finite(value.brightness), -1, 1),
    contrast: clamp(finite(value.contrast), -1, 1),
    saturation: clamp(finite(value.saturation), -1, 1),
    hue: clamp(finite(value.hue), -180, 180),
    blur: clamp(finite(value.blur), 0, 40),
    grayscale: clamp(finite(value.grayscale), 0, 1),
    sepia: clamp(finite(value.sepia), 0, 1)
  };
}

/**
 * Builds the single affine RGBA matrix used by both the Fabric projection and
 * the export renderer. Operations intentionally follow the control order:
 * brightness -> contrast -> saturation -> hue -> grayscale -> sepia.
 */
export function createAdjustmentColorMatrix(value: ImageAdjustments): AdjustmentColorMatrix {
  const adjustment = normalizeImageAdjustments(value);
  const brightness = Math.max(0, 1 + adjustment.brightness);
  const contrast = Math.max(0, 1 + adjustment.contrast);
  const saturation = Math.max(0, 1 + adjustment.saturation);
  const matrices: AdjustmentColorMatrix[] = [
    scaleRgb(brightness),
    contrastMatrix(contrast),
    saturationMatrix(saturation),
    hueRotationMatrix(adjustment.hue),
    saturationMatrix(1 - adjustment.grayscale),
    interpolateMatrix(IDENTITY_MATRIX, SEPIA_MATRIX, adjustment.sepia)
  ];
  return matrices.reduce(
    (combined, operation) => multiplyMatrices(operation, combined),
    [...IDENTITY_MATRIX] as AdjustmentColorMatrix
  );
}

export function isIdentityColorMatrix(matrix: AdjustmentColorMatrix, epsilon = 1e-10): boolean {
  return matrix.every((value, index) => Math.abs(value - IDENTITY_MATRIX[index]) <= epsilon);
}

export function applyAdjustmentColorMatrix(
  pixels: Uint8ClampedArray,
  matrix: AdjustmentColorMatrix
): Uint8ClampedArray {
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    pixels[index] =
      red * matrix[0] + green * matrix[1] + blue * matrix[2] + alpha * matrix[3] + matrix[4] * 255;
    pixels[index + 1] =
      red * matrix[5] + green * matrix[6] + blue * matrix[7] + alpha * matrix[8] + matrix[9] * 255;
    pixels[index + 2] =
      red * matrix[10] + green * matrix[11] + blue * matrix[12] + alpha * matrix[13] + matrix[14] * 255;
    pixels[index + 3] =
      red * matrix[15] + green * matrix[16] + blue * matrix[17] + alpha * matrix[18] + matrix[19] * 255;
  }
  return pixels;
}

export function adjustmentBlurPixels(value: ImageAdjustments): number {
  return normalizeImageAdjustments(value).blur;
}

function scaleRgb(amount: number): AdjustmentColorMatrix {
  return [
    amount, 0, 0, 0, 0,
    0, amount, 0, 0, 0,
    0, 0, amount, 0, 0,
    0, 0, 0, 1, 0
  ];
}

function contrastMatrix(amount: number): AdjustmentColorMatrix {
  const offset = 0.5 * (1 - amount);
  return [
    amount, 0, 0, 0, offset,
    0, amount, 0, 0, offset,
    0, 0, amount, 0, offset,
    0, 0, 0, 1, 0
  ];
}

function saturationMatrix(amount: number): AdjustmentColorMatrix {
  return [
    0.213 + 0.787 * amount, 0.715 - 0.715 * amount, 0.072 - 0.072 * amount, 0, 0,
    0.213 - 0.213 * amount, 0.715 + 0.285 * amount, 0.072 - 0.072 * amount, 0, 0,
    0.213 - 0.213 * amount, 0.715 - 0.715 * amount, 0.072 + 0.928 * amount, 0, 0,
    0, 0, 0, 1, 0
  ];
}

function hueRotationMatrix(degrees: number): AdjustmentColorMatrix {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    0.213 + cosine * 0.787 - sine * 0.213,
    0.715 - cosine * 0.715 - sine * 0.715,
    0.072 - cosine * 0.072 + sine * 0.928,
    0,
    0,
    0.213 - cosine * 0.213 + sine * 0.143,
    0.715 + cosine * 0.285 + sine * 0.14,
    0.072 - cosine * 0.072 - sine * 0.283,
    0,
    0,
    0.213 - cosine * 0.213 - sine * 0.787,
    0.715 - cosine * 0.715 + sine * 0.715,
    0.072 + cosine * 0.928 + sine * 0.072,
    0,
    0,
    0, 0, 0, 1, 0
  ];
}

function multiplyMatrices(
  outer: AdjustmentColorMatrix,
  inner: AdjustmentColorMatrix
): AdjustmentColorMatrix {
  const result = new Array<number>(20).fill(0);
  for (let row = 0; row < 4; row += 1) {
    const rowOffset = row * 5;
    for (let column = 0; column < 4; column += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[rowOffset + column] += outer[rowOffset + index] * inner[index * 5 + column];
      }
    }
    result[rowOffset + 4] = outer[rowOffset + 4];
    for (let index = 0; index < 4; index += 1) {
      result[rowOffset + 4] += outer[rowOffset + index] * inner[index * 5 + 4];
    }
  }
  return result as AdjustmentColorMatrix;
}

function interpolateMatrix(
  from: AdjustmentColorMatrix,
  to: AdjustmentColorMatrix,
  amount: number
): AdjustmentColorMatrix {
  return from.map((value, index) => value + (to[index] - value) * amount) as AdjustmentColorMatrix;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const SEPIA_MATRIX: AdjustmentColorMatrix = [
  0.393, 0.769, 0.189, 0, 0,
  0.349, 0.686, 0.168, 0, 0,
  0.272, 0.534, 0.131, 0, 0,
  0, 0, 0, 1, 0
];
