import type { EditorBackground, EditorLayer } from '../domain/types';
import {
  createRenderDescription,
  getArtboardBounds,
  getContentBounds,
  type RenderBounds,
  type RenderDescription,
  type RenderNode
} from './renderDescription';
import type { EditorDocumentV2 } from '../domain/types';
import {
  adjustmentBlurPixels,
  applyAdjustmentColorMatrix,
  createAdjustmentColorMatrix,
  isIdentityColorMatrix
} from '../rendering/imageAdjustments';

export type EditorExportFormat = 'png' | 'jpeg' | 'webp';
export type EditorExportScale = 1 | 2 | 3;

export interface EditorExportOptions {
  format: EditorExportFormat;
  scale: EditorExportScale;
  quality: number;
  bounds: 'artboard' | 'content';
  background: EditorBackground;
  filename: string;
}

export interface EditorExportResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  description: RenderDescription;
}

type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;
type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type RenderImage = ImageBitmap | HTMLImageElement;

export async function exportEditorDocument(
  document: EditorDocumentV2,
  getAssetBlob: (assetId: string) => Promise<Blob | null>,
  options: EditorExportOptions
): Promise<EditorExportResult> {
  const description = createRenderDescription(document);
  const bounds = options.bounds === 'content'
    ? getContentBounds(description)
    : getArtboardBounds(description);
  const canvas = createCanvas(
    Math.max(1, Math.round(bounds.width * options.scale)),
    Math.max(1, Math.round(bounds.height * options.scale))
  );
  const context = canvas.getContext('2d');
  if (!context) throw new Error('EXPORT_CONTEXT_UNAVAILABLE');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.scale(options.scale, options.scale);
  context.translate(-bounds.x, -bounds.y);
  paintBackground(context, bounds, options.background, options.format);

  for (const node of description.nodes) {
    if (!node.visible) continue;
    await paintNode(context, node, getAssetBlob);
  }

  const mimeType = mimeTypeFor(options.format);
  const blob = await canvasToBlob(canvas, mimeType, clamp(options.quality, 0.1, 1));
  if (!blob.type || blob.type !== mimeType) throw new Error('EXPORT_FORMAT_UNSUPPORTED');
  return {
    blob,
    filename: normalizeFilename(options.filename, options.format),
    width: canvas.width,
    height: canvas.height,
    description
  };
}

export function downloadEditorExport(result: EditorExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filename;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function paintNode(
  context: RenderContext,
  node: RenderNode,
  getAssetBlob: (assetId: string) => Promise<Blob | null>
): Promise<void> {
  const { layer, transform } = node;
  context.save();
  context.translate(transform.x, transform.y);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.scale(
    transform.scaleX * (transform.flipX ? -1 : 1),
    transform.scaleY * (transform.flipY ? -1 : 1)
  );
  context.globalAlpha = transform.opacity;
  if (layer.type === 'image') await paintImageLayer(context, layer, getAssetBlob);
  else if (layer.type === 'text') paintTextLayer(context, layer);
  else if (layer.type === 'rect') paintRectLayer(context, layer);
  else if (layer.type === 'ellipse') paintEllipseLayer(context, layer);
  else paintLineLayer(context, layer);
  context.restore();
}

async function paintImageLayer(
  context: RenderContext,
  layer: Extract<EditorLayer, { type: 'image' }>,
  getAssetBlob: (assetId: string) => Promise<Blob | null>
): Promise<void> {
  const blob = await getAssetBlob(layer.assetId);
  if (!blob) throw new Error('ASSET_NOT_FOUND');
  const image = await decodeImage(blob);
  const sourceX = layer.crop.x * layer.naturalWidth;
  const sourceY = layer.crop.y * layer.naturalHeight;
  const sourceWidth = layer.crop.width * layer.naturalWidth;
  const sourceHeight = layer.crop.height * layer.naturalHeight;
  const adjusted = createAdjustedCropCanvas(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    layer
  );
  const blur = adjustmentBlurPixels(layer.adjustments);
  context.filter = blur ? `blur(${blur}px)` : 'none';
  context.drawImage(
    adjusted,
    -sourceWidth / 2,
    -sourceHeight / 2,
    sourceWidth,
    sourceHeight
  );
  context.filter = 'none';
  if ('close' in image && typeof image.close === 'function') image.close();
}

function createAdjustedCropCanvas(
  image: RenderImage,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
  layer: Extract<EditorLayer, { type: 'image' }>
): RenderCanvas {
  const canvas = createCanvas(
    Math.max(1, Math.round(sourceWidth)),
    Math.max(1, Math.round(sourceHeight))
  );
  const context = canvas.getContext('2d');
  if (!context) throw new Error('EXPORT_CONTEXT_UNAVAILABLE');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );
  const matrix = createAdjustmentColorMatrix(layer.adjustments);
  if (!isIdentityColorMatrix(matrix)) {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    applyAdjustmentColorMatrix(imageData.data, matrix);
    context.putImageData(imageData, 0, 0);
  }
  return canvas;
}

