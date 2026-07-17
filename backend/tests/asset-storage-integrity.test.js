const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const test = require('node:test');

const { ApiError } = require('../lib/api-error');
const { storeAsset } = require('../services/asset-storage');

const pngFixture = () => {
  const buffer = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(16, 16);
  buffer.writeUInt32BE(12, 20);
  return buffer;
};

const createActiveRowHarness = ({ physicalBuffer, repairBuffer }) => {
  const fixture = pngFixture();
  const ownerUserId = '00000000-0000-4000-8000-000000000001';
  const digest = crypto.createHash('sha256').update(fixture).digest();
  const shaHex = digest.toString('hex');
  const key = `${ownerUserId}/${shaHex.slice(0, 2)}/${shaHex}.png`;
  const uri = `file://assets/${key}`;
  let stored = physicalBuffer;
  let repairs = 0;
  let committed = false;
  let rolledBack = false;
  const row = {
    id: '10000000-0000-4000-8000-000000000001',
    owner_user_id: ownerUserId,
    storage_driver: 'file',
    uri,
    mime_type: 'image/png',
    byte_size: fixture.length,
    width: 16,
    height: 12,
    sha256: digest,
    metadata: {},
    expires_at: new Date(Date.now() + 60_000),
    created_at: new Date(),
    gc_state: 'active'
  };
  const pool = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized === 'COMMIT') committed = true;
      if (normalized === 'ROLLBACK') rolledBack = true;
      if (normalized.startsWith('SELECT * FROM assets WHERE uri=')) {
        return { rowCount: 1, rows: [{ ...row }] };
      }
      if (normalized.includes("gc_state='active'")) {
        row.gc_state = 'active';
        return { rowCount: 1, rows: [{ ...row }] };
      }
      if (normalized.includes("gc_state='writing'")) {
        row.gc_state = 'writing';
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
  const adapter = {
    driver: 'file',
    uriForKey: (value) => `file://assets/${value}`,
    async open(value) {
      if (value !== uri || !Buffer.isBuffer(stored)) {
        throw new ApiError(404, 'ASSET_NOT_FOUND');
      }
      return { body: Readable.from([stored]), contentLength: stored.length };
    },
    async replaceBuffer({ buffer }) {
      repairs += 1;
      stored = repairBuffer ? repairBuffer(buffer) : Buffer.from(buffer);
      return { uri, created: false };
    },
    async putBuffer() {
      throw new Error('active rows must use repair writes');
    }
  };
  return {
    adapter,
    fixture,
    ownerUserId,
    pool,
    state: () => ({ committed, repairs, rolledBack, stored })
  };
};

const storeFixture = (harness) => storeAsset({
  pool: harness.pool,
  adapter: harness.adapter,
  ownerUserId: harness.ownerUserId,
  buffer: harness.fixture,
  declaredMime: 'image/png',
  retentionClass: 'generated-output',
  metadata: { source: 'ai-design-result' },
  expiresAt: new Date(Date.now() + 120_000)
});

test('active DB row with a missing object is repaired and verified before storeAsset returns', async () => {
  const harness = createActiveRowHarness({ physicalBuffer: null });
  const stored = await storeFixture(harness);
  assert.equal(stored.assetId, '10000000-0000-4000-8000-000000000001');
  assert.equal(harness.state().repairs, 1);
  assert.equal(harness.state().committed, true);
  assert.deepEqual(harness.state().stored, harness.fixture);
});

test('active DB row with same-length corrupt bytes is repaired and verified before reuse', async () => {
  const harness = createActiveRowHarness({
    physicalBuffer: Buffer.alloc(pngFixture().length, 0xa5)
  });
  await storeFixture(harness);
  assert.equal(harness.state().repairs, 1);
  assert.equal(harness.state().committed, true);
  assert.deepEqual(harness.state().stored, harness.fixture);
});

test('a silently corrupt repair never returns a verified generated asset', async () => {
  const harness = createActiveRowHarness({
    physicalBuffer: null,
    repairBuffer: (buffer) => Buffer.alloc(buffer.length, 0x5a)
  });
  await assert.rejects(() => storeFixture(harness), {
    code: 'ASSET_WRITE_VERIFICATION_FAILED'
  });
  assert.equal(harness.state().committed, false);
  assert.equal(harness.state().rolledBack, true);
});

test('a brand-new generated output is read-verified before its database row is activated', async () => {
  const fixture = pngFixture();
  const ownerUserId = '00000000-0000-4000-8000-000000000002';
  let physical = null;
  let committed = false;
  let rolledBack = false;
  let deleted = false;
  const pool = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized === 'COMMIT') committed = true;
      if (normalized === 'ROLLBACK') rolledBack = true;
      if (normalized.startsWith('SELECT * FROM assets WHERE uri=')) {
        return { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('INSERT INTO assets')) return { rowCount: 1, rows: [] };
      if (normalized.includes("UPDATE assets SET gc_state='active'")) {
        return { rowCount: 1, rows: [{
          id: '10000000-0000-4000-8000-000000000002',
          mime_type: 'image/png',
          byte_size: fixture.length,
          width: 16,
          height: 12,
          metadata: {},
          expires_at: null,
          created_at: new Date()
        }] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
  const adapter = {
    driver: 'file',
    uriForKey: (key) => `file://assets/${key}`,
    async putBuffer({ buffer }) {
      physical = Buffer.alloc(buffer.length, 0x7f);
    },
    async open() {
      return { body: Readable.from([physical]), contentLength: physical.length };
    },
    async delete() {
      deleted = true;
      physical = null;
    }
  };
  await assert.rejects(() => storeAsset({
    pool,
    adapter,
    ownerUserId,
    buffer: fixture,
    declaredMime: 'image/png',
    retentionClass: 'generated-output'
  }), { code: 'ASSET_WRITE_VERIFICATION_FAILED' });
  assert.equal(committed, false);
  assert.equal(rolledBack, true);
  assert.equal(deleted, true);
});
