const { ApiError } = require('../lib/api-error');

const INPUT_EXTENSIONS = Object.freeze({
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'text/markdown': '.md',
  'text/plain': '.txt'
});
const MAX_INPUT_ASSET_BYTES = 40 * 1024 * 1024;
const MAX_RUN_INPUT_ASSETS = 40;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeInputAttachments = (assetIds, assetNames) => {
  if (assetIds == null) assetIds = [];
  if (!Array.isArray(assetIds) || assetIds.length > 10 ||
      assetIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    throw new ApiError(400, 'AGENT_ASSET_IDS_INVALID', { field: 'assetIds' });
  }
  const ids = [...new Set(assetIds.map((id) => id.toLowerCase()))];
  if (assetNames != null && (typeof assetNames !== 'object' || Array.isArray(assetNames) ||
      Object.keys(assetNames).some((id) => !ids.includes(id.toLowerCase())))) {
    throw new ApiError(400, 'AGENT_ASSET_NAMES_INVALID', { field: 'assetNames' });
  }
  const names = {};
  for (const [id, value] of Object.entries(assetNames || {})) {
    if (typeof value !== 'string' || value.length > 1000) {
      throw new ApiError(400, 'AGENT_ASSET_NAMES_INVALID', { field: 'assetNames' });
    }
    // Display names are untrusted content, never sandbox paths or log fields.
    const name = value.split(/[\\/]/).at(-1).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 240);
    if (name) names[id.toLowerCase()] = name;
  }
  return { assetIds: ids, assetNames: names };
};

const attachmentMetadata = (record, filename, index = 0) => {
  const mimeType = String(record.mime_type || '').toLowerCase();
  const byteSize = Number(record.byte_size);
  if (!INPUT_EXTENSIONS[mimeType]) throw new ApiError(415, 'AGENT_INPUT_ASSET_TYPE_INVALID');
  if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > MAX_INPUT_ASSET_BYTES) {
    throw new ApiError(413, 'AGENT_INPUT_ASSET_TOO_LARGE');
  }
  return {
    assetId: record.id,
    filename: filename || `attachment-${index + 1}${INPUT_EXTENSIONS[mimeType]}`,
    mimeType,
    byteSize
  };
};

module.exports = { INPUT_EXTENSIONS, MAX_INPUT_ASSET_BYTES, MAX_RUN_INPUT_ASSETS, normalizeInputAttachments, attachmentMetadata };
