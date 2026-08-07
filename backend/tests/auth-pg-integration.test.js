const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { getPool } = require('../db/pool');
const { createAuthService } = require('../services/auth-service');

const hasDatabase = Boolean(String(process.env.DATABASE_URL || '').trim());
const env = {
  ...process.env,
  NODE_ENV: 'production',
  SESSION_TOKEN_HASH_SECRET:
    process.env.SESSION_TOKEN_HASH_SECRET ||
    'auth-pg-integration-session-secret-that-is-not-production',
  CSRF_SECRET:
    process.env.CSRF_SECRET ||
    'auth-pg-integration-csrf-secret-that-is-not-production',
  CREDITS_INIT: '125'
};

test.after(async () => {
  if (hasDatabase) await getPool().end();
});

test('verified PostgreSQL email login provisions wallet, ledger and session atomically', {
  skip: !hasDatabase
}, async () => {
  const suffix = crypto.randomUUID();
  const email = `auth-pg-${suffix}@example.test`;
  const legacyUserId = `auth_pg_${suffix}`;
  const service = createAuthService({ pool: getPool(), env });
  const result = await service.loginWithVerifiedIdentity({
    legacyUserId,
    email,
    username: email,
    displayName: 'Auth PG integration',
    identity: { provider: 'email', subject: email },
    userAgent: 'auth-pg-integration'
  });

  assert.equal(result.user.email, email);
  assert.equal(result.wallet.available, 125);
  assert.ok(result.session.token);

  const stored = await getPool().query(
    `SELECT
       w.available_credits,
       w.frozen_credits,
       l.reference_id,
       l.idempotency_key,
       (SELECT count(*)::int FROM sessions WHERE user_id=u.id) AS sessions
     FROM users u
     JOIN wallets w ON w.user_id=u.id
     JOIN wallet_ledger l ON l.user_id=u.id AND l.reference_type='account_signup'
     WHERE u.id=$1`,
    [result.user.dbUserId]
  );
  assert.equal(stored.rowCount, 1);
  assert.deepEqual({
    available: Number(stored.rows[0].available_credits),
    frozen: Number(stored.rows[0].frozen_credits),
    referenceId: String(stored.rows[0].reference_id),
    idempotencyKey: String(stored.rows[0].idempotency_key),
    sessions: Number(stored.rows[0].sessions)
  }, {
    available: 125,
    frozen: 0,
    referenceId: result.user.dbUserId,
    idempotencyKey: `signup:${result.user.dbUserId}`,
    sessions: 1
  });
});
