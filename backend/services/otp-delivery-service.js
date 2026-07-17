const crypto = require('crypto');

const { getOtpHmacSecret } = require('../lib/otp-security');
const { withClientTransaction } = require('./auth-service');

const DEFAULT_LEASE_MS = 15_000;
const IDEMPOTENCY_WINDOW_MS = 60_000;
const RETENTION_DAYS = 30;
const FINAL_STATES = new Set(['accepted', 'debug', 'unknown', 'failed', 'rejected']);
const TARGET_IP_QUOTA_STATES = Object.freeze([
  'reserved',
  'challenge_ready',
  'accepted',
  'unknown',
  'failed'
]);
const GLOBAL_BUDGET_STATES = Object.freeze([
  'reserved',
  'challenge_ready',
  'accepted',
  'unknown'
]);
const ALL_STATES = new Set([
  'reserved',
  'challenge_ready',
  ...FINAL_STATES
]);

class OtpDeliveryError extends Error {
  constructor(code, { status = 400, retryable = false, retryAfterSec = 0 } = {}) {
    super(code);
    this.name = 'OtpDeliveryError';
    this.code = code;
    this.status = status;
    this.retryable = Boolean(retryable);
    this.retryAfterSec = Math.max(0, Number(retryAfterSec) || 0);
  }
}

const normalize = (value) => String(value || '').trim().toLowerCase();

const hmac = (namespace, value, env = process.env) =>
  crypto
    .createHmac('sha256', getOtpHmacSecret(env))
    .update(`artigen:${namespace}:v1\n${String(value || '')}`, 'utf8')
    .digest();

const hashQuotaTarget = (target, env = process.env) =>
  hmac('otp-quota-target', normalize(target), env);

const hashQuotaIp = (ip, env = process.env) =>
  hmac('otp-quota-ip', normalize(ip) || 'unknown', env);

const hashIdempotencyKey = ({ requestKey }, env = process.env) =>
  hmac(
    'otp-send-idempotency',
    String(requestKey || '').trim(),
    env
  );

const hashProviderMessage = (messageId, env = process.env) => {
  const value = String(messageId || '').trim();
  return value ? hmac('otp-provider-message', value, env) : null;
};

const boundedPositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, parsed);
};

const quotaLimits = (env = process.env) => ({
  targetHour: boundedPositiveInt(env.OTP_SEND_TARGET_HOURLY_LIMIT, 5, 1000),
  targetDay: boundedPositiveInt(env.OTP_SEND_TARGET_DAILY_LIMIT, 10, 10_000),
  ipHour: boundedPositiveInt(env.OTP_SEND_IP_HOURLY_LIMIT, 20, 100_000),
  ipDay: boundedPositiveInt(env.OTP_SEND_IP_DAILY_LIMIT, 50, 1_000_000),
  globalDay: boundedPositiveInt(env.OTP_SEND_GLOBAL_DAILY_LIMIT, 250, 10_000_000)
});

const validateExplicitKey = (value) => {
  const key = String(value || '').trim();
  if (!key) return '';
  if (
    key.length < 8 ||
    key.length > 200 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(key)
  ) {
    throw new OtpDeliveryError('INVALID_IDEMPOTENCY_KEY', {
      status: 400,
      retryable: false
    });
  }
  return key;
};

const resolveOtpSendIdempotencyKey = ({
  explicitKey,
  sessionId,
  projectId,
  target,
  purpose,
  ip,
  now = new Date()
} = {}) => {
  const explicit = validateExplicitKey(explicitKey);
  if (explicit) return explicit;
  const identity = String(sessionId || projectId || ip || 'anonymous')
    .trim()
    .slice(0, 160) || 'anonymous';
  const windowId = Math.floor(new Date(now).getTime() / IDEMPOTENCY_WINDOW_MS);
  const digest = crypto
    .createHash('sha256')
    .update(
      `artigen:otp-send-fallback:v1\n${normalize(purpose)}\n${normalize(target)}\n${identity}\n${windowId}`,
      'utf8'
    )
    .digest('hex');
  return `fallback:${digest}`;
};

