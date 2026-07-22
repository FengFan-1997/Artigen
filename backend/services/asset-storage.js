const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { getPool, isDatabaseConfigured } = require('../db/pool');
const { ApiError } = require('../lib/api-error');
const { MEMORY_DIR } = require('../utils/storage');
const fileInspection = require('./file-inspection-service');

const DEFAULT_MAX_BYTES = 40 * 1024 * 1024;
const RETENTION_CLASSES = new Set([
  'temporary-input',
  'generated-output',
  'editor-transfer',
  'other'
]);

const MIME_ALIASES = new Map([
  ['image/jpg', 'image/jpeg'],
  ['image/pjpeg', 'image/jpeg'],
  ['application/x-zip-compressed', 'application/zip'],
  ['application/x-ico', 'image/x-icon'],
  ['image/vnd.microsoft.icon', 'image/x-icon']
]);

const normalizeMime = (value) => {
  const mime = String(value || '').split(';')[0].trim().toLowerCase();
  return MIME_ALIASES.get(mime) || mime;
};

const startsWithBytes = (buffer, bytes) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < bytes.length) return false;
  return bytes.every((value, index) => buffer[index] === value);
};

const isProbablyText = (buffer) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.includes(0)) return false;
  const text = buffer.toString('utf8');
  return !text.includes('\uFFFD');
};

const detectMagicMime = (buffer, declaredMime = '') => {
  const declared = normalizeMime(declaredMime);
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  const ascii6 = buffer.subarray(0, 6).toString('ascii');
  if (ascii6 === 'GIF87a' || ascii6 === 'GIF89a') return 'image/gif';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (
    startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(buffer, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return declared === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ? declared
      : 'application/zip';
  }
  if (startsWithBytes(buffer, [0x00, 0x00, 0x01, 0x00])) return 'image/x-icon';
  if (startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  if (declared === 'text/plain' && isProbablyText(buffer)) return 'text/plain';
  return '';
};

const validateMagicBytes = (buffer, declaredMime) => {
  const declared = normalizeMime(declaredMime);
  const detected = detectMagicMime(buffer, declared);
  if (!detected) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', { field: 'files' });
  }
  if (
    declared &&
    declared !== 'application/octet-stream' &&
    declared !== detected
  ) {
    throw new ApiError(415, 'FILE_TYPE_MISMATCH', {
      field: 'files',
      details: { declaredMime: declared, detectedMime: detected }
    });
  }
  return detected;
};

const readImageDimensions = (buffer, mimeType) => {
  const mime = normalizeMime(mimeType);
  if (mime === 'image/png' && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mime === 'image/gif' && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mime === 'image/x-icon' && buffer.length >= 8) {
    return { width: buffer[6] || 256, height: buffer[7] || 256 };
  }
  if (mime === 'image/webp' && buffer.length >= 30) {
    const chunk = buffer.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3)
      };
    }
    if (
      chunk === 'VP8 ' &&
      buffer[23] === 0x9d &&
      buffer[24] === 0x01 &&
      buffer[25] === 0x2a
    ) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff
      };
    }
    if (chunk === 'VP8L' && buffer[20] === 0x2f) {
      return {
        width: 1 + (((buffer[22] & 0x3f) << 8) | buffer[21]),
        height: 1 + (((buffer[24] & 0x0f) << 10) | (buffer[23] << 2) | ((buffer[22] & 0xc0) >> 6))
      };
    }
  }
  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) break;
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7)
        };
      }
      offset += 2 + length;
    }
  }
  return { width: null, height: null };
};

const extensionForMime = (mimeType) => ({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/x-icon': '.ico',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'text/plain': '.txt'
}[normalizeMime(mimeType)] || '.bin');

const safeMetadata = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const blocked = /(?:token|secret|signature|password|filename|url|uri)/i;
  const output = {};
  for (const [key, value] of Object.entries(input).slice(0, 30)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key) || blocked.test(key)) continue;
    if (typeof value === 'string') output[key] = value.slice(0, 200);
    else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
    else if (typeof value === 'boolean') output[key] = value;
  }
  return output;
};

class FileAssetAdapter {
  constructor(rootDir = process.env.ASSET_FILE_ROOT || path.join(MEMORY_DIR, 'assets-v2')) {
    this.driver = 'file';
    this.rootDir = path.resolve(rootDir);
  }

  resolveKey(key) {
    const clean = String(key || '').replace(/^\/+/, '');
    if (!clean || clean.includes('..') || !/^[A-Za-z0-9_./-]+$/.test(clean)) {
      throw new ApiError(400, 'INVALID_ASSET_KEY');
    }
    const target = path.resolve(this.rootDir, clean);
    if (target !== this.rootDir && !target.startsWith(`${this.rootDir}${path.sep}`)) {
      throw new ApiError(400, 'INVALID_ASSET_KEY');
    }
    return target;
  }

  keyFromUri(uri) {
    const prefix = 'file://assets/';
    const raw = String(uri || '');
    if (!raw.startsWith(prefix)) throw new ApiError(500, 'INVALID_ASSET_URI');
    return raw.slice(prefix.length);
  }

