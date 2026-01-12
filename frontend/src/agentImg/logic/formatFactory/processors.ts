import { canvasToBlob, drawToCanvas, loadImageFromUrl, scaleToMaxSide } from './canvas';
import { safeBaseName } from './format';
import { revokeUrl } from './url';

let cachedPdfLib: any | null = null;
let cachedPdfWorkerSrc: string | null = null;

const ensurePdfLib = async () => {
  if (cachedPdfLib && cachedPdfWorkerSrc) return cachedPdfLib as any;
  const [libMod, workerMod] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker?url')
  ]);
  const lib = libMod as any;
  const workerSrc = (workerMod as any)?.default || (workerMod as any);
  cachedPdfLib = lib;
  cachedPdfWorkerSrc = workerSrc;
  const anyLib = lib as any;
  if (anyLib?.GlobalWorkerOptions?.workerSrc !== workerSrc) {
    anyLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }
  return lib as any;
};

const blobToArrayBuffer = (blob: Blob) => blob.arrayBuffer();

const buildIcoFromPngs = (items: { size: number; data: ArrayBuffer }[]) => {
  const count = items.length;
  const headerSize = 6;
  const dirSize = 16 * count;
  const imagesSize = items.reduce((sum, it) => sum + it.data.byteLength, 0);
  const totalSize = headerSize + dirSize + imagesSize;

  const out = new ArrayBuffer(totalSize);
  const view = new DataView(out);
  let offset = 0;

  view.setUint16(offset, 0, true);
  offset += 2;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, count, true);
  offset += 2;

  let imageOffset = headerSize + dirSize;
  for (let i = 0; i < count; i += 1) {
    const { size, data } = items[i];
    const w = size === 256 ? 0 : size;
    const h = size === 256 ? 0 : size;

    view.setUint8(offset + 0, w);
    view.setUint8(offset + 1, h);
    view.setUint8(offset + 2, 0);
    view.setUint8(offset + 3, 0);
    view.setUint16(offset + 4, 1, true);
    view.setUint16(offset + 6, 32, true);
    view.setUint32(offset + 8, data.byteLength, true);
    view.setUint32(offset + 12, imageOffset, true);

    new Uint8Array(out, imageOffset, data.byteLength).set(new Uint8Array(data));
    imageOffset += data.byteLength;
    offset += 16;
  }

  return out;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function tr(opts: { lang?: 'zh' | 'en' } | undefined, zh: string, en: string) {
  return opts?.lang === 'en' ? en : zh;
}

export const convertImage = async (
  file: File,
  outType: 'image/webp' | 'image/jpeg' | 'image/png',
  quality?: number,
  opts?: FormatFactoryRunOpts
) => {
  const srcUrl = URL.createObjectURL(file);
  try {
    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 0, total: 2, label: tr(opts, '读取图片', 'Reading image') });
    const img = await loadImageFromUrl(srcUrl);
    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 1, total: 2, label: tr(opts, '导出图片', 'Exporting image') });
    const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
    const blob = await canvasToBlob(canvas, outType, quality);
    const ext = outType === 'image/png' ? 'png' : outType === 'image/jpeg' ? 'jpg' : 'webp';
    reportProgress(opts, { done: 2, total: 2, label: tr(opts, '完成', 'Done') });
    return { blob, filename: `${safeBaseName(file.name)}.${ext}` };
  } finally {
    revokeUrl(srcUrl);
  }
};

export const convertToJpeg = async (
  file: File,
  quality: number,
  maxSide: number | null,
  opts?: FormatFactoryRunOpts
) => {
  const srcUrl = URL.createObjectURL(file);
  try {
    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 0, total: 2, label: tr(opts, '读取图片', 'Reading image') });
    const img = await loadImageFromUrl(srcUrl);
    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 1, total: 2, label: tr(opts, '压缩导出', 'Compressing') });
    const { w, h } = scaleToMaxSide(img.naturalWidth, img.naturalHeight, maxSide);
    const canvas = drawToCanvas(img, w, h);
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    reportProgress(opts, { done: 2, total: 2, label: tr(opts, '完成', 'Done') });
    return { blob, filename: `${safeBaseName(file.name)}.jpg` };
  } finally {
    revokeUrl(srcUrl);
  }
};

