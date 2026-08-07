const assert = require('node:assert/strict');
const { Readable } = require('stream');
const test = require('node:test');
const sharp = require('sharp');

const {
  MULTIPART_PART_SIZE,
  SINGLE_PUT_LIMIT,
  createAssetUploadSession,
  directAssetUploadsEnabled,
  inspectStagedObject,
  normalizeParts
} = require('../services/asset-upload-service');

const OWNER_ID = '22222222-2222-4222-8222-222222222222';

const createSessionPool = () => {
  const rows = [];
  return {
    rows,
    async query(sql, params) {
      if (/^SELECT \*/.test(sql)) {
        const row = rows.find((entry) => entry.owner_user_id === params[0] && entry.idempotency_key === params[1]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (/INSERT INTO asset_upload_sessions/.test(sql)) {
        const row = {
          id: params[0],
          owner_user_id: params[1],
          idempotency_key: params[2],
          tool_id: params[3],
          operation: params[4],
          object_key: params[5],
          upload_kind: params[6],
          declared_mime: params[7],
          declared_size: params[8],
          max_bytes: params[9],
          max_pixels: params[10],
          retention_hours: params[11],
          allowed_mime_types: params[12],
          part_size: params[13],
          expires_at: params[14],
          status: 'created'
        };
        rows.push(row);
        return { rowCount: 1, rows: [row] };
      }
      if (/provider_upload_id/.test(sql)) {
        const row = rows.find((entry) => entry.id === params[0]);
        Object.assign(row, { provider_upload_id: params[1], status: 'uploading' });
        return { rowCount: 1, rows: [row] };
      }
      if (/status='failed'/.test(sql)) return { rowCount: 1, rows: [] };
      throw new Error(`UNEXPECTED_QUERY: ${sql}`);
    }
  };
};

test('direct upload rollout requires both the feature flag and shared object storage', () => {
  assert.equal(directAssetUploadsEnabled({ DIRECT_ASSET_UPLOADS: '1' }, { driver: 'file' }), false);
  assert.equal(directAssetUploadsEnabled({ DIRECT_ASSET_UPLOADS: '0', ASSET_STORAGE_DRIVER: 's3' }), false);
  assert.equal(directAssetUploadsEnabled({ DIRECT_ASSET_UPLOADS: '1' }, { driver: 's3' }), true);
});

test('upload sessions choose single PUT below 16 MiB and 8 MiB multipart chunks above it', async () => {
  const pool = createSessionPool();
  const adapter = {
    driver: 's3',
    async signPut(input) {
      this.signed = input;
      return 'https://storage.invalid/signed-put';
    },
    async createMultipart(input) {
      this.multipart = input;
      return 'provider-upload-id';
    }
  };
  const common = {
    pool,
    adapter,
    env: { DIRECT_ASSET_UPLOADS: '1' },
    ownerUserId: OWNER_ID,
    toolId: 'old-photo',
    operation: 'enhance',
    declaredMime: 'image/png',
    maxBytes: 40 * 1024 * 1024,
    maxPixels: 32_000_000,
    allowedMimeTypes: ['image/png']
  };
  const single = await createAssetUploadSession({
    ...common,
    idempotencyKey: 'upload:single:1234',
    declaredSize: SINGLE_PUT_LIMIT - 1
  });
  assert.equal(single.kind, 'single');
  assert.equal(single.method, 'PUT');
  assert.equal(single.url, 'https://storage.invalid/signed-put');

  const multipart = await createAssetUploadSession({
    ...common,
    idempotencyKey: 'upload:multipart:1234',
    declaredSize: SINGLE_PUT_LIMIT
  });
  assert.equal(multipart.kind, 'multipart');
  assert.equal(multipart.partSize, MULTIPART_PART_SIZE);
  assert.equal(adapter.multipart.mimeType, 'image/png');
});

test('idempotency replay preserves the session and rejects a changed file identity', async () => {
  const pool = createSessionPool();
  const adapter = {
    driver: 's3',
    signPut: async () => 'https://storage.invalid/replay'
  };
  const input = {
    pool,
    adapter,
    env: { DIRECT_ASSET_UPLOADS: '1' },
    ownerUserId: OWNER_ID,
    idempotencyKey: 'upload:replay:1234',
    toolId: 'old-photo',
    operation: 'enhance',
    declaredMime: 'image/png',
    declaredSize: 1024,
    maxBytes: 2048,
    maxPixels: 10_000,
    allowedMimeTypes: ['image/png']
  };
  const first = await createAssetUploadSession(input);
  const replay = await createAssetUploadSession(input);
  assert.equal(replay.id, first.id);
  await assert.rejects(
    createAssetUploadSession({ ...input, declaredSize: 1025 }),
    { code: 'IDEMPOTENCY_KEY_REUSED' }
  );
});

test('file-type and sharp validate streamed content, dimensions and pixel limits', async () => {
  const png = await sharp({
    create: { width: 20, height: 10, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } }
  }).png().toBuffer();
  const adapter = {
    async openKey() {
      return { body: Readable.from(png), contentLength: png.length };
    }
  };
  const baseRow = {
    object_key: 'staging/test',
    declared_mime: 'image/png',
    declared_size: png.length,
    max_bytes: png.length,
    max_pixels: 500,
    allowed_mime_types: ['image/png']
  };
  const inspected = await inspectStagedObject({ adapter, row: baseRow });
  try {
    assert.equal(inspected.mimeType, 'image/png');
    assert.equal(inspected.width, 20);
    assert.equal(inspected.height, 10);
    assert.match(inspected.sha256Hex, /^[a-f0-9]{64}$/);
  } finally {
    await require('fs').promises.rm(inspected.temporaryRoot, { recursive: true, force: true });
  }
  await assert.rejects(
    inspectStagedObject({ adapter, row: { ...baseRow, declared_mime: 'image/jpeg' } }),
    { code: 'FILE_TYPE_MISMATCH' }
  );
  await assert.rejects(
    inspectStagedObject({ adapter, row: { ...baseRow, max_pixels: 100 } }),
    { code: 'PIXEL_LIMIT_EXCEEDED' }
  );
});

test('multipart completion requires exactly one ordered ETag per expected part', () => {
  assert.deepEqual(normalizeParts([
    { PartNumber: 2, ETag: '"etag-two"' },
    { PartNumber: 1, ETag: '"etag-one"' }
  ], 2), [
    { partNumber: 1, etag: '"etag-one"' },
    { partNumber: 2, etag: '"etag-two"' }
  ]);
  assert.throws(() => normalizeParts([{ partNumber: 2, etag: 'etag' }], 1), {
    code: 'INVALID_MULTIPART_PARTS'
  });
});