  uriForKey(key) {
    this.resolveKey(key);
    return `file://assets/${key}`;
  }

  async putFile({ key, filePath }) {
    const target = this.resolveKey(key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    let created = false;
    try {
      await fs.promises.copyFile(filePath, temporary, fs.constants.COPYFILE_EXCL);
      // link() is atomic and, unlike rename(), never replaces an existing
      // content-addressed object written by another process.
      await fs.promises.link(temporary, target);
      created = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    } finally {
      await fs.promises.rm(temporary, { force: true });
    }
    return { uri: this.uriForKey(key), created };
  }

  async replaceFile({ key, filePath }) {
    const target = this.resolveKey(key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.repair-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    try {
      await fs.promises.copyFile(filePath, temporary, fs.constants.COPYFILE_EXCL);
      await fs.promises.rename(temporary, target);
    } finally {
      await fs.promises.rm(temporary, { force: true });
    }
    return { uri: this.uriForKey(key), created: false };
  }

  async putBuffer({ key, buffer }) {
    const target = this.resolveKey(key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    let created = false;
    try {
      await fs.promises.writeFile(target, buffer, { flag: 'wx' });
      created = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    return { uri: this.uriForKey(key), created };
  }

  async replaceBuffer({ key, buffer }) {
    const target = this.resolveKey(key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.repair-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    try {
      await fs.promises.writeFile(temporary, buffer, { flag: 'wx' });
      await fs.promises.rename(temporary, target);
    } finally {
      await fs.promises.rm(temporary, { force: true });
    }
    return { uri: this.uriForKey(key), created: false };
  }

  async open(uri) {
    const target = this.resolveKey(this.keyFromUri(uri));
    const stat = await fs.promises.stat(target).catch(() => null);
    if (!stat || !stat.isFile()) throw new ApiError(404, 'ASSET_NOT_FOUND');
    return { body: fs.createReadStream(target), contentLength: stat.size };
  }

  async delete(uri) {
    await fs.promises.rm(this.resolveKey(this.keyFromUri(uri)), { force: true });
  }
}

class S3AssetAdapter {
  constructor(env = process.env) {
    this.driver = 's3';
    this.bucket = String(env.S3_BUCKET || env.ASSET_S3_BUCKET || env.R2_BUCKET || '').trim();
    if (!this.bucket) throw new ApiError(503, 'S3_NOT_CONFIGURED', { retryable: true });
    let sdk;
    try {
      sdk = require('@aws-sdk/client-s3');
    } catch {
      throw new ApiError(503, 'S3_SDK_NOT_INSTALLED', { retryable: true });
    }
    this.commands = sdk;
    const endpoint = String(env.S3_ENDPOINT || env.ASSET_S3_ENDPOINT || env.R2_ENDPOINT || '').trim();
    const accessKeyId = String(
      env.S3_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || ''
    ).trim();
    const secretAccessKey = String(
      env.S3_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY || ''
    ).trim();
    this.client = new sdk.S3Client({
      region: String(env.S3_REGION || env.AWS_REGION || 'auto').trim(),
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: String(env.S3_FORCE_PATH_STYLE || '').trim() === '1',
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {})
    });
  }

  keyFromUri(uri) {
    const prefix = `s3://${this.bucket}/`;
    const raw = String(uri || '');
    if (!raw.startsWith(prefix)) throw new ApiError(500, 'INVALID_ASSET_URI');
    return raw.slice(prefix.length);
  }

  uriForKey(key) {
    const clean = String(key || '').replace(/^\/+/, '');
    if (!clean || clean.includes('..') || !/^[A-Za-z0-9_./-]+$/.test(clean)) {
      throw new ApiError(400, 'INVALID_ASSET_KEY');
    }
    return `s3://${this.bucket}/${clean}`;
  }

  async putFile({ key, filePath, mimeType, byteSize }) {
    const body = fs.createReadStream(filePath);
    await this.client.send(new this.commands.PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
      ContentLength: byteSize
    }));
    return { uri: this.uriForKey(key), created: true };
  }

  async putBuffer({ key, buffer, mimeType }) {
    await this.client.send(new this.commands.PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ContentLength: buffer.length
    }));
    return { uri: this.uriForKey(key), created: true };
  }

