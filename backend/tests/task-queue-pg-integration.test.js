const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { getPool } = require('../db/pool');
const {
  createQuote,
  createTaskWithHold,
  cancelTask,
  finalizeTaskInputs,
  releaseTask,
  settleTask
} = require('../services/billing-service');
const {
  FileAssetAdapter,
  consumeEditorTransfer,
  createEditorTransfer,
  deleteOwnedAssetNow,
  storeAsset
} = require('../services/asset-storage');
const {
  claimNextTask,
  claimUnrecoverableTask,
  heartbeatTaskLease,
  markProviderDispatched
} = require('../services/task-queue-service');

const hasDatabase = Boolean(String(process.env.DATABASE_URL || '').trim());

const createWalletUser = async (credits = 100) => {
  const legacyUserId = `queue_test_${crypto.randomUUID()}`;
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

const createOldPhotoTask = async (user, suffix = crypto.randomUUID()) => {
  const quote = await createQuote({ userId: user.legacyUserId, sku: 'workshop.old-photo.v1' });
  return createTaskWithHold({
    userId: user.legacyUserId,
    toolId: 'old-photo',
    operation: 'enhance',
    options: { denoise: true },
    inputAssetIds: [],
    quoteId: quote.quoteId,
    sku: 'workshop.old-photo.v1',
    idempotencyKey: `queue:${suffix}`
  });
};

test('uploaded inputs are reserved before storage and cannot be leased until finalized', {
  skip: !hasDatabase
}, async () => {
  const user = await createWalletUser(20);
  const quote = await createQuote({ userId: user.legacyUserId, sku: 'workshop.old-photo.v1' });
  const task = await createTaskWithHold({
    userId: user.legacyUserId,
    toolId: 'old-photo',
    operation: 'enhance',
    options: { denoise: true },
    inputAssetIds: [],
    requestIdentity: [{ sha256: 'a'.repeat(64), mimeType: 'image/png', byteSize: 32 }],
    deferInputAssets: true,
    quoteId: quote.quoteId,
    sku: 'workshop.old-photo.v1',
    idempotencyKey: `queue:deferred:${crypto.randomUUID()}`
  });
  assert.equal(task.inputPreparationRequired, true);
  assert.equal(await claimNextTask({
    pool: getPool(),
    taskId: task.taskId,
    leaseOwner: 'must-not-claim-unready'
  }), null);

  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-input-reservation-'));
  const adapter = new FileAssetAdapter(root);
  try {
    const png = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(2, 16);
    png.writeUInt32BE(2, 20);
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
    const finalized = await finalizeTaskInputs({
      userId: user.legacyUserId,
      taskId: task.taskId,
      inputAssetIds: [asset.assetId],
      inputRetentionHours: 24
    });
    assert.equal(finalized.inputPreparationCompleted, true);
    const claimed = await claimNextTask({
      pool: getPool(),
      taskId: task.taskId,
      leaseOwner: 'claim-after-input-finalize'
    });
    assert.equal(claimed.id, task.taskId);
    await releaseTask({
      taskId: task.taskId,
      errorCode: 'INTEGRATION_CLEANUP',
      leaseOwner: claimed.lease_owner
    });
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('expired holds cannot finalize inputs, claim work, dispatch, or settle', {
  skip: !hasDatabase
}, async () => {
  const user = await createWalletUser(20);
  const quote = await createQuote({ userId: user.legacyUserId, sku: 'workshop.old-photo.v1' });
  const task = await createTaskWithHold({
    userId: user.legacyUserId,
    toolId: 'old-photo',
    operation: 'enhance',
    options: { denoise: true },
    inputAssetIds: [],
    requestIdentity: [{ sha256: 'a'.repeat(64), mimeType: 'image/png', byteSize: 32 }],
    deferInputAssets: true,
    quoteId: quote.quoteId,
    sku: 'workshop.old-photo.v1',
    idempotencyKey: `queue:expired-hold:${crypto.randomUUID()}`
  });
  await getPool().query(
    "UPDATE credit_holds SET expires_at=now() - interval '1 second' WHERE task_id=$1",
    [task.taskId]
  );
  await assert.rejects(
    finalizeTaskInputs({
      userId: user.legacyUserId,
      taskId: task.taskId,
      inputAssetIds: []
    }),
    { code: 'TASK_TIMEOUT' }
  );
  assert.equal(await claimNextTask({
    pool: getPool(),
    taskId: task.taskId,
    leaseOwner: 'must-not-claim-expired-hold'
  }), null);
  const timeoutClaim = await claimUnrecoverableTask({
    pool: getPool(),
    taskId: task.taskId,
    leaseOwner: 'expired-hold-refunder'
  });
  assert.equal(timeoutClaim.failure_code, 'TASK_TIMEOUT');
  await releaseTask({
    taskId: task.taskId,
    errorCode: timeoutClaim.failure_code,
    leaseOwner: timeoutClaim.lease_owner
  });
});

test('lock waits crossing hold expiry cannot renew, dispatch, or settle with a stale statement timestamp', {
  skip: !hasDatabase
}, async () => {
  const user = await createWalletUser(40);
  const heartbeatTask = await createOldPhotoTask(user, `clock-heartbeat:${crypto.randomUUID()}`);
  const dispatchTask = await createOldPhotoTask(user, `clock-dispatch:${crypto.randomUUID()}`);
  const directionsQuote = await createQuote({
    userId: user.legacyUserId,
    sku: 'ai-design.directions.v1'
  });
  const directionsTask = await createTaskWithHold({
    userId: user.legacyUserId,
    toolId: 'ai-design',
    operation: 'directions',
    options: { prompt: 'lock wait expiry', locale: 'en' },
    storedOptions: { locale: 'en' },
    inputAssetIds: [],
    quoteId: directionsQuote.quoteId,
    sku: 'ai-design.directions.v1',
    idempotencyKey: `clock-settle:${crypto.randomUUID()}`
  });
  const heartbeatClaim = await claimNextTask({
    pool: getPool(),
    taskId: heartbeatTask.taskId,
    leaseOwner: 'clock-heartbeat-worker'
  });
  const dispatchClaim = await claimNextTask({
    pool: getPool(),
    taskId: dispatchTask.taskId,
    leaseOwner: 'clock-dispatch-worker'
  });
  const settleClaim = await claimNextTask({
    pool: getPool(),
    taskId: directionsTask.taskId,
    leaseOwner: 'clock-settle-worker'
  });
  const taskIds = [heartbeatTask.taskId, dispatchTask.taskId, directionsTask.taskId];
  await getPool().query(
    `UPDATE credit_holds
        SET expires_at=clock_timestamp() + interval '1 second'
      WHERE task_id=ANY($1::uuid[])`,
    [taskIds]
  );
  const blocker = await getPool().connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query(
      `SELECT task.id
         FROM tool_tasks task
         JOIN credit_holds hold ON hold.task_id=task.id
        WHERE task.id=ANY($1::uuid[])
        ORDER BY task.id
        FOR UPDATE OF task, hold`,
      [taskIds]
    );
    const heartbeatPromise = heartbeatTaskLease({
      pool: getPool(),
      taskId: heartbeatTask.taskId,
      leaseOwner: heartbeatClaim.lease_owner
    });
    const dispatchPromise = markProviderDispatched({
      pool: getPool(),
      taskId: dispatchTask.taskId,
      leaseOwner: dispatchClaim.lease_owner
    }).then((value) => ({ value }), (error) => ({ error }));
    const settlePromise = settleTask({
      taskId: directionsTask.taskId,
      outputAssetIds: [],
      allowEmptyAssets: true,
      leaseOwner: settleClaim.lease_owner,
      result: { assets: [], data: { directions: [] }, warnings: [] }
    }).then((value) => ({ value }), (error) => ({ error }));
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await blocker.query('COMMIT');
    assert.equal(await heartbeatPromise, false);
    assert.equal((await dispatchPromise).error?.code, 'TASK_TIMEOUT');
    assert.equal((await settlePromise).error?.code, 'TASK_TIMEOUT');
  } catch (error) {
    await blocker.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    blocker.release();
  }
  await releaseTask({
    taskId: heartbeatTask.taskId,
    errorCode: 'INTEGRATION_CLEANUP',
    leaseOwner: heartbeatClaim.lease_owner
  });
  await releaseTask({
    taskId: dispatchTask.taskId,
    errorCode: 'INTEGRATION_CLEANUP',
    leaseOwner: dispatchClaim.lease_owner
  });
  await releaseTask({
    taskId: directionsTask.taskId,
    errorCode: 'INTEGRATION_CLEANUP',
    leaseOwner: settleClaim.lease_owner
  });
});

test('50 lease competitors dispatch one idempotent task only once', {
  skip: !hasDatabase
}, async () => {
  const user = await createWalletUser(20);
  const task = await createOldPhotoTask(user);
  const claims = await Promise.all(Array.from({ length: 50 }, (_, index) => claimNextTask({
    pool: getPool(),
    taskId: task.taskId,
    leaseOwner: `competitor-${index}`
  })));
  const winners = claims.filter(Boolean);
  assert.equal(winners.length, 1);
  const owner = winners[0].lease_owner;
  assert.equal(await heartbeatTaskLease({
    pool: getPool(),
    taskId: task.taskId,
    leaseOwner: owner
  }), true);
  const dispatches = await Promise.all(Array.from({ length: 50 }, () => markProviderDispatched({
    pool: getPool(),
    taskId: task.taskId,
    leaseOwner: owner
  })));
  assert.equal(dispatches.every((value) => value), true);
  const state = await getPool().query(
    'SELECT attempt_count, provider_dispatched_at FROM tool_tasks WHERE id=$1',
    [task.taskId]
  );
  assert.equal(Number(state.rows[0].attempt_count), 1);
  assert.ok(state.rows[0].provider_dispatched_at);
  await releaseTask({ taskId: task.taskId, errorCode: 'INTEGRATION_CLEANUP', leaseOwner: owner });
});

test('one pre-dispatch crash is reclaimed, a second crash refunds without a third execution', {
  skip: !hasDatabase
}, async () => {
  const user = await createWalletUser(20);
  const task = await createOldPhotoTask(user);
  const first = await claimNextTask({
    pool: getPool(),
    taskId: task.taskId,
    leaseOwner: 'worker-first'
  });
  assert.equal(Number(first.attempt_count), 1);
  await getPool().query(
    "UPDATE tool_tasks SET lease_expires_at=now() - interval '1 second' WHERE id=$1",
    [task.taskId]
  );
  const reclaimed = await claimNextTask({
    pool: getPool(),
    taskId: task.taskId,
    leaseOwner: 'worker-reclaim'
  });
  assert.equal(Number(reclaimed.attempt_count), 2);
  await getPool().query(
    "UPDATE tool_tasks SET lease_expires_at=now() - interval '1 second' WHERE id=$1",
    [task.taskId]
  );
  assert.equal(await claimNextTask({
    pool: getPool(),
    taskId: task.taskId,
    leaseOwner: 'worker-forbidden'
  }), null);
  const failed = await claimUnrecoverableTask({
    pool: getPool(),
    taskId: task.taskId,
    leaseOwner: 'worker-refund'
  });
  assert.equal(failed.failure_code, 'TASK_RETRY_EXHAUSTED');
  await releaseTask({
    taskId: task.taskId,
    errorCode: failed.failure_code,
    leaseOwner: 'worker-refund'
  });
  const wallet = await getPool().query(
    'SELECT available_credits, frozen_credits FROM wallets WHERE user_id=$1',
    [user.dbUserId]
  );
  assert.deepEqual({
    available: Number(wallet.rows[0].available_credits),
    frozen: Number(wallet.rows[0].frozen_credits)
  }, { available: 20, frozen: 0 });
});

test('dispatched ambiguous work is never reclaimed and cancellation is persisted before refund', {
  skip: !hasDatabase
}, async () => {
  const user = await createWalletUser(20);
  const ambiguousTask = await createOldPhotoTask(user, `ambiguous:${crypto.randomUUID()}`);
  const claimed = await claimNextTask({
    pool: getPool(),
    taskId: ambiguousTask.taskId,
    leaseOwner: 'worker-dispatched'
  });
  await markProviderDispatched({
    pool: getPool(),
    taskId: ambiguousTask.taskId,
    leaseOwner: claimed.lease_owner
  });
  await getPool().query(
    "UPDATE tool_tasks SET lease_expires_at=now() - interval '1 second' WHERE id=$1",
    [ambiguousTask.taskId]
  );
  assert.equal(await claimNextTask({
    pool: getPool(),
    taskId: ambiguousTask.taskId,
    leaseOwner: 'must-not-retry'
  }), null);
  const ambiguous = await claimUnrecoverableTask({
    pool: getPool(),
    taskId: ambiguousTask.taskId,
    leaseOwner: 'worker-ambiguous-refund'
  });
  assert.equal(ambiguous.failure_code, 'PROVIDER_RESULT_UNKNOWN');
  await releaseTask({
    taskId: ambiguousTask.taskId,
    errorCode: ambiguous.failure_code,
    leaseOwner: 'worker-ambiguous-refund'
  });

  const cancellable = await createOldPhotoTask(user, `cancel:${crypto.randomUUID()}`);
  await claimNextTask({
    pool: getPool(),
    taskId: cancellable.taskId,
    leaseOwner: 'worker-cancel'
  });
  const requested = await cancelTask({
    userId: user.legacyUserId,
    taskId: cancellable.taskId
  });
  assert.equal(requested.status, 'cancelled');
  assert.ok(requested.updatedAt);
  const cancelState = await getPool().query(
    `SELECT t.cancel_requested_at, h.status AS hold_status
       FROM tool_tasks t JOIN credit_holds h ON h.task_id=t.id
      WHERE t.id=$1`,
    [cancellable.taskId]
  );
  assert.ok(cancelState.rows[0].cancel_requested_at);
  assert.equal(cancelState.rows[0].hold_status, 'released');
});

test('directions data-only settlement charges once without fabricating an output asset', {
  skip: !hasDatabase
}, async () => {
  const user = await createWalletUser(20);
  const quote = await createQuote({ userId: user.legacyUserId, sku: 'ai-design.directions.v1' });
  const task = await createTaskWithHold({
    userId: user.legacyUserId,
    toolId: 'ai-design',
    operation: 'directions',
    options: { prompt: 'test', locale: 'en' },
    storedOptions: { locale: 'en' },
    inputAssetIds: [],
    quoteId: quote.quoteId,
    sku: 'ai-design.directions.v1',
    idempotencyKey: `directions:${crypto.randomUUID()}`
  });
  const claimed = await claimNextTask({
    pool: getPool(),
    taskId: task.taskId,
    leaseOwner: 'directions-worker'
  });
  const settled = await settleTask({
    taskId: task.taskId,
    outputAssetIds: [],
    allowEmptyAssets: true,
    leaseOwner: claimed.lease_owner,
    result: {
      assets: [],
      data: { directions: [{ id: 'one' }, { id: 'two' }, { id: 'three' }, { id: 'four' }] },
      warnings: []
    }
  });
  assert.equal(settled.status, 'success');
  assert.equal(settled.assets.length, 0);
  assert.equal(settled.receipt.chargedCredits, 5);
  assert.equal(settled.result.data.directions.length, 4);
});

test('owner asset deletion refuses live transfers then removes bytes and row after consume', {
  skip: !hasDatabase
}, async () => {
  const user = await createWalletUser(0);
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-delete-test-'));
  const adapter = new FileAssetAdapter(root);
  try {
    const png = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(2, 16);
    png.writeUInt32BE(2, 20);
    const asset = await storeAsset({
      pool: getPool(),
      adapter,
      ownerUserId: user.dbUserId,
      buffer: png,
      declaredMime: 'image/png',
      maxPixels: 100,
      retentionClass: 'generated-output',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    const transfer = await createEditorTransfer({
      pool: getPool(),
      assetId: asset.assetId,
      ownerUserId: user.dbUserId
    });
    await assert.rejects(
      deleteOwnedAssetNow({
        pool: getPool(),
        assetId: asset.assetId,
        ownerUserId: user.dbUserId,
        adapterResolver: () => adapter
      }),
      { code: 'ASSET_IN_USE' }
    );
    await consumeEditorTransfer({
      pool: getPool(),
      transferId: transfer.transferId,
      ownerUserId: user.dbUserId
    });
    const deleted = await deleteOwnedAssetNow({
      pool: getPool(),
      assetId: asset.assetId,
      ownerUserId: user.dbUserId,
      adapterResolver: () => adapter
    });
    assert.deepEqual(deleted, { assetId: asset.assetId, deleted: true });
    const row = await getPool().query('SELECT id FROM assets WHERE id=$1', [asset.assetId]);
    assert.equal(row.rowCount, 0);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
