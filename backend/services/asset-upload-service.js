const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { ApiError } = require('../lib/api-error');
const { getPool } = require('../db/pool');
const assets = require('./asset-storage');
const fileInspection = require('./file-inspection-service');

const SINGLE_PUT_LIMIT = 16 * 1024 * 1024;
const MULTIPART_PART_SIZE = 8 * 1024 * 1024;
const SESSION_TTL_MINUTES = 60;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

const directAssetUploadsEnabled = (env = process.env, adapter = null) => {
  const enabled = /^(1|true)$/i.test(String(env.DIRECT_ASSET_UPLOADS || '').trim());
  const driver = String(env.ASSET_STORAGE_DRIVER || '').trim().toLowerCase();
  return enabled && (adapter?.driver === 's3' || driver === 's3' || driver === 'r2');
};

const assertDirectUploadsAvailable = ({ env = process.env, adapter }) => {
  if (!directAssetUploadsEnabled(env, adapter)) {
    throw new ApiError(503, 'DIRECT_ASSET_UPLOADS_DISABLED', { retryable: false });
  }
  if (!adapter || adapter.driver !== 's3') {
    throw new ApiError(503, 'S3_NOT_CONFIGURED', { retryable: true });
  }
};

const requireIdempotencyKey = (value) => {
  const key = String(value || '').trim();
  if (!IDEMPOTENCY_RE.test(key)) {
    throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY', { field: 'idempotencyKey' });
  }
  return key;
};

const normalizeDeclaredUpload = ({ declaredMime, declaredSize, maxBytes, maxPixels, allowedMimeTypes }) => {
  const mimeType = assets.normalizeMime(declaredMime);
  const byteSize = Number(declaredSize);
  const boundedMaxBytes = Math.max(1, Number(maxBytes || 0));
  if (!mimeType || mimeType.length > 160) {
    throw new ApiError(400, 'INVALID_FILE_TYPE', { field: 'mimeType' });
  }
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new ApiError(400, 'INVALID_FILE_SIZE', { field: 'size' });
  }
  if (byteSize > boundedMaxBytes) {
    throw new ApiError(413, 'FILE_TOO_LARGE', { field: 'size' });
  }
  const allowed = Array.isArray(allowedMimeTypes)
    ? [...new Set(allowedMimeTypes.map(assets.normalizeMime).filter(Boolean))]
    : [];
  if (allowed.length && !allowed.includes(mimeType)) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', { field: 'mimeType' });
  }
  return {
    declaredMime: mimeType,
    declaredSize: byteSize,
    maxBytes: boundedMaxBytes,
    maxPixels: Math.max(0, Number(maxPixels || 0)),
    allowedMimeTypes: allowed
  };
};

const normalizeParts = (value, expectedCount) => {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new ApiError(400, 'INVALID_MULTIPART_PARTS', { field: 'parts' });
  }
  const parts = value.map((part) => ({
    partNumber: Number(part?.partNumber ?? part?.PartNumber),
    etag: String(part?.etag ?? part?.ETag ?? '').trim()
  })).sort((left, right) => left.partNumber - right.partNumber);
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index].partNumber !== index + 1 || !/^"?[A-Za-z0-9+/_=-]{1,200}"?$/.test(parts[index].etag)) {
      throw new ApiError(400, 'INVALID_MULTIPART_PARTS', { field: 'parts' });
    }
  }
  return parts;
};

const assertSessionOwner = (row, ownerUserId) => {
  if (!row || String(row.owner_user_id) !== String(ownerUserId || '')) {
    throw new ApiError(404, 'ASSET_UPLOAD_NOT_FOUND');
  }
};

const assertSessionLive = (row) => {
  if (new Date(row.expires_at).getTime() <= Date.now() || row.status === 'expired') {
    throw new ApiError(410, 'ASSET_UPLOAD_EXPIRED');
  }
  if (['aborted', 'failed'].includes(row.status)) {
    throw new ApiError(409, 'ASSET_UPLOAD_NOT_ACTIVE');
  }
};

const publicSession = (row) => ({
  id: row.id,
  kind: row.upload_kind,
  status: row.status,
  partSize: row.part_size == null ? null : Number(row.part_size),
  size: Number(row.declared_size),
  mimeType: row.declared_mime,
  expiresAt: row.expires_at
});

