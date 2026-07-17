import { describe, expect, it } from 'vitest';
import {
  projectWatermarkRect,
  watermarkPreviewSize
} from './useFormatFactoryWatermark';

describe('watermark preview geometry', () => {
  it('caps a large overlay while preserving its aspect ratio', () => {
    expect(watermarkPreviewSize(8000, 4000)).toEqual({ width: 1024, height: 512 });
    expect(watermarkPreviewSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('projects source-pixel selections onto the lightweight overlay', () => {
    expect(
      projectWatermarkRect(
        { x: 2000, y: 1000, w: 4000, h: 2000 },
        8000,
        4000,
        1024,
        512
      )
    ).toEqual({ x: 256, y: 128, w: 512, h: 256 });
  });
});
