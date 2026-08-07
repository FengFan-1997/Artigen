const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { getPool } = require('../db/pool');
const {
  createAdminFinanceService
} = require('../services/admin-finance-service');

const hasDatabase = Boolean(String(process.env.DATABASE_URL || '').trim());

test('admin PostgreSQL finance lists canonical records and adjusts through one immutable ledger entry', {
  skip: !hasDatabase
}, async () => {
  const pool = getPool();
  const service = createAdminFinanceService({ pool });
  const suffix = crypto.randomUUID();
  const legacyUserId = `admin_finance_${suffix}`;
  const username = `admin_finance_${suffix}`;
  const sku = `credits.admin-test.${suffix}`;
  let userId;
  let packageId;
  let orderId;
  let taskId;

  try {
    const user = await pool.query(
      `INSERT INTO users (legacy_user_id, username, display_name)
       VALUES ($1,$2,'Admin finance test') RETURNING id`,
      [legacyUserId, username]
    );
    userId = user.rows[0].id;
    await pool.query(
      `INSERT INTO wallets (user_id, available_credits, frozen_credits)
       VALUES ($1,25,3)`,
      [userId]
    );
    await pool.query(
      `INSERT INTO administrators (user_id, role, active)
       VALUES ($1,'owner',true)`,
      [userId]
    );
    const paymentPackage = await pool.query(
      `INSERT INTO payment_packages (sku, title, amount_minor, currency, credits)
       VALUES ($1,'Admin test package',990,'CNY',40) RETURNING id`,
      [sku]
    );
    packageId = paymentPackage.rows[0].id;
    const order = await pool.query(
      `INSERT INTO payment_orders
        (user_id, package_id, provider, expected_amount_minor, currency, expected_credits, status)
       VALUES ($1,$2,'fixture',990,'CNY',40,'pending') RETURNING id`,
      [userId, packageId]
    );
    orderId = order.rows[0].id;
    const task = await pool.query(
      `INSERT INTO tool_tasks
        (user_id, tool_id, operation, options, sku, quoted_credits, idempotency_key,
         request_hash, status)
       VALUES ($1,'old-photo','enhance','{}',$2,3,$3,$4,'queued') RETURNING id`,
      [userId, sku, `admin-fixture:${suffix}`, crypto.createHash('sha256').update(suffix).digest()]
    );
    taskId = task.rows[0].id;
    await pool.query(
      `INSERT INTO credit_holds (task_id, user_id, credits, expires_at)
       VALUES ($1,$2,3,now() + interval '30 minutes')`,
      [taskId, userId]
    );

    const users = await service.listUsers({ q: legacyUserId, limit: 20, offset: 0 });
    assert.equal(users.total, 1);
    assert.deepEqual({
      userId: users.items[0].userId,
      available: users.items[0].wallet.available,
      frozen: users.items[0].wallet.frozen
    }, { userId: legacyUserId, available: 25, frozen: 3 });
    const emptyUsersPage = await service.listUsers({ q: legacyUserId, limit: 20, offset: 20 });
    assert.equal(emptyUsersPage.total, 1);
    assert.deepEqual(emptyUsersPage.items, []);

    const orders = await service.listOrders({ userId: legacyUserId, limit: 20, offset: 0 });
    assert.equal(orders.total, 1);
    assert.deepEqual({
      id: orders.items[0].id,
      packageId: orders.items[0].packageId,
      amountCny: orders.items[0].amountCny,
      credits: orders.items[0].credits
    }, { id: String(orderId), packageId: sku, amountCny: 9.9, credits: 40 });

    const holds = await service.listHolds({ userId: legacyUserId, limit: 20, offset: 0 });
    assert.equal(holds.total, 1);
    assert.deepEqual({
      taskId: holds.items[0].taskId,
      cost: holds.items[0].cost,
      status: holds.items[0].status
    }, { taskId: String(taskId), cost: 3, status: 'held' });

    const idempotencyKey = `admin-adjust:${suffix}`;
    const adjustments = await Promise.all(Array.from({ length: 20 }, () =>
      service.adjustAvailableCredits({
        userId: legacyUserId,
        available: 40,
        idempotencyKey,
        actor: 'integration-owner',
        actorUserId: userId,
        requestId: `request-${suffix}`
      })
    ));
    assert.equal(adjustments.filter((item) => !item.replayed).length, 1);
    assert.equal(adjustments.filter((item) => item.replayed).length, 19);
    const adjusted = adjustments.find((item) => !item.replayed);
    assert.deepEqual({
      available: adjusted.wallet.available,
      frozen: adjusted.wallet.frozen
    }, { available: 40, frozen: 3 });

    const replay = await service.adjustAvailableCredits({
      userId: legacyUserId,
      available: 40,
      idempotencyKey,
      actor: 'integration-owner',
      actorUserId: userId,
      requestId: `request-${suffix}`
    });
    assert.equal(replay.replayed, true);
    await assert.rejects(
      service.adjustAvailableCredits({
        userId: legacyUserId,
        available: 41,
        idempotencyKey,
        actor: 'integration-owner',
        actorUserId: userId,
        requestId: `request-${suffix}`
      }),
      { code: 'IDEMPOTENCY_CONFLICT', status: 409 }
    );

    const state = await pool.query(
      `SELECT w.available_credits, w.frozen_credits,
              (SELECT count(*)::int FROM wallet_ledger
                WHERE user_id=$1 AND entry_type='admin_adjustment') AS ledger_count,
              (SELECT count(*)::int FROM audit_events
                WHERE target_type='wallet' AND target_id=$1::text
                  AND event_type='admin.wallet.adjusted') AS audit_count,
              (SELECT actor_user_id FROM audit_events
                WHERE target_type='wallet' AND target_id=$1::text
                  AND event_type='admin.wallet.adjusted' LIMIT 1) AS audit_actor,
              (SELECT delta_available FROM wallet_ledger
                WHERE user_id=$1 AND entry_type='admin_adjustment' LIMIT 1) AS delta
         FROM wallets w WHERE w.user_id=$1`,
      [userId]
    );
    assert.deepEqual({
      available: Number(state.rows[0].available_credits),
      frozen: Number(state.rows[0].frozen_credits),
      ledgerCount: Number(state.rows[0].ledger_count),
      auditCount: Number(state.rows[0].audit_count),
      auditActor: String(state.rows[0].audit_actor),
      delta: Number(state.rows[0].delta)
    }, {
      available: 40,
      frozen: 3,
      ledgerCount: 1,
      auditCount: 1,
      auditActor: String(userId),
      delta: 15
    });
  } finally {
    // The production invariant deliberately makes wallet_ledger append-only.
    // CI uses an ephemeral PostgreSQL service and UUID-isolated fixtures, so
    // retaining this row is preferable to disabling the trigger for cleanup.
  }
});
