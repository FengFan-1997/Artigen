import { describe, expect, test } from 'vitest';
import { DEFAULT_ADJUSTMENTS } from '../domain/factory';
import {
  applyAdjustmentColorMatrix,
  createAdjustmentColorMatrix,
  isIdentityColorMatrix,
  normalizeImageAdjustments
} from './imageAdjustments';

describe('shared editor image adjustment semantics', () => {
  test('keeps the default adjustment matrix neutral', () => {
    expect(isIdentityColorMatrix(createAdjustmentColorMatrix(DEFAULT_ADJUSTMENTS))).toBe(true);
  });

  test('applies grayscale continuously instead of using an on/off threshold', () => {
    const matrix = createAdjustmentColorMatrix({
      ...DEFAULT_ADJUSTMENTS,
      grayscale: 0.25
    });
    const pixels = applyAdjustmentColorMatrix(new Uint8ClampedArray([255, 0, 0, 255]), matrix);

    expect([...pixels]).toEqual([205, 14, 14, 255]);
  });

  test('applies partial sepia using the same affine matrix used by Fabric', () => {
    const matrix = createAdjustmentColorMatrix({
      ...DEFAULT_ADJUSTMENTS,
      sepia: 0.5
    });
    const pixels = applyAdjustmentColorMatrix(new Uint8ClampedArray([255, 0, 0, 255]), matrix);

    expect([...pixels]).toEqual([178, 44, 35, 255]);
  });

  test('normalizes malformed values at the shared render boundary', () => {
    expect(normalizeImageAdjustments({
      brightness: Number.NaN,
      contrast: 4,
      saturation: -4,
      hue: 720,
      blur: 100,
      grayscale: -1,
      sepia: 3
    })).toEqual({
      brightness: 0,
      contrast: 1,
      saturation: -1,
      hue: 180,
      blur: 40,
      grayscale: 0,
      sepia: 1
    });
  });
});
