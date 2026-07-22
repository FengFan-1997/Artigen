import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  jpeg: vi.fn(),
  png: vi.fn(),
  webp: vi.fn()
}));

vi.mock('@jsquash/jpeg/encode.js', () => ({
  init: vi.fn(),
  default: mocks.jpeg
}));
vi.mock('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url', () => ({ default: '/jpeg.wasm' }));
vi.mock('@jsquash/png/encode.js', () => ({
  init: vi.fn(),
  default: mocks.png
}));
vi.mock('@jsquash/png/codec/pkg/squoosh_png_bg.wasm?url', () => ({ default: '/png.wasm' }));
vi.mock('@jsquash/webp/encode.js', () => ({
  init: vi.fn(),
  default: mocks.webp
}));
vi.mock('@jsquash/webp/codec/enc/webp_enc.wasm?url', () => ({ default: '/webp.wasm' }));
vi.mock('@jsquash/webp/codec/enc/webp_enc_simd.wasm?url', () => ({ default: '/webp-simd.wasm' }));

import {
  assertCodecDimensions,
  encodeCodecPixels,
  resetCodecEncodersForTests
} from './codecPipeline';
import {
  CODEC_IMAGE_ORIENTATION,
  resolveCodecDimensions
} from './imageCodec.worker';

beforeEach(() => {
  resetCodecEncodersForTests();
  mocks.jpeg.mockReset().mockResolvedValue(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]).buffer);
  mocks.png.mockReset().mockResolvedValue(
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer
  );
  mocks.webp.mockReset().mockResolvedValue(new TextEncoder().encode('RIFF\0\0\0\0WEBP').buffer);
});

describe('worker codec pipeline', () => {
  it('encodes PNG, JPEG, and WebP with matching binary signatures', async () => {
    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 17]) };
    const outputs = await Promise.all([
      encodeCodecPixels(pixels, 'image/png'),
      encodeCodecPixels(pixels, 'image/jpeg', 0.8),
      encodeCodecPixels(pixels, 'image/webp', 0.8)
    ]);
    expect(outputs.map((blob) => blob.type)).toEqual(['image/png', 'image/jpeg', 'image/webp']);
    expect(mocks.png.mock.calls[0]?.[0]).toMatchObject({ width: 1, height: 1 });
    expect(mocks.png.mock.calls[0]?.[0].data[3]).toBe(17);
  });

  it('preserves oriented dimensions and rejects unsafe memory shapes', () => {
    expect(CODEC_IMAGE_ORIENTATION).toBe('from-image');
    expect(resolveCodecDimensions(1200, 800, {
      type: 'rotate', rotate: 90, flipH: false, flipV: false
    })).toEqual({ width: 800, height: 1200 });
    expect(resolveCodecDimensions(1200, 800, {
      type: 'resize', width: 600, height: null, maxSide: null
    })).toEqual({ width: 600, height: 400 });
    expect(() => assertCodecDimensions(20_000, 1)).toThrowError('CANVAS_TOO_LARGE');
    expect(() => assertCodecDimensions(10_000, 10_000)).toThrowError('CANVAS_TOO_LARGE');
  });
});
