const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_INTERVAL_MS,
  cleanupConfig,
  createAuthCleanupService
} = require('../services/auth-cleanup-service');

const compact = (sql) => String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();

test('auth cleanup deletes bounded expired OTP, session and delivery rows', async () => {
  const calls = [];
  const current = new Date('2026-07-16T10:00:00.000Z');
  const service = createAuthCleanupService({
    pool: {
      async query(sql, params) {
        calls.push({ sql: compact(sql), params });
        return { rowCount: 3, rows: [] };
      }
    },
    env: {
      AUTH_CLEANUP_BATCH_SIZE: '123',
      OTP_CHALLENGE_RETENTION_DAYS: '2',
      AUTH_SESSION_RETENTION_DAYS: '8',
      OTP_DELIVERY_RETENTION_DAYS: '31'
    },
    now: () => new Date(current)
  });

  const result = await service.runOnce();
  assert.deepEqual(result.map((item) => item.deleted), [3, 3, 3]);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.match(call.sql, /with doomed as/);
    assert.match(call.sql, /limit \$3/);
    assert.match(call.sql, /for update skip locked/);
    assert.equal(call.params[0].toISOString(), current.toISOString());
    assert.equal(call.params[2], 123);
  }
  const otp = calls.find((call) => call.sql.includes('from otp_challenges'));
  assert.match(otp.sql, /expires_at </);
  assert.match(otp.sql, /consumed_at is not null/);
  assert.equal(otp.params[1], 2);
  const sessions = calls.find((call) => call.sql.includes('from sessions'));
  assert.match(sessions.sql, /expires_at </);
  assert.match(sessions.sql, /revoked_at is not null/);
  assert.equal(sessions.params[1], 8);
  const deliveries = calls.find((call) =>
    call.sql.includes('from otp_delivery_attempts')
  );
  assert.match(deliveries.sql, /created_at </);
  assert.equal(deliveries.params[1], 31);
});

test('opportunistic auth cleanup is throttled to at most once per process-hour', async () => {
  let current = new Date('2026-07-16T10:00:00.000Z');
  let calls = 0;
  const service = createAuthCleanupService({
    pool: {
      async query() {
        calls += 1;
        return { rowCount: 0, rows: [] };
      }
    },
    env: { AUTH_CLEANUP_INTERVAL_MS: '1' },
    now: () => new Date(current)
  });
  assert.equal(service.config.intervalMs, DEFAULT_INTERVAL_MS);
  assert.equal(service.maybeRun(), true);
  await service.waitForIdle();
  assert.equal(service.maybeRun(), false);
  assert.equal(calls, 3);

  current = new Date(current.getTime() + DEFAULT_INTERVAL_MS + 1);
  assert.equal(service.maybeRun(), true);
  await service.waitForIdle();
  assert.equal(calls, 6);
});

test('cleanup failures are redacted and do not stop the other bounded deletes', async () => {
  const logs = [];
  let calls = 0;
  const service = createAuthCleanupService({
    pool: {
      async query() {
        calls += 1;
        if (calls === 1) {
          const error = new Error('postgres://user:password@example/private');
          error.code = 'ECONNRESET';
          throw error;
        }
        return { rowCount: 1, rows: [] };
      }
    },
    logger: {
      warn(label, metadata) {
        logs.push({ label, metadata });
      }
    }
  });
  const result = await service.runOnce();
  assert.equal(result.filter((item) => item.ok).length, 2);
  assert.equal(result.filter((item) => !item.ok).length, 1);
  assert.equal(calls, 3);
  assert.deepEqual(logs, [{
    label: '[AuthCleanup]',
    metadata: { kind: 'otp_challenges', code: 'ECONNRESET' }
  }]);
  assert.equal(JSON.stringify(logs).includes('password'), false);
});

test('cleanup configuration keeps every delete bounded', () => {
  assert.deepEqual(cleanupConfig({
    AUTH_CLEANUP_BATCH_SIZE: '999999',
    OTP_CHALLENGE_RETENTION_DAYS: '0',
    AUTH_SESSION_RETENTION_DAYS: '-2',
    OTP_DELIVERY_RETENTION_DAYS: '9999'
  }), {
    intervalMs: DEFAULT_INTERVAL_MS,
    batchSize: 5000,
    otpRetentionDays: 1,
    sessionRetentionDays: 1,
    deliveryRetentionDays: 365
  });
});