const cooldownSec = (until, now = new Date()) => {
  if (!until) return 0;
  return Math.max(
    0,
    Math.ceil((new Date(until).getTime() - new Date(now).getTime()) / 1000)
  );
};

const normalizeAttempt = (row, now = new Date()) => ({
  id: String(row?.id || '').trim(),
  purpose: String(row?.purpose || '').trim(),
  challengeId: String(row?.challenge_id || '').trim(),
  state: String(row?.state || '').trim(),
  provider: String(row?.provider || '').trim(),
  providerDispatched: Boolean(row?.provider_dispatched_at),
  errorCode: String(row?.error_code || '').trim(),
  cooldownSec: cooldownSec(row?.cooldown_until, now),
  leaseExpired: row?.lease_expires_at
    ? new Date(row.lease_expires_at) <= new Date(now)
    : true,
  createdAt: row?.created_at || null
});

const assertAttemptBinding = ({
  row,
  targetHash,
  purpose
}) => {
  if (
    String(row?.purpose || '') !== normalize(purpose) ||
    !Buffer.isBuffer(row?.target_hash) ||
    row.target_hash.length !== targetHash.length ||
    !crypto.timingSafeEqual(row.target_hash, targetHash)
  ) {
    throw new OtpDeliveryError('IDEMPOTENCY_CONFLICT', {
      status: 409,
      retryable: false
    });
  }
};

const retryAfterFromOldest = (oldest, windowMs, now = new Date()) => {
  if (!oldest) return Math.ceil(windowMs / 1000);
  return Math.max(
    1,
    Math.ceil(
      (new Date(oldest).getTime() + windowMs - new Date(now).getTime()) / 1000
    )
  );
};

const quotaViolation = (row, limits, now = new Date()) => {
  const checks = [
    {
      scope: 'global_day',
      count: Number(row?.global_day || 0),
      limit: limits.globalDay,
      oldest: row?.global_day_oldest,
      windowMs: 24 * 60 * 60 * 1000
    },
    {
      scope: 'target_hour',
      count: Number(row?.target_hour || 0),
      limit: limits.targetHour,
      oldest: row?.target_hour_oldest,
      windowMs: 60 * 60 * 1000
    },
    {
      scope: 'target_day',
      count: Number(row?.target_day || 0),
      limit: limits.targetDay,
      oldest: row?.target_day_oldest,
      windowMs: 24 * 60 * 60 * 1000
    },
    {
      scope: 'ip_hour',
      count: Number(row?.ip_hour || 0),
      limit: limits.ipHour,
      oldest: row?.ip_hour_oldest,
      windowMs: 60 * 60 * 1000
    },
    {
      scope: 'ip_day',
      count: Number(row?.ip_day || 0),
      limit: limits.ipDay,
      oldest: row?.ip_day_oldest,
      windowMs: 24 * 60 * 60 * 1000
    }
  ];
  const blocked = checks.find((check) => check.count >= check.limit);
  return blocked
    ? {
        scope: blocked.scope,
        retryAfterSec: retryAfterFromOldest(
          blocked.oldest,
          blocked.windowMs,
          now
        )
      }
    : null;
};

