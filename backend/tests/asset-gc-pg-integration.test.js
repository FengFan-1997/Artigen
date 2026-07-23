const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { getPool } = require('../db/pool');
const {
  FileAssetAdapter,
  claimExpiredAssets,
  deleteClaimedAsset,
  storeAsset,
  sweepExpiredAssets,
  sweepOrphanedFileAssets
} = require('../services/asset-storage');

const hasDatabase = Boolean(String(process.env.DATABASE_URL || '').trim());

const pngFixture = () => {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av9Z5AAAAABJRU5ErkJggg==',
    'base64'
  );
};

const createUser = async () => {
  const legacyId = `asset_gc_${crypto.randomUUID()}`;
  const inserted = await getPool().query(
    `INSERT INTO users (legacy_user_id, username, display_name)
     VALUES ($1::text,$1::citext,$1::text) RETURNING id`,
    [legacyId]
  );
  return inserted.rows[0].id;
};

const queryAsset = (assetId) => getPool().query('SELECT * FROM assets WHERE id=$1', [assetId]);

const readOpenedBody = async (opened) => {
  const chunks = [];
  for await (const chunk of opened.body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

test('reupload atomically cancels an expired asset deletion lease', {
  skip: !hasDatabase
}, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-gc-reupload-'));
  const adapter = new FileAssetAdapter(root);
  try {
    const userId = await createUser();
    const first = await storeAsset({
      pool: getPool(), adapter, ownerUserId: userId, buffer: pngFixture(),
      declaredMime: 'image/png', expiresAt: new Date(Date.now() - 1000)
    });
    const staleClaims = await claimExpiredAssets({
      pool: getPool(), limit: 1, assetId: first.assetId
    });
    assert.equal(staleClaims.length, 1);
    assert.equal(String(staleClaims[0].id), first.assetId);
    const refreshed = await storeAsset({
      pool: getPool(), adapter, ownerUserId: userId, buffer: pngFixture(),
      declaredMime: 'image/png', expiresAt: new Date(Date.now() + 60_000)
    });
    assert.equal(refreshed.assetId, first.assetId);

    const staleDelete = await deleteClaimedAsset({
      pool: getPool(),
      claim: staleClaims[0],
      adapterResolver: () => adapter
    });
    assert.equal(staleDelete.status, 'skipped');

    const sweep = await sweepExpiredAssets({
      pool: getPool(),
      assetId: first.assetId,
      adapterResolver: () => adapter
    });
    assert.equal(sweep.deleted, 0);
    const row = await queryAsset(first.assetId);
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].gc_state, 'active');
    assert.ok(new Date(row.rows[0].expires_at).getTime() > Date.now());
    await adapter.open(row.rows[0].uri);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('active generated-output row repairs a missing physical object before reuse', {
  skip: !hasDatabase
}, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-asset-missing-'));
  const adapter = new FileAssetAdapter(root);
  try {
    const userId = await createUser();
    const fixture = pngFixture();
    const first = await storeAsset({
      pool: getPool(),
      adapter,
      ownerUserId: userId,
      buffer: fixture,
      declaredMime: 'image/png',
      retentionClass: 'generated-output',
      metadata: { source: 'ai-design-result' },
      expiresAt: new Date(Date.now() + 60_000)
    });
    const row = (await queryAsset(first.assetId)).rows[0];
    await fs.promises.rm(adapter.resolveKey(adapter.keyFromUri(row.uri)), { force: true });

    const repaired = await storeAsset({
      pool: getPool(),
      adapter,
      ownerUserId: userId,
      buffer: fixture,
      declaredMime: 'image/png',
      retentionClass: 'generated-output',
      metadata: { source: 'ai-design-result' },
      expiresAt: new Date(Date.now() + 120_000)
    });

    assert.equal(repaired.assetId, first.assetId);
    assert.deepEqual(await readOpenedBody(await adapter.open(row.uri)), fixture);
    assert.equal((await queryAsset(first.assetId)).rows[0].gc_state, 'active');
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('active generated-output row repairs same-length corrupt bytes before reuse', {
  skip: !hasDatabase
}, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-asset-corrupt-'));
  const adapter = new FileAssetAdapter(root);
  try {
    const userId = await createUser();
    const fixture = pngFixture();
    const first = await storeAsset({
      pool: getPool(),
      adapter,
      ownerUserId: userId,
      buffer: fixture,
      declaredMime: 'image/png',
      retentionClass: 'generated-output',
      metadata: { source: 'ai-design-result' },
      expiresAt: new Date(Date.now() + 60_000)
    });
    const row = (await queryAsset(first.assetId)).rows[0];
    const objectPath = adapter.resolveKey(adapter.keyFromUri(row.uri));
    await fs.promises.writeFile(objectPath, Buffer.alloc(fixture.length, 0xa5));

    const repaired = await storeAsset({
      pool: getPool(),
      adapter,
      ownerUserId: userId,
      buffer: fixture,
      declaredMime: 'image/png',
      retentionClass: 'generated-output',
      metadata: { source: 'ai-design-result' },
      expiresAt: new Date(Date.now() + 120_000)
    });

    assert.equal(repaired.assetId, first.assetId);
    assert.deepEqual(await readOpenedBody(await adapter.open(row.uri)), fixture);
    const current = (await queryAsset(first.assetId)).rows[0];
    assert.equal(current.gc_state, 'active');
    assert.deepEqual(current.sha256, crypto.createHash('sha256').update(fixture).digest());
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('concurrent sweepers delete one expired object exactly once', {
  skip: !hasDatabase
}, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-gc-race-'));
  const adapter = new FileAssetAdapter(root);
  let deletes = 0;
  const deleteObject = adapter.delete.bind(adapter);
  adapter.delete = async (uri) => {
    deletes += 1;
    await deleteObject(uri);
  };
  try {
    const userId = await createUser();
    const asset = await storeAsset({
      pool: getPool(), adapter, ownerUserId: userId, buffer: pngFixture(),
      declaredMime: 'image/png', expiresAt: new Date(Date.now() - 1000)
    });
    const results = await Promise.all([
      sweepExpiredAssets({
        pool: getPool(), assetId: asset.assetId, adapterResolver: () => adapter
      }),
      sweepExpiredAssets({
        pool: getPool(), assetId: asset.assetId, adapterResolver: () => adapter
      })
    ]);
    assert.equal(results.reduce((sum, result) => sum + result.deleted, 0), 1);
    assert.equal(deletes, 1);
    assert.equal((await queryAsset(asset.assetId)).rowCount, 0);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('asset GC removes expired transfer references before the asset row', {
  skip: !hasDatabase
}, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-gc-refs-'));
  const adapter = new FileAssetAdapter(root);
  try {
    const userId = await createUser();
    const asset = await storeAsset({
      pool: getPool(), adapter, ownerUserId: userId, buffer: pngFixture(),
      declaredMime: 'image/png', expiresAt: new Date(Date.now() - 1000)
    });
    const transfer = await getPool().query(
      `INSERT INTO editor_transfers (owner_user_id, asset_id, expires_at)
       VALUES ($1,$2,now() - interval '1 minute') RETURNING id`,
      [userId, asset.assetId]
    );
    const sweep = await sweepExpiredAssets({
      pool: getPool(),
      assetId: asset.assetId,
      adapterResolver: () => adapter
    });
    assert.equal(sweep.deleted, 1);
    assert.equal((await queryAsset(asset.assetId)).rowCount, 0);
    assert.equal((await getPool().query(
      'SELECT 1 FROM editor_transfers WHERE id=$1',
      [transfer.rows[0].id]
    )).rowCount, 0);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('asset GC retains live transfers and queued task inputs until references become terminal', {
  skip: !hasDatabase
}, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-gc-live-ref-'));
  const adapter = new FileAssetAdapter(root);
  let deletes = 0;
  const deleteObject = adapter.delete.bind(adapter);
  adapter.delete = async (uri) => {
    deletes += 1;
    await deleteObject(uri);
  };
  try {
    const userId = await createUser();
    const asset = await storeAsset({
      pool: getPool(), adapter, ownerUserId: userId, buffer: pngFixture(),
      declaredMime: 'image/png', expiresAt: new Date(Date.now() - 1000)
    });
    const transfer = await getPool().query(
      `INSERT INTO editor_transfers (owner_user_id, asset_id, expires_at)
       VALUES ($1,$2,now() + interval '10 minutes') RETURNING id`,
      [userId, asset.assetId]
    );
    const task = await getPool().query(
      `INSERT INTO tool_tasks
        (user_id, tool_id, operation, options, quoted_credits, idempotency_key,
         request_hash, status)
       VALUES ($1,'old-photo','enhance','{}',0,$2,$3,'queued') RETURNING id`,
      [userId, `asset-gc:${crypto.randomUUID()}`, crypto.randomBytes(32)]
    );
    await getPool().query(
      `INSERT INTO tool_task_assets (task_id, asset_id, role, position)
       VALUES ($1,$2,'input',0)`,
      [task.rows[0].id, asset.assetId]
    );

    const retained = await sweepExpiredAssets({
      pool: getPool(), assetId: asset.assetId, adapterResolver: () => adapter
    });
    assert.equal(retained.retained, 1);
    assert.equal(deletes, 0);
    const retainedRow = await queryAsset(asset.assetId);
    assert.equal(retainedRow.rows[0].gc_state, 'active');
    assert.ok(new Date(retainedRow.rows[0].expires_at).getTime() > Date.now());

    await getPool().query("UPDATE tool_tasks SET status='cancelled' WHERE id=$1", [task.rows[0].id]);
    await getPool().query(
      "UPDATE editor_transfers SET expires_at=now() - interval '1 second' WHERE id=$1",
      [transfer.rows[0].id]
    );
    await getPool().query(
      "UPDATE assets SET expires_at=now() - interval '1 second' WHERE id=$1",
      [asset.assetId]
    );
    const deleted = await sweepExpiredAssets({
      pool: getPool(), assetId: asset.assetId, adapterResolver: () => adapter
    });
    assert.equal(deleted.deleted, 1);
    assert.equal(deletes, 1);
    assert.equal((await queryAsset(asset.assetId)).rowCount, 0);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('asset GC records delete failures with backoff and retries idempotently', {
  skip: !hasDatabase
}, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-gc-retry-'));
  const adapter = new FileAssetAdapter(root);
  let attempts = 0;
  const deleteObject = adapter.delete.bind(adapter);
  adapter.delete = async (uri) => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error('fixture object-store outage');
      error.code = 'FIXTURE_STORAGE_DOWN';
      throw error;
    }
    await deleteObject(uri);
  };
  try {
    const userId = await createUser();
    const asset = await storeAsset({
      pool: getPool(), adapter, ownerUserId: userId, buffer: pngFixture(),
      declaredMime: 'image/png', expiresAt: new Date(Date.now() - 1000)
    });
    const failed = await sweepExpiredAssets({
      pool: getPool(), assetId: asset.assetId, adapterResolver: () => adapter
    });
    assert.equal(failed.failed, 1);
    const retrying = await queryAsset(asset.assetId);
    assert.equal(retrying.rows[0].gc_state, 'deleting');
    assert.equal(retrying.rows[0].last_gc_error, 'FIXTURE_STORAGE_DOWN');
    assert.ok(new Date(retrying.rows[0].gc_lease_until).getTime() > Date.now());

    await getPool().query(
      "UPDATE assets SET gc_lease_until=now() - interval '1 second' WHERE id=$1",
      [asset.assetId]
    );
    const recovered = await sweepExpiredAssets({
      pool: getPool(), assetId: asset.assetId, adapterResolver: () => adapter
    });
    assert.equal(recovered.deleted, 1);
    assert.equal(attempts, 2);
    assert.equal((await queryAsset(asset.assetId)).rowCount, 0);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('failed object writes roll back the DB reservation and compensate storage', {
  skip: !hasDatabase
}, async () => {
  const userId = await createUser();
  let compensated = 0;
  const adapter = {
    driver: 'file',
    uriForKey: (key) => `file://assets/${key}`,
    putBuffer: async () => {
      const error = new Error('fixture write failure');
      error.code = 'FIXTURE_WRITE_FAILED';
      throw error;
    },
    delete: async () => { compensated += 1; }
  };
  await assert.rejects(() => storeAsset({
    pool: getPool(), adapter, ownerUserId: userId, buffer: pngFixture(),
    declaredMime: 'image/png', expiresAt: new Date(Date.now() + 60_000)
  }), { code: 'FIXTURE_WRITE_FAILED' });
  assert.equal(compensated, 1);
  const sha = crypto.createHash('sha256').update(pngFixture()).digest();
  const rows = await getPool().query(
    'SELECT 1 FROM assets WHERE owner_user_id=$1 AND sha256=$2',
    [userId, sha]
  );
  assert.equal(rows.rowCount, 0);
});

test('file inventory removes crash orphans only after grace while preserving registered assets', {
  skip: !hasDatabase
}, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-gc-inventory-'));
  const adapter = new FileAssetAdapter(root);
  try {
    const userId = await createUser();
    const registered = await storeAsset({
      pool: getPool(), adapter, ownerUserId: userId, buffer: pngFixture(),
      declaredMime: 'image/png', expiresAt: new Date(Date.now() + 60_000)
    });
    const registeredRow = await queryAsset(registered.assetId);
    const registeredUri = registeredRow.rows[0].uri;
    const registeredPath = adapter.resolveKey(adapter.keyFromUri(registeredUri));
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await fs.promises.utimes(registeredPath, old, old);

    const oldOrphan = await adapter.putBuffer({
      key: 'orphan/old/crash.bin', buffer: Buffer.from('old orphan')
    });
    const oldOrphanPath = adapter.resolveKey(adapter.keyFromUri(oldOrphan.uri));
    await fs.promises.utimes(oldOrphanPath, old, old);
    const recentOrphan = await adapter.putBuffer({
      key: 'orphan/recent/crash.bin', buffer: Buffer.from('recent orphan')
    });

    const result = await sweepOrphanedFileAssets({
      pool: getPool(), adapter, graceMs: 60 * 60 * 1000
    });
    assert.equal(result.deleted, 1);
    await assert.rejects(() => adapter.open(oldOrphan.uri), { code: 'ASSET_NOT_FOUND' });
    await adapter.open(registeredUri);
    await adapter.open(recentOrphan.uri);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