  async signPut({ key, mimeType, byteSize, expiresIn = 15 * 60 }) {
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const command = new this.commands.PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: byteSize
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async createMultipart({ key, mimeType }) {
    const response = await this.client.send(new this.commands.CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType
    }));
    if (!response.UploadId) throw new ApiError(502, 'MULTIPART_CREATE_FAILED', { retryable: true });
    return response.UploadId;
  }

  async signPart({ key, uploadId, partNumber, expiresIn = 15 * 60 }) {
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const command = new this.commands.UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async listParts({ key, uploadId }) {
    const response = await this.client.send(new this.commands.ListPartsCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MaxParts: 1000
    }));
    return (response.Parts || []).map((part) => ({
      partNumber: Number(part.PartNumber),
      etag: String(part.ETag || ''),
      size: Number(part.Size || 0)
    }));
  }

  async completeMultipart({ key, uploadId, parts }) {
    await this.client.send(new this.commands.CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((part) => ({
          ETag: part.etag,
          PartNumber: part.partNumber
        }))
      }
    }));
  }

  async abortMultipart({ key, uploadId }) {
    if (!uploadId) return;
    await this.client.send(new this.commands.AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId
    }));
  }

  async openKey(key) {
    return this.open(this.uriForKey(key));
  }

  async deleteKey(key) {
    return this.delete(this.uriForKey(key));
  }

  async copyKey({ sourceKey, key, mimeType }) {
    await this.client.send(new this.commands.CopyObjectCommand({
      Bucket: this.bucket,
      Key: key,
      CopySource: `${this.bucket}/${sourceKey}`,
      ContentType: mimeType,
      MetadataDirective: 'REPLACE'
    }));
    return { uri: this.uriForKey(key), created: true };
  }

  async replaceFile(input) {
    return this.putFile(input);
  }

  async replaceBuffer(input) {
    return this.putBuffer(input);
  }

  async open(uri) {
    const response = await this.client.send(new this.commands.GetObjectCommand({
      Bucket: this.bucket,
      Key: this.keyFromUri(uri)
    }));
    return {
      body: response.Body,
      contentLength: Number(response.ContentLength || 0) || undefined,
      contentType: response.ContentType
    };
  }

  async delete(uri) {
    await this.client.send(new this.commands.DeleteObjectCommand({
      Bucket: this.bucket,
      Key: this.keyFromUri(uri)
    }));
  }
}

let defaultAdapter;
const getAssetAdapter = () => {
  if (defaultAdapter) return defaultAdapter;
  const driver = String(process.env.ASSET_STORAGE_DRIVER || 'file').trim().toLowerCase();
  if (driver === 'file') defaultAdapter = new FileAssetAdapter();
  else if (driver === 's3' || driver === 'r2') defaultAdapter = new S3AssetAdapter();
  else throw new ApiError(503, 'ASSET_STORAGE_NOT_CONFIGURED', { retryable: true });
  return defaultAdapter;
};

const adapterForRecord = (row, env = process.env) => {
  if (row?.storage_driver === 'file') return new FileAssetAdapter();
  if (row?.storage_driver === 's3') return new S3AssetAdapter(env);
  throw new ApiError(500, 'INVALID_ASSET_STORAGE_DRIVER');
};

const withPoolTransaction = async (pool, callback) => {
  const client = typeof pool?.connect === 'function' ? await pool.connect() : pool;
  if (!client || typeof client.query !== 'function') {
    throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
  }
  const shouldRelease = client !== pool && typeof client.release === 'function';
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    if (shouldRelease) client.release();
  }
};

const advisoryKeyForUri = (uri) => crypto
  .createHash('sha256')
  .update(String(uri || ''))
  .digest()
  .readBigInt64BE(0)
  .toString();

const lockAssetUri = (client, uri) => client.query(
  'SELECT pg_advisory_xact_lock($1::bigint)',
  [advisoryKeyForUri(uri)]
);

const assertAssetOwner = (row, ownerUserId) => {
  if (row.owner_user_id && String(row.owner_user_id) !== String(ownerUserId || '')) {
    throw new ApiError(ownerUserId ? 403 : 401, ownerUserId ? 'FORBIDDEN' : 'LOGIN_REQUIRED');
  }
};

const toReadable = (body) => {
  if (body && typeof body.pipe === 'function') return body;
  if (body && typeof body.transformToWebStream === 'function') {
    return Readable.fromWeb(body.transformToWebStream());
  }
  return Readable.from(body || []);
};

const destroyReadable = (body) => {
  try {
    body?.destroy?.();
  } catch {}
  try {
    const cancelled = body?.cancel?.();
    cancelled?.catch?.(() => {});
  } catch {}
};

const verifyStoredObject = async ({ adapter, uri, sha256, byteSize }) => {
  let opened;
  let readable;
  try {
    opened = await adapter.open(uri);
    const contentLength = Number(opened?.contentLength);
    if (Number.isFinite(contentLength) && contentLength > 0 && contentLength !== byteSize) {
      destroyReadable(opened?.body);
      return false;
    }
    readable = toReadable(opened?.body);
    const hash = crypto.createHash('sha256');
    let received = 0;
    for await (const rawChunk of readable) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      received += chunk.length;
      if (received > byteSize) {
        destroyReadable(readable);
        return false;
      }
      hash.update(chunk);
    }
    const digest = hash.digest();
    return received === byteSize &&
      digest.length === sha256.length &&
      crypto.timingSafeEqual(digest, sha256);
  } catch {
    destroyReadable(readable || opened?.body);
    return false;
  }
};

