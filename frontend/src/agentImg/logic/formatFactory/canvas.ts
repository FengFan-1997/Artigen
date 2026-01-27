export const loadImageFromUrl = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
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

export const drawToCanvas = (img: HTMLImageElement, targetW: number, targetH: number) => {
  const w = Math.max(1, Math.floor(targetW || 0));
  const h = Math.max(1, Math.floor(targetH || 0));
  if (w > MAX_CANVAS_DIM || h > MAX_CANVAS_DIM) throw new Error('CANVAS_TOO_LARGE');
  if (w * h > MAX_CANVAS_PIXELS) throw new Error('CANVAS_TOO_LARGE');
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
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
