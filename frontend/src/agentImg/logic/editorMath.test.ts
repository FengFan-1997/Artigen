import { describe, expect, test } from 'vitest';
import {
  clampCropRect,
  clampNumber,
  detectTiltAngle,
  isPointInRect,
  normalizeCropRect,
  removeBackgroundAlgorithm1,
  restoreImageAlgorithm1,
  rotatedRectWithMaxArea,
  splitLayersAlgorithm1
} from './editorMath';

describe('editorMath', () => {
  test('normalizeCropRect normalizes two points', () => {
    expect(normalizeCropRect({ x: 10, y: 20 }, { x: 30, y: 50 })).toEqual({
      x: 10,
      y: 20,
      w: 20,
      h: 30
    });
    expect(normalizeCropRect({ x: 30, y: 50 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      w: 20,
      h: 30
    });
  });

  test('clampNumber clamps and handles non-finite', () => {
    expect(clampNumber(5, 0, 10)).toBe(5);
    expect(clampNumber(-1, 0, 10)).toBe(0);
    expect(clampNumber(99, 0, 10)).toBe(10);
    expect(clampNumber(Number.NaN, 7, 10)).toBe(7);
    expect(clampNumber(Number.POSITIVE_INFINITY, 7, 10)).toBe(7);
  });

  test('clampCropRect enforces min size and stays within bounds', () => {
    const r1 = clampCropRect({ x: -10, y: -10, w: 1, h: 2 }, { w: 100, h: 80 });
    expect(r1.x).toBe(0);
    expect(r1.y).toBe(0);
    expect(r1.w).toBeGreaterThanOrEqual(12);
    expect(r1.h).toBeGreaterThanOrEqual(12);

    const r2 = clampCropRect({ x: 95, y: 70, w: 30, h: 30 }, { w: 100, h: 80 });
    expect(r2.x + r2.w).toBeLessThanOrEqual(100);
    expect(r2.y + r2.h).toBeLessThanOrEqual(80);
  });

  test('clampCropRect supports custom minSize', () => {
    const r = clampCropRect({ x: 0, y: 0, w: 1, h: 1 }, { w: 100, h: 100 }, 32);
    expect(r.w).toBe(32);
    expect(r.h).toBe(32);
  });

  test('clampCropRect handles bounds smaller than minSize', () => {
    const r = clampCropRect({ x: 10, y: 10, w: 1, h: 1 }, { w: 8, h: 9 }, 12);
    expect(r.w).toBe(8);
    expect(r.h).toBe(9);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  test('clampCropRect handles non-finite inputs', () => {
    const r = clampCropRect(
      { x: Number.NaN, y: Number.POSITIVE_INFINITY, w: Number.NaN, h: -5 },
      { w: 50, h: 40 },
      12
    );
    expect(r.w).toBe(12);
    expect(r.h).toBe(12);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  test('isPointInRect checks inclusion', () => {
    const r = { x: 10, y: 20, w: 30, h: 40 };
    expect(isPointInRect({ x: 10, y: 20 }, r)).toBe(true);
    expect(isPointInRect({ x: 40, y: 60 }, r)).toBe(true);
    expect(isPointInRect({ x: 41, y: 60 }, r)).toBe(false);
    expect(isPointInRect({ x: 40, y: 61 }, r)).toBe(false);
  });

  test('rotatedRectWithMaxArea returns original at 0°', () => {
    expect(rotatedRectWithMaxArea(200, 100, 0)).toEqual({ w: 200, h: 100 });
  });

  test('rotatedRectWithMaxArea handles zero sizes', () => {
    expect(rotatedRectWithMaxArea(0, 100, 0.3)).toEqual({ w: 0, h: 0 });
    expect(rotatedRectWithMaxArea(100, 0, 0.3)).toEqual({ w: 0, h: 0 });
  });

  test('rotatedRectWithMaxArea handles non-finite angle', () => {
    expect(rotatedRectWithMaxArea(200, 100, Number.NaN)).toEqual({ w: 200, h: 100 });
  });

  test('rotatedRectWithMaxArea is positive for 45°', () => {
    const r = rotatedRectWithMaxArea(200, 100, (45 * Math.PI) / 180);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
    expect(r.w).toBeLessThanOrEqual(200);
    expect(r.h).toBeLessThanOrEqual(100);
  });

  test('detectTiltAngle returns 0 for flat image', () => {
    const w = 64;
    const h = 64;
    const data = new Uint8ClampedArray(w * h * 4);
    data.fill(128);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    expect(detectTiltAngle({ width: w, height: h, data })).toBe(0);
  });

  test('detectTiltAngle returns 0 for tiny image', () => {
    const w = 2;
    const h = 2;
    const data = new Uint8ClampedArray(w * h * 4);
    data.fill(0);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    expect(detectTiltAngle({ width: w, height: h, data })).toBe(0);
  });

  test('detectTiltAngle matches synthetic ramp angle', () => {
    const makeRamp = (deg: number) => {
      const w = 96;
      const h = 96;
      const data = new Uint8ClampedArray(w * h * 4);
      const rad = (deg * Math.PI) / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const cx = (w - 1) / 2;
      const cy = (h - 1) / 2;
      const scale = 2.5;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const v = 128 + (x - cx) * dx * scale + (y - cy) * dy * scale;
          const c = Math.max(0, Math.min(255, Math.round(v)));
          const i = (y * w + x) * 4;
          data[i] = c;
          data[i + 1] = c;
          data[i + 2] = c;
          data[i + 3] = 255;
        }
      }
      return { width: w, height: h, data };
    };

    expect(Math.abs(detectTiltAngle(makeRamp(15)) - 15)).toBeLessThanOrEqual(5);
    expect(Math.abs(detectTiltAngle(makeRamp(-20)) + 20)).toBeLessThanOrEqual(5);
  });

  test('restoreImageAlgorithm1 keeps flat image unchanged', () => {
    const w = 4;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 120;
      data[i + 1] = 120;
      data[i + 2] = 120;
      data[i + 3] = 255;
    }
    const out = restoreImageAlgorithm1(
      { width: w, height: h, data },
      { strength: 0.8, denoise: 0.2 }
    );
    expect(out.data).toHaveLength(data.length);
    for (let i = 0; i < data.length; i += 4) {
      expect(out.data[i]).toBe(120);
      expect(out.data[i + 1]).toBe(120);
      expect(out.data[i + 2]).toBe(120);
      expect(out.data[i + 3]).toBe(255);
    }
  });

  test('restoreImageAlgorithm1 handles empty input', () => {
    const out = restoreImageAlgorithm1({ width: 0, height: 0, data: new Uint8ClampedArray() });
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
    expect(out.data).toHaveLength(0);
  });

  test('removeBackgroundAlgorithm1 removes corner background', () => {
    const w = 4;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    const center = [1 * w + 1, 1 * w + 2, 2 * w + 1, 2 * w + 2];
    for (const idx of center) {
      const p = idx * 4;
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = 255;
    }
    const out = removeBackgroundAlgorithm1({ width: w, height: h, data }, { threshold: 0.2 });
    const cornerAlpha = out.data[3];
    const centerAlpha = out.data[(1 * w + 1) * 4 + 3];
    expect(cornerAlpha).toBe(0);
    expect(centerAlpha).toBe(255);
  });

  test('splitLayersAlgorithm1 splits foreground and background', () => {
    const w = 4;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    const center = [1 * w + 1, 1 * w + 2, 2 * w + 1, 2 * w + 2];
    for (const idx of center) {
      const p = idx * 4;
      data[p] = 200;
      data[p + 1] = 200;
      data[p + 2] = 200;
      data[p + 3] = 255;
    }
    const out = splitLayersAlgorithm1({ width: w, height: h, data }, { threshold: 0.2 });
    const bgCornerAlpha = out.background[3];
    const fgCornerAlpha = out.foreground[3];
    const fgCenterAlpha = out.foreground[(1 * w + 1) * 4 + 3];
    const bgCenterAlpha = out.background[(1 * w + 1) * 4 + 3];
    expect(bgCornerAlpha).toBe(255);
    expect(fgCornerAlpha).toBe(0);
    expect(fgCenterAlpha).toBe(255);
    expect(bgCenterAlpha).toBe(0);
  });
});