const writeAssetObject = async ({ adapter, input, key, mimeType, byteSize, replace }) => {
  if (input.sourceKey && typeof adapter.copyKey === 'function') {
    return adapter.copyKey({ sourceKey: input.sourceKey, key, mimeType, byteSize, replace });
  }
  if (Buffer.isBuffer(input.buffer)) {
    const method = replace && typeof adapter.replaceBuffer === 'function'
      ? adapter.replaceBuffer.bind(adapter)
      : adapter.putBuffer?.bind(adapter);
    if (!method) throw new ApiError(500, 'ASSET_ADAPTER_INVALID');
    return method({ key, buffer: input.buffer, mimeType, byteSize });
  }
  const method = replace && typeof adapter.replaceFile === 'function'
    ? adapter.replaceFile.bind(adapter)
    : adapter.putFile?.bind(adapter);
  if (!method) throw new ApiError(500, 'ASSET_ADAPTER_INVALID');
  return method({ key, filePath: input.tempPath, mimeType, byteSize });
};

const publicAsset = (row) => ({
  assetId: row.id,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size || 0),
  width: row.width == null ? null : Number(row.width),
  height: row.height == null ? null : Number(row.height),
  metadata: row.metadata || {},
  expiresAt: row.expires_at || null,
  createdAt: row.created_at
});

const storeAsset = async (input = {}) => {
  if (!input.pool && !isDatabaseConfigured()) {
    throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
  }
  const adapter = input.adapter || getAssetAdapter();
  const maxBytes = Math.max(1, Number(input.maxBytes || DEFAULT_MAX_BYTES));
  let inspected;
  if (Buffer.isBuffer(input.buffer)) {
    inspected = await fileInspection.inspectBuffer({
      buffer: input.buffer,
      declaredMime: input.declaredMime,
      maxBytes,
      maxPixels: input.maxPixels,
      allowedMimeTypes: input.allowedMimeTypes
    });
  } else if (input.tempPath) {
    inspected = await fileInspection.inspectFile({
      tempPath: input.tempPath,
      declaredMime: input.declaredMime,
      maxBytes,
      maxPixels: input.maxPixels,
      allowedMimeTypes: input.allowedMimeTypes
    });
  } else {
    throw new ApiError(400, 'MISSING_FILE', { field: 'files' });
  }
  const { byteSize, mimeType, sha256 } = inspected;
  const dimensions = { width: inspected.width, height: inspected.height };

  const owner = input.ownerUserId ? String(input.ownerUserId) : 'guest';
  const shaHex = sha256.toString('hex');
  const key = `${owner}/${shaHex.slice(0, 2)}/${shaHex}${extensionForMime(mimeType)}`;
  const pool = input.pool || getPool();
  const metadata = safeMetadata(input.metadata);
  const expiresAt = input.expiresAt || null;
  const retentionClass = RETENTION_CLASSES.has(String(input.retentionClass || ''))
    ? String(input.retentionClass)
    : 'other';
  if (typeof adapter.uriForKey !== 'function') {
    throw new ApiError(500, 'ASSET_ADAPTER_INVALID');
  }
  const uri = adapter.uriForKey(key);

  return withPoolTransaction(pool, async (client) => {
    await lockAssetUri(client, uri);
    const selected = await client.query('SELECT * FROM assets WHERE uri=$1 FOR UPDATE', [uri]);
    const existing = selected.rows[0] || null;
    if (existing) {
      const sameDigest = Buffer.isBuffer(existing.sha256) && existing.sha256.equals(sha256);
      if (
        existing.storage_driver !== adapter.driver ||
        existing.mime_type !== mimeType ||
        Number(existing.byte_size) !== byteSize ||
        !sameDigest
      ) {
        throw new ApiError(409, 'ASSET_RECORD_CONFLICT');
      }
      if (
        existing.gc_state === 'active' &&
        await verifyStoredObject({ adapter, uri, sha256, byteSize })
      ) {
        const refreshed = await client.query(
          `UPDATE assets SET
             expires_at = CASE
               WHEN expires_at IS NULL OR $2::timestamptz IS NULL THEN NULL
               ELSE GREATEST(expires_at, $2::timestamptz)
             END,
             retention_class = CASE
               WHEN $4='generated-output' THEN 'generated-output'
               WHEN retention_class='other' THEN $4
               ELSE retention_class
             END,
             delete_requested_at = NULL,
             metadata = metadata || $3::jsonb,
             gc_lease_until = NULL,
             last_gc_error = NULL
           WHERE id=$1
           RETURNING *`,
          [existing.id, expiresAt, JSON.stringify(metadata), retentionClass]
        );
        return publicAsset(refreshed.rows[0]);
      }
      await client.query(
        `UPDATE assets SET
           gc_state='writing',
           gc_lease_until=now() + interval '10 minutes',
           expires_at = CASE
             WHEN expires_at IS NULL OR $2::timestamptz IS NULL THEN NULL
             ELSE GREATEST(expires_at, $2::timestamptz)
           END,
           retention_class = CASE
             WHEN $4='generated-output' THEN 'generated-output'
             WHEN retention_class='other' THEN $4
             ELSE retention_class
           END,
           delete_requested_at=NULL,
           metadata=metadata || $3::jsonb,
           last_gc_error=NULL
         WHERE id=$1`,
        [existing.id, expiresAt, JSON.stringify(metadata), retentionClass]
      );
    } else {
      await client.query(
        `INSERT INTO assets
          (owner_user_id, storage_driver, uri, mime_type, byte_size, width, height,
           sha256, metadata, expires_at, retention_class, gc_state, gc_lease_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'writing',now() + interval '10 minutes')`,
        [
          input.ownerUserId || null,
          adapter.driver,
          uri,
          mimeType,
          byteSize,
          dimensions.width,
          dimensions.height,
          sha256,
          JSON.stringify(metadata),
          expiresAt,
          retentionClass
        ]
      );
    }

    let objectWriteAttempted = false;
    try {
      objectWriteAttempted = true;
      await writeAssetObject({
        adapter,
        input,
        key,
        mimeType,
        byteSize,
        replace: Boolean(existing)
      });
      const verifyAfterWrite = Boolean(existing) || retentionClass === 'generated-output';
      if (
        verifyAfterWrite &&
        !(await verifyStoredObject({ adapter, uri, sha256, byteSize }))
      ) {
        throw new ApiError(502, 'ASSET_WRITE_VERIFICATION_FAILED', { retryable: true });
      }
      const activated = await client.query(
        `UPDATE assets SET
           gc_state='active', gc_lease_until=NULL, gc_attempts=0, last_gc_error=NULL
         WHERE uri=$1 AND gc_state='writing'
         RETURNING *`,
        [uri]
      );
      if (!activated.rowCount) throw new ApiError(409, 'ASSET_WRITE_LOST');
      return publicAsset(activated.rows[0]);
    } catch (error) {
      // A brand-new DB reservation has no legitimate prior owner of this
      // content-addressed object. Remove any partial/uncertain object while
      // the advisory lock is still held, before rolling back the reservation.
      if (!existing && objectWriteAttempted) {
        try {
          await adapter.delete(uri);
        } catch (cleanupError) {
          console.error('Asset write compensation failed', cleanupError?.code || cleanupError?.message || cleanupError);
        }
      }
      throw error;
    }
  });
};

