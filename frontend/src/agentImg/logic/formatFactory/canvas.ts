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

export const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error('CANVAS_EXPORT_FAIL'));
        else resolve(b);
      },
      type,
      quality
    );
  });

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
