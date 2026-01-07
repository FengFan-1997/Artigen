import { canvasToBlob, drawToCanvas, loadImageFromUrl, scaleToMaxSide } from './canvas';
import { safeBaseName } from './format';
import { revokeUrl } from './url';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker?url';

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

export const convertImage = async (
  file: File,
  outType: 'image/webp' | 'image/jpeg' | 'image/png',
  quality?: number,
  opts?: FormatFactoryRunOpts
) => {
  const srcUrl = URL.createObjectURL(file);
  try {
    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 0, total: 2, label: '读取图片' });
    const img = await loadImageFromUrl(srcUrl);
    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 1, total: 2, label: '导出图片' });
    const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
    const blob = await canvasToBlob(canvas, outType, quality);
    const ext = outType === 'image/png' ? 'png' : outType === 'image/jpeg' ? 'jpg' : 'webp';
    reportProgress(opts, { done: 2, total: 2, label: '完成' });
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
    reportProgress(opts, { done: 0, total: 2, label: '读取图片' });
    const img = await loadImageFromUrl(srcUrl);
    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 1, total: 2, label: '压缩导出' });
    const { w, h } = scaleToMaxSide(img.naturalWidth, img.naturalHeight, maxSide);
    const canvas = drawToCanvas(img, w, h);
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    reportProgress(opts, { done: 2, total: 2, label: '完成' });
    return { blob, filename: `${safeBaseName(file.name)}.jpg` };
  } finally {
    revokeUrl(srcUrl);
  }
};