export const resizeImage = async (
  file: File,
  input: {
    width: number | null;
    height: number | null;
    maxSide: number | null;
    outType: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
  },
  opts?: FormatFactoryRunOpts
) => {
  const srcUrl = URL.createObjectURL(file);
  try {
    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 0, total: 2, label: tr(opts, '读取图片', 'Reading image') });
    const img = await loadImageFromUrl(srcUrl);

    const w0 = img.naturalWidth || 0;
    const h0 = img.naturalHeight || 0;
    if (!w0 || !h0) throw new Error(tr(opts, '读取图片失败', 'Failed to read image'));

    const width = input.width && input.width > 0 ? Math.floor(input.width) : null;
    const height = input.height && input.height > 0 ? Math.floor(input.height) : null;
    const maxSide = input.maxSide && input.maxSide > 0 ? Math.floor(input.maxSide) : null;

    let w = w0;
    let h = h0;
    if (width && height) {
      w = width;
      h = height;
    } else if (width) {
      w = width;
      h = Math.max(1, Math.round((h0 * width) / w0));
    } else if (height) {
      h = height;
      w = Math.max(1, Math.round((w0 * height) / h0));
    } else if (maxSide) {
      const scaled = scaleToMaxSide(w0, h0, maxSide);
      w = scaled.w;
      h = scaled.h;
    } else {
      throw new Error(tr(opts, '请输入宽/高或最长边', 'Please enter width/height or max side'));
    }

    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 1, total: 2, label: tr(opts, '导出图片', 'Exporting image') });
    const canvas = drawToCanvas(img, w, h);
    const blob = await canvasToBlob(canvas, input.outType, input.quality);
    const ext =
      input.outType === 'image/png' ? 'png' : input.outType === 'image/jpeg' ? 'jpg' : 'webp';
    reportProgress(opts, { done: 2, total: 2, label: tr(opts, '完成', 'Done') });
    return { blob, filename: `${safeBaseName(file.name)}_${w}x${h}.${ext}` };
  } finally {
    revokeUrl(srcUrl);
  }
};

export const rotateFlipImage = async (
  file: File,
  input: {
    rotate: 0 | 90 | 180 | 270;
    flipH: boolean;
    flipV: boolean;
    outType: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
  },
  opts?: FormatFactoryRunOpts
) => {
  const srcUrl = URL.createObjectURL(file);
  try {
    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 0, total: 2, label: tr(opts, '读取图片', 'Reading image') });
    const img = await loadImageFromUrl(srcUrl);

    const w0 = img.naturalWidth || 0;
    const h0 = img.naturalHeight || 0;
    if (!w0 || !h0) throw new Error(tr(opts, '读取图片失败', 'Failed to read image'));

    const rot = input.rotate;
    const swap = rot === 90 || rot === 270;
    const w = swap ? h0 : w0;
    const h = swap ? w0 : h0;

    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 1, total: 2, label: tr(opts, '导出图片', 'Exporting image') });

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');

    ctx.translate(w / 2, h / 2);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    const sx = input.flipH ? -1 : 1;
    const sy = input.flipV ? -1 : 1;
    ctx.scale(sx, sy);
    ctx.drawImage(img, -w0 / 2, -h0 / 2, w0, h0);

    const blob = await canvasToBlob(canvas, input.outType, input.quality);
    const ext =
      input.outType === 'image/png' ? 'png' : input.outType === 'image/jpeg' ? 'jpg' : 'webp';
    reportProgress(opts, { done: 2, total: 2, label: tr(opts, '完成', 'Done') });
    return { blob, filename: `${safeBaseName(file.name)}_${rot}deg.${ext}` };
  } finally {
    revokeUrl(srcUrl);
  }
};

export const filterImage = async (
  file: File,
  input: {
    preset: 'grayscale' | 'sepia' | 'invert';
    intensity: number;
    outType: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
  },
  opts?: FormatFactoryRunOpts
) => {
  const srcUrl = URL.createObjectURL(file);
  try {
    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 0, total: 3, label: tr(opts, '读取图片', 'Reading image') });
    const img = await loadImageFromUrl(srcUrl);

    const w = img.naturalWidth || 0;
    const h = img.naturalHeight || 0;
    if (!w || !h) throw new Error(tr(opts, '读取图片失败', 'Failed to read image'));

    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 1, total: 3, label: tr(opts, '渲染画布', 'Rendering canvas') });
    const canvas = drawToCanvas(img, w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');

    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 2, total: 3, label: tr(opts, '应用滤镜', 'Applying filter') });
    const t = clamp01(Number(input.intensity || 0));
    if (t > 0) {
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        let r2 = r;
        let g2 = g;
        let b2 = b;
        if (input.preset === 'grayscale') {
          const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
          r2 = y;
          g2 = y;
          b2 = y;
        } else if (input.preset === 'sepia') {
          r2 = Math.min(255, Math.round(0.393 * r + 0.769 * g + 0.189 * b));
          g2 = Math.min(255, Math.round(0.349 * r + 0.686 * g + 0.168 * b));
          b2 = Math.min(255, Math.round(0.272 * r + 0.534 * g + 0.131 * b));
        } else {
          r2 = 255 - r;
          g2 = 255 - g;
          b2 = 255 - b;
        }
        d[i] = Math.round(r * (1 - t) + r2 * t);
        d[i + 1] = Math.round(g * (1 - t) + g2 * t);
        d[i + 2] = Math.round(b * (1 - t) + b2 * t);
      }
      ctx.putImageData(imageData, 0, 0);
    }

    const blob = await canvasToBlob(canvas, input.outType, input.quality);
    const ext =
      input.outType === 'image/png' ? 'png' : input.outType === 'image/jpeg' ? 'jpg' : 'webp';
    reportProgress(opts, { done: 3, total: 3, label: tr(opts, '完成', 'Done') });
    return { blob, filename: `${safeBaseName(file.name)}_${input.preset}.${ext}` };
  } finally {
    revokeUrl(srcUrl);
  }
};

