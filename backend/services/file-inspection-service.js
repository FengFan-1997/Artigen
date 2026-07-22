const crypto = require('crypto');
const fs = require('fs');
const { pipeline } = require('stream/promises');
const sharp = require('sharp');
const { ApiError } = require('../lib/api-error');

const MIME_ALIASES = new Map([
  ['image/jpg', 'image/jpeg'],
  ['image/pjpeg', 'image/jpeg'],
  ['application/x-zip-compressed', 'application/zip'],
  ['application/x-ico', 'image/x-icon'],
  ['image/vnd.microsoft.icon', 'image/x-icon']
]);

let fileTypePromise;
const loadFileType = () => {
  if (!fileTypePromise) fileTypePromise = import('file-type');
  return fileTypePromise;
};

const normalizeMime = (value) => {
  const mime = String(value || '').split(';')[0].trim().toLowerCase();
  return MIME_ALIASES.get(mime) || mime;
};

const isUtf8Text = (buffer) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.includes(0)) return false;
  return !buffer.toString('utf8').includes('\uFFFD');
};

const orientedDimensions = (metadata) => {
  const rotated = [5, 6, 7, 8].includes(Number(metadata.orientation));
  return {
    width: Number(rotated ? metadata.height : metadata.width) || null,
    height: Number(rotated ? metadata.width : metadata.height) || null
  };
};

const imageMetadata = async ({ source, maxPixels }) => {
  let metadata;
  try {
    metadata = await sharp(source, {
      failOn: 'warning',
      limitInputPixels: Number(maxPixels) > 0 ? Number(maxPixels) : true,
      sequentialRead: true
    }).metadata();
  } catch (error) {
    if (/pixel limit|input image exceeds/i.test(String(error?.message || ''))) {
      throw new ApiError(413, 'PIXEL_LIMIT_EXCEEDED', { field: 'files' });
    }
    throw new ApiError(422, 'IMAGE_METADATA_INVALID', { field: 'files' });
  }
  const dimensions = orientedDimensions(metadata);
  if (!dimensions.width || !dimensions.height) {
    throw new ApiError(422, 'IMAGE_DIMENSIONS_UNAVAILABLE', { field: 'files' });
  }
  if (
    Number(maxPixels) > 0 &&
    dimensions.width * dimensions.height > Number(maxPixels)
  ) {
    throw new ApiError(413, 'PIXEL_LIMIT_EXCEEDED', { field: 'files' });
  }
  return dimensions;
};

const assertDetectedMime = ({ detectedMime, declaredMime, allowedMimeTypes }) => {
  const detected = normalizeMime(detectedMime);
  const declared = normalizeMime(declaredMime);
  if (!detected) throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', { field: 'files' });
  if (declared && declared !== 'application/octet-stream' && declared !== detected) {
    throw new ApiError(415, 'FILE_TYPE_MISMATCH', {
      field: 'files',
      details: { declaredMime: declared, detectedMime: detected }
    });
  }
  const allowed = Array.isArray(allowedMimeTypes)
    ? allowedMimeTypes.map(normalizeMime).filter(Boolean)
    : [];
  if (allowed.length && !allowed.includes(detected)) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', { field: 'files' });
  }
  return detected;
};

const inspectBuffer = async (input = {}) => {
  const buffer = input.buffer;
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new ApiError(400, 'EMPTY_FILE', { field: 'files' });
  }
  const maxBytes = Math.max(1, Number(input.maxBytes || buffer.length));
  if (buffer.length > maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', { field: 'files' });
  const { fileTypeFromBuffer } = await loadFileType();
  const result = await fileTypeFromBuffer(buffer);
  const textFallback = !result && normalizeMime(input.declaredMime) === 'text/plain' && isUtf8Text(buffer);
  const mimeType = assertDetectedMime({
    detectedMime: textFallback ? 'text/plain' : result?.mime,
    declaredMime: input.declaredMime,
    allowedMimeTypes: input.allowedMimeTypes
  });
  const dimensions = mimeType.startsWith('image/')
    ? await imageMetadata({ source: buffer, maxPixels: input.maxPixels })
    : { width: null, height: null };
  return {
    byteSize: buffer.length,
    mimeType,
    sha256: crypto.createHash('sha256').update(buffer).digest(),
    ...dimensions
  };
};

const inspectFile = async (input = {}) => {
  const stat = await fs.promises.stat(input.tempPath).catch(() => null);
  if (!stat?.isFile()) throw new ApiError(400, 'MISSING_FILE', { field: 'files' });
  if (stat.size <= 0) throw new ApiError(400, 'EMPTY_FILE', { field: 'files' });
  const maxBytes = Math.max(1, Number(input.maxBytes || stat.size));
  if (stat.size > maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', { field: 'files' });
  const { fileTypeFromFile } = await loadFileType();
  const result = await fileTypeFromFile(input.tempPath);
  let textFallback = false;
  if (!result && normalizeMime(input.declaredMime) === 'text/plain') {
    const sample = await fs.promises.readFile(input.tempPath);
    textFallback = isUtf8Text(sample);
  }
  const mimeType = assertDetectedMime({
    detectedMime: textFallback ? 'text/plain' : result?.mime,
    declaredMime: input.declaredMime,
    allowedMimeTypes: input.allowedMimeTypes
  });
  const dimensions = mimeType.startsWith('image/')
    ? await imageMetadata({ source: input.tempPath, maxPixels: input.maxPixels })
    : { width: null, height: null };
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(input.tempPath), hash);
  return {
    byteSize: stat.size,
    mimeType,
    sha256: hash.digest(),
    ...dimensions
  };
};

module.exports = {
  assertDetectedMime,
  inspectBuffer,
  inspectFile,
  normalizeMime,
  orientedDimensions
};