const loadSession = async ({ pool, sessionId, ownerUserId }) => {
  const selected = await pool.query('SELECT * FROM asset_upload_sessions WHERE id=$1', [sessionId]);
  if (!selected.rowCount) throw new ApiError(404, 'ASSET_UPLOAD_NOT_FOUND');
  const row = selected.rows[0];
  assertSessionOwner(row, ownerUserId);
  return row;
};

const uploadInstructions = async ({ row, adapter }) => {
  const upload = publicSession(row);
  if (row.status === 'complete') return upload;
  if (row.upload_kind === 'single') {
    upload.method = 'PUT';
    upload.url = await adapter.signPut({
      key: row.object_key,
      mimeType: row.declared_mime,
      byteSize: Number(row.declared_size)
    });
    upload.headers = { 'Content-Type': row.declared_mime };
  }
  return upload;
};

const assertIdempotentSessionMatches = (row, input, declared) => {
  if (
    row.tool_id !== input.toolId ||
    row.operation !== input.operation ||
    row.declared_mime !== declared.declaredMime ||
    Number(row.declared_size) !== declared.declaredSize
  ) {
    throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED');
  }
};

const createAssetUploadSession = async (input = {}) => {
  const pool = input.pool || getPool();
  const adapter = input.adapter || assets.getAssetAdapter();
  assertDirectUploadsAvailable({ env: input.env, adapter });
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const declared = normalizeDeclaredUpload(input);
  const ownerUserId = String(input.ownerUserId || '').trim();
  const existing = await pool.query(
    'SELECT * FROM asset_upload_sessions WHERE owner_user_id=$1 AND idempotency_key=$2',
    [ownerUserId, idempotencyKey]
  );
  if (existing.rowCount) {
    const row = existing.rows[0];
    assertIdempotentSessionMatches(row, input, declared);
    if (row.status !== 'complete') assertSessionLive(row);
    return uploadInstructions({ row, adapter });
  }

  const id = crypto.randomUUID();
  const uploadKind = declared.declaredSize < SINGLE_PUT_LIMIT ? 'single' : 'multipart';
  const objectKey = `staging/${ownerUserId}/${id}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);
  const inserted = await pool.query(
    `INSERT INTO asset_upload_sessions
      (id, owner_user_id, idempotency_key, tool_id, operation, object_key, upload_kind,
       declared_mime, declared_size, max_bytes, max_pixels, retention_hours, allowed_mime_types,
       part_size, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING
     RETURNING *`,
    [
      id,
      ownerUserId,
      idempotencyKey,
      String(input.toolId || ''),
      String(input.operation || ''),
      objectKey,
      uploadKind,
      declared.declaredMime,
      declared.declaredSize,
      declared.maxBytes,
      declared.maxPixels,
      Math.max(1, Number(input.retentionHours || 1)),
      declared.allowedMimeTypes,
      uploadKind === 'multipart' ? MULTIPART_PART_SIZE : null,
      expiresAt
    ]
  );
  let row = inserted.rows[0];
  if (!row) {
    const raced = await pool.query(
      'SELECT * FROM asset_upload_sessions WHERE owner_user_id=$1 AND idempotency_key=$2',
      [ownerUserId, idempotencyKey]
    );
    if (!raced.rowCount) throw new ApiError(409, 'ASSET_UPLOAD_CREATE_CONFLICT', { retryable: true });
    row = raced.rows[0];
    assertIdempotentSessionMatches(row, input, declared);
    if (row.status !== 'complete') assertSessionLive(row);
    return uploadInstructions({ row, adapter });
  }
  try {
    if (uploadKind === 'multipart') {
      const providerUploadId = await adapter.createMultipart({
        key: objectKey,
        mimeType: declared.declaredMime
      });
      const updated = await pool.query(
        `UPDATE asset_upload_sessions
            SET provider_upload_id=$2, status='uploading', updated_at=now()
          WHERE id=$1 RETURNING *`,
        [id, providerUploadId]
      );
      row = updated.rows[0];
    }
    return uploadInstructions({ row, adapter });
  } catch (error) {
    await pool.query(
      "UPDATE asset_upload_sessions SET status='failed', error_code=$2, updated_at=now() WHERE id=$1",
      [id, String(error?.code || 'UPLOAD_SESSION_CREATE_FAILED').slice(0, 160)]
    ).catch(() => {});
    throw error;
  }
};

const listUploadedParts = async (input = {}) => {
  const pool = input.pool || getPool();
  const adapter = input.adapter || assets.getAssetAdapter();
  assertDirectUploadsAvailable({ env: input.env, adapter });
  const row = await loadSession({ ...input, pool });
  assertSessionLive(row);
  if (row.upload_kind !== 'multipart' || !row.provider_upload_id) {
    throw new ApiError(409, 'MULTIPART_NOT_AVAILABLE');
  }
  return adapter.listParts({ key: row.object_key, uploadId: row.provider_upload_id });
};

const signUploadPart = async (input = {}) => {
  const pool = input.pool || getPool();
  const adapter = input.adapter || assets.getAssetAdapter();
  assertDirectUploadsAvailable({ env: input.env, adapter });
  const row = await loadSession({ ...input, pool });
  assertSessionLive(row);
  if (row.upload_kind !== 'multipart' || !row.provider_upload_id) {
    throw new ApiError(409, 'MULTIPART_NOT_AVAILABLE');
  }
  const partNumber = Number(input.partNumber);
  const partCount = Math.ceil(Number(row.declared_size) / Number(row.part_size));
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount) {
    throw new ApiError(400, 'INVALID_PART_NUMBER', { field: 'partNumber' });
  }
  const url = await adapter.signPart({
    key: row.object_key,
    uploadId: row.provider_upload_id,
    partNumber
  });
  return { method: 'PUT', url, headers: {} };
};

const inspectStagedObject = async ({ adapter, row }) => {
  const temporaryRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-direct-upload-'));
  const tempPath = path.join(temporaryRoot, 'upload.bin');
  let opened;
  let received = 0;
  const hash = crypto.createHash('sha256');
  try {
    opened = await adapter.openKey(row.object_key);
    const contentLength = Number(opened.contentLength || 0);
    if (contentLength && contentLength !== Number(row.declared_size)) {
      throw new ApiError(400, 'FILE_SIZE_MISMATCH', { field: 'size' });
    }
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > Number(row.max_bytes) || received > Number(row.declared_size)) {
          callback(new ApiError(413, 'FILE_TOO_LARGE', { field: 'size' }));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      }
    });
    await pipeline(assets.toReadable(opened.body), meter, fs.createWriteStream(tempPath, { flags: 'wx' }));
    if (received !== Number(row.declared_size)) {
      throw new ApiError(400, 'FILE_SIZE_MISMATCH', { field: 'size' });
    }
    const verified = await fileInspection.inspectFile({
      tempPath,
      declaredMime: row.declared_mime,
      maxBytes: Number(row.max_bytes),
      maxPixels: Number(row.max_pixels),
      allowedMimeTypes: row.allowed_mime_types
    });
    return {
      tempPath,
      temporaryRoot,
      byteSize: received,
      mimeType: verified.mimeType,
      sha256Hex: hash.digest('hex'),
      width: verified.width,
      height: verified.height
    };
  } catch (error) {
    await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
};

const completeAssetUpload = async (input = {}) => {
  const pool = input.pool || getPool();
  const adapter = input.adapter || assets.getAssetAdapter();
  assertDirectUploadsAvailable({ env: input.env, adapter });
  let row = await loadSession({ ...input, pool });
  if (row.status === 'complete' && row.asset_id) {
    return assets.publicAsset(await assets.getAssetRecord({
      assetId: row.asset_id,
      ownerUserId: input.ownerUserId,
      pool
    }));
  }
  assertSessionLive(row);
  if (!['created', 'uploading', 'verifying'].includes(row.status)) {
    throw new ApiError(409, 'ASSET_UPLOAD_NOT_ACTIVE');
  }
  const recoveringVerification = row.status === 'verifying';
  const claimed = await pool.query(
    `UPDATE asset_upload_sessions
        SET status='verifying', updated_at=now()
      WHERE id=$1 AND owner_user_id=$2 AND status IN ('created','uploading')
      RETURNING *`,
    [row.id, input.ownerUserId]
  );
  if (claimed.rowCount) row = claimed.rows[0];
  else if (!recoveringVerification) {
    throw new ApiError(409, 'ASSET_UPLOAD_VERIFYING', { retryable: true });
  }

  let inspected;
  try {
    let multipartCompletionError = null;
    if (row.upload_kind === 'multipart') {
      const partCount = Math.ceil(Number(row.declared_size) / Number(row.part_size));
      const parts = normalizeParts(input.parts, partCount);
      try {
        await adapter.completeMultipart({
          key: row.object_key,
          uploadId: row.provider_upload_id,
          parts
        });
      } catch (error) {
        // A process can die after S3 commits the multipart object but before
        // the session row is finalized. Verification below is the recovery
        // fence: only an actually readable, valid object is promoted.
        multipartCompletionError = error;
      }
    }
    try {
      inspected = await inspectStagedObject({ adapter, row });
    } catch (error) {
      throw multipartCompletionError || error;
    }
    const retentionHours = Math.max(1, Number(row.retention_hours || 1));
    const asset = await assets.storeAsset({
      pool,
      adapter,
      ownerUserId: input.ownerUserId,
      tempPath: inspected.tempPath,
      sourceKey: row.object_key,
      declaredMime: inspected.mimeType,
      maxBytes: Number(row.max_bytes),
      maxPixels: Number(row.max_pixels),
      allowedMimeTypes: row.allowed_mime_types,
      retentionClass: 'temporary-input',
      expiresAt: new Date(Date.now() + retentionHours * 60 * 60 * 1000),
      metadata: {
        source: 'direct-upload',
        toolId: row.tool_id,
        operation: row.operation,
        uploadSessionId: row.id
      }
    });
    const completed = await pool.query(
      `UPDATE asset_upload_sessions
          SET status='complete', asset_id=$2, completed_at=now(), updated_at=now(), error_code=NULL
        WHERE id=$1 AND owner_user_id=$3
        RETURNING id`,
      [row.id, asset.assetId, input.ownerUserId]
    );
    if (!completed.rowCount) throw new ApiError(409, 'ASSET_UPLOAD_NOT_FOUND');
    await adapter.deleteKey(row.object_key);
    return asset;
  } catch (error) {
    const code = String(error?.code || 'ASSET_UPLOAD_VERIFY_FAILED').slice(0, 160);
    await pool.query(
      "UPDATE asset_upload_sessions SET status='failed', error_code=$2, updated_at=now() WHERE id=$1 AND status <> 'complete'",
      [row.id, code]
    ).catch(() => {});
    await adapter.deleteKey(row.object_key).catch(() => {});
    throw error;
  } finally {
    if (inspected?.temporaryRoot) {
      await fs.promises.rm(inspected.temporaryRoot, { recursive: true, force: true });
    }
  }
};

const cancelAssetUpload = async (input = {}) => {
  const pool = input.pool || getPool();
  const adapter = input.adapter || assets.getAssetAdapter();
  assertDirectUploadsAvailable({ env: input.env, adapter });
  const row = await loadSession({ ...input, pool });
  if (row.status === 'complete') throw new ApiError(409, 'ASSET_UPLOAD_ALREADY_COMPLETE');
  if (row.status === 'aborted') return { id: row.id, status: 'aborted' };
  if (row.upload_kind === 'multipart') {
    await adapter.abortMultipart({ key: row.object_key, uploadId: row.provider_upload_id }).catch(() => {});
  }
  await adapter.deleteKey(row.object_key).catch(() => {});
  await pool.query(
    "UPDATE asset_upload_sessions SET status='aborted', updated_at=now() WHERE id=$1 AND owner_user_id=$2",
    [row.id, input.ownerUserId]
  );
  return { id: row.id, status: 'aborted' };
};

const sweepExpiredUploadSessions = async (input = {}) => {
  const pool = input.pool || getPool();
  const adapter = input.adapter || assets.getAssetAdapter();
  if (adapter.driver !== 's3') return { claimed: 0, cleaned: 0, failed: 0 };
  const claimed = await pool.query(
    `UPDATE asset_upload_sessions
        SET status='expired', updated_at=now()
      WHERE id IN (
        SELECT id FROM asset_upload_sessions
         WHERE status IN ('created','uploading','verifying','failed')
           AND expires_at <= now()
         ORDER BY expires_at
         FOR UPDATE SKIP LOCKED
         LIMIT 100
      )
      RETURNING *`
  );
  const summary = { claimed: claimed.rowCount, cleaned: 0, failed: 0 };
  for (const row of claimed.rows) {
    try {
      if (row.upload_kind === 'multipart') {
        await adapter.abortMultipart({ key: row.object_key, uploadId: row.provider_upload_id }).catch(() => {});
      }
      await adapter.deleteKey(row.object_key).catch(() => {});
      summary.cleaned += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
};

module.exports = {
  MULTIPART_PART_SIZE,
  SINGLE_PUT_LIMIT,
  assertDirectUploadsAvailable,
  cancelAssetUpload,
  completeAssetUpload,
  createAssetUploadSession,
  directAssetUploadsEnabled,
  inspectStagedObject,
  listUploadedParts,
  normalizeDeclaredUpload,
  normalizeParts,
  signUploadPart,
  sweepExpiredUploadSessions
};
