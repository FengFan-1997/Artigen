export type CodecMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export type CodecPixels = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export const CODEC_LIMITS = Object.freeze({
  maxDimension: 16_384,
  maxPixels: 50_000_000,
  rgbaWorkingCopies: 3
});

export const assertCodecDimensions = (widthValue: number, heightValue: number) => {
  const width = Math.max(1, Math.floor(Number(widthValue) || 0));
  const height = Math.max(1, Math.floor(Number(heightValue) || 0));
  if (width > CODEC_LIMITS.maxDimension || height > CODEC_LIMITS.maxDimension) {
    throw new Error('CANVAS_TOO_LARGE');
  }
  if (width * height > CODEC_LIMITS.maxPixels) throw new Error('CANVAS_TOO_LARGE');
  return { width, height, estimatedWorkingBytes: width * height * 4 * CODEC_LIMITS.rgbaWorkingCopies };
};

export const assertCodecPixels = (pixels: CodecPixels) => {
  const dimensions = assertCodecDimensions(pixels.width, pixels.height);
  if (pixels.data.byteLength !== dimensions.width * dimensions.height * 4) {
    throw new Error('INVALID_IMAGE_PIXELS');
  }
  return dimensions;
};

const magicMatches = (bytes: Uint8Array, mimeType: CodecMimeType) => {
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value);
  }
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
};

type Encoder = (pixels: CodecPixels, quality?: number) => Promise<ArrayBuffer>;
const encoderPromises = new Map<CodecMimeType, Promise<Encoder>>();

const loadEncoder = (mimeType: CodecMimeType): Promise<Encoder> => {
  const existing = encoderPromises.get(mimeType);
  if (existing) return existing;
  const pending = (async (): Promise<Encoder> => {
    if (mimeType === 'image/jpeg') {
      const [module, wasm] = await Promise.all([
        import('@jsquash/jpeg/encode.js'),
        import('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url')
      ]);
      await module.init({ locateFile: () => wasm.default } as any);
      return (pixels, quality = 0.9) => module.default(pixels as ImageData, {
        quality: Math.round(Math.max(0, Math.min(1, quality)) * 100)
      });
    }
    if (mimeType === 'image/png') {
      const [module, wasm] = await Promise.all([
        import('@jsquash/png/encode.js'),
        import('@jsquash/png/codec/pkg/squoosh_png_bg.wasm?url')
      ]);
      await module.init(wasm.default);
      return (pixels) => module.default(pixels as ImageData, { bitDepth: 8 });
    }
    const [module, scalarWasm, simdWasm] = await Promise.all([
      import('@jsquash/webp/encode.js'),
      import('@jsquash/webp/codec/enc/webp_enc.wasm?url'),
      import('@jsquash/webp/codec/enc/webp_enc_simd.wasm?url')
    ]);
    await module.init({
      locateFile: (path: string) => path.includes('_simd') ? simdWasm.default : scalarWasm.default
    } as any);
    return (pixels, quality = 0.9) => module.default(pixels as ImageData, {
      quality: Math.round(Math.max(0, Math.min(1, quality)) * 100)
    });
  })().catch((error) => {
    encoderPromises.delete(mimeType);
    throw error;
  });
  encoderPromises.set(mimeType, pending);
  return pending;
};

export const encodeCodecPixels = async (
  pixels: CodecPixels,
  mimeType: CodecMimeType,
  quality?: number
) => {
  assertCodecPixels(pixels);
  const encode = await loadEncoder(mimeType);
  const encoded = await encode(pixels, quality);
  const bytes = new Uint8Array(encoded);
  if (!bytes.byteLength || !magicMatches(bytes, mimeType)) throw new Error('IMAGE_OUTPUT_INVALID');
  return new Blob([encoded], { type: mimeType });
};

export const resetCodecEncodersForTests = () => encoderPromises.clear();
