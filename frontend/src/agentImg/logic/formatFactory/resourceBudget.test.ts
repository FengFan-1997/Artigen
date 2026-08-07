import { describe, expect, it } from 'vitest';
import {
  assertFormatFactoryResourceBudget,
  assertPdfStitchBudget,
  assertZipResourceBudget,
  createPdfRangeBudgetTracker,
  createResourceBudgetProfile
} from './resourceBudget';

describe('format factory resource budgets', () => {
  it('scales total bytes and pixels down on low-memory devices', () => {
    const low = createResourceBudgetProfile(1);
    const desktop = createResourceBudgetProfile(8);
    expect(low.maxWorkingBytes).toBeLessThan(desktop.maxWorkingBytes);
    expect(low.maxTotalPixels).toBeLessThan(desktop.maxTotalPixels);
    expect(() =>
      assertFormatFactoryResourceBudget({
        toolId: 'webp',
        metrics: [
          { bytes: 40 * 1024 * 1024, pixels: 8_000_000 },
          { bytes: 40 * 1024 * 1024, pixels: 8_000_000 },
          { bytes: 40 * 1024 * 1024, pixels: 8_000_000 }
        ],
        outputMimeType: 'image/png',
        profile: low
      })
    ).toThrow();
  });

  it('rejects total pixel/output budgets even when every file is below 32 MP', () => {
    const profile = createResourceBudgetProfile(4);
    expect(() =>
      assertFormatFactoryResourceBudget({
        toolId: 'resize',
        metrics: [
          { bytes: 10, pixels: 24_000_000 },
          { bytes: 10, pixels: 24_000_000 }
        ],
        outputMimeType: 'image/png',
        profile
      })
    ).toThrowError('BATCH_TOTAL_PIXELS_LIMIT');
  });

  it('accounts for resize upscaling instead of budgeting only source pixels', () => {
    expect(() =>
      assertFormatFactoryResourceBudget({
        toolId: 'resize',
        metrics: [{ bytes: 10, pixels: 1_000_000, outputPixels: 80_000_000 }],
        outputMimeType: 'image/jpeg',
        profile: createResourceBudgetProfile(8)
      })
    ).toThrowError('BATCH_TOTAL_PIXELS_LIMIT');
  });

  it('fails large filters explicitly when worker canvas capability is unavailable', () => {
    expect(() =>
      assertFormatFactoryResourceBudget({
        toolId: 'filter',
        metrics: [{ bytes: 1024, pixels: 3_000_000 }],
        outputMimeType: 'image/jpeg',
        filterWorkerAvailable: false,
        profile: createResourceBudgetProfile(8)
      })
    ).toThrowError('FILTER_WORKER_UNAVAILABLE');
  });

  it('budgets ZIP duplication and PDF accumulated outputs', () => {
    const profile = createResourceBudgetProfile(1);
    expect(() => assertZipResourceBudget([70 * 1024 * 1024], profile)).toThrowError(
      'ZIP_MEMORY_BUDGET_EXCEEDED'
    );

    const range = createPdfRangeBudgetTracker('image/png', profile);
    range.reserve(1000, 1000);
    expect(range.snapshot().totalPixels).toBe(1_000_000);
    expect(() => range.reserve(5000, 5000)).toThrow();

    expect(() =>
      assertPdfStitchBudget(
        [
          { width: 4000, height: 4000 },
          { width: 4000, height: 4000 }
        ],
        profile
      )
    ).toThrow();
  });
});