export const generateIco = async (file: File, sizes: number[], opts?: FormatFactoryRunOpts) => {
  const srcUrl = URL.createObjectURL(file);
  try {
    abortIfNeeded(opts?.signal);
    reportProgress(opts, { done: 0, total: Math.max(1, sizes.length + 1), label: '读取图片' });
    const img = await loadImageFromUrl(srcUrl);
    const pngBuffers: { size: number; data: ArrayBuffer }[] = [];
    for (let i = 0; i < sizes.length; i += 1) {
      abortIfNeeded(opts?.signal);
      const size = sizes[i];
      reportProgress(opts, {
        done: i,
        total: Math.max(1, sizes.length + 1),
        label: `生成 ${size}×${size}`
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
      label: '打包 ICO'
    });
    const icoArrayBuffer = buildIcoFromPngs(pngBuffers);
    const blob = new Blob([icoArrayBuffer], { type: 'image/x-icon' });
    reportProgress(opts, {
      done: sizes.length + 1,
      total: Math.max(1, sizes.length + 1),
      label: '完成'
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
  if (list.length === 0) throw new Error('请选择至少一张图片');

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
      label: `处理图片 ${i + 1}/${list.length}`
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

  reportProgress(opts, { done: list.length, total: list.length, label: '生成 PDF' });
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

const ensurePdfWorker = () => {
  const anyLib = pdfjsLib as any;
  if (anyLib?.GlobalWorkerOptions?.workerSrc !== pdfWorkerSrc) {
    anyLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  }
};

export const getPdfPageCount = async (file: File, opts?: { signal?: AbortSignal }) => {
  ensurePdfWorker();
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
  ensurePdfWorker();
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
    signal?: AbortSignal;
    onProgress?: (p: FormatFactoryProgress) => void;
  }
) => {
  const mode = opts?.mode === 'page' ? 'page' : 'stitch';
  const outType = opts?.outType || 'image/png';
  const quality = typeof opts?.quality === 'number' ? opts.quality : 0.9;
  const scale = typeof opts?.scale === 'number' ? opts.scale : 1.4;
  const maxPages = typeof opts?.maxPages === 'number' ? opts.maxPages : 12;
  const signal = opts?.signal;
  const onProgress = opts?.onProgress;

  abortIfNeeded(signal);
  const { doc } = await loadPdfDocFromFile(file, { signal });
  abortIfNeeded(signal);

  try {
    const pages = Math.max(1, Number(doc?.numPages || 0));

    if (mode === 'page') {
      const pageNumber = typeof opts?.pageNumber === 'number' ? opts.pageNumber : 1;
      const p = Math.max(1, Math.min(pages, Math.floor(pageNumber)));
      reportProgress({ onProgress }, { done: 0, total: 1, label: `渲染第 ${p} 页` });
      const canvas = await renderPdfPageToCanvasFromDoc(doc, p, scale, { signal });
      reportProgress({ onProgress }, { done: 1, total: 1, label: '导出图片' });
      const blob = await canvasToBlob(
        canvas,
        outType,
        outType === 'image/png' ? undefined : clamp(quality, 0.1, 1)
      );
      const ext = outType === 'image/png' ? 'png' : outType === 'image/jpeg' ? 'jpg' : 'webp';
      return { blob, filename: `${safeBaseName(file.name)}_p${p}.${ext}` };
    }

    const takePages = Math.min(pages, Math.max(1, Math.floor(maxPages)));
    reportProgress({ onProgress }, { done: 0, total: takePages, label: `渲染 1/${takePages}` });

    const canvases: HTMLCanvasElement[] = [];
    for (let i = 1; i <= takePages; i += 1) {
      abortIfNeeded(signal);
      const canvas = await renderPdfPageToCanvasFromDoc(doc, i, scale, { signal });
      canvases.push(canvas);
      reportProgress(
        { onProgress },
        { done: i, total: takePages, label: `渲染 ${i}/${takePages}` }
      );
    }

    abortIfNeeded(signal);
    reportProgress({ onProgress }, { done: takePages, total: takePages, label: '拼接长图' });

    const width = Math.max(...canvases.map((c) => c.width));
    const height = canvases.reduce((sum, c) => sum + c.height, 0);
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    let y = 0;
    for (const c of canvases) {
      abortIfNeeded(signal);
      ctx.drawImage(c, 0, y);
      y += c.height;
    }

    abortIfNeeded(signal);
    reportProgress({ onProgress }, { done: takePages, total: takePages, label: '导出图片' });
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

const waitForEvent = (el: EventTarget, eventName: string) =>
  new Promise<void>((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('VIDEO_LOAD_FAIL'));
    };
    const cleanup = () => {
      el.removeEventListener(eventName, onOk as any);
      el.removeEventListener('error', onErr as any);
    };
    el.addEventListener(eventName, onOk as any, { once: true });
    el.addEventListener('error', onErr as any, { once: true });
  });

const seekVideo = (video: HTMLVideoElement, t: number) =>
  new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('VIDEO_SEEK_FAIL'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onErr, { once: true });
    video.currentTime = Math.max(0, t);
  });

export const videoToGif = async (
  file: File,
  opts?: {
    startSec?: number;
    durationSec?: number;
    fps?: number;
    width?: number;
    maxColors?: number;
    signal?: AbortSignal;
    onProgress?: (p: FormatFactoryProgress) => void;
  }
) => {
  const startSec = typeof opts?.startSec === 'number' ? opts.startSec : 0;
  const durationSec = typeof opts?.durationSec === 'number' ? opts.durationSec : 3;
  const fps = typeof opts?.fps === 'number' ? opts.fps : 10;
  const width = typeof opts?.width === 'number' ? opts.width : 480;
  const maxColors = typeof opts?.maxColors === 'number' ? opts.maxColors : 256;
  const signal = opts?.signal;
  const onProgress = opts?.onProgress;

  const srcUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = srcUrl;
  video.muted = true;
  video.playsInline = true;

  try {
    abortIfNeeded(signal);
    await waitForEvent(video, 'loadedmetadata');
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

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');

    const gif = GIFEncoder();
    gif.writeHeader();
    gif.setRepeat(0);

    for (let i = 0; i < frameCount; i += 1) {
      abortIfNeeded(signal);
      reportProgress(
        { onProgress },
        { done: i, total: frameCount, label: `抽帧 ${i + 1}/${frameCount}` }
      );
      const t = safeStart + i / safeFps;
      await seekVideo(video, t);
      ctx.drawImage(video, 0, 0, outW, outH);
      const imageData = ctx.getImageData(0, 0, outW, outH);
      const rgba = imageData.data;
      const palette = quantize(rgba, clamp(Math.floor(maxColors), 16, 256));
      const index = applyPalette(rgba, palette);
      gif.writeFrame(index, outW, outH, { palette, delay });
    }

    reportProgress({ onProgress }, { done: frameCount, total: frameCount, label: '输出 GIF' });
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