const getAssetRecord = async ({ assetId, ownerUserId, pool = getPool() }) => {
  const result = await pool.query(
    `SELECT * FROM assets
      WHERE id = $1
        AND gc_state = 'active'
        AND delete_requested_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())`,
    [assetId]
  );
  if (!result.rowCount) throw new ApiError(404, 'ASSET_NOT_FOUND');
  const row = result.rows[0];
  assertAssetOwner(row, ownerUserId);
  return row;
};

const openAsset = async (input = {}) => {
  const row = await getAssetRecord(input);
  const adapter = input.adapter || adapterForRecord(row);
  const opened = await adapter.open(row.uri);
  return { record: row, ...opened };
};

const createEditorTransfer = async ({ assetId, ownerUserId, ttlMinutes = 30, pool = getPool() }) => {
  const ttl = Math.max(1, Math.min(24 * 60, Number(ttlMinutes || 30)));
  return withPoolTransaction(pool, async (client) => {
    const selected = await client.query(
      `SELECT * FROM assets
       WHERE id=$1 AND gc_state='active'
         AND delete_requested_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())
       FOR UPDATE`,
      [assetId]
    );
    if (!selected.rowCount) throw new ApiError(404, 'ASSET_NOT_FOUND');
    assertAssetOwner(selected.rows[0], ownerUserId);
    const inserted = await client.query(
      `INSERT INTO editor_transfers (owner_user_id, asset_id, expires_at)
       VALUES ($1,$2,now() + ($3 * interval '1 minute'))
       RETURNING id, asset_id, expires_at`,
      [ownerUserId || null, assetId, ttl]
    );
    await client.query(
      `UPDATE assets SET expires_at = CASE
         WHEN expires_at IS NULL THEN NULL
         ELSE GREATEST(expires_at, $2::timestamptz)
       END,
       retention_class=CASE
         WHEN retention_class='other' THEN 'editor-transfer'
         ELSE retention_class
       END
       WHERE id=$1`,
      [assetId, inserted.rows[0].expires_at]
    );
    return {
      transferId: inserted.rows[0].id,
      assetId: inserted.rows[0].asset_id,
      expiresAt: inserted.rows[0].expires_at
    };
  });
};

