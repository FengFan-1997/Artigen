export const loadImageFromUrl = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    try {
      (img as any).decoding = 'async';
    } catch {}
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAIL'));
    img.src = url;
  });

const nativeCanvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('CANVAS_EXPORT_FAIL'));
        else resolve(blob);
      },
      type,
      quality
    );
  });

const hasWebpMagic = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  return (
    bytes.byteLength >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
};

type WebpEncoder = (
  data: ImageData,
  options?: { quality?: number }
) => Promise<ArrayBuffer>;

let webpEncoderPromise: Promise<WebpEncoder> | null = null;

const getWebpEncoder = () => {
  if (webpEncoderPromise) return webpEncoderPromise;
  webpEncoderPromise = Promise.all([
    import('@jsquash/webp/encode.js'),
    import('@jsquash/webp/codec/enc/webp_enc.wasm?url'),
    import('@jsquash/webp/codec/enc/webp_enc_simd.wasm?url')
  ])
    .then(async ([encoder, scalarWasm, simdWasm]) => {
      await encoder.init({
        locateFile: (path: string) =>
          path.includes('_simd') ? simdWasm.default : scalarWasm.default
      } as any);
      return encoder.default as WebpEncoder;
    })
    .catch((error) => {
      webpEncoderPromise = null;
      throw error;
    });
  return webpEncoderPromise;
};

const encodeWebpFallback = async (
  canvas: HTMLCanvasElement,
  quality?: number
): Promise<Blob> => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');
  const encodeWebp = await getWebpEncoder();
  const encoded = await encodeWebp(ctx.getImageData(0, 0, canvas.width, canvas.height), {
    quality: Math.round(Math.max(0, Math.min(1, quality ?? 0.9)) * 100)
  });
  const blob = new Blob([encoded], { type: 'image/webp' });
  if (!(await hasWebpMagic(blob))) throw new Error('IMAGE_OUTPUT_INVALID');
  return blob;
};

export const canvasToBlob = async (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
) => {
  const blob = await nativeCanvasToBlob(canvas, type, quality);
  if (type !== 'image/webp' || (await hasWebpMagic(blob))) return blob;
  // WebKit can silently return PNG bytes for a requested WebP export. Use the lazy WASM
  // encoder so the filename, MIME type, and binary contract always agree.
  return encodeWebpFallback(canvas, quality);
};

const MAX_CANVAS_DIM = 16384;
const MAX_CANVAS_PIXELS = 50_000_000;

const assertCanvasSafeSize = (w: number, h: number) => {
  const width = Math.max(1, Math.floor(w || 0));
  const height = Math.max(1, Math.floor(h || 0));
  if (width > MAX_CANVAS_DIM || height > MAX_CANVAS_DIM) throw new Error('CANVAS_TOO_LARGE');
  if (width * height > MAX_CANVAS_PIXELS) throw new Error('CANVAS_TOO_LARGE');
  return { width, height };
};

const createCanvas = (w: number, h: number) => {
  const { width, height } = assertCanvasSafeSize(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');
  ctx.imageSmoothingEnabled = true;
  try {
    ctx.imageSmoothingQuality = 'high';
  } catch {}
  return { canvas, ctx, width, height };
};

const ensureCanvas = (prev: HTMLCanvasElement | null, w: number, h: number) => {
  const { width, height } = assertCanvasSafeSize(w, h);
  const canvas = prev || document.createElement('canvas');
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');
  ctx.imageSmoothingEnabled = true;
  try {
    ctx.imageSmoothingQuality = 'high';
  } catch {}
  return { canvas, ctx, width, height };
};

const downscaleInSteps = (
  img: HTMLImageElement,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number
) => {
  let curW = Math.max(1, Math.floor(srcW || 0));
  let curH = Math.max(1, Math.floor(srcH || 0));
  let srcCanvas: HTMLCanvasElement | null = null;
  let dstCanvas: HTMLCanvasElement | null = null;

  while (curW * 0.5 > targetW * 1.2 && curH * 0.5 > targetH * 1.2) {
    const nextW = Math.max(targetW, Math.floor(curW * 0.5));
    const nextH = Math.max(targetH, Math.floor(curH * 0.5));
    const { canvas, ctx } = ensureCanvas(dstCanvas, nextW, nextH);
    if (!srcCanvas) ctx.drawImage(img, 0, 0, curW, curH, 0, 0, nextW, nextH);
    else ctx.drawImage(srcCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);
    dstCanvas = srcCanvas;
    srcCanvas = canvas;
    curW = nextW;
    curH = nextH;
  }

  const { canvas: out, ctx: outCtx } = ensureCanvas(dstCanvas, targetW, targetH);
  if (!srcCanvas) outCtx.drawImage(img, 0, 0, srcW, srcH, 0, 0, targetW, targetH);
  else outCtx.drawImage(srcCanvas, 0, 0, curW, curH, 0, 0, targetW, targetH);
  return out;
};

export const drawToCanvas = (img: HTMLImageElement, targetW: number, targetH: number) => {
  const w = Math.max(1, Math.floor(targetW || 0));
  const h = Math.max(1, Math.floor(targetH || 0));
  const srcW = img.naturalWidth || img.width || 0;
  const srcH = img.naturalHeight || img.height || 0;
  if (!srcW || !srcH) {
    const { canvas, ctx } = createCanvas(w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }
  const ratio = Math.min(w / srcW, h / srcH);
  if (ratio > 0 && ratio < 0.5) {
    return downscaleInSteps(img, srcW, srcH, w, h);
  }
  const { canvas, ctx } = createCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
};

export const scaleToMaxSide = (w: number, h: number, maxSide: number | null) => {
  if (!maxSide || maxSide <= 0) return { w, h };
  const longSide = Math.max(w, h);
  if (longSide <= maxSide) return { w, h };
  const ratio = maxSide / longSide;
  return { w: Math.max(1, Math.round(w * ratio)), h: Math.max(1, Math.round(h * ratio)) };
};