export const generateIco = async (file: File, sizes: number[], opts?: FormatFactoryRunOpts) => {
  const srcUrl = URL.createObjectURL(file);
  try {
    abortIfNeeded(opts?.signal);
    reportProgress(opts, {
      done: 0,
      total: Math.max(1, sizes.length + 1),
      label: tr(opts, '读取图片', 'Reading image')
    });
    const img = await loadImageFromUrl(srcUrl);
    const pngBuffers: { size: number; data: ArrayBuffer }[] = [];
    for (let i = 0; i < sizes.length; i += 1) {
      abortIfNeeded(opts?.signal);
      const size = sizes[i];
      reportProgress(opts, {
        done: i,
        total: Math.max(1, sizes.length + 1),
        label: tr(opts, `生成 ${size}×${size}`, `Generating ${size}×${size}`)
      });
      const canvas = drawToCanvas(img, size, size);
      const pngBlob = await canvasToBlob(canvas, 'image/png');
      const buf = await blobToArrayBuffer(pngBlob);
      pngBuffers.push({ size, data: buf });
    }

    abortIfNeeded(opts?.signal);
    reportProgress(opts, {
      done: sizes.length,
      total: Math.max(1, sizes.length + 1),
      label: tr(opts, '打包 ICO', 'Packing ICO')
    });
    const icoArrayBuffer = buildIcoFromPngs(pngBuffers);
    const blob = new Blob([icoArrayBuffer], { type: 'image/x-icon' });
    reportProgress(opts, {
      done: sizes.length + 1,
      total: Math.max(1, sizes.length + 1),
      label: tr(opts, '完成', 'Done')
    });
    return { blob, filename: `${safeBaseName(file.name)}.ico` };
  } finally {
    revokeUrl(srcUrl);
  }
};

const encoder = new TextEncoder();

const concatBytes = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
};

const mmToPt = (mm: number) => (mm * 72) / 25.4;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const loadImageFromFile = async (file: File) => {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageFromUrl(url);
    return img;
  } finally {
    revokeUrl(url);
  }
};

const fileToJpegBytes = async (file: File, quality: number, maxSide: number | null) => {
  const img = await loadImageFromFile(file);
  const { w, h } = scaleToMaxSide(img.naturalWidth, img.naturalHeight, maxSide);
  const canvas = drawToCanvas(img, w, h);
  const blob = await canvasToBlob(canvas, 'image/jpeg', clamp(quality, 0.1, 1));
  const buf = await blobToArrayBuffer(blob);
  return { bytes: new Uint8Array(buf), w, h };
};