const consumeEditorTransfer = async ({ transferId, ownerUserId, pool = getPool() }) => {
  const consumed = await pool.query(
    `UPDATE editor_transfers AS transfer
     SET consumed_at=now()
     FROM assets AS asset
     WHERE transfer.id=$1
       AND transfer.owner_user_id=$2
       AND transfer.asset_id=asset.id
       AND transfer.consumed_at IS NULL
       AND transfer.expires_at > now()
       AND asset.gc_state='active'
       AND (asset.expires_at IS NULL OR asset.expires_at > now())
     RETURNING transfer.id AS transfer_id,
       transfer.asset_id,
       transfer.expires_at,
       asset.mime_type,
       asset.byte_size,
       asset.width,
       asset.height`,
    [transferId, ownerUserId]
  );
  if (!consumed.rowCount) throw new ApiError(404, 'EDITOR_TRANSFER_NOT_AVAILABLE');
  const row = consumed.rows[0];
  return {
    transferId: row.transfer_id,
    assetId: row.asset_id,
    assetUrl: `/api/assets/${encodeURIComponent(row.asset_id)}`,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size || 0),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    expiresAt: row.expires_at
  };
};

const requestAssetDeletion = async ({ assetId, ownerUserId, pool = getPool() }) => {
  const requested = await pool.query(
    `UPDATE assets
        SET delete_requested_at=COALESCE(delete_requested_at,now()),
            expires_at=CASE
              WHEN expires_at IS NULL THEN now()
              ELSE LEAST(expires_at,now())
            END
      WHERE id=$1
        AND owner_user_id=$2
        AND gc_state='active'
      RETURNING id`,
    [assetId, ownerUserId]
  );
  if (!requested.rowCount) throw new ApiError(404, 'ASSET_NOT_FOUND');
  return true;
};

const assertAssetNotInUse = async ({ assetId, ownerUserId, pool = getPool() }) => {
  const state = await pool.query(
    `SELECT asset.id,
       EXISTS(
         SELECT 1 FROM editor_transfers transfer
          WHERE transfer.asset_id=asset.id
            AND transfer.consumed_at IS NULL
            AND transfer.expires_at > now()
       ) AS live_transfer,
       EXISTS(
         SELECT 1
           FROM tool_task_assets link
           JOIN tool_tasks task ON task.id=link.task_id
          WHERE link.asset_id=asset.id
            AND task.status IN ('queued','running')
       ) AS live_task
      FROM assets asset
     WHERE asset.id=$1
       AND asset.owner_user_id=$2
       AND asset.gc_state='active'`,
    [assetId, ownerUserId]
  );
  if (!state.rowCount) throw new ApiError(404, 'ASSET_NOT_FOUND');
  if (state.rows[0].live_transfer || state.rows[0].live_task) {
    throw new ApiError(409, 'ASSET_IN_USE', { retryable: true });
  }
  return true;
};

const deleteOwnedAssetNow = async (input = {}) => {
  const pool = input.pool || getPool();
  await assertAssetNotInUse({
    assetId: input.assetId,
    ownerUserId: input.ownerUserId,
    pool
  });
  await requestAssetDeletion({
    assetId: input.assetId,
    ownerUserId: input.ownerUserId,
    pool
  });
  const claims = await claimExpiredAssets({
    pool,
    assetId: input.assetId,
    limit: 1,
    leaseSeconds: 120
  });
  if (!claims.length) throw new ApiError(409, 'ASSET_DELETE_CONFLICT', { retryable: true });
  const result = await deleteClaimedAsset({
    pool,
    claim: claims[0],
    adapterResolver: input.adapterResolver
  });
  if (result.status === 'retained') {
    throw new ApiError(409, 'ASSET_IN_USE', { retryable: true });
  }
  if (result.status !== 'deleted') {
    throw new ApiError(409, 'ASSET_DELETE_CONFLICT', { retryable: true });
  }
  return { assetId: input.assetId, deleted: true };
};

const claimExpiredAssets = async (input = {}) => {
  const pool = input.pool || getPool();
  const limit = Math.max(1, Math.min(100, Number(input.limit || 20)));
  const leaseSeconds = Math.max(30, Math.min(15 * 60, Number(input.leaseSeconds || 120)));
  const leaseUntil = new Date(Date.now() + leaseSeconds * 1000);
  return withPoolTransaction(pool, async (client) => {
    const claimed = await client.query(
      `WITH candidates AS (
         SELECT id, gc_state AS previous_state
         FROM assets
         WHERE (
           (gc_state='active' AND expires_at IS NOT NULL AND expires_at <= now())
           OR (gc_state='active' AND delete_requested_at IS NOT NULL)
           OR (
             gc_state IN ('writing','deleting')
             AND gc_lease_until IS NOT NULL
             AND gc_lease_until <= now()
           )
         )
         AND ($3::uuid IS NULL OR id=$3::uuid)
         ORDER BY COALESCE(expires_at, gc_lease_until), id
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE assets AS asset SET
         gc_state='deleting',
         gc_lease_until=$2::timestamptz,
         gc_attempts=asset.gc_attempts + 1,
         last_gc_error=NULL
       FROM candidates
       WHERE asset.id=candidates.id
       RETURNING asset.*, candidates.previous_state`,
      [limit, leaseUntil, input.assetId || null]
    );
    return claimed.rows;
  });
};

const safeGcError = (error) => String(error?.code || error?.name || 'ASSET_GC_FAILED')
  .replace(/[^A-Za-z0-9_.:-]/g, '_')
  .slice(0, 160);

