import { describe, expect, test } from 'vitest';
import {
  calculateSixInchLayout,
  fitDimensionsWithin,
  IdPhotoJobGuard,
  ID_PHOTO_PRESETS,
  millimetersToPixels,
  sixInchSheetPixels
} from './idPhotoMath';

describe('standard ID photo dimensions', () => {
  test('uses exact common preset pixels', () => {
    expect(ID_PHOTO_PRESETS).toEqual([
      { id: 'one-inch', label: '一寸', width: 295, height: 413 },
      { id: 'two-inch', label: '二寸', width: 413, height: 579 },
      { id: 'passport', label: '护照', width: 390, height: 567 }
    ]);
  });

  test('converts mm and DPI using exact round(mm / 25.4 * dpi)', () => {
    expect(millimetersToPixels(25, 300)).toBe(295);
    expect(millimetersToPixels(35, 300)).toBe(413);
    expect(millimetersToPixels(33, 300)).toBe(390);
    expect(millimetersToPixels(48, 300)).toBe(567);
    expect(() => millimetersToPixels(0, 300)).toThrow(RangeError);
  });

  test('lays photos out inside an exact 6×4 inch sheet', () => {
    expect(sixInchSheetPixels(300)).toEqual({ width: 1800, height: 1200 });
    const layout = calculateSixInchLayout(295, 413, 300);
    expect(layout.sheetWidth).toBe(1800);
    expect(layout.sheetHeight).toBe(1200);
    expect(layout.placements).toHaveLength(12);
    expect(layout.rotated).toBe(true);
    for (const placement of layout.placements) {
      expect(placement.x).toBeGreaterThanOrEqual(layout.margin);
      expect(placement.y).toBeGreaterThanOrEqual(layout.margin);
      expect(placement.x + placement.width).toBeLessThanOrEqual(
        layout.sheetWidth - layout.margin
      );
      expect(placement.y + placement.height).toBeLessThanOrEqual(
        layout.sheetHeight - layout.margin
      );
    }
  });

  test('caps interactive previews without changing their aspect ratio', () => {
    expect(fitDimensionsWithin(6000, 4000, 1200)).toEqual({ width: 1200, height: 800 });
    expect(fitDimensionsWithin(295, 413, 1200)).toEqual({ width: 295, height: 413 });
  });
});

describe('IdPhotoJobGuard', () => {
  test('rejects superseded and invalidated worker results', () => {
    const guard = new IdPhotoJobGuard();
    const first = guard.start(1);
    const second = guard.start(2);
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    expect(guard.invalidate()).toBe(second.jobId);
    expect(guard.isCurrent(second)).toBe(false);
  });
});
