const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { getPool } = require('../db/pool');
const {
  cancelTask,
  createQuote,
  createTaskWithHold
} = require('../services/billing-service');
const { FileAssetAdapter, storeAsset } = require('../services/asset-storage');

const hasDatabase = Boolean(String(process.env.DATABASE_URL || '').trim());

const createWalletUser = async (credits) => {
  const legacyUserId = `billing_test_${crypto.randomUUID()}`;
  const inserted = await getPool().query(
    `INSERT INTO users (legacy_user_id, username, display_name)
     VALUES ($1::text,$1::citext,$1::text) RETURNING id`,
    [legacyUserId]
  );
  await getPool().query(
    'INSERT INTO wallets (user_id, available_credits, frozen_credits) VALUES ($1,$2,0)',
    [inserted.rows[0].id, credits]
  );
  return { dbUserId: inserted.rows[0].id, legacyUserId };
};

const createHeldTask = ({ userId, quoteId, idempotencyKey }) => createTaskWithHold({
  userId,
  toolId: 'old-photo',
  operation: 'enhance',
  options: { denoise: true },
  inputAssetIds: [],
  // These tests exercise hold/idempotency semantics only. Keep the task
  // ineligible for the queue so a worker from another concurrently running
  // test file cannot fail, refund, and recycle the same wallet balance while
  // the 50 hold attempts are still settling.
  deferInputAssets: true,
  quoteId,
  sku: 'workshop.old-photo.v1',
  idempotencyKey
});

test('50 identical PostgreSQL task requests create one hold and replay one task', {
  skip: !hasDatabase
}, async () => {
  const user = await createWalletUser(100);
  let taskId = null;
  try {
    const quote = await createQuote({ userId: user.legacyUserId, sku: 'workshop.old-photo.v1' });
    const key = `integration:same:${crypto.randomUUID()}`;
    const tasks = await Promise.all(
      Array.from({ length: 50 }, () => createHeldTask({
        userId: user.legacyUserId,
        quoteId: quote.quoteId,
        idempotencyKey: key
      }))
    );
    taskId = tasks[0]?.taskId || null;

    assert.equal(new Set(tasks.map((task) => String(task.taskId))).size, 1);
    assert.equal(tasks.filter((task) => task.replayed).length, 49);
    const state = await getPool().query(
      `SELECT w.available_credits, w.frozen_credits,
         (SELECT count(*)::int FROM tool_tasks WHERE user_id=$1) AS tasks,
         (SELECT count(*)::int FROM credit_holds WHERE user_id=$1 AND status='held') AS holds,
         (SELECT count(*)::int FROM wallet_ledger
           WHERE user_id=$1 AND entry_type='hold') AS hold_ledger
       FROM wallets w WHERE w.user_id=$1`,
      [user.dbUserId]
    );
    assert.deepEqual({
      available: Number(state.rows[0].available_credits),
      frozen: Number(state.rows[0].frozen_credits),
      tasks: Number(state.rows[0].tasks),
      holds: Number(state.rows[0].holds),
      holdLedger: Number(state.rows[0].hold_ledger)
    }, { available: 95, frozen: 5, tasks: 1, holds: 1, holdLedger: 1 });
  } finally {
    if (taskId) {
      await cancelTask({ userId: user.legacyUserId, taskId });
    }
  }
});

test('50 competing PostgreSQL holds never make the wallet negative', {
  skip: !hasDatabase
}, async () => {
  const user = await createWalletUser(5);
  let taskId = null;
  try {
    const quotes = await Promise.all(Array.from({ length: 50 }, () =>
      createQuote({ userId: user.legacyUserId, sku: 'workshop.old-photo.v1' })
    ));
    const outcomes = await Promise.allSettled(quotes.map((quote, index) => createHeldTask({
      userId: user.legacyUserId,
      quoteId: quote.quoteId,
      idempotencyKey: `integration:race:${index}:${crypto.randomUUID()}`
    })));
    taskId = outcomes.find((outcome) => outcome.status === 'fulfilled')?.value?.taskId || null;

    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((outcome) =>
      outcome.status === 'rejected' && outcome.reason?.code === 'INSUFFICIENT_CREDITS'
    ).length, 49);
    const wallet = await getPool().query(
      'SELECT available_credits, frozen_credits FROM wallets WHERE user_id=$1',
      [user.dbUserId]
    );
    assert.equal(Number(wallet.rows[0].available_credits), 0);
    assert.equal(Number(wallet.rows[0].frozen_credits), 5);
    assert.ok(Number(wallet.rows[0].available_credits) >= 0);
    assert.ok(Number(wallet.rows[0].frozen_credits) >= 0);
  } finally {
    if (taskId) {
      await cancelTask({ userId: user.legacyUserId, taskId });
    }
  }
});

test('legacy task hash compatibility rejects the same key with different upload bytes', {
  skip: !hasDatabase
}, async () => {
  const user = await createWalletUser(20);
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-legacy-hash-'));
  const adapter = new FileAssetAdapter(root);
  let taskId = null;
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av9Z5AAAAABJRU5ErkJggg==',
      'base64'
    );
    const asset = await storeAsset({
      pool: getPool(),
      adapter,
      ownerUserId: user.dbUserId,
      buffer: png,
      declaredMime: 'image/png',
      maxPixels: 100,
      retentionClass: 'temporary-input',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    const quote = await createQuote({ userId: user.legacyUserId, sku: 'workshop.old-photo.v1' });
    const key = `integration:legacy-upload:${crypto.randomUUID()}`;
    const original = await createTaskWithHold({
      userId: user.legacyUserId,
      toolId: 'old-photo',
      operation: 'enhance',
      options: { denoise: true },
      inputAssetIds: [asset.assetId],
      quoteId: quote.quoteId,
      sku: 'workshop.old-photo.v1',
      idempotencyKey: key
    });
    taskId = original.taskId;
    const matchingIdentity = [{
      sha256: crypto.createHash('sha256').update(png).digest('hex'),
      mimeType: 'image/png',
      byteSize: png.length
    }];
    const replay = await createTaskWithHold({
      userId: user.legacyUserId,
      toolId: 'old-photo',
      operation: 'enhance',
      options: { denoise: true },
      inputAssetIds: [],
      requestIdentity: matchingIdentity,
      deferInputAssets: true,
      quoteId: quote.quoteId,
      sku: 'workshop.old-photo.v1',
      idempotencyKey: key
    });
    assert.equal(replay.taskId, original.taskId);
    assert.equal(replay.replayed, true);
    await assert.rejects(
      createTaskWithHold({
        userId: user.legacyUserId,
        toolId: 'old-photo',
        operation: 'enhance',
        options: { denoise: true },
        inputAssetIds: [],
        requestIdentity: [{ ...matchingIdentity[0], sha256: 'f'.repeat(64) }],
        deferInputAssets: true,
        quoteId: quote.quoteId,
        sku: 'workshop.old-photo.v1',
        idempotencyKey: key
      }),
      { code: 'IDEMPOTENCY_CONFLICT', status: 409 }
    );
  } finally {
    if (taskId) {
      await cancelTask({ userId: user.legacyUserId, taskId });
    }
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
