const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { CreateBucketCommand } = require('@aws-sdk/client-s3');

const { getPool } = require('../db/pool');
const { S3AssetAdapter } = require('../services/asset-storage');
const {
  cancelAssetUpload,
  completeAssetUpload,
  createAssetUploadSession,
  listUploadedParts,
  signUploadPart
} = require('../services/asset-upload-service');

const hasMinio = Boolean(
  String(process.env.MINIO_TEST_ENDPOINT || '').trim() &&
  String(process.env.DATABASE_URL || '').trim()
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av9Z5AAAAABJRU5ErkJggg==',
  'base64'
);

const createUser = async () => {
  const legacyId = `upload_s3_${crypto.randomUUID()}`;
  const inserted = await getPool().query(
    `INSERT INTO users (legacy_user_id, username, display_name)
     VALUES ($1::text,$1::citext,$1::text) RETURNING id`,
    [legacyId]
  );
  return inserted.rows[0].id;
};

const sessionInput = ({ adapter, ownerUserId, size, mimeType = 'image/png', suffix }) => ({
  pool: getPool(),
  adapter,
  env: { DIRECT_ASSET_UPLOADS: '1' },
  ownerUserId,
  idempotencyKey: `minio:${suffix}:${crypto.randomUUID()}`,
  toolId: 'old-photo',
  operation: 'enhance',
  declaredMime: mimeType,
  declaredSize: size,
  maxBytes: 40 * 1024 * 1024,
  maxPixels: 32_000_000,
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  retentionHours: 1
});

const put = async (url, body, headers = {}) => {
  const response = await fetch(url, { method: 'PUT', headers, body });
  assert.equal(response.ok, true, `S3 PUT failed with ${response.status}`);
  return response;
};

test('MinIO exercises single, multipart, resume, cancel, authorization and validation fences', {
  skip: !hasMinio,
  timeout: 120_000
}, async () => {
  const env = {
    ASSET_STORAGE_DRIVER: 's3',
    S3_ENDPOINT: process.env.MINIO_TEST_ENDPOINT,
    S3_BUCKET: process.env.MINIO_TEST_BUCKET || 'artigen-ci',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: process.env.MINIO_ROOT_USER || 'artigen-minio',
    S3_SECRET_ACCESS_KEY: process.env.MINIO_ROOT_PASSWORD || 'artigen-minio-secret',
    S3_FORCE_PATH_STYLE: '1'
  };
  const adapter = new S3AssetAdapter(env);
  await adapter.client.send(new CreateBucketCommand({ Bucket: adapter.bucket })).catch((error) => {
    if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(error?.name)) throw error;
  });
  const ownerUserId = await createUser();
  const foreignUserId = await createUser();

  const single = await createAssetUploadSession(sessionInput({
    adapter,
    ownerUserId,
    size: PNG.length,
    suffix: 'single'
  }));
  await put(single.url, PNG, single.headers);
  const singleAsset = await completeAssetUpload({
    pool: getPool(), adapter, env: { DIRECT_ASSET_UPLOADS: '1' }, ownerUserId, sessionId: single.id
  });
  assert.equal(singleAsset.mimeType, 'image/png');
  assert.deepEqual([singleAsset.width, singleAsset.height], [1, 1]);
  const replay = await completeAssetUpload({
    pool: getPool(), adapter, env: { DIRECT_ASSET_UPLOADS: '1' }, ownerUserId, sessionId: single.id
  });
  assert.equal(replay.assetId, singleAsset.assetId);

  await assert.rejects(listUploadedParts({
    pool: getPool(),
    adapter,
    env: { DIRECT_ASSET_UPLOADS: '1' },
    ownerUserId: foreignUserId,
    sessionId: single.id
  }), { code: 'ASSET_UPLOAD_NOT_FOUND' });

  const duplicate = await createAssetUploadSession(sessionInput({
    adapter,
    ownerUserId,
    size: PNG.length,
    suffix: 'duplicate'
  }));
  await put(duplicate.url, PNG, duplicate.headers);
  const duplicateAsset = await completeAssetUpload({
    pool: getPool(), adapter, env: { DIRECT_ASSET_UPLOADS: '1' }, ownerUserId, sessionId: duplicate.id
  });
  assert.equal(duplicateAsset.assetId, singleAsset.assetId);

  const spoof = await createAssetUploadSession(sessionInput({
    adapter,
    ownerUserId,
    size: PNG.length,
    mimeType: 'image/jpeg',
    suffix: 'spoof'
  }));
  await put(spoof.url, PNG, spoof.headers);
  await assert.rejects(completeAssetUpload({
    pool: getPool(), adapter, env: { DIRECT_ASSET_UPLOADS: '1' }, ownerUserId, sessionId: spoof.id
  }), { code: 'FILE_TYPE_MISMATCH' });

  const multipartBytes = Buffer.alloc(16 * 1024 * 1024);
  PNG.copy(multipartBytes);
  const multipart = await createAssetUploadSession(sessionInput({
    adapter,
    ownerUserId,
    size: multipartBytes.length,
    suffix: 'multipart'
  }));
  assert.equal(multipart.kind, 'multipart');
  const completedParts = [];
  for (let partNumber = 1; partNumber <= 2; partNumber += 1) {
    const signed = await signUploadPart({
      pool: getPool(),
      adapter,
      env: { DIRECT_ASSET_UPLOADS: '1' },
      ownerUserId,
      sessionId: multipart.id,
      partNumber
    });
    const start = (partNumber - 1) * multipart.partSize;
    const response = await put(signed.url, multipartBytes.subarray(start, start + multipart.partSize));
    completedParts.push({ partNumber, etag: response.headers.get('etag') });
  }
  const resumed = await listUploadedParts({
    pool: getPool(), adapter, env: { DIRECT_ASSET_UPLOADS: '1' }, ownerUserId, sessionId: multipart.id
  });
  assert.deepEqual(resumed.map((part) => part.partNumber), [1, 2]);
  const multipartAsset = await completeAssetUpload({
    pool: getPool(),
    adapter,
    env: { DIRECT_ASSET_UPLOADS: '1' },
    ownerUserId,
    sessionId: multipart.id,
    parts: completedParts
  });
  assert.equal(multipartAsset.byteSize, multipartBytes.length);
  assert.equal(multipartAsset.mimeType, 'image/png');

  const cancelled = await createAssetUploadSession(sessionInput({
    adapter,
    ownerUserId,
    size: multipartBytes.length,
    suffix: 'cancel'
  }));
  assert.deepEqual(await cancelAssetUpload({
    pool: getPool(), adapter, env: { DIRECT_ASSET_UPLOADS: '1' }, ownerUserId, sessionId: cancelled.id
  }), { id: cancelled.id, status: 'aborted' });
});
