const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { getPool } = require('../db/pool');
const {
  createAdminOperationsService
} = require('../services/admin-operations-service');
const {
  getBehaviorSummary,
  insertBehaviorEvent,
  listBehaviorEvents
} = require('../services/behavior-event-service');
const {
  createAdminFinanceService
} = require('../services/admin-finance-service');

const hasDatabase = Boolean(String(process.env.DATABASE_URL || '').trim());

test('PostgreSQL admin operations join behavior, users, sessions, ledger and audit safely', {
  skip: !hasDatabase
}, async () => {
  const pool = getPool();
  const suffix = crypto.randomUUID().replace(/-/g, '');
  const actorRef = `ops_actor_${suffix}`;
  const userRef = `ops_user_${suffix}`;
  const eventRequestId = `ops-event-${suffix}`;
  const requestId = `ops-request-${suffix}`;
  let actorId;
  let userId;

  try {
    const actor = await pool.query(
      `INSERT INTO users (legacy_user_id, username, display_name)
       VALUES ($1::text,$1::citext,'Operations actor') RETURNING id`,
      [actorRef]
    );
    actorId = actor.rows[0].id;
    const user = await pool.query(
      `INSERT INTO users (legacy_user_id, username, display_name)
       VALUES ($1::text,$1::citext,'Operations user') RETURNING id`,
      [userRef]
    );
    userId = user.rows[0].id;
    await pool.query(
      `INSERT INTO wallets (user_id, available_credits, frozen_credits)
       VALUES ($1,25,0),($2,80,0)`,
      [actorId, userId]
    );
    await pool.query(
      `INSERT INTO sessions
        (user_id, token_hash, csrf_hash, expires_at)
       VALUES ($1,$2,$3,now() + interval '1 hour')`,
      [
        userId,
        crypto.createHash('sha256').update(`token-${suffix}`).digest(),
        crypto.createHash('sha256').update(`csrf-${suffix}`).digest()
      ]
    );
    await insertBehaviorEvent({
      pool,
      body: {
        eventType: 'ui_click',
        requestId: eventRequestId,
        userId: 'forged-public-user',
        path: '/artigen/pg-operations',
        payload: {
          category: 'interaction',
          action: 'integration:open',
          element: 'button',
          prompt: 'must not persist'
        }
      },
      req: {
        authResolution: { dbUserId: userId, userId: userRef },
        headers: { 'user-agent': 'Mozilla/5.0 (iPhone; Mobile)' }
      },
      getClientIp: () => '192.0.2.10'
    });

    const behavior = await listBehaviorEvents({
      pool,
      userId: userRef,
      path: '/artigen/pg-operations',
      action: 'integration:open'
    });
    assert.equal(behavior.total, 1);
    assert.equal(behavior.items[0].userId, userRef);
    assert.equal(behavior.items[0].deviceCategory, 'mobile');
    assert.equal(Object.hasOwn(behavior.items[0].properties, 'prompt'), false);

    const users = await createAdminFinanceService({ pool }).listUsers({
      q: userRef,
      limit: 10
    });
    assert.equal(users.total, 1);
    assert.equal(users.items[0].visits, 0);
    assert.ok(users.items[0].lastSeen > 0);

    const service = createAdminOperationsService({ pool });
    const ledger = await service.listCreditLedger({ userId: userRef, limit: 10 });
    assert.equal(ledger.total, 0);

    const status = await service.updateUserStatus({
      userId: userRef,
      status: 'disabled',
      actorUserId: actorId,
      requestId
    });
    assert.equal(status.status, 'disabled');
    const state = await pool.query(
      `SELECT u.status,
              (SELECT count(*)::int FROM sessions
                WHERE user_id=u.id AND revoked_at IS NOT NULL) AS revoked,
              (SELECT count(*)::int FROM audit_events
                WHERE actor_user_id=$2 AND target_id=u.id::text
                  AND event_type='admin.user.status_changed'
                  AND request_id=$3) AS audited
         FROM users u WHERE u.id=$1`,
      [userId, actorId, requestId]
    );
    assert.deepEqual({
      status: state.rows[0].status,
      revoked: Number(state.rows[0].revoked),
      audited: Number(state.rows[0].audited)
    }, {
      status: 'disabled',
      revoked: 1,
      audited: 1
    });

    const summary = await getBehaviorSummary({ pool, days: 1 });
    assert.ok(summary.totals.events >= 1);
    const audit = await service.listAuditEvents({
      actor: actorRef,
      eventType: 'admin.user.status_changed',
      targetType: 'user'
    });
    assert.equal(audit.total, 1);
  } finally {
    if (userId) {
      await pool.query('DELETE FROM behavior_events WHERE actor_user_id=$1', [userId]);
      await pool.query(
        'DELETE FROM audit_events WHERE target_id=$1::text OR actor_user_id=$1::uuid',
        [userId]
      );
      await pool.query('DELETE FROM wallets WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    }
    if (actorId) {
      await pool.query('DELETE FROM audit_events WHERE actor_user_id=$1', [actorId]);
      await pool.query('DELETE FROM wallets WHERE user_id=$1', [actorId]);
      await pool.query('DELETE FROM users WHERE id=$1', [actorId]);
    }
  }
});