const recordGcFailure = async ({ pool, claim, error }) => {
  const attempts = Math.max(1, Number(claim.gc_attempts || 1));
  const retrySeconds = Math.min(60 * 60, 15 * (2 ** Math.min(8, attempts - 1)));
  await pool.query(
    `UPDATE assets SET
       gc_lease_until=now() + ($3 * interval '1 second'),
       last_gc_error=$4
     WHERE id=$1
       AND gc_state='deleting'
       AND gc_lease_until=$2::timestamptz`,
    [claim.id, claim.gc_lease_until, retrySeconds, safeGcError(error)]
  );
};

const deleteClaimedAsset = async (input = {}) => {
  const { claim } = input;
  const pool = input.pool || getPool();
  const resolveAdapter = input.adapterResolver || adapterForRecord;
  return withPoolTransaction(pool, async (client) => {
    await lockAssetUri(client, claim.uri);
    const selected = await client.query(
      `SELECT *, (expires_at > now()) AS expires_live FROM assets
       WHERE id=$1
         AND gc_state='deleting'
         AND gc_lease_until=$2::timestamptz
       FOR UPDATE`,
      [claim.id, claim.gc_lease_until]
    );
    if (!selected.rowCount) return { status: 'skipped' };
    const row = selected.rows[0];

    // Reuploads take the same advisory lock and restore active before this
    // check. Never delete an object whose retention has just been extended.
    if (claim.previous_state === 'active' && (!row.expires_at || row.expires_live)) {
      await client.query(
        `UPDATE assets SET gc_state='active', gc_lease_until=NULL
         WHERE id=$1`,
        [row.id]
      );
      return { status: 'skipped' };
    }

    await client.query(
      `DELETE FROM editor_transfers
       WHERE asset_id=$1 AND (expires_at <= now() OR consumed_at IS NOT NULL)`,
      [row.id]
    );
    await client.query(
      `DELETE FROM tool_task_assets AS link
       USING tool_tasks AS task
       WHERE link.asset_id=$1
         AND link.task_id=task.id
         AND task.status IN ('success','failed','cancelled')`,
      [row.id]
    );

    const references = await client.query(
      `SELECT
         EXISTS(
           SELECT 1 FROM editor_transfers
           WHERE asset_id=$1 AND consumed_at IS NULL AND expires_at > now()
         ) AS live_transfer,
         (SELECT max(expires_at) FROM editor_transfers
           WHERE asset_id=$1 AND consumed_at IS NULL AND expires_at > now()) AS transfer_until,
         EXISTS(
           SELECT 1
           FROM tool_task_assets AS link
           JOIN tool_tasks AS task ON task.id=link.task_id
           WHERE link.asset_id=$1 AND task.status IN ('queued','running')
         ) AS live_task`,
      [row.id]
    );
    const reference = references.rows[0] || {};
    if (reference.live_transfer || reference.live_task) {
      await client.query(
        `UPDATE assets SET
           gc_state='active',
           gc_lease_until=NULL,
           expires_at=CASE
             WHEN expires_at IS NULL THEN NULL
             ELSE GREATEST(
               expires_at,
               now() + interval '15 minutes',
               COALESCE($2::timestamptz, now())
             )
           END,
           last_gc_error='ASSET_STILL_REFERENCED'
         WHERE id=$1`,
        [row.id, reference.transfer_until || null]
      );
      return { status: 'retained' };
    }

    // Any remaining link is an invariant violation. Fail closed and retry;
    // never bypass a RESTRICT foreign key with a broad/cascading delete.
    const dangling = await client.query(
      `SELECT EXISTS(SELECT 1 FROM tool_task_assets WHERE asset_id=$1) AS task_link,
              EXISTS(SELECT 1 FROM editor_transfers WHERE asset_id=$1) AS transfer_link`,
      [row.id]
    );
    if (dangling.rows[0]?.task_link || dangling.rows[0]?.transfer_link) {
      throw new ApiError(409, 'ASSET_STILL_REFERENCED', { retryable: true });
    }

    const adapter = resolveAdapter(row);
    await adapter.delete(row.uri);
    const removed = await client.query(
      `DELETE FROM assets
       WHERE id=$1
         AND gc_state='deleting'
         AND gc_lease_until=$2::timestamptz`,
      [row.id, claim.gc_lease_until]
    );
    if (!removed.rowCount) throw new ApiError(409, 'ASSET_GC_LEASE_LOST', { retryable: true });
    return { status: 'deleted' };
  });
};

const sweepExpiredAssets = async (input = {}) => {
  if (!input.pool && !isDatabaseConfigured()) {
    return { claimed: 0, deleted: 0, retained: 0, skipped: 0, failed: 0 };
  }
  const pool = input.pool || getPool();
  const claims = await claimExpiredAssets({
    pool,
    limit: input.limit,
    leaseSeconds: input.leaseSeconds,
    assetId: input.assetId
  });
  const summary = { claimed: claims.length, deleted: 0, retained: 0, skipped: 0, failed: 0 };
  for (const claim of claims) {
    try {
      const result = await deleteClaimedAsset({
        pool,
        claim,
        adapterResolver: input.adapterResolver
      });
      summary[result.status] += 1;
    } catch (error) {
      summary.failed += 1;
      try {
        await recordGcFailure({ pool, claim, error });
      } catch (recordError) {
        console.error('Asset GC retry state failed', recordError?.code || recordError?.message || recordError);
      }
    }
  }
  return summary;
};

