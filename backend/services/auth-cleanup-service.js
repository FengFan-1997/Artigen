const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_OTP_RETENTION_DAYS = 1;
const DEFAULT_SESSION_RETENTION_DAYS = 7;
const DEFAULT_DELIVERY_RETENTION_DAYS = 30;

const boundedInt = (value, fallback, { min, max }) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const cleanupConfig = (env = process.env) => ({
  intervalMs: boundedInt(
    env.AUTH_CLEANUP_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
    { min: DEFAULT_INTERVAL_MS, max: 24 * DEFAULT_INTERVAL_MS }
  ),
  batchSize: boundedInt(
    env.AUTH_CLEANUP_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    { min: 1, max: 5000 }
  ),
  otpRetentionDays: boundedInt(
    env.OTP_CHALLENGE_RETENTION_DAYS,
    DEFAULT_OTP_RETENTION_DAYS,
    { min: 1, max: 90 }
  ),
  sessionRetentionDays: boundedInt(
    env.AUTH_SESSION_RETENTION_DAYS,
    DEFAULT_SESSION_RETENTION_DAYS,
    { min: 1, max: 365 }
  ),
  deliveryRetentionDays: boundedInt(
    env.OTP_DELIVERY_RETENTION_DAYS,
    DEFAULT_DELIVERY_RETENTION_DAYS,
    { min: 1, max: 365 }
  )
});

const safeErrorCode = (error) =>
  String(error?.code || error?.name || 'CLEANUP_FAILED')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_:-]/g, '_')
    .slice(0, 80) || 'CLEANUP_FAILED';

const cleanupQueries = Object.freeze({
  otpChallenges: `
    WITH doomed AS (
      SELECT id
        FROM otp_challenges
       WHERE expires_at < $1::timestamptz - ($2::int * interval '1 day')
          OR (
            consumed_at IS NOT NULL
            AND consumed_at < $1::timestamptz - ($2::int * interval '1 day')
          )
       ORDER BY COALESCE(consumed_at, expires_at), id
       LIMIT $3
       FOR UPDATE SKIP LOCKED
    )
    DELETE FROM otp_challenges target
     USING doomed
     WHERE target.id=doomed.id
    RETURNING target.id
  `,
  sessions: `
    WITH doomed AS (
      SELECT id
        FROM sessions
       WHERE expires_at < $1::timestamptz - ($2::int * interval '1 day')
          OR (
            revoked_at IS NOT NULL
            AND revoked_at < $1::timestamptz - ($2::int * interval '1 day')
          )
       ORDER BY COALESCE(revoked_at, expires_at), id
       LIMIT $3
       FOR UPDATE SKIP LOCKED
    )
    DELETE FROM sessions target
     USING doomed
     WHERE target.id=doomed.id
    RETURNING target.id
  `,
  otpDeliveries: `
    WITH doomed AS (
      SELECT id
        FROM otp_delivery_attempts
       WHERE created_at < $1::timestamptz - ($2::int * interval '1 day')
       ORDER BY created_at, id
       LIMIT $3
       FOR UPDATE SKIP LOCKED
    )
    DELETE FROM otp_delivery_attempts target
     USING doomed
     WHERE target.id=doomed.id
    RETURNING target.id
  `
});

const createAuthCleanupService = ({
  pool,
  env = process.env,
  now = () => new Date(),
  logger = console
} = {}) => {
  const config = cleanupConfig(env);
  let lastStartedAt = null;
  let inFlight = null;

  const deleteBatch = async ({ kind, sql, retentionDays }) => {
    try {
      const result = await pool.query(sql, [
        now(),
        retentionDays,
        config.batchSize
      ]);
      return { kind, deleted: Number(result?.rowCount || 0), ok: true };
    } catch (error) {
      logger.warn?.('[AuthCleanup]', {
        kind,
        code: safeErrorCode(error)
      });
      return {
        kind,
        deleted: 0,
        ok: false,
        code: safeErrorCode(error)
      };
    }
  };

  const runOnce = async () => {
    if (!pool || typeof pool.query !== 'function') {
      return [{ kind: 'all', deleted: 0, ok: false, code: 'DATABASE_NOT_CONFIGURED' }];
    }
    return Promise.all([
      deleteBatch({
        kind: 'otp_challenges',
        sql: cleanupQueries.otpChallenges,
        retentionDays: config.otpRetentionDays
      }),
      deleteBatch({
        kind: 'sessions',
        sql: cleanupQueries.sessions,
        retentionDays: config.sessionRetentionDays
      }),
      deleteBatch({
        kind: 'otp_delivery_attempts',
        sql: cleanupQueries.otpDeliveries,
        retentionDays: config.deliveryRetentionDays
      })
    ]);
  };

  const maybeRun = () => {
    const currentMs = new Date(now()).getTime();
    if (
      inFlight ||
      (lastStartedAt !== null && currentMs - lastStartedAt < config.intervalMs)
    ) {
      return false;
    }
    lastStartedAt = currentMs;
    inFlight = runOnce()
      .catch((error) => {
        logger.warn?.('[AuthCleanup]', {
          kind: 'all',
          code: safeErrorCode(error)
        });
      })
      .finally(() => {
        inFlight = null;
      });
    return true;
  };

  const waitForIdle = async () => {
    if (inFlight) await inFlight;
  };

  return {
    config,
    maybeRun,
    runOnce,
    waitForIdle
  };
};

module.exports = {
  DEFAULT_BATCH_SIZE,
  DEFAULT_DELIVERY_RETENTION_DAYS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_OTP_RETENTION_DAYS,
  DEFAULT_SESSION_RETENTION_DAYS,
  cleanupConfig,
  cleanupQueries,
  createAuthCleanupService,
  safeErrorCode
};
