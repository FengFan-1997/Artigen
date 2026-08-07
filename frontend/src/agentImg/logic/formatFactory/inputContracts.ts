import { getToolDefinition, type ToolLimits } from '../../domain/toolCatalog';
import type { FormatFactoryToolId } from './types';

type InputKind = 'image' | 'pdf' | 'text' | 'video' | 'word' | 'none';
type DurationScope = 'source' | 'selection' | null;

export type FormatFactoryInputPolicy = {
  accept: string;
  durationScope: DurationScope;
  kind: InputKind;
  limits: ToolLimits;
  multiple: boolean;
  workflowId: string | null;
};

const specs: Record<
  FormatFactoryToolId,
  { accept: string; kind: InputKind; operation: string; durationScope?: DurationScope }
> = {
  webp: { accept: 'image/png,image/jpeg,image/webp', kind: 'image', operation: 'convert' },
  jpeg: { accept: 'image/png,image/jpeg,image/webp', kind: 'image', operation: 'compress' },
  resize: { accept: 'image/png,image/jpeg,image/webp', kind: 'image', operation: 'resize' },
  rotate: { accept: 'image/png,image/jpeg,image/webp', kind: 'image', operation: 'rotate' },
  filter: { accept: 'image/png,image/jpeg,image/webp', kind: 'image', operation: 'filter' },
  watermark: { accept: 'image/png,image/jpeg,image/webp', kind: 'image', operation: 'blur' },
  live: {
    accept: 'video/*',
    kind: 'video',
    operation: 'pick-frame',
    durationScope: 'source'
  },
  pdf: { accept: 'application/pdf', kind: 'pdf', operation: 'pdf-page' },
  pdf2word: { accept: 'application/pdf', kind: 'pdf', operation: 'extract-text-docx' },
  word2pdf: {
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'word',
    operation: 'word-server-faithful'
  },
  txt2pdf: { accept: 'text/plain', kind: 'text', operation: 'txt-local' },
  img2pdf: {
    accept: 'image/png,image/jpeg,image/webp',
    kind: 'image',
    operation: 'images-to-pdf'
  },
  gif: {
    accept: 'video/*',
    kind: 'video',
    operation: 'video-to-gif',
    durationScope: 'selection'
  },
  ico: { accept: 'image/png,image/jpeg,image/webp', kind: 'image', operation: 'contain' },
  'ingredient-list': { accept: '', kind: 'none', operation: 'local-layout' }
};

const emptyLimits: ToolLimits = Object.freeze({
  maxFiles: 0,
  maxFileBytes: 0,
  maxPixels: 0
});

export const getFormatFactoryInputPolicy = (
  toolId: FormatFactoryToolId
): FormatFactoryInputPolicy => {
  const spec = specs[toolId];
  const workflow = getToolDefinition(toolId);
  const catalogLimits = workflow?.limits || emptyLimits;
  const limits = {
    ...catalogLimits,
    ...(workflow?.operationLimits?.[spec.operation] || {})
  };
  return {
    accept: spec.accept,
    durationScope: spec.durationScope || null,
    kind: spec.kind,
    limits,
    multiple: limits.maxFiles > 1,
    workflowId: workflow?.id || null
  };
};

const extension = (file: File) => {
  const match = String(file?.name || '')
    .toLowerCase()
    .match(/(\.[a-z0-9]+)$/);
  return match?.[1] || '';
};

export const isAcceptedFormatFactoryFile = (toolId: FormatFactoryToolId, file: File) => {
  const { kind } = getFormatFactoryInputPolicy(toolId);
  const mimeType = String(file?.type || '').toLowerCase();
  const ext = extension(file);
  if (kind === 'image') {
    return (
      mimeType === 'image/png' ||
      mimeType === 'image/jpeg' ||
      mimeType === 'image/webp' ||
      ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)
    );
  }
  if (kind === 'pdf') return mimeType === 'application/pdf' || ext === '.pdf';
  if (kind === 'word') {
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === '.docx'
    );
  }
  if (kind === 'text') return mimeType.startsWith('text/') || ext === '.txt';
  if (kind === 'video') {
    return (
      mimeType.startsWith('video/') ||
      ['.mp4', '.m4v', '.mov', '.webm', '.ogv', '.ogg'].includes(ext)
    );
  }
  return false;
};

export const validateFormatFactorySelection = (
  toolId: FormatFactoryToolId,
  files: readonly File[]
) => {
  const policy = getFormatFactoryInputPolicy(toolId);
  if (files.length > policy.limits.maxFiles) throw new Error('TOO_MANY_FILES');
  for (const file of files) {
    if (!isAcceptedFormatFactoryFile(toolId, file)) throw new Error('INVALID_FILE_TYPE');
    if (
      policy.limits.maxFileBytes > 0 &&
      Number(file?.size || 0) > policy.limits.maxFileBytes
    ) {
      throw new Error('FILE_TOO_LARGE');
    }
  }
  return policy;
};

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.slice(start, end));

const parsePngDimensions = (bytes: Uint8Array) => {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.byteLength < 24 ||
    !signature.every((value, index) => bytes[index] === value) ||
    ascii(bytes, 12, 16) !== 'IHDR'
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

const parseJpegDimensions = (bytes: Uint8Array) => {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.byteLength) {
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > bytes.byteLength) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.byteLength) break;
    if (jpegStartOfFrameMarkers.has(marker) && length >= 7) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6]
      };
    }
    offset += length;
  }
  return null;
};