export const imagesToPdf = async (
  files: File[],
  opts?: { pageSize?: 'A4' | 'auto'; marginMm?: number; quality?: number } & FormatFactoryRunOpts
) => {
  const list = Array.isArray(files) ? files.filter((f) => f && f.size > 0) : [];
  if (list.length === 0)
    throw new Error(tr(opts, '请选择至少一张图片', 'Please select at least one image'));

  abortIfNeeded(opts?.signal);
  const pageSize = opts?.pageSize === 'auto' ? 'auto' : 'A4';
  const marginMm = typeof opts?.marginMm === 'number' ? opts.marginMm : 10;
  const quality = typeof opts?.quality === 'number' ? opts.quality : 0.86;
  const marginPt = mmToPt(clamp(marginMm, 0, 30));

  const a4 = { w: 595.28, h: 841.89 };
  const baseName = safeBaseName(list[0].name) || 'images';

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let cursor = 0;

  const pushText = (s: string) => {
    const b = encoder.encode(s);
    chunks.push(b);
    cursor += b.byteLength;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    cursor += b.byteLength;
  };

  const addObject = (objNo: number, bodyParts: (string | Uint8Array)[]) => {
    offsets[objNo] = cursor;
    pushText(`${objNo} 0 obj\n`);
    for (const p of bodyParts) {
      if (typeof p === 'string') pushText(p);
      else pushBytes(p);
    }
    pushText('\nendobj\n');
  };

  pushText('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');

  const catalogNo = 1;
  const pagesNo = 2;
  const objStart = 3;

  const pageNos: number[] = [];
  const pageSpecs: Array<{
    imgNo: number;
    contentNo: number;
    pageNo: number;
    imgW: number;
    imgH: number;
    pageW: number;
    pageH: number;
    drawW: number;
    drawH: number;
    drawX: number;
    drawY: number;
    jpegBytes: Uint8Array;
  }> = [];

  for (let i = 0; i < list.length; i += 1) {
    abortIfNeeded(opts?.signal);
    reportProgress(opts, {
      done: i,
      total: list.length,
      label: tr(
        opts,
        `处理图片 ${i + 1}/${list.length}`,
        `Processing image ${i + 1}/${list.length}`
      )
    });
    const file = list[i];
    const { bytes, w, h } = await fileToJpegBytes(file, quality, null);

    const imgNo = objStart + i * 3;
    const contentNo = objStart + i * 3 + 1;
    const pageNo = objStart + i * 3 + 2;
    pageNos.push(pageNo);

    const pageW = pageSize === 'A4' ? a4.w : (w * 72) / 96;
    const pageH = pageSize === 'A4' ? a4.h : (h * 72) / 96;
    const innerW = Math.max(1, pageW - marginPt * 2);
    const innerH = Math.max(1, pageH - marginPt * 2);

    const imgPtW = pageSize === 'A4' ? (w * 72) / 96 : pageW;
    const imgPtH = pageSize === 'A4' ? (h * 72) / 96 : pageH;

    const scale = Math.min(innerW / imgPtW, innerH / imgPtH, 1);
    const drawW = imgPtW * scale;
    const drawH = imgPtH * scale;
    const drawX = (pageW - drawW) / 2;
    const drawY = (pageH - drawH) / 2;

    pageSpecs.push({
      imgNo,
      contentNo,
      pageNo,
      imgW: w,
      imgH: h,
      pageW,
      pageH,
      drawW,
      drawH,
      drawX,
      drawY,
      jpegBytes: bytes
    });
  }

  reportProgress(opts, {
    done: list.length,
    total: list.length,
    label: tr(opts, '生成 PDF', 'Generating PDF')
  });
  addObject(catalogNo, [`<< /Type /Catalog /Pages ${pagesNo} 0 R >>`]);
  addObject(pagesNo, [
    `<< /Type /Pages /Count ${pageNos.length} /Kids [${pageNos.map((n) => `${n} 0 R`).join(' ')}] >>`
  ]);

  for (const p of pageSpecs) {
    const imgDict = `<< /Type /XObject /Subtype /Image /Width ${p.imgW} /Height ${p.imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.byteLength} >>`;
    addObject(p.imgNo, [imgDict, `\nstream\n`, p.jpegBytes, `\nendstream`]);

    const contentStream = `q\n${p.drawW.toFixed(2)} 0 0 ${p.drawH.toFixed(2)} ${p.drawX.toFixed(2)} ${p.drawY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    addObject(p.contentNo, [
      `<< /Length ${contentBytes.byteLength} >>\nstream\n`,
      contentBytes,
      `\nendstream`
    ]);

    addObject(p.pageNo, [
      `<< /Type /Page /Parent ${pagesNo} 0 R /MediaBox [0 0 ${p.pageW.toFixed(2)} ${p.pageH.toFixed(2)}] /Resources << /XObject << /Im0 ${p.imgNo} 0 R >> >> /Contents ${p.contentNo} 0 R >>`
    ]);
  }

  const xrefOffset = cursor;
  pushText(`xref\n0 ${pageSpecs.length * 3 + 3}\n`);
  pushText('0000000000 65535 f \n');
  for (let i = 1; i < pageSpecs.length * 3 + 3; i += 1) {
    const off = offsets[i] || 0;
    pushText(`${String(off).padStart(10, '0')} 00000 n \n`);
  }
  pushText(
    `trailer\n<< /Size ${pageSpecs.length * 3 + 3} /Root ${catalogNo} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const pdfBytes = concatBytes(chunks);
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  return { blob, filename: `${baseName}.pdf` };
};

export const getPdfPageCount = async (file: File, opts?: { signal?: AbortSignal }) => {
  const pdfjsLib = await ensurePdfLib();
  if (opts?.signal?.aborted) throw new Error('ABORTED');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (opts?.signal?.aborted) throw new Error('ABORTED');
  const doc = await (pdfjsLib as any).getDocument({ data: bytes }).promise;
  const pages = Number(doc?.numPages || 0);
  try {
    await doc.destroy();
  } catch {}
  return pages;
};

const loadPdfDocFromFile = async (file: File, opts?: { signal?: AbortSignal }) => {
  const pdfjsLib = await ensurePdfLib();
  if (opts?.signal?.aborted) throw new Error('ABORTED');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (opts?.signal?.aborted) throw new Error('ABORTED');
  const doc = await (pdfjsLib as any).getDocument({ data: bytes }).promise;
  return { doc, bytes };
};

const renderPdfPageToCanvasFromDoc = async (
  doc: any,
  pageNumber: number,
  scale: number,
  opts?: { signal?: AbortSignal }
) => {
  if (opts?.signal?.aborted) throw new Error('ABORTED');
  const page = await doc.getPage(pageNumber);
  if (opts?.signal?.aborted) throw new Error('ABORTED');
  const viewport = page.getViewport({ scale: clamp(scale, 0.5, 3) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');
  await page.render({ canvasContext: ctx, viewport }).promise;
  if (opts?.signal?.aborted) throw new Error('ABORTED');
  return canvas;
};

const abortIfNeeded = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('ABORTED');
};

export type FormatFactoryProgress = { done: number; total: number; label?: string };

export type FormatFactoryRunOpts = {
  lang?: 'zh' | 'en';
  signal?: AbortSignal;
  onProgress?: (p: FormatFactoryProgress) => void;
};

const reportProgress = (opts: FormatFactoryRunOpts | undefined, p: FormatFactoryProgress) => {
  try {
    opts?.onProgress?.(p);
  } catch {}
};

export const pdfToImage = async (
  file: File,
  opts?: {
    mode?: 'stitch' | 'page';
    pageNumber?: number;
    scale?: number;
    outType?: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
    maxPages?: number;
  } & FormatFactoryRunOpts
) => {
  const mode = opts?.mode === 'page' ? 'page' : 'stitch';
  const outType = opts?.outType || 'image/png';
  const quality = typeof opts?.quality === 'number' ? opts.quality : 0.9;
  const scale = typeof opts?.scale === 'number' ? opts.scale : 1.4;
  const maxPages = typeof opts?.maxPages === 'number' ? opts.maxPages : 12;
  const signal = opts?.signal;

  abortIfNeeded(signal);
  const { doc } = await loadPdfDocFromFile(file, { signal });
  abortIfNeeded(signal);

  try {
    const pages = Math.max(1, Number(doc?.numPages || 0));

    if (mode === 'page') {
      const pageNumber = typeof opts?.pageNumber === 'number' ? opts.pageNumber : 1;
      const p = Math.max(1, Math.min(pages, Math.floor(pageNumber)));
      reportProgress(opts, {
        done: 0,
        total: 1,
        label: tr(opts, `渲染第 ${p} 页`, `Rendering page ${p}`)
      });
      const canvas = await renderPdfPageToCanvasFromDoc(doc, p, scale, { signal });
      reportProgress(opts, { done: 1, total: 1, label: tr(opts, '导出图片', 'Exporting image') });
      const blob = await canvasToBlob(
        canvas,
        outType,
        outType === 'image/png' ? undefined : clamp(quality, 0.1, 1)
      );
      const ext = outType === 'image/png' ? 'png' : outType === 'image/jpeg' ? 'jpg' : 'webp';
      return { blob, filename: `${safeBaseName(file.name)}_p${p}.${ext}` };
    }

    const takePages = Math.min(pages, Math.max(1, Math.floor(maxPages)));
    reportProgress(opts, {
      done: 0,
      total: takePages,
      label: tr(opts, `计算尺寸 1/${takePages}`, `Measuring 1/${takePages}`)
    });

    const pageSizes: Array<{ w: number; h: number }> = [];
    const safeScale = clamp(scale, 0.5, 3);
    for (let i = 1; i <= takePages; i += 1) {
      abortIfNeeded(signal);
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: safeScale });
      pageSizes.push({
        w: Math.max(1, Math.floor(viewport.width)),
        h: Math.max(1, Math.floor(viewport.height))
      });
      reportProgress(opts, {
        done: i,
        total: takePages,
        label: tr(opts, `计算尺寸 ${i}/${takePages}`, `Measuring ${i}/${takePages}`)
      });
    }

    abortIfNeeded(signal);
    reportProgress(opts, {
      done: 0,
      total: takePages,
      label: tr(opts, `渲染并拼接 1/${takePages}`, `Rendering & stitching 1/${takePages}`)
    });

    const width = Math.max(...pageSizes.map((s) => s.w));
    const height = pageSizes.reduce((sum, s) => sum + s.h, 0);
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    let y = 0;
    for (let i = 1; i <= takePages; i += 1) {
      abortIfNeeded(signal);
      const canvas = await renderPdfPageToCanvasFromDoc(doc, i, safeScale, { signal });
      ctx.drawImage(canvas, 0, y);
      y += canvas.height;
      reportProgress(opts, {
        done: i,
        total: takePages,
        label: tr(opts, `渲染并拼接 ${i}/${takePages}`, `Rendering & stitching ${i}/${takePages}`)
      });
    }

    abortIfNeeded(signal);
    reportProgress(opts, {
      done: takePages,
      total: takePages,
      label: tr(opts, '导出图片', 'Exporting image')
    });
    const blob = await canvasToBlob(
      out,
      outType,
      outType === 'image/png' ? undefined : clamp(quality, 0.1, 1)
    );
    const ext = outType === 'image/png' ? 'png' : outType === 'image/jpeg' ? 'jpg' : 'webp';
    const suffix = pages > takePages ? `_p1-${takePages}` : `_p1-${pages}`;
    return { blob, filename: `${safeBaseName(file.name)}${suffix}.${ext}` };
  } finally {
    try {
      await doc.destroy();
    } catch {}
  }
};

