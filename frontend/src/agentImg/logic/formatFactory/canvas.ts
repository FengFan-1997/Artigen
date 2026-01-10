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

export const drawToCanvas = (img: HTMLImageElement, targetW: number, targetH: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas;
};

export const scaleToMaxSide = (w: number, h: number, maxSide: number | null) => {
  if (!maxSide || maxSide <= 0) return { w, h };
  const longSide = Math.max(w, h);
  if (longSide <= maxSide) return { w, h };
  const ratio = maxSide / longSide;
  return { w: Math.max(1, Math.round(w * ratio)), h: Math.max(1, Math.round(h * ratio)) };
};
