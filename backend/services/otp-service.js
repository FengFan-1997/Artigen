const crypto = require('crypto');

const { getOtpHmacSecret, hashOtpCode } = require('../lib/otp-security');
const { withClientTransaction } = require('./auth-service');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const normalize = (value) => String(value || '').trim().toLowerCase();

const hashOtpTarget = ({ target, purpose }, env = process.env) =>
  crypto
    .createHmac('sha256', getOtpHmacSecret(env))
    .update(`artigen-otp-target-v1\n${normalize(purpose)}\n${normalize(target)}`, 'utf8')
    .digest();

const safeBufferEqual = (left, right) => {
  try {
    const a = Buffer.isBuffer(left) ? left : Buffer.from(left || '');
    const b = Buffer.isBuffer(right) ? right : Buffer.from(right || '');
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

const createOtpService = ({ pool, env = process.env, now = () => new Date() } = {}) => {
  const lockTarget = async (client, targetHash, purpose) => {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${targetHash.toString('hex')}:${normalize(purpose)}`]
    );
  };

  const createChallenge = async ({ target, purpose, code }) => {
    const normalizedPurpose = normalize(purpose);
    const targetHash = hashOtpTarget({ target, purpose: normalizedPurpose }, env);
    const codeHmac = Buffer.from(
      hashOtpCode({ target, purpose: normalizedPurpose, code }, env),
      'hex'
    );
    return withClientTransaction(pool, async (client) => {
      await lockTarget(client, targetHash, normalizedPurpose);
      const latest = await client.query(
        `SELECT id, cooldown_until FROM otp_challenges
         WHERE target_hash=$1 AND purpose=$2
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [targetHash, normalizedPurpose]
      );
      const current = now();
      const cooldownUntil = latest.rows[0]?.cooldown_until
        ? new Date(latest.rows[0].cooldown_until)
        : null;
      if (cooldownUntil && cooldownUntil > current) {
        return {
          ok: false,
          error: 'OTP_COOLDOWN',
          cooldownSec: Math.max(1, Math.ceil((cooldownUntil - current) / 1000))
        };
      }
      // Supersede any older unused code; only the newest challenge is valid.
      await client.query(
        `UPDATE otp_challenges SET consumed_at=$3
         WHERE target_hash=$1 AND purpose=$2 AND consumed_at IS NULL`,
        [targetHash, normalizedPurpose, current]
      );
      const expiresAt = new Date(current.getTime() + OTP_TTL_MS);
      const nextSendAt = new Date(current.getTime() + OTP_COOLDOWN_MS);
      const inserted = await client.query(
        `INSERT INTO otp_challenges
          (target_hash, purpose, code_hmac, attempts, expires_at, cooldown_until, created_at)
         VALUES ($1,$2,$3,0,$4,$5,$6)
         RETURNING id, expires_at, cooldown_until`,
        [targetHash, normalizedPurpose, codeHmac, expiresAt, nextSendAt, current]
      );
      return {
        ok: true,
        challengeId: String(inserted.rows[0].id),
        expiresAt: inserted.rows[0].expires_at,
        cooldownUntil: inserted.rows[0].cooldown_until,
        cooldownSec: Math.ceil(OTP_COOLDOWN_MS / 1000)
      };
    });
  };

  const consumeChallenge = async ({ target, purpose, code }) => {
    const normalizedPurpose = normalize(purpose);
    const targetHash = hashOtpTarget({ target, purpose: normalizedPurpose }, env);
    const actual = Buffer.from(
      hashOtpCode({ target, purpose: normalizedPurpose, code }, env),
      'hex'
    );
    return withClientTransaction(pool, async (client) => {
      await lockTarget(client, targetHash, normalizedPurpose);
      const found = await client.query(
        `SELECT id, code_hmac, attempts, expires_at FROM otp_challenges
         WHERE target_hash=$1 AND purpose=$2 AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [targetHash, normalizedPurpose]
      );
      const row = found.rows[0];
      if (!row) return { ok: false, error: 'OTP_REQUIRED' };
      const current = now();
      if (new Date(row.expires_at) <= current) {
        await client.query(
          'UPDATE otp_challenges SET consumed_at=$2 WHERE id=$1 AND consumed_at IS NULL',
          [row.id, current]
        );
        return { ok: false, error: 'OTP_EXPIRED' };
      }
      const attempts = Number(row.attempts || 0);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await client.query(
          'UPDATE otp_challenges SET consumed_at=$2 WHERE id=$1 AND consumed_at IS NULL',
          [row.id, current]
        );
        return { ok: false, error: 'OTP_ATTEMPTS_EXCEEDED' };
      }
      if (!safeBufferEqual(actual, row.code_hmac)) {
        const nextAttempts = attempts + 1;
        await client.query(
          `UPDATE otp_challenges SET attempts=$2,
             consumed_at=CASE WHEN $2 >= $3 THEN $4 ELSE consumed_at END
           WHERE id=$1 AND consumed_at IS NULL`,
          [row.id, nextAttempts, OTP_MAX_ATTEMPTS, current]
        );
        return {
          ok: false,
          error: nextAttempts >= OTP_MAX_ATTEMPTS
            ? 'OTP_ATTEMPTS_EXCEEDED'
            : 'OTP_INCORRECT',
          attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - nextAttempts)
        };
      }
      const consumed = await client.query(
        `UPDATE otp_challenges SET consumed_at=$2
         WHERE id=$1 AND consumed_at IS NULL RETURNING id`,
        [row.id, current]
      );
      return consumed.rowCount
        ? { ok: true, challengeId: String(row.id) }
        : { ok: false, error: 'OTP_ALREADY_USED' };
    });
  };

  const invalidateChallenge = async (challengeId, { releaseCooldown = false } = {}) => {
    if (!challengeId) return false;
    const current = now();
    const changed = await pool.query(
      `UPDATE otp_challenges
          SET consumed_at=COALESCE(consumed_at,$2),
              cooldown_until=CASE
                WHEN $3 THEN LEAST(cooldown_until,$2)
                ELSE cooldown_until
              END
       WHERE id=$1 RETURNING id`,
      [challengeId, current, Boolean(releaseCooldown)]
    );
    return Boolean(changed.rowCount);
  };

  return { createChallenge, consumeChallenge, invalidateChallenge };
};

module.exports = {
  OTP_TTL_MS,
  OTP_COOLDOWN_MS,
  OTP_MAX_ATTEMPTS,
  createOtpService,
  hashOtpTarget,
  safeBufferEqual
};