const readUint24Le = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

const parseWebpDimensions = (bytes: Uint8Array) => {
  if (
    bytes.byteLength < 30 ||
    ascii(bytes, 0, 4) !== 'RIFF' ||
    ascii(bytes, 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const chunk = ascii(bytes, 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: readUint24Le(bytes, 24) + 1,
      height: readUint24Le(bytes, 27) + 1
    };
  }
  if (
    chunk === 'VP8 ' &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff
    };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)
    };
  }
  return null;
};

export const readFormatFactoryImageDimensions = async (file: File) => {
  const bytes = new Uint8Array(
    await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer()
  );
  const dimensions =
    parsePngDimensions(bytes) || parseJpegDimensions(bytes) || parseWebpDimensions(bytes);
  if (!dimensions?.width || !dimensions?.height) throw new Error('IMAGE_METADATA_UNREADABLE');
  return dimensions;
};

export const validateFormatFactoryFileContents = async (
  toolId: FormatFactoryToolId,
  files: readonly File[]
) => {
  const policy = getFormatFactoryInputPolicy(toolId);
  if (policy.kind === 'pdf') {
    for (const file of files) {
      const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      if (ascii(header, 0, 5) !== '%PDF-') throw new Error('INVALID_FILE_TYPE');
    }
    return [];
  }
  if (policy.kind !== 'image') return [];

  const dimensions: Array<{ width: number; height: number }> = [];
  for (const file of files) {
    const current = await readFormatFactoryImageDimensions(file);
    const pixels = current.width * current.height;
    if (
      !Number.isSafeInteger(pixels) ||
      (policy.limits.maxPixels > 0 && pixels > policy.limits.maxPixels)
    ) {
      throw new Error('IMAGE_PIXEL_LIMIT');
    }
    dimensions.push(current);
  }
  return dimensions;
};

export const validateFormatFactoryVideoMetadata = (
  toolId: FormatFactoryToolId,
  metadata: { width: number; height: number; durationSeconds: number }
) => {
  const policy = getFormatFactoryInputPolicy(toolId);
  const width = Math.max(0, Math.floor(Number(metadata.width) || 0));
  const height = Math.max(0, Math.floor(Number(metadata.height) || 0));
  const pixels = width * height;
  if (!width || !height) throw new Error('VIDEO_DIM_FAIL');
  if (policy.limits.maxPixels > 0 && pixels > policy.limits.maxPixels) {
    throw new Error(toolId === 'gif' ? 'GIF_SOURCE_PIXEL_LIMIT' : 'VIDEO_PIXEL_LIMIT');
  }
  const duration = Number(metadata.durationSeconds);
  if (
    policy.durationScope === 'source' &&
    policy.limits.maxDurationSeconds &&
    Number.isFinite(duration) &&
    duration > policy.limits.maxDurationSeconds
  ) {
    throw new Error('VIDEO_DURATION_LIMIT');
  }
  return { width, height, durationSeconds: duration };
};

export const validateFormatFactorySelectionDuration = (
  toolId: FormatFactoryToolId,
  durationSeconds: number
) => {
  const policy = getFormatFactoryInputPolicy(toolId);
  if (
    policy.durationScope === 'selection' &&
    policy.limits.maxDurationSeconds &&
    Number(durationSeconds) > policy.limits.maxDurationSeconds
  ) {
    throw new Error('VIDEO_DURATION_LIMIT');
  }
};

const formatMegabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));
const formatMegapixels = (pixels: number, lang: 'zh' | 'en') => {
  const value = Math.round(pixels / 1_000_000);
  return lang === 'zh' ? `${value * 100}万像素` : `${value} MP`;
};

export const formatFactoryLimitHint = (
  toolId: FormatFactoryToolId,
  lang: 'zh' | 'en' = 'zh'
) => {
  const policy = getFormatFactoryInputPolicy(toolId);
  const { maxFiles, maxFileBytes, maxPixels, maxDurationSeconds } = policy.limits;
  const parts: string[] = [];
  if (maxFiles > 1) {
    parts.push(lang === 'zh' ? `最多 ${maxFiles} 个` : `up to ${maxFiles} files`);
    parts.push(
      lang === 'zh' ? '总量按设备内存自适应限制' : 'device-adaptive total memory budget'
    );
  }
  if (maxFileBytes > 0) {
    const size = `${formatMegabytes(maxFileBytes)} MB`;
    parts.push(
      lang === 'zh'
        ? `单个最大 ${size}`
        : maxFiles > 1
          ? `${size} each`
          : `max ${size}`
    );
  }
  if (maxPixels > 0) parts.push(formatMegapixels(maxPixels, lang));
  if (maxDurationSeconds) {
    const duration =
      maxDurationSeconds % 60 === 0
        ? lang === 'zh'
          ? `${maxDurationSeconds / 60} 分钟`
          : `${maxDurationSeconds / 60} min`
        : lang === 'zh'
          ? `${maxDurationSeconds} 秒`
          : `${maxDurationSeconds}s`;
    parts.push(
      policy.durationScope === 'selection'
        ? lang === 'zh'
          ? `片段最长 ${duration}`
          : `clip up to ${duration}`
        : lang === 'zh'
          ? `最长 ${duration}`
          : `up to ${duration}`
    );
  }
  return parts.join(' · ');
};