function paintTextLayer(context: RenderContext, layer: Extract<EditorLayer, { type: 'text' }>): void {
  context.fillStyle = layer.fill;
  context.font = `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
  context.textAlign = layer.textAlign;
  context.textBaseline = 'middle';
  const lines = wrapText(context, layer.text, layer.width);
  const lineHeight = layer.fontSize * layer.lineHeight;
  const x = layer.textAlign === 'left' ? -layer.width / 2 : layer.textAlign === 'right' ? layer.width / 2 : 0;
  const startY = -((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => context.fillText(line, x, startY + index * lineHeight, layer.width));
}

function paintRectLayer(context: RenderContext, layer: Extract<EditorLayer, { type: 'rect' }>): void {
  const x = -layer.width / 2;
  const y = -layer.height / 2;
  context.beginPath();
  context.roundRect(x, y, layer.width, layer.height, Math.min(layer.radius, layer.width / 2, layer.height / 2));
  fillAndStroke(context, layer.fill, layer.stroke, layer.strokeWidth);
}

function paintEllipseLayer(context: RenderContext, layer: Extract<EditorLayer, { type: 'ellipse' }>): void {
  context.beginPath();
  context.ellipse(0, 0, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
  fillAndStroke(context, layer.fill, layer.stroke, layer.strokeWidth);
}

function paintLineLayer(context: RenderContext, layer: Extract<EditorLayer, { type: 'line' }>): void {
  context.beginPath();
  context.moveTo(-layer.width / 2, 0);
  context.lineTo(layer.width / 2, 0);
  context.strokeStyle = layer.stroke;
  context.lineWidth = layer.strokeWidth;
  context.lineCap = 'round';
  context.stroke();
}

function fillAndStroke(context: RenderContext, fill: string, stroke: string, strokeWidth: number): void {
  if (fill !== 'transparent') {
    context.fillStyle = fill;
    context.fill();
  }
  if (strokeWidth > 0) {
    context.strokeStyle = stroke;
    context.lineWidth = strokeWidth;
    context.stroke();
  }
}

function paintBackground(
  context: RenderContext,
  bounds: RenderBounds,
  background: EditorBackground,
  format: EditorExportFormat
): void {
  const color = background.type === 'color'
    ? background.color
    : format === 'jpeg'
      ? '#ffffff'
      : null;
  if (!color) return;
  context.save();
  context.fillStyle = color;
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.restore();
}

function wrapText(context: RenderContext, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const character of Array.from(paragraph || ' ')) {
      const candidate = `${current}${character}`;
      if (current && context.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = character;
      } else {
        current = candidate;
      }
    }
    lines.push(current || ' ');
  }
  return lines;
}

async function decodeImage(blob: Blob): Promise<RenderImage> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createCanvas(width: number, height: number): RenderCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBlob(canvas: RenderCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('EXPORT_ENCODING_FAILED'));
    }, type, quality);
  });
}

function mimeTypeFor(format: EditorExportFormat): string {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

function normalizeFilename(filename: string, format: EditorExportFormat): string {
  const base = filename.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\.(png|jpe?g|webp)$/i, '') || 'artigen-design';
  return `${base}.${format === 'jpeg' ? 'jpg' : format}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : max));
}