const fileInventoryCursors = new Map();

const listFileInventory = async (rootDir, maxEntries = 100_000) => {
  const root = path.resolve(rootDir);
  const output = [];
  const pending = [''];
  while (pending.length && output.length < maxEntries) {
    const relativeDir = pending.pop();
    const absoluteDir = path.join(root, relativeDir);
    let entries;
    try {
      entries = await fs.promises.readdir(absoluteDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const relative = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) pending.push(relative);
      else if (entry.isFile()) output.push(relative.split(path.sep).join('/'));
      if (output.length >= maxEntries) break;
    }
  }
  return output.sort();
};

const sweepOrphanedFileAssets = async (input = {}) => {
  if (!input.pool && !isDatabaseConfigured()) {
    return { scanned: 0, candidates: 0, deleted: 0, retained: 0, skipped: true };
  }
  const adapter = input.adapter || getAssetAdapter();
  if (!(adapter instanceof FileAssetAdapter) && adapter.driver !== 'file') {
    return { scanned: 0, candidates: 0, deleted: 0, retained: 0, skipped: true };
  }
  const pool = input.pool || getPool();
  const graceMs = Math.max(60_000, Number(input.graceMs || 60 * 60 * 1000));
  const scanLimit = Math.max(100, Math.min(10_000, Number(input.scanLimit || 2000)));
  const deleteLimit = Math.max(1, Math.min(500, Number(input.deleteLimit || 100)));
  const inventory = await listFileInventory(adapter.rootDir, Number(input.maxEntries || 100_000));
  if (!inventory.length) {
    return { scanned: 0, candidates: 0, deleted: 0, retained: 0, skipped: false };
  }

  const cursorKey = path.resolve(adapter.rootDir);
  const previousCursor = fileInventoryCursors.get(cursorKey) || '';
  const afterCursor = inventory.findIndex((key) => key > previousCursor);
  const start = afterCursor >= 0 ? afterCursor : 0;
  const ordered = [...inventory.slice(start), ...inventory.slice(0, start)].slice(0, scanLimit);
  fileInventoryCursors.set(cursorKey, ordered.at(-1) || previousCursor);

  const cutoff = Date.now() - graceMs;
  const candidates = [];
  for (const key of ordered) {
    const target = adapter.resolveKey(key);
    const stat = await fs.promises.stat(target).catch(() => null);
    if (stat?.isFile() && stat.mtimeMs <= cutoff) {
      candidates.push({ key, uri: adapter.uriForKey(key) });
    }
  }
  if (!candidates.length) {
    return { scanned: ordered.length, candidates: 0, deleted: 0, retained: 0, skipped: false };
  }
  const known = await pool.query(
    'SELECT uri FROM assets WHERE uri = ANY($1::text[])',
    [candidates.map((candidate) => candidate.uri)]
  );
  const registered = new Set(known.rows.map((row) => String(row.uri)));
  const orphans = candidates.filter((candidate) => !registered.has(candidate.uri)).slice(0, deleteLimit);
  let deleted = 0;
  let retained = candidates.length - orphans.length;
  for (const candidate of orphans) {
    const result = await withPoolTransaction(pool, async (client) => {
      await lockAssetUri(client, candidate.uri);
      const exists = await client.query('SELECT 1 FROM assets WHERE uri=$1 LIMIT 1', [candidate.uri]);
      if (exists.rowCount) return 'retained';
      const stat = await fs.promises.stat(adapter.resolveKey(candidate.key)).catch(() => null);
      if (!stat?.isFile() || stat.mtimeMs > cutoff) return 'retained';
      await adapter.delete(candidate.uri);
      return 'deleted';
    });
    if (result === 'deleted') deleted += 1;
    else retained += 1;
  }
  return {
    scanned: ordered.length,
    candidates: candidates.length,
    deleted,
    retained,
    skipped: false
  };
};

module.exports = {
  FileAssetAdapter,
  S3AssetAdapter,
  adapterForRecord,
  assertAssetNotInUse,
  claimExpiredAssets,
  consumeEditorTransfer,
  createEditorTransfer,
  deleteOwnedAssetNow,
  deleteClaimedAsset,
  detectMagicMime,
  getAssetAdapter,
  getAssetRecord,
  normalizeMime,
  openAsset,
  publicAsset,
  readImageDimensions,
  requestAssetDeletion,
  RETENTION_CLASSES,
  safeMetadata,
  storeAsset,
  sweepExpiredAssets,
  sweepOrphanedFileAssets,
  toReadable,
  validateMagicBytes,
  verifyStoredObject,
  withPoolTransaction
};
