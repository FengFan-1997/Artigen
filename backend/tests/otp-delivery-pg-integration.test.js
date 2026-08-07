const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { getPool } = require('../db/pool');
const {
  DEFAULT_LEASE_MS,
  createOtpDeliveryService
} = require('../services/otp-delivery-service');
const { createOtpService } = require('../services/otp-service');

const hasDatabase = Boolean(String(process.env.DATABASE_URL || '').trim());
const env = {
  ...process.env,
  NODE_ENV: 'production',
  OTP_HMAC_SECRET:
    process.env.OTP_HMAC_SECRET ||
    'otp-pg-integration-secret-that-is-never-used-in-production',
  OTP_SEND_TARGET_HOURLY_LIMIT: '1000',
  OTP_SEND_TARGET_DAILY_LIMIT: '10000',
  OTP_SEND_IP_HOURLY_LIMIT: '100000',
  OTP_SEND_IP_DAILY_LIMIT: '1000000',
  OTP_SEND_GLOBAL_DAILY_LIMIT: '10000000'
};

const uniqueInput = (label) => {
  const suffix = crypto.randomUUID();
  return {
    target: `${label}-${suffix}@example.test`,
    purpose: 'login',
    ip: `integration-${suffix}`,
    requestKey: `otp-pg:${label}:${suffix}`
  };
};

const removeRows = async ({ attemptIds = [], challengeIds = [] } = {}) => {
  if (attemptIds.length) {
    await getPool().query(
      'DELETE FROM otp_delivery_attempts WHERE id=ANY($1::uuid[])',
      [attemptIds]
    );
  }
  if (challengeIds.length) {
    await getPool().query(
      'DELETE FROM otp_challenges WHERE id=ANY($1::uuid[])',
      [challengeIds]
    );
  }
};

test.after(async () => {
  if (hasDatabase) await getPool().end();
});

test('50 identical PostgreSQL OTP begin attempts elect exactly one owner', {
  skip: !hasDatabase
}, async () => {
  const service = createOtpDeliveryService({ pool: getPool(), env });
  const input = uniqueInput('same-key');
  const attempts = await Promise.all(
    Array.from({ length: 50 }, () => service.beginAttempt(input))
  );
  const attemptIds = [...new Set(attempts.map((item) => item.attempt.id))];

  try {
    assert.equal(attempts.every((item) => item.ok), true);
    assert.equal(attempts.filter((item) => item.owner).length, 1);
    assert.equal(attempts.filter((item) => item.replay).length, 49);
    assert.equal(attemptIds.length, 1);

    const stored = await getPool().query(
      'SELECT count(*)::int AS count FROM otp_delivery_attempts WHERE id=$1',
      [attemptIds[0]]
    );
    assert.equal(Number(stored.rows[0].count), 1);
  } finally {
    await removeRows({ attemptIds });
  }
});

test('PostgreSQL OTP idempotency rejects one key rebound to another email', {
  skip: !hasDatabase
}, async () => {
  const service = createOtpDeliveryService({ pool: getPool(), env });
  const input = uniqueInput('binding');
  const first = await service.beginAttempt(input);

  try {
    await assert.rejects(
      service.beginAttempt({
        ...input,
        target: `different-${crypto.randomUUID()}@example.test`
      }),
      (error) =>
        error?.code === 'IDEMPOTENCY_CONFLICT' &&
        Number(error?.status) === 409
    );
  } finally {
    await removeRows({ attemptIds: [first.attempt.id] });
  }
});

test('50 concurrent PostgreSQL OTP consumers can consume one challenge once', {
  skip: !hasDatabase
}, async () => {
  const otp = createOtpService({ pool: getPool(), env });
  const target = `consume-${crypto.randomUUID()}@example.test`;
  const purpose = 'login';
  const code = '482731';
  const challenge = await otp.createChallenge({ target, purpose, code });

  try {
    assert.equal(challenge.ok, true);
    const outcomes = await Promise.all(
      Array.from({ length: 50 }, () =>
        otp.consumeChallenge({ target, purpose, code })
      )
    );
    assert.equal(outcomes.filter((item) => item.ok).length, 1);
    assert.equal(
      outcomes.filter((item) => !item.ok && item.error === 'OTP_REQUIRED').length,
      49
    );

    const stored = await getPool().query(
      'SELECT consumed_at FROM otp_challenges WHERE id=$1',
      [challenge.challengeId]
    );
    assert.equal(stored.rowCount, 1);
    assert.ok(stored.rows[0].consumed_at);
  } finally {
    await removeRows({ challengeIds: [challenge.challengeId] });
  }
});

test('an expired pre-dispatch PostgreSQL OTP lease is reclaimed with its old challenge identified', {
  skip: !hasDatabase
}, async () => {
  const clock = { value: new Date() };
  const now = () => new Date(clock.value);
  const delivery = createOtpDeliveryService({ pool: getPool(), env, now });
  const otp = createOtpService({ pool: getPool(), env, now });
  const input = uniqueInput('reclaim');
  const first = await delivery.beginAttempt(input);
  const challenge = await otp.createChallenge({
    target: input.target,
    purpose: input.purpose,
    code: '314159'
  });
  await delivery.markChallengeReady({
    attemptId: first.attempt.id,
    challengeId: challenge.challengeId,
    cooldownUntil: challenge.cooldownUntil
  });

  try {
    clock.value = new Date(clock.value.getTime() + DEFAULT_LEASE_MS + 1000);
    const reclaimed = await delivery.beginAttempt(input);

    assert.equal(reclaimed.ok, true);
    assert.equal(reclaimed.owner, true);
    assert.equal(reclaimed.replay, true);
    assert.equal(reclaimed.replacedChallengeId, challenge.challengeId);
    assert.equal(reclaimed.attempt.id, first.attempt.id);
    assert.equal(reclaimed.attempt.state, 'reserved');
    assert.equal(reclaimed.attempt.challengeId, '');
  } finally {
    await removeRows({
      attemptIds: [first.attempt.id],
      challengeIds: [challenge.challengeId]
    });
  }
});

test('an expired post-dispatch PostgreSQL OTP lease becomes unknown and is never reclaimed', {
  skip: !hasDatabase
}, async () => {
  const clock = { value: new Date() };
  const now = () => new Date(clock.value);
  const delivery = createOtpDeliveryService({ pool: getPool(), env, now });
  const otp = createOtpService({ pool: getPool(), env, now });
  const input = uniqueInput('post-dispatch');
  const first = await delivery.beginAttempt(input);
  const challenge = await otp.createChallenge({
    target: input.target,
    purpose: input.purpose,
    code: '271828'
  });
  await delivery.markChallengeReady({
    attemptId: first.attempt.id,
    challengeId: challenge.challengeId,
    cooldownUntil: challenge.cooldownUntil
  });

  try {
    await delivery.markProviderDispatched({
      attemptId: first.attempt.id,
      provider: 'brevo'
    });
    clock.value = new Date(clock.value.getTime() + DEFAULT_LEASE_MS + 1000);
    const replay = await delivery.beginAttempt(input);

    assert.equal(replay.ok, true);
    assert.equal(replay.owner, false);
    assert.equal(replay.replay, true);
    assert.equal(replay.attempt.id, first.attempt.id);
    assert.equal(replay.attempt.state, 'unknown');

    const stored = await getPool().query(
      'SELECT state FROM otp_delivery_attempts WHERE id=$1',
      [first.attempt.id]
    );
    assert.equal(stored.rows[0].state, 'unknown');
  } finally {
    await removeRows({
      attemptIds: [first.attempt.id],
      challengeIds: [challenge.challengeId]
    });
  }
});
