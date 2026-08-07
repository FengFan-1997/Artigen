const assert = require('node:assert/strict');
const test = require('node:test');

const { createOtpService } = require('../services/otp-service');

const compact = (sql) => String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
const sameBuffer = (left, right) => Buffer.from(left).equals(Buffer.from(right));

const createOtpPool = () => {
  const state = { challenges: [], locks: new Map() };
  let id = 0;

  const connect = async () => {
    const heldLocks = [];
    const releaseLocks = () => {
      while (heldLocks.length) heldLocks.pop()();
    };
    const query = async (sql, params = []) => {
      const q = compact(sql);
      if (q === 'begin') return { rowCount: 0, rows: [] };
      if (q === 'commit' || q === 'rollback') {
        releaseLocks();
        return { rowCount: 0, rows: [] };
      }
      if (q.startsWith('select pg_advisory_xact_lock')) {
        const key = String(params[0]);
        const previous = state.locks.get(key) || Promise.resolve();
        let release;
        const mine = new Promise((resolve) => { release = resolve; });
        const chain = previous.then(() => mine);
        state.locks.set(key, chain);
        await previous;
        heldLocks.push(() => {
          release();
          if (state.locks.get(key) === chain) state.locks.delete(key);
        });
        return { rowCount: 1, rows: [{}] };
      }
      if (q.startsWith('select id, cooldown_until from otp_challenges')) {
        const [targetHash, purpose] = params;
        const rows = state.challenges
          .filter((row) => sameBuffer(row.target_hash, targetHash) && row.purpose === purpose)
          .sort((a, b) => b.created_at - a.created_at);
        return {
          rowCount: rows.length ? 1 : 0,
          rows: rows.length ? [{ id: rows[0].id, cooldown_until: rows[0].cooldown_until }] : []
        };
      }
      if (q.startsWith('update otp_challenges set consumed_at=$3')) {
        const [targetHash, purpose, consumedAt] = params;
        let changed = 0;
        for (const row of state.challenges) {
          if (sameBuffer(row.target_hash, targetHash) && row.purpose === purpose && !row.consumed_at) {
            row.consumed_at = consumedAt;
            changed += 1;
          }
        }
        return { rowCount: changed, rows: [] };
      }
      if (q.startsWith('insert into otp_challenges')) {
        const [targetHash, purpose, codeHmac, expiresAt, cooldownUntil, createdAt] = params;
        const row = {
          id: `otp-${++id}`,
          target_hash: Buffer.from(targetHash),
          purpose,
          code_hmac: Buffer.from(codeHmac),
          attempts: 0,
          expires_at: expiresAt,
          cooldown_until: cooldownUntil,
          consumed_at: null,
          created_at: createdAt
        };
        state.challenges.push(row);
        return {
          rowCount: 1,
          rows: [{ id: row.id, expires_at: expiresAt, cooldown_until: cooldownUntil }]
        };
      }
      if (q.startsWith('select id, code_hmac, attempts, expires_at from otp_challenges')) {
        const [targetHash, purpose] = params;
        const rows = state.challenges
          .filter((row) =>
            sameBuffer(row.target_hash, targetHash) && row.purpose === purpose && !row.consumed_at
          )
          .sort((a, b) => b.created_at - a.created_at);
        return { rowCount: rows.length ? 1 : 0, rows: rows.length ? [{ ...rows[0] }] : [] };
      }
      if (q.startsWith('update otp_challenges set attempts=$2')) {
        const [challengeId, attempts, maxAttempts, current] = params;
        const row = state.challenges.find((item) => item.id === challengeId && !item.consumed_at);
        if (row) {
          row.attempts = attempts;
          if (attempts >= maxAttempts) row.consumed_at = current;
        }
        return { rowCount: row ? 1 : 0, rows: [] };
      }
      if (q.startsWith('update otp_challenges set consumed_at=$2')) {
        const [challengeId, current] = params;
        const row = state.challenges.find((item) => item.id === challengeId && !item.consumed_at);
        if (row) row.consumed_at = current;
        return {
          rowCount: row ? 1 : 0,
          rows: row && q.includes('returning id') ? [{ id: row.id }] : []
        };
      }
      throw new Error(`Unhandled fake OTP SQL: ${q}`);
    };
    return { query, release: releaseLocks };
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

test('PostgreSQL OTP cooldown and concurrent consumption are atomic', async () => {
  const pool = createOtpPool();
  const clock = { value: new Date('2026-07-15T00:00:00.000Z') };
  const env = { NODE_ENV: 'production', OTP_HMAC_SECRET: 'otp-test-secret' };
  const otp = createOtpService({ pool, env, now: () => new Date(clock.value) });

  const sends = await Promise.all(
    Array.from({ length: 20 }, (_, index) => otp.createChallenge({
      target: 'person@example.com',
      purpose: 'login',
      code: String(index).padStart(6, '0')
    }))
  );
  assert.equal(sends.filter((item) => item.ok).length, 1);
  assert.equal(sends.filter((item) => item.error === 'OTP_COOLDOWN').length, 19);
  assert.equal(pool.state.challenges.length, 1);

  const winnerCode = String(sends.findIndex((item) => item.ok)).padStart(6, '0');
  const consumes = await Promise.all(
    Array.from({ length: 20 }, () => otp.consumeChallenge({
      target: 'person@example.com',
      purpose: 'login',
      code: winnerCode
    }))
  );
  assert.equal(consumes.filter((item) => item.ok).length, 1);
  assert.equal(pool.state.challenges.filter((item) => item.consumed_at).length, 1);
});

test('PostgreSQL OTP expires after ten minutes and permits at most five attempts', async () => {
  const pool = createOtpPool();
  const clock = { value: new Date('2026-07-15T00:00:00.000Z') };
  const env = { NODE_ENV: 'production', OTP_HMAC_SECRET: 'otp-test-secret' };
  const otp = createOtpService({ pool, env, now: () => new Date(clock.value) });

  await otp.createChallenge({
    target: 'attempts@example.com',
    purpose: 'password-reset',
    code: '123456'
  });
  const failures = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    failures.push(await otp.consumeChallenge({
      target: 'attempts@example.com',
      purpose: 'password-reset',
      code: '000000'
    }));
  }
  assert.deepEqual(failures.map((item) => item.attemptsLeft), [4, 3, 2, 1, 0]);
  assert.equal(failures[4].error, 'OTP_ATTEMPTS_EXCEEDED');
  const blocked = await otp.consumeChallenge({
    target: 'attempts@example.com',
    purpose: 'password-reset',
    code: '123456'
  });
  assert.equal(blocked.ok, false);

  clock.value = new Date('2026-07-15T00:01:01.000Z');
  await otp.createChallenge({
    target: 'expiry@example.com',
    purpose: 'login',
    code: '654321'
  });
  clock.value = new Date('2026-07-15T00:11:02.000Z');
  const expired = await otp.consumeChallenge({
    target: 'expiry@example.com',
    purpose: 'login',
    code: '654321'
  });
  assert.equal(expired.error, 'OTP_EXPIRED');
});
