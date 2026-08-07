import { describe, expect, it } from 'vitest';
import {
  getToolDefinition,
  toolCatalogVersion
} from '../../domain/toolCatalog';
import {
  formatFactoryLimitHint,
  getFormatFactoryInputPolicy,
  readFormatFactoryImageDimensions,
  validateFormatFactoryFileContents,
  validateFormatFactorySelection,
  validateFormatFactorySelectionDuration,
  validateFormatFactoryVideoMetadata
} from './inputContracts';

const pngFile = (width: number, height: number, name = 'fixture.png') => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new File([bytes], name, { type: 'image/png' });
};

describe('format factory input contracts', () => {
  it('derives UI file counts and byte limits from catalog v5', () => {
    expect(toolCatalogVersion).toBe(5);
    expect(getToolDefinition('ai-design')?.kind).toBe('generator');
    expect(getFormatFactoryInputPolicy('live').limits).toMatchObject({
      maxFiles: 1,
      maxFileBytes: 200 * 1024 * 1024,
      maxPixels: 32_000_000,
      maxDurationSeconds: 600
    });
    expect(getFormatFactoryInputPolicy('pdf').limits.maxFileBytes).toBe(80 * 1024 * 1024);
    expect(getFormatFactoryInputPolicy('pdf').multiple).toBe(false);
    expect(getFormatFactoryInputPolicy('img2pdf').limits.maxFiles).toBe(50);
    expect(getFormatFactoryInputPolicy('img2pdf').multiple).toBe(true);
    expect(getFormatFactoryInputPolicy('word2pdf').limits.maxFileBytes).toBe(40 * 1024 * 1024);
    expect(getFormatFactoryInputPolicy('watermark').multiple).toBe(false);
    expect(getFormatFactoryInputPolicy('ico').multiple).toBe(false);
    for (const toolId of ['webp', 'jpeg', 'resize', 'rotate', 'filter'] as const) {
      expect(getFormatFactoryInputPolicy(toolId).limits.maxFiles).toBe(50);
      expect(getFormatFactoryInputPolicy(toolId).multiple).toBe(true);
    }
  });

  it('rejects selection count, type, and byte violations before processing', () => {
    const image = pngFile(10, 10);
    expect(() => validateFormatFactorySelection('ico', [image, image])).toThrowError(
      'TOO_MANY_FILES'
    );
    expect(() =>
      validateFormatFactorySelection('pdf', [
        new File(['not pdf'], 'fake.txt', { type: 'text/plain' })
      ])
    ).toThrowError('INVALID_FILE_TYPE');
    const oversized = {
      name: 'large.mp4',
      type: 'video/mp4',
      size: 200 * 1024 * 1024 + 1
    } as File;
    expect(() => validateFormatFactorySelection('live', [oversized])).toThrowError(
      'FILE_TOO_LARGE'
    );
  });

  it('reads image dimensions from headers and enforces the 32 MP catalog ceiling', async () => {
    await expect(readFormatFactoryImageDimensions(pngFile(6000, 5000))).resolves.toEqual({
      width: 6000,
      height: 5000
    });
    await expect(
      validateFormatFactoryFileContents('resize', [pngFile(8000, 5000)])
    ).rejects.toThrowError('IMAGE_PIXEL_LIMIT');
    await expect(
      validateFormatFactoryFileContents('resize', [
        new File(['not an image'], 'spoofed.png', { type: 'image/png' })
      ])
    ).rejects.toThrowError('IMAGE_METADATA_UNREADABLE');
  });

  it('enforces source and selected-clip video limits without conflating them', () => {
    expect(() =>
      validateFormatFactoryVideoMetadata('live', {
        width: 3840,
        height: 2160,
        durationSeconds: 601
      })
    ).toThrowError('VIDEO_DURATION_LIMIT');
    expect(() =>
      validateFormatFactoryVideoMetadata('gif', {
        width: 5000,
        height: 3000,
        durationSeconds: 120
      })
    ).toThrowError('GIF_SOURCE_PIXEL_LIMIT');
    expect(() => validateFormatFactorySelectionDuration('gif', 30.1)).toThrowError(
      'VIDEO_DURATION_LIMIT'
    );
    expect(() => validateFormatFactorySelectionDuration('gif', 30)).not.toThrow();
  });

  it('shows the same catalog limits next to the file picker', () => {
    expect(formatFactoryLimitHint('live', 'zh')).toContain('200 MB');
    expect(formatFactoryLimitHint('live', 'zh')).toContain('10 分钟');
    expect(formatFactoryLimitHint('img2pdf', 'en')).toContain('up to 50 files');
    expect(formatFactoryLimitHint('img2pdf', 'en')).toContain('80 MB each');
    expect(formatFactoryLimitHint('img2pdf', 'en')).toContain(
      'device-adaptive total memory budget'
    );
  });
});