const escapePdfText = (s: string) => {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '');
};

const wrapLines = (text: string, maxChars: number) => {
  const out: string[] = [];
  const t = String(text || '');
  const lines = t.split('\n');
  for (const rawLine of lines) {
    const line = String(rawLine || '').replace(/\r/g, '');
    if (!line) {
      out.push('');
      continue;
    }
    let cur = line;
    while (cur.length > maxChars) {
      out.push(cur.slice(0, maxChars));
      cur = cur.slice(maxChars);
    }
    out.push(cur);
  }
  return out;
};

export const txtToPdf = async (
  file: File,
  opts?: { maxCharsPerLine?: number } & FormatFactoryRunOpts
) => {
  abortIfNeeded(opts?.signal);
  reportProgress(opts, { done: 0, total: 2, label: tr(opts, '读取文本', 'Reading text') });
  const raw = await file.text();
  abortIfNeeded(opts?.signal);

  const text = String(raw || '').replace(/\t/g, '    ');
  const maxCharsPerLine = Math.max(20, Math.floor(opts?.maxCharsPerLine ?? 80));
  const lines = wrapLines(text, maxCharsPerLine);

  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 56;
  const fontSize = 12;
  const lineHeight = 16;
  const usableH = pageH - margin * 2;
  const linesPerPage = Math.max(1, Math.floor(usableH / lineHeight));
  const totalPages = Math.max(1, Math.ceil(lines.length / linesPerPage));

  const objects: string[] = [];
  const offsets: number[] = [];
  let cursor = 0;

  const push = (s: string) => {
    objects.push(s);
    cursor += new TextEncoder().encode(s).byteLength;
  };

  const addObject = (no: number, body: string) => {
    offsets[no] = cursor;
    push(`${no} 0 obj\n${body}\nendobj\n`);
  };

  const pagesObjNo = 2;
  const fontObjNo = 3;
  const firstPageObjNo = 4;
  const firstContentObjNo = firstPageObjNo + totalPages;

  const pageRefs = Array.from({ length: totalPages }, (_, i) => `${firstPageObjNo + i} 0 R`).join(
    ' '
  );

  push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  addObject(1, `<< /Type /Catalog /Pages ${pagesObjNo} 0 R >>`);
  addObject(pagesObjNo, `<< /Type /Pages /Count ${totalPages} /Kids [${pageRefs}] >>`);
  addObject(fontObjNo, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  reportProgress(opts, { done: 1, total: 2, label: tr(opts, '生成 PDF', 'Generating PDF') });

  for (let p = 0; p < totalPages; p += 1) {
    abortIfNeeded(opts?.signal);
    const pageNo = firstPageObjNo + p;
    const contentNo = firstContentObjNo + p;
    const from = p * linesPerPage;
    const to = Math.min(lines.length, from + linesPerPage);
    const pageLines = lines.slice(from, to);

    const startX = margin;
    const startY = pageH - margin - fontSize;

    let stream = `BT\n/F1 ${fontSize} Tf\n${startX.toFixed(2)} ${startY.toFixed(2)} Td\n`;
    for (let i = 0; i < pageLines.length; i += 1) {
      const ln = escapePdfText(pageLines[i]);
      stream += `(${ln}) Tj\n`;
      if (i !== pageLines.length - 1) stream += `0 -${lineHeight} Td\n`;
    }
    stream += 'ET\n';

    const contentBytes = new TextEncoder().encode(stream);
    addObject(contentNo, `<< /Length ${contentBytes.byteLength} >>\nstream\n${stream}endstream`);
    addObject(
      pageNo,
      `<< /Type /Page /Parent ${pagesObjNo} 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(
        2
      )}] /Resources << /Font << /F1 ${fontObjNo} 0 R >> >> /Contents ${contentNo} 0 R >>`
    );
  }

  const xrefOffset = cursor;
  push(`xref\n0 ${firstContentObjNo + totalPages}\n`);
  push('0000000000 65535 f \n');
  for (let i = 1; i < firstContentObjNo + totalPages; i += 1) {
    const off = offsets[i] || 0;
    push(`${String(off).padStart(10, '0')} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${firstContentObjNo + totalPages} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const pdfText = objects.join('');
  const blob = new Blob([pdfText], { type: 'application/pdf' });
  reportProgress(opts, { done: 2, total: 2, label: tr(opts, '完成', 'Done') });
  return { blob, filename: `${safeBaseName(file.name)}.pdf` };
};

export const pdfToWord = async (file: File, opts?: FormatFactoryRunOpts) => {
  abortIfNeeded(opts?.signal);
  const pdfjsLib = await ensurePdfLib();
  abortIfNeeded(opts?.signal);
  reportProgress(opts, { done: 0, total: 2, label: tr(opts, '读取 PDF', 'Reading PDF') });
  const bytes = new Uint8Array(await file.arrayBuffer());
  abortIfNeeded(opts?.signal);

  const doc = await (pdfjsLib as any).getDocument({ data: bytes }).promise;
  abortIfNeeded(opts?.signal);

  try {
    const pages = Math.max(1, Number(doc?.numPages || 0));
    const parts: string[] = [];
    for (let i = 1; i <= pages; i += 1) {
      abortIfNeeded(opts?.signal);
      reportProgress(opts, {
        done: i - 1,
        total: pages,
        label: tr(opts, `提取文字 ${i}/${pages}`, `Extracting text ${i}/${pages}`)
      });
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const items = Array.isArray(tc?.items) ? tc.items : [];
      const pageText = items
        .map((it: any) => (typeof it?.str === 'string' ? it.str : ''))
        .join(' ')
        .replace(/\s+\n/g, '\n')
        .trim();
      parts.push(pageText);
    }

    reportProgress(opts, {
      done: pages,
      total: pages,
      label: tr(opts, '生成 Word', 'Building Word')
    });
    const text = parts.filter(Boolean).join('\n\n');
    const html = [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8" />',
      `<title>${safeBaseName(file.name)}</title>`,
      '</head>',
      '<body>',
      `<pre style="white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5;">${text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre>`,
      '</body>',
      '</html>'
    ].join('');
    const blob = new Blob([html], { type: 'text/html' });
    reportProgress(opts, { done: 2, total: 2, label: tr(opts, '完成', 'Done') });
    return { blob, filename: `${safeBaseName(file.name)}.doc` };
  } finally {
    try {
      await doc.destroy();
    } catch {}
  }
};

const waitForVideoReadyState = (
  video: HTMLVideoElement,
  minReadyState: number,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
) =>
  new Promise<void>((resolve, reject) => {
    if (opts?.signal?.aborted) {
      reject(new Error('ABORTED'));
      return;
    }
    if (video.readyState >= minReadyState) {
      resolve();
      return;
    }

    const timeoutMs = typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : 8000;
    let timer: any = null;

    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('VIDEO_LOAD_FAIL'));
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('ABORTED'));
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('VIDEO_LOAD_FAIL'));
    };

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onOk as any);
      video.removeEventListener('loadeddata', onOk as any);
      video.removeEventListener('canplay', onOk as any);
      video.removeEventListener('error', onErr as any);
      opts?.signal?.removeEventListener('abort', onAbort as any);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    video.addEventListener('loadedmetadata', onOk as any, { once: true });
    video.addEventListener('loadeddata', onOk as any, { once: true });
    video.addEventListener('canplay', onOk as any, { once: true });
    video.addEventListener('error', onErr as any, { once: true });
    opts?.signal?.addEventListener('abort', onAbort as any, { once: true });
    if (timeoutMs > 0) timer = setTimeout(onTimeout, timeoutMs);
  });

const seekVideo = async (
  video: HTMLVideoElement,
  t: number,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
) => {
  abortIfNeeded(opts?.signal);
  const target = Math.max(0, Number.isFinite(t) ? t : 0);

  if (Math.abs((video.currentTime || 0) - target) < 0.001) {
    if (video.readyState >= 2) return;
    await waitForVideoReadyState(video, 2, { signal: opts?.signal, timeoutMs: opts?.timeoutMs });
    abortIfNeeded(opts?.signal);
    return;
  }

  const timeoutMs = typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : 8000;
  await new Promise<void>((resolve, reject) => {
    if (opts?.signal?.aborted) {
      reject(new Error('ABORTED'));
      return;
    }

    let timer: any = null;

    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('VIDEO_SEEK_FAIL'));
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('ABORTED'));
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('VIDEO_SEEK_FAIL'));
    };

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      opts?.signal?.removeEventListener('abort', onAbort as any);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onErr, { once: true });
    opts?.signal?.addEventListener('abort', onAbort as any, { once: true });
    if (timeoutMs > 0) timer = setTimeout(onTimeout, timeoutMs);

    video.currentTime = target;
  });

  abortIfNeeded(opts?.signal);
  if (video.readyState >= 2) return;
  await waitForVideoReadyState(video, 2, { signal: opts?.signal, timeoutMs });
  abortIfNeeded(opts?.signal);
};

export const videoToGif = async (
  file: File,
  opts?: {
    startSec?: number;
    durationSec?: number;
    fps?: number;
    width?: number;
    maxColors?: number;
  } & FormatFactoryRunOpts
) => {
  const startSec = typeof opts?.startSec === 'number' ? opts.startSec : 0;
  const durationSec = typeof opts?.durationSec === 'number' ? opts.durationSec : 3;
  const fps = typeof opts?.fps === 'number' ? opts.fps : 10;
  const width = typeof opts?.width === 'number' ? opts.width : 480;
  const maxColors = typeof opts?.maxColors === 'number' ? opts.maxColors : 256;
  const signal = opts?.signal;

  const srcUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = srcUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    abortIfNeeded(signal);
    try {
      video.load();
    } catch {}
    await waitForVideoReadyState(video, 1, { signal, timeoutMs: 12000 });
    abortIfNeeded(signal);
    const dur = Number(video.duration || 0);
    if (!Number.isFinite(dur) || dur <= 0) throw new Error('VIDEO_META_FAIL');

    const safeStart = clamp(startSec, 0, Math.max(0, dur - 0.05));
    const maxDur = Math.min(10, Math.max(0.2, dur - safeStart));
    const safeDur = clamp(durationSec, 0.2, maxDur);
    const safeFps = clamp(Math.floor(fps), 2, 24);
    const frameCount = Math.max(1, Math.floor(safeDur * safeFps));
    const delay = Math.round(1000 / safeFps);

    const vw = Math.max(1, Math.floor(video.videoWidth || 0));
    const vh = Math.max(1, Math.floor(video.videoHeight || 0));
    if (!vw || !vh) throw new Error('VIDEO_DIM_FAIL');

    const outW = clamp(Math.floor(width), 120, 960);
    const outH = Math.max(1, Math.round((outW * vh) / vw));
    const colors = clamp(Math.floor(maxColors), 16, 256);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');

    const { GIFEncoder, applyPalette, quantize } = await import('gifenc');
    const gif = GIFEncoder();
    gif.writeHeader();
    gif.setRepeat(0);

    const reportEvery = Math.max(1, Math.floor(frameCount / 30));
    for (let i = 0; i < frameCount; i += 1) {
      abortIfNeeded(signal);
      if (i === 0 || i === frameCount - 1 || i % reportEvery === 0) {
        reportProgress(opts, {
          done: i,
          total: frameCount,
          label: tr(opts, `抽帧 ${i + 1}/${frameCount}`, `Capturing frames ${i + 1}/${frameCount}`)
        });
      }
      const t = safeStart + i / safeFps;
      await seekVideo(video, t, { signal, timeoutMs: 12000 });
      ctx.drawImage(video, 0, 0, outW, outH);
      const imageData = ctx.getImageData(0, 0, outW, outH);
      const rgba = imageData.data;
      const palette = quantize(rgba, colors);
      const index = applyPalette(rgba, palette);
      gif.writeFrame(index, outW, outH, { palette, delay });
    }

    reportProgress(opts, {
      done: frameCount,
      total: frameCount,
      label: tr(opts, '输出 GIF', 'Encoding GIF')
    });
    gif.finish();
    const bytes = gif.bytes();
    const blob = new Blob([bytes], { type: 'image/gif' });
    return { blob, filename: `${safeBaseName(file.name)}.gif` };
  } finally {
    revokeUrl(srcUrl);
    try {
      video.removeAttribute('src');
      video.load();
    } catch {}
  }
};
