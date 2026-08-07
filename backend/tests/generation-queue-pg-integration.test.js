const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { getPool } = require('../db/pool');
const { getTool } = require('../lib/tool-catalog');
const { buildStoredTaskOptions } = require('../routes/tool-tasks');
const billing = require('../services/billing-service');
const { TaskLeaseQueue, markProviderDispatched } = require('../services/task-queue-service');
const { createWorkshopAiExecutor } = require('../services/workshop-ai-service');

const hasDatabase = Boolean(String(process.env.DATABASE_URL || '').trim());

const createWalletUser = async (credits) => {
  const legacyUserId = `generation_queue_${crypto.randomUUID()}`;
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

test('50 same-key requests dispatch and settle the generation task exactly once', {
  skip: !hasDatabase,
  timeout: 30_000
}, async () => {
  const previousKey = process.env.TASK_PAYLOAD_ENCRYPTION_KEY;
  process.env.TASK_PAYLOAD_ENCRYPTION_KEY = 'integration-test-payload-key-32b';
  try {
    const user = await createWalletUser(100);
    const quote = await billing.createQuote({
      userId: user.legacyUserId,
      sku: 'ai-design.directions.v1'
    });
    const idempotencyKey = `generation:same:${crypto.randomUUID()}`;
    const options = {
      prompt: 'Create four controlled product directions',
      locale: 'en'
    };
    const requests = await Promise.all(Array.from({ length: 50 }, () =>
      billing.createTaskWithHold({
        userId: user.legacyUserId,
        toolId: 'ai-design',
        operation: 'directions',
        options,
        storedOptions: { locale: 'en', hasProductProfile: false },
        taskPayload: { options },
        inputAssetIds: [],
        quoteId: quote.quoteId,
        sku: 'ai-design.directions.v1',
        idempotencyKey
      })
    ));
    assert.equal(new Set(requests.map((task) => task.taskId)).size, 1);
    assert.equal(requests.filter((task) => task.replayed).length, 49);

    const conflictingOptions = { ...options, prompt: 'A different request using the same key' };
    const conflicts = await Promise.allSettled(Array.from({ length: 50 }, () =>
      billing.createTaskWithHold({
        userId: user.legacyUserId,
        toolId: 'ai-design',
        operation: 'directions',
        options: conflictingOptions,
        storedOptions: { locale: 'en', hasProductProfile: false },
        taskPayload: { options: conflictingOptions },
        inputAssetIds: [],
        quoteId: quote.quoteId,
        sku: 'ai-design.directions.v1',
        idempotencyKey
      })
    ));
    assert.equal(conflicts.filter((outcome) =>
      outcome.status === 'rejected' && outcome.reason?.code === 'IDEMPOTENCY_CONFLICT'
    ).length, 50);

    let providerDispatches = 0;
    const queues = Array.from({ length: 50 }, (_, index) => {
      const queue = new TaskLeaseQueue({
        pool: getPool(),
        leaseOwner: `integration-worker-${index}`,
        releaseTask: billing.releaseTask,
        requestTaskCancellation: billing.requestTaskCancellation,
        env: process.env
      });
      queue.register('ai-design', 'directions', async (input) => {
        await billing.markTaskRunning({ taskId: input.taskId, leaseOwner: input.leaseOwner });
        await markProviderDispatched({
          pool: getPool(),
          taskId: input.taskId,
          leaseOwner: input.leaseOwner
        });
        providerDispatches += 1;
        await billing.settleTask({
          taskId: input.taskId,
          leaseOwner: input.leaseOwner,
          outputAssetIds: [],
          allowEmptyAssets: true,
          result: { assets: [], data: { directions: [] }, warnings: [] }
        });
      }, { payloadRequired: true });
      return queue;
    });

    await Promise.all(queues.map((queue) => queue.pollOnce()));
    assert.equal(providerDispatches, 1);

    const state = await getPool().query(
      `SELECT t.status, t.charged_credits, t.refunded_credits,
         t.provider_dispatched_at IS NOT NULL AS dispatched,
         h.status AS hold_status,
         (SELECT count(*)::int FROM tool_tasks WHERE user_id=$1) AS task_count,
         (SELECT count(*)::int FROM credit_holds WHERE user_id=$1) AS hold_count,
         (SELECT count(*)::int FROM wallet_ledger
           WHERE user_id=$1 AND entry_type='hold') AS hold_entries,
         (SELECT count(*)::int FROM wallet_ledger
           WHERE user_id=$1 AND entry_type='charge') AS charge_entries,
         (SELECT count(*)::int FROM tool_task_payloads WHERE task_id=t.id) AS payload_count
       FROM tool_tasks t
       JOIN credit_holds h ON h.task_id=t.id
       WHERE t.id=$2`,
      [user.dbUserId, requests[0].taskId]
    );
    assert.deepEqual({
      status: state.rows[0].status,
      charged: Number(state.rows[0].charged_credits),
      refunded: Number(state.rows[0].refunded_credits),
      dispatched: state.rows[0].dispatched,
      holdStatus: state.rows[0].hold_status,
      tasks: Number(state.rows[0].task_count),
      holds: Number(state.rows[0].hold_count),
      holdEntries: Number(state.rows[0].hold_entries),
      chargeEntries: Number(state.rows[0].charge_entries),
      payloadCount: Number(state.rows[0].payload_count)
    }, {
      status: 'success',
      charged: 5,
      refunded: 0,
      dispatched: true,
      holdStatus: 'settled',
      tasks: 1,
      holds: 1,
      holdEntries: 1,
      chargeEntries: 1,
      payloadCount: 0
    });
  } finally {
    if (previousKey === undefined) delete process.env.TASK_PAYLOAD_ENCRYPTION_KEY;
    else process.env.TASK_PAYLOAD_ENCRYPTION_KEY = previousKey;
  }
});

test('ingredient source is encrypted at rest, decrypted by the lease worker, and deleted at terminal state', {
  skip: !hasDatabase,
  timeout: 30_000
}, async () => {
  const previousKey = process.env.TASK_PAYLOAD_ENCRYPTION_KEY;
  const previousWorkshopFlag = process.env.WORKSHOP_AI_TASK_V2_ENABLED;
  process.env.TASK_PAYLOAD_ENCRYPTION_KEY =
    'hex:000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
  process.env.WORKSHOP_AI_TASK_V2_ENABLED = 'true';
  try {
    const user = await createWalletUser(20);
    const quote = await billing.createQuote({
      userId: user.legacyUserId,
      sku: 'workshop.ingredient-layout-ai.v1'
    });
    const sourceText = `Water, Glycerin, Sodium Hyaluronate ${crypto.randomUUID()}`;
    const options = {
      sourceText,
      productType: 'Cosmetic',
      locale: 'en'
    };
    const storedOptions = buildStoredTaskOptions({
      tool: getTool('ingredient-label'),
      operation: 'ai-organize-source-text',
      normalizedOptions: options
    });
    const task = await billing.createTaskWithHold({
      userId: user.legacyUserId,
      toolId: 'ingredient-label',
      operation: 'ai-organize-source-text',
      options,
      storedOptions,
      taskPayload: { options },
      payloadTtlMinutes: 60,
      inputAssetIds: [],
      quoteId: quote.quoteId,
      sku: 'workshop.ingredient-layout-ai.v1',
      idempotencyKey: `ingredient:encrypted:${crypto.randomUUID()}`
    });

    const stored = await getPool().query(
      `SELECT task.options, payload.algorithm, payload.iv, payload.auth_tag, payload.ciphertext
         FROM tool_tasks task
         JOIN tool_task_payloads payload ON payload.task_id=task.id
        WHERE task.id=$1`,
      [task.taskId]
    );
    assert.equal(stored.rowCount, 1);
    assert.deepEqual(stored.rows[0].options, storedOptions);
    assert.equal(Object.prototype.hasOwnProperty.call(stored.rows[0].options, 'sourceText'), false);
    assert.equal(JSON.stringify(stored.rows[0].options).includes(sourceText), false);
    assert.equal(stored.rows[0].algorithm, 'aes-256-gcm-v1');
    assert.equal(Buffer.from(stored.rows[0].iv).length, 12);
    assert.equal(Buffer.from(stored.rows[0].auth_tag).length, 16);
    assert.equal(Buffer.from(stored.rows[0].ciphertext).includes(Buffer.from(sourceText, 'utf8')), false);

    let providerSourceText = null;
    const provider = {
      available: true,
      organizeIngredientSource: async ({ sourceText: decryptedSourceText }) => {
        providerSourceText = decryptedSourceText;
        return {
          layoutType: 'standard',
          sections: [{ title: 'SOURCE TEXT', content: [decryptedSourceText] }]
        };
      }
    };
    const executor = createWorkshopAiExecutor({
      provider,
      env: process.env,
      markRunning: billing.markTaskRunning,
      markProviderDispatched: (input) => markProviderDispatched({
        pool: getPool(),
        ...input
      }),
      settleTask: billing.settleTask,
      releaseTask: billing.releaseTask
    });
    const queue = new TaskLeaseQueue({
      pool: getPool(),
      leaseOwner: `ingredient-payload-worker-${crypto.randomUUID()}`,
      releaseTask: billing.releaseTask,
      requestTaskCancellation: billing.requestTaskCancellation,
      env: process.env
    });
    queue.register(
      'ingredient-label',
      'ai-organize-source-text',
      executor,
      { payloadRequired: true }
    );
    assert.equal(await queue.pollOnce({ taskId: task.taskId }), true);
    assert.equal(providerSourceText, sourceText);

    const terminal = await getPool().query(
      `SELECT task.status, task.options, task.result,
              (SELECT count(*)::int
                 FROM tool_task_payloads payload
                WHERE payload.task_id=task.id) AS payload_count
         FROM tool_tasks task
        WHERE task.id=$1`,
      [task.taskId]
    );
    assert.equal(terminal.rows[0].status, 'success');
    assert.deepEqual(terminal.rows[0].options, storedOptions);
    assert.equal(terminal.rows[0].result.data.sourceTrace.verified, true);
    assert.equal(Number(terminal.rows[0].payload_count), 0);
  } finally {
    if (previousKey === undefined) delete process.env.TASK_PAYLOAD_ENCRYPTION_KEY;
    else process.env.TASK_PAYLOAD_ENCRYPTION_KEY = previousKey;
    if (previousWorkshopFlag === undefined) delete process.env.WORKSHOP_AI_TASK_V2_ENABLED;
    else process.env.WORKSHOP_AI_TASK_V2_ENABLED = previousWorkshopFlag;
  }
});