const createOtpDeliveryService = ({
  pool,
  env = process.env,
  now = () => new Date()
} = {}) => {
  const findAttempt = async ({ target, purpose, requestKey }) => {
    const normalizedPurpose = normalize(purpose);
    if (!['login', 'password-reset'].includes(normalizedPurpose)) {
      throw new OtpDeliveryError('OTP_PURPOSE_INVALID', { status: 400 });
    }
    const targetHash = hashQuotaTarget(target, env);
    const idempotencyHash = hashIdempotencyKey({ requestKey }, env);
    const found = await pool.query(
      `SELECT id, target_hash, purpose, challenge_id, state, provider, error_code,
              cooldown_until, lease_expires_at, provider_dispatched_at, created_at
         FROM otp_delivery_attempts
        WHERE idempotency_hash=$1
        LIMIT 1`,
      [idempotencyHash]
    );
    if (!found.rowCount) return null;
    assertAttemptBinding({
      row: found.rows[0],
      targetHash,
      purpose: normalizedPurpose
    });
    return normalizeAttempt(found.rows[0], now());
  };

  const beginAttempt = async ({ target, purpose, ip, requestKey }) => {
    const normalizedPurpose = normalize(purpose);
    if (!['login', 'password-reset'].includes(normalizedPurpose)) {
      throw new OtpDeliveryError('OTP_PURPOSE_INVALID', { status: 400 });
    }
    const current = now();
    const targetHash = hashQuotaTarget(target, env);
    const ipHash = hashQuotaIp(ip, env);
    const idempotencyHash = hashIdempotencyKey({
      requestKey
    }, env);
    const leaseExpiresAt = new Date(current.getTime() + DEFAULT_LEASE_MS);
    return withClientTransaction(pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('artigen:otp-delivery-quota:v1', 0))"
      );
      const existing = await client.query(
        `SELECT id, target_hash, purpose, challenge_id, state, provider, error_code,
                cooldown_until, lease_expires_at, provider_dispatched_at, created_at
           FROM otp_delivery_attempts
          WHERE idempotency_hash=$1
          LIMIT 1 FOR UPDATE`,
        [idempotencyHash]
      );
      if (existing.rowCount) {
        const existingRow = existing.rows[0];
        assertAttemptBinding({
          row: existingRow,
          targetHash,
          purpose: normalizedPurpose
        });
        const attempt = normalizeAttempt(existingRow, current);
        if (
          ['reserved', 'challenge_ready'].includes(attempt.state) &&
          attempt.leaseExpired
        ) {
          if (attempt.providerDispatched) {
            const ambiguous = await client.query(
              `UPDATE otp_delivery_attempts
                  SET state='unknown', error_code='MAIL_DELIVERY_UNKNOWN',
                      completed_at=$2, updated_at=$2, lease_expires_at=$2
                WHERE id=$1
                  AND state IN ('reserved','challenge_ready')
                  AND provider_dispatched_at IS NOT NULL
                RETURNING id, purpose, challenge_id, state, provider, error_code,
                          cooldown_until, lease_expires_at, provider_dispatched_at,
                          created_at`,
              [attempt.id, current]
            );
            if (!ambiguous.rowCount) {
              const fresh = await client.query(
                `SELECT id, target_hash, purpose, challenge_id, state, provider,
                        error_code, cooldown_until, lease_expires_at,
                        provider_dispatched_at, created_at
                   FROM otp_delivery_attempts
                  WHERE id=$1
                  LIMIT 1`,
                [attempt.id]
              );
              return {
                ok: true,
                owner: false,
                replay: true,
                attempt: normalizeAttempt(fresh.rows[0] || existingRow, current)
              };
            }
            return {
              ok: true,
              owner: false,
              replay: true,
              attempt: normalizeAttempt(ambiguous.rows[0] || existingRow, current)
            };
          }
          const replacedChallengeId = attempt.challengeId;
          const reclaimed = await client.query(
            `UPDATE otp_delivery_attempts
                SET state='reserved', challenge_id=NULL, cooldown_until=NULL,
                    provider=NULL, error_code=NULL, lease_expires_at=$2,
                    updated_at=$3
              WHERE id=$1
                AND state IN ('reserved','challenge_ready')
                AND provider_dispatched_at IS NULL
              RETURNING id, purpose, challenge_id, state, provider, error_code,
                        cooldown_until, lease_expires_at, provider_dispatched_at,
                        created_at`,
            [attempt.id, leaseExpiresAt, current]
          );
          if (!reclaimed.rowCount) {
            const fresh = await client.query(
              `SELECT id, target_hash, purpose, challenge_id, state, provider,
                      error_code, cooldown_until, lease_expires_at,
                      provider_dispatched_at, created_at
                 FROM otp_delivery_attempts
                WHERE id=$1
                LIMIT 1`,
              [attempt.id]
            );
            return {
              ok: true,
              owner: false,
              replay: true,
              attempt: normalizeAttempt(fresh.rows[0] || existingRow, current)
            };
          }
          return {
            ok: true,
            owner: true,
            replay: true,
            replacedChallengeId,
            attempt: normalizeAttempt(reclaimed.rows[0], current)
          };
        }
        return { ok: true, owner: false, replay: true, attempt };
      }

      const quota = await client.query(
        `SELECT
           count(*) FILTER (
             WHERE target_hash=$1 AND created_at > $3::timestamptz - interval '1 hour'
               AND state=ANY($4::text[])
           ) AS target_hour,
           min(created_at) FILTER (
             WHERE target_hash=$1 AND created_at > $3::timestamptz - interval '1 hour'
               AND state=ANY($4::text[])
           ) AS target_hour_oldest,
           count(*) FILTER (
             WHERE target_hash=$1
               AND state=ANY($4::text[])
           ) AS target_day,
           min(created_at) FILTER (
             WHERE target_hash=$1
               AND state=ANY($4::text[])
           ) AS target_day_oldest,
           count(*) FILTER (
             WHERE ip_hash=$2 AND created_at > $3::timestamptz - interval '1 hour'
               AND state=ANY($4::text[])
           ) AS ip_hour,
           min(created_at) FILTER (
             WHERE ip_hash=$2 AND created_at > $3::timestamptz - interval '1 hour'
               AND state=ANY($4::text[])
           ) AS ip_hour_oldest,
           count(*) FILTER (
             WHERE ip_hash=$2
               AND state=ANY($4::text[])
           ) AS ip_day,
           min(created_at) FILTER (
             WHERE ip_hash=$2
               AND state=ANY($4::text[])
           ) AS ip_day_oldest,
           count(*) FILTER (
             WHERE state=ANY($5::text[])
           ) AS global_day,
           min(created_at) FILTER (
             WHERE state=ANY($5::text[])
           ) AS global_day_oldest
         FROM otp_delivery_attempts
        WHERE created_at > $3::timestamptz - interval '24 hours'`,
        [
          targetHash,
          ipHash,
          current,
          TARGET_IP_QUOTA_STATES,
          GLOBAL_BUDGET_STATES
        ]
      );
      const violation = quotaViolation(
        quota.rows[0] || {},
        quotaLimits(env),
        current
      );
      if (violation) {
        return {
          ok: false,
          error: 'OTP_SEND_QUOTA_EXCEEDED',
          scope: violation.scope,
          retryAfterSec: violation.retryAfterSec
        };
      }

      const inserted = await client.query(
        `INSERT INTO otp_delivery_attempts
          (idempotency_hash, target_hash, ip_hash, purpose, state,
           lease_expires_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'reserved',$5,$6,$6)
         RETURNING id, purpose, challenge_id, state, provider, error_code,
                   cooldown_until, lease_expires_at, provider_dispatched_at,
                   created_at`,
        [
          idempotencyHash,
          targetHash,
          ipHash,
          normalizedPurpose,
          leaseExpiresAt,
          current
        ]
      );
      return {
        ok: true,
        owner: true,
        replay: false,
        attempt: normalizeAttempt(inserted.rows[0], current)
      };
    });
  };

  const markChallengeReady = async ({
    attemptId,
    challengeId,
    cooldownUntil
  }) => {
    const current = now();
    const leaseExpiresAt = new Date(current.getTime() + DEFAULT_LEASE_MS);
    const updated = await pool.query(
      `UPDATE otp_delivery_attempts
          SET challenge_id=$2, state='challenge_ready', cooldown_until=$3,
              updated_at=$4, lease_expires_at=$5
        WHERE id=$1 AND state='reserved' AND provider_dispatched_at IS NULL
        RETURNING id`,
      [attemptId, challengeId, cooldownUntil || null, current, leaseExpiresAt]
    );
    if (!updated.rowCount) {
      throw new OtpDeliveryError('OTP_SEND_ATTEMPT_LOST', {
        status: 409,
        retryable: true
      });
    }
    return true;
  };

  const markProviderDispatched = async ({ attemptId, provider }) => {
    const current = now();
    const providerName = String(provider || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 32);
    const updated = await pool.query(
      `UPDATE otp_delivery_attempts
          SET provider_dispatched_at=$2, updated_at=$2,
              provider=CASE WHEN $3='' THEN provider ELSE $3 END
        WHERE id=$1
          AND state='challenge_ready'
          AND provider_dispatched_at IS NULL
          AND lease_expires_at > $2
        RETURNING id`,
      [attemptId, current, providerName]
    );
    if (!updated.rowCount) {
      throw new OtpDeliveryError('OTP_SEND_ATTEMPT_LOST', {
        status: 409,
        retryable: true
      });
    }
    return true;
  };

  const completeAttempt = async ({
    attemptId,
    state,
    provider,
    messageId,
    errorCode
  }) => {
    const normalizedState = normalize(state);
    if (!FINAL_STATES.has(normalizedState)) {
      throw new OtpDeliveryError('OTP_SEND_STATE_INVALID', { status: 500 });
    }
    const providerName = String(provider || '').trim().toLowerCase().slice(0, 32);
    const safeError = String(errorCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_:-]/g, '_')
      .slice(0, 96);
    const current = now();
    const updated = await pool.query(
      `UPDATE otp_delivery_attempts
          SET state=$2,
              provider=CASE WHEN $3='' THEN provider ELSE $3 END,
              provider_message_hash=$4,
              error_code=CASE WHEN $5='' THEN NULL ELSE $5 END,
              completed_at=$6, updated_at=$6, lease_expires_at=$6
        WHERE id=$1
          AND state IN ('reserved','challenge_ready')
        RETURNING id`,
      [
        attemptId,
        normalizedState,
        providerName,
        hashProviderMessage(messageId, env),
        safeError,
        current
      ]
    );
    return Boolean(updated.rowCount);
  };

  const sweepOldAttempts = async ({ limit = 1000 } = {}) => {
    const boundedLimit = Math.max(1, Math.min(5000, Number(limit) || 1000));
    const removed = await pool.query(
      `WITH old AS (
         SELECT id
           FROM otp_delivery_attempts
          WHERE created_at < now() - ($1::int * interval '1 day')
          ORDER BY created_at
          LIMIT $2
       )
       DELETE FROM otp_delivery_attempts attempt
        USING old
        WHERE attempt.id=old.id
       RETURNING attempt.id`,
      [RETENTION_DAYS, boundedLimit]
    );
    return removed.rowCount;
  };

  return {
    beginAttempt,
    completeAttempt,
    findAttempt,
    markChallengeReady,
    markProviderDispatched,
    sweepOldAttempts
  };
};

module.exports = {
  ALL_STATES,
  DEFAULT_LEASE_MS,
  FINAL_STATES,
  GLOBAL_BUDGET_STATES,
  IDEMPOTENCY_WINDOW_MS,
  OtpDeliveryError,
  RETENTION_DAYS,
  TARGET_IP_QUOTA_STATES,
  assertAttemptBinding,
  cooldownSec,
  createOtpDeliveryService,
  hashIdempotencyKey,
  hashProviderMessage,
  hashQuotaIp,
  hashQuotaTarget,
  normalizeAttempt,
  quotaLimits,
  quotaViolation,
  resolveOtpSendIdempotencyKey,
  retryAfterFromOldest,
  validateExplicitKey
};
