const assert = require('node:assert/strict');
const test = require('node:test');

const {
  GLOBAL_BUDGET_STATES,
  TARGET_IP_QUOTA_STATES,
  createOtpDeliveryService,
  hashIdempotencyKey,
  hashQuotaIp,
  hashQuotaTarget,
  quotaLimits,
  quotaViolation,
  resolveOtpSendIdempotencyKey
} = require('../services/otp-delivery-service');

const env = {
  NODE_ENV: 'production',
  OTP_HMAC_SECRET: 'otp-delivery-test-secret'
};

const compact = (sql) => String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
const sameBuffer = (left, right) => Buffer.from(left).equals(Buffer.from(right));

const createDeliveryPool = () => {
  const state = { attempts: [], lock: Promise.resolve() };
  let sequence = 0;
  const connect = async () => {
    let releaseLock = null;
    const query = async (sql, params = []) => {
      const q = compact(sql);
      if (q === 'begin' || q === 'commit' || q === 'rollback') {
        if ((q === 'commit' || q === 'rollback') && releaseLock) {
          releaseLock();
          releaseLock = null;
        }
        return { rowCount: 0, rows: [] };
      }
      if (q.startsWith('select pg_advisory_xact_lock')) {
        const previous = state.lock;
        let release;
        const mine = new Promise((resolve) => {
          release = resolve;
        });
        state.lock = previous.then(() => mine);
        await previous;
        releaseLock = release;
        return { rowCount: 1, rows: [{}] };
      }
      if (q.startsWith('select id, target_hash, purpose, challenge_id, state')) {
        const row = state.attempts.find((item) =>
          sameBuffer(item.idempotency_hash, params[0])
        );
        return { rowCount: row ? 1 : 0, rows: row ? [{ ...row }] : [] };
      }
      if (q.startsWith('select count(*) filter')) {
        return {
          rowCount: 1,
          rows: [{
            target_hour: 0,
            target_day: 0,
            ip_hour: 0,
            ip_day: 0,
            global_day: 0
          }]
        };
      }
      if (q.startsWith('insert into otp_delivery_attempts')) {
        const [idempotencyHash, targetHash, ipHash, purpose, leaseExpiresAt, createdAt] =
          params;
        const row = {
          id: `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
          idempotency_hash: Buffer.from(idempotencyHash),
          target_hash: Buffer.from(targetHash),
          ip_hash: Buffer.from(ipHash),
          purpose,
          challenge_id: null,
          state: 'reserved',
          provider: null,
          provider_dispatched_at: null,
          error_code: null,
          cooldown_until: null,
          lease_expires_at: leaseExpiresAt,
          created_at: createdAt
        };
        state.attempts.push(row);
        return { rowCount: 1, rows: [{ ...row }] };
      }
      if (q.startsWith('update otp_delivery_attempts set challenge_id=$2')) {
        const row = state.attempts.find((item) => item.id === params[0]);
        if (!row || row.state !== 'reserved') return { rowCount: 0, rows: [] };
        row.challenge_id = params[1];
        row.state = 'challenge_ready';
        row.cooldown_until = params[2];
        row.lease_expires_at = params[4];
        return { rowCount: 1, rows: [{ id: row.id }] };
      }
      if (q.startsWith("update otp_delivery_attempts set state='unknown'")) {
        const row = state.attempts.find((item) => item.id === params[0]);
        if (
          !row ||
          !['reserved', 'challenge_ready'].includes(row.state) ||
          !row.provider_dispatched_at
        ) {
          return { rowCount: 0, rows: [] };
        }
        row.state = 'unknown';
        row.error_code = 'MAIL_DELIVERY_UNKNOWN';
        row.lease_expires_at = params[1];
        return { rowCount: 1, rows: [{ ...row }] };
      }
      if (q.startsWith("update otp_delivery_attempts set state='reserved'")) {
        const row = state.attempts.find((item) => item.id === params[0]);
        if (
          !row ||
          !['reserved', 'challenge_ready'].includes(row.state) ||
          row.provider_dispatched_at
        ) {
          return { rowCount: 0, rows: [] };
        }
        row.state = 'reserved';
        row.challenge_id = null;
        row.cooldown_until = null;
        row.provider = null;
        row.error_code = null;
        row.lease_expires_at = params[1];
        return { rowCount: 1, rows: [{ ...row }] };
      }
      if (q.startsWith('update otp_delivery_attempts set provider_dispatched_at=$2')) {
        const row = state.attempts.find((item) => item.id === params[0]);
        if (
          !row ||
          row.state !== 'challenge_ready' ||
          row.provider_dispatched_at ||
          new Date(row.lease_expires_at) <= new Date(params[1])
        ) {
          return { rowCount: 0, rows: [] };
        }
        row.provider_dispatched_at = params[1];
        row.provider = params[2] || row.provider;
        return { rowCount: 1, rows: [{ id: row.id }] };
      }
      if (q.startsWith('update otp_delivery_attempts set state=$2')) {
        const row = state.attempts.find((item) => item.id === params[0]);
        if (!row || !['reserved', 'challenge_ready'].includes(row.state)) {
          return { rowCount: 0, rows: [] };
        }
        row.state = params[1];
        row.provider = params[2] || row.provider;
        row.error_code = params[4] || null;
        return { rowCount: 1, rows: [{ id: row.id }] };
      }
      throw new Error(`Unhandled OTP delivery SQL: ${q}`);
    };
    return {
      query,
      release() {
        if (releaseLock) releaseLock();
      }
    };
  };
  return {
    state,
    connect,
    async query(sql, params) {
      const client = await connect();
      try {
        return await client.query(sql, params);
      } finally {
        client.release();
      }
    }
  };
};

test('OTP delivery quota identifiers are deterministic HMACs, not raw PII', () => {
  const target = hashQuotaTarget('Person@Example.com', env);
  const targetAgain = hashQuotaTarget('person@example.com', env);
  const ip = hashQuotaIp('203.0.113.12', env);
  const idempotency = hashIdempotencyKey({
    target: 'person@example.com',
    purpose: 'login',
    requestKey: 'request-key-123'
  }, env);

  assert.equal(target.length, 32);
  assert.equal(ip.length, 32);
  assert.equal(idempotency.length, 32);
  assert.equal(target.equals(targetAgain), true);
  assert.equal(target.equals(ip), false);
  assert.equal(target.toString('utf8').includes('example.com'), false);
});

test('fallback OTP idempotency is stable for one minute and rotates afterwards', () => {
  const base = {
    target: 'person@example.com',
    purpose: 'login',
    ip: '203.0.113.12'
  };
  const first = resolveOtpSendIdempotencyKey({
    ...base,
    now: new Date('2026-07-16T10:00:01.000Z')
  });
  const replay = resolveOtpSendIdempotencyKey({
    ...base,
    now: new Date('2026-07-16T10:00:59.999Z')
  });
  const next = resolveOtpSendIdempotencyKey({
    ...base,
    now: new Date('2026-07-16T10:01:00.000Z')
  });
  assert.equal(first, replay);
  assert.notEqual(first, next);
  assert.match(first, /^fallback:[a-f0-9]{64}$/);

  assert.throws(
    () => resolveOtpSendIdempotencyKey({
      ...base,
      explicitKey: 'bad key'
    }),
    (error) => error.code === 'INVALID_IDEMPOTENCY_KEY'
  );
});

test('OTP quota returns the earliest blocked scope and a bounded retry delay', () => {
  const now = new Date('2026-07-16T10:00:00.000Z');
  const limits = quotaLimits({
    OTP_SEND_TARGET_HOURLY_LIMIT: '2',
    OTP_SEND_TARGET_DAILY_LIMIT: '20',
    OTP_SEND_IP_HOURLY_LIMIT: '30',
    OTP_SEND_IP_DAILY_LIMIT: '100',
    OTP_SEND_GLOBAL_DAILY_LIMIT: '250'
  });
  const violation = quotaViolation({
    target_hour: 2,
    target_hour_oldest: new Date('2026-07-16T09:30:00.000Z')
  }, limits, now);
  assert.equal(violation.scope, 'target_hour');
  assert.equal(violation.retryAfterSec, 1800);
  const globalFirst = quotaViolation({
    global_day: 250,
    global_day_oldest: new Date('2026-07-15T11:00:00.000Z'),
    target_hour: 99,
    target_hour_oldest: new Date('2026-07-16T09:30:00.000Z')
  }, quotaLimits({}), now);
  assert.equal(globalFirst.scope, 'global_day');
});

test('OTP quota defaults and counted states match the production abuse budget', () => {
  assert.deepEqual(quotaLimits({}), {
    targetHour: 5,
    targetDay: 10,
    ipHour: 20,
    ipDay: 50,
    globalDay: 250
  });
  assert.deepEqual(TARGET_IP_QUOTA_STATES, [
    'reserved',
    'challenge_ready',
    'accepted',
    'unknown',
    'failed'
  ]);
  assert.deepEqual(GLOBAL_BUDGET_STATES, [
    'reserved',
    'challenge_ready',
    'accepted',
    'unknown'
  ]);
  assert.equal(GLOBAL_BUDGET_STATES.includes('failed'), false);
  assert.equal(GLOBAL_BUDGET_STATES.includes('rejected'), false);
});

test('50 concurrent database sends with one key create one attempt and one owner', async () => {
  const pool = createDeliveryPool();
  const clock = new Date('2026-07-16T10:00:00.000Z');
  const service = createOtpDeliveryService({
    pool,
    env,
    now: () => new Date(clock)
  });
  const requests = await Promise.all(
    Array.from({ length: 50 }, () =>
      service.beginAttempt({
        target: 'person@example.com',
        purpose: 'login',
        ip: '203.0.113.12',
        requestKey: 'same-request-key'
      })
    )
  );
  assert.equal(requests.filter((item) => item.owner).length, 1);
  assert.equal(requests.filter((item) => item.replay).length, 49);
  assert.equal(pool.state.attempts.length, 1);

  const attemptId = requests.find((item) => item.owner).attempt.id;
  await service.markChallengeReady({
    attemptId,
    challengeId: '10000000-0000-4000-8000-000000000001',
    cooldownUntil: new Date('2026-07-16T10:01:00.000Z')
  });
  await service.completeAttempt({
    attemptId,
    state: 'accepted',
    provider: 'brevo',
    messageId: 'provider-message'
  });
  const replay = await service.beginAttempt({
    target: 'person@example.com',
    purpose: 'login',
    ip: '203.0.113.12',
    requestKey: 'same-request-key'
  });
  assert.equal(replay.owner, false);
  assert.equal(replay.attempt.state, 'accepted');
  const found = await service.findAttempt({
    target: 'person@example.com',
    purpose: 'login',
    requestKey: 'same-request-key'
  });
  assert.equal(found.state, 'accepted');

  await assert.rejects(
    () => service.findAttempt({
      target: 'different@example.com',
      purpose: 'login',
      requestKey: 'same-request-key'
    }),
    (error) => error.code === 'IDEMPOTENCY_CONFLICT' && error.status === 409
  );
});

test('expired pre-dispatch OTP work is reclaimed but ambiguous dispatch is not retried', async () => {
  const pool = createDeliveryPool();
  const clock = { value: new Date('2026-07-16T10:00:00.000Z') };
  const service = createOtpDeliveryService({
    pool,
    env,
    now: () => new Date(clock.value)
  });
  const input = {
    target: 'recovery@example.com',
    purpose: 'login',
    ip: '203.0.113.12',
    requestKey: 'recovery-request-key'
  };
  const first = await service.beginAttempt(input);
  const firstChallengeId = '10000000-0000-4000-8000-000000000001';
  await service.markChallengeReady({
    attemptId: first.attempt.id,
    challengeId: firstChallengeId,
    cooldownUntil: new Date('2026-07-16T10:01:00.000Z')
  });
  clock.value = new Date('2026-07-16T10:00:16.000Z');
  const reclaimed = await service.beginAttempt(input);
  assert.equal(reclaimed.owner, true);
  assert.equal(reclaimed.replay, true);
  assert.equal(reclaimed.replacedChallengeId, firstChallengeId);
  assert.equal(reclaimed.attempt.state, 'reserved');
  assert.equal(reclaimed.attempt.challengeId, '');

  const secondChallengeId = '20000000-0000-4000-8000-000000000002';
  await service.markChallengeReady({
    attemptId: first.attempt.id,
    challengeId: secondChallengeId,
    cooldownUntil: new Date('2026-07-16T10:02:00.000Z')
  });
  await service.markProviderDispatched({ attemptId: first.attempt.id });
  clock.value = new Date('2026-07-16T10:00:32.000Z');
  const ambiguous = await service.beginAttempt(input);
  assert.equal(ambiguous.owner, false);
  assert.equal(ambiguous.attempt.state, 'unknown');
  assert.equal(ambiguous.attempt.providerDispatched, true);
});
