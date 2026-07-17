const crypto = require('crypto');
const { promisify } = require('util');

const { deriveCsrfToken } = require('../lib/csrf-protection');
const { parseSessionNotBefore } = require('../lib/auth-utils');

const scryptAsync = promisify(crypto.scrypt);
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

class AuthServiceError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code);
    this.name = 'AuthServiceError';
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

const isProduction = (env = process.env) =>
  String(env.NODE_ENV || '').trim().toLowerCase() === 'production';

const usesDatabaseAuth = (env = process.env) =>
  isProduction(env) || Boolean(String(env.DATABASE_URL || '').trim());

const getSessionHashSecret = (env = process.env) => {
  const secret = String(
    env.SESSION_TOKEN_HASH_SECRET || env.CSRF_SECRET || env.OTP_HMAC_SECRET || ''
  ).trim();
  if (!secret) throw new AuthServiceError('SESSION_HASH_NOT_CONFIGURED', 503);
  return secret;
};

const hmacBuffer = (secret, namespace, value) =>
  crypto
    .createHmac('sha256', secret)
    .update(`${namespace}\u0000${String(value || '')}`, 'utf8')
    .digest();

const hashSessionToken = (token, env = process.env) =>
  hmacBuffer(getSessionHashSecret(env), 'session-token-v1', token);

const hashCsrfToken = (csrfToken, env = process.env) =>
  hmacBuffer(getSessionHashSecret(env), 'session-csrf-v1', csrfToken);

const hashUserAgent = (value) => {
  const text = String(value || '').trim();
  return text ? crypto.createHash('sha256').update(text, 'utf8').digest() : null;
};

const generateSessionToken = () => crypto.randomBytes(32).toString('base64url');

const sessionTtlMs = (env = process.env) => {
  const parsed = Number(env.SESSION_TTL_MS || 0);
  if (Number.isFinite(parsed) && parsed >= 60_000) {
    return Math.min(parsed, 365 * 24 * 60 * 60 * 1000);
  }
  const days = Number(env.SESSION_TTL_DAYS || 0);
  if (Number.isFinite(days) && days > 0) {
    return Math.min(days, 365) * 24 * 60 * 60 * 1000;
  }
  return DEFAULT_SESSION_TTL_MS;
};

const initialCredits = (env = process.env) => {
  const parsed = Number.parseInt(String(env.CREDITS_INIT ?? '100'), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
};

const encodePassword = async (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scryptAsync(String(password || ''), salt, 32);
  return `scrypt$v1$${salt}$${hash.toString('hex')}`;
};

const safeEqualHex = (left, right) => {
  try {
    const a = Buffer.from(String(left || ''), 'hex');
    const b = Buffer.from(String(right || ''), 'hex');
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

const verifyEncodedPassword = async (encoded, password) => {
  const parts = String(encoded || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return { ok: false, upgrade: false };
  const [, version, salt, expected] = parts;
  if (!['v1', 'legacy-sync'].includes(version) || !salt || !expected) {
    return { ok: false, upgrade: false };
  }
  try {
    const actual = await scryptAsync(String(password || ''), salt, 32);
    return {
      ok: safeEqualHex(actual.toString('hex'), expected),
      upgrade: version !== 'v1'
    };
  } catch {
    return { ok: false, upgrade: false };
  }
};

const withClientTransaction = async (pool, callback) => {
  if (!pool || typeof pool.connect !== 'function') {
    throw new AuthServiceError('DATABASE_NOT_CONFIGURED', 503);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
};

const normalizeDbUser = (row) => ({
  dbUserId: String(row.id || row.user_id || '').trim(),
  userId: String(row.legacy_user_id || row.id || row.user_id || '').trim(),
  legacyUserId: String(row.legacy_user_id || '').trim(),
  username: String(row.username || '').trim(),
  email: String(row.email || '').trim().toLowerCase(),
  name: String(row.display_name || row.username || row.email || '').trim(),
  status: String(row.status || 'active').trim()
});

const mapUniqueViolation = (error) => {
  if (String(error?.code || '') !== '23505') throw error;
  const constraint = String(error?.constraint || '');
  if (constraint.includes('username')) throw new AuthServiceError('USERNAME_EXISTS', 409);
  if (constraint.includes('email')) throw new AuthServiceError('EMAIL_EXISTS', 409);
  if (constraint.includes('provider_subject')) {
    throw new AuthServiceError('IDENTITY_ALREADY_LINKED', 409);
  }
  throw new AuthServiceError('ACCOUNT_CONFLICT', 409);
};

const createAuthService = ({ pool, env = process.env, now = () => new Date() } = {}) => {
  const ensureWallet = async (client, userId) => {
    const credits = initialCredits(env);
    const inserted = await client.query(
      `INSERT INTO wallets (user_id, available_credits, frozen_credits)
       VALUES ($1,$2,0)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING available_credits, frozen_credits`,
      [userId, credits]
    );
    if (inserted.rowCount) {
      await client.query(
        `INSERT INTO wallet_ledger
          (user_id, entry_type, delta_available, delta_frozen, balance_available,
           balance_frozen, reference_type, reference_id, idempotency_key, metadata)
         VALUES ($1,'admin_adjustment',$2,0,$2,0,'account_signup',$1::text,$3,$4)
         ON CONFLICT (user_id, idempotency_key)
           WHERE idempotency_key IS NOT NULL DO NOTHING`,
        [userId, credits, `signup:${userId}`, JSON.stringify({ source: 'signup' })]
      );
    }
    const wallet = inserted.rowCount
      ? inserted.rows[0]
      : (
          await client.query(
            'SELECT available_credits, frozen_credits FROM wallets WHERE user_id=$1',
            [userId]
          )
        ).rows[0];
    if (!wallet) throw new AuthServiceError('WALLET_CREATE_FAILED', 500);
    return {
      available: Number(wallet.available_credits || 0),
      frozen: Number(wallet.frozen_credits || 0)
    };
  };

  const createSession = async (client, user, { userAgent = '' } = {}) => {
    const token = generateSessionToken();
    const csrfToken = deriveCsrfToken(token, env);
    const issuedAt = now();
    const expiresAt = new Date(issuedAt.getTime() + sessionTtlMs(env));
    const inserted = await client.query(
      `INSERT INTO sessions
        (user_id, token_hash, csrf_hash, user_agent_hash, expires_at, created_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$6)
       RETURNING id, created_at, expires_at`,
      [
        user.id,
        hashSessionToken(token, env),
        hashCsrfToken(csrfToken, env),
        hashUserAgent(userAgent),
        expiresAt,
        issuedAt
      ]
    );
    if (!inserted.rowCount) throw new AuthServiceError('SESSION_CREATE_FAILED', 500);
    return {
      token,
      csrfToken,
      sessionId: String(inserted.rows[0].id),
      issuedAt: inserted.rows[0].created_at,
      expiresAt: inserted.rows[0].expires_at
    };
  };

  const attachIdentity = async (client, userId, identity) => {
    if (!identity?.provider || !identity?.subject) return;
    const linked = await client.query(
      `INSERT INTO user_identities (user_id, provider, subject)
       VALUES ($1,$2,$3)
       ON CONFLICT (provider, subject) DO UPDATE SET subject=EXCLUDED.subject
       RETURNING user_id`,
      [userId, String(identity.provider), String(identity.subject)]
    );
    if (String(linked.rows[0]?.user_id || '') !== String(userId)) {
      throw new AuthServiceError('IDENTITY_ALREADY_LINKED', 409);
    }
  };

  const findIdentityUser = async (client, identity) => {
    if (!identity?.provider || !identity?.subject) return null;
    const found = await client.query(
      `SELECT u.* FROM user_identities i
       JOIN users u ON u.id=i.user_id
       WHERE i.provider=$1 AND i.subject=$2
       LIMIT 1 FOR UPDATE OF u`,
      [String(identity.provider), String(identity.subject)]
    );
    return found.rows[0] || null;
  };

  const loginWithVerifiedIdentity = async ({
    legacyUserId,
    email,
    username,
    displayName,
    identity,
    userAgent
  }) =>
    withClientTransaction(pool, async (client) => {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      let user = await findIdentityUser(client, identity);
      if (!user && normalizedEmail) {
        const byEmail = await client.query(
          'SELECT * FROM users WHERE email=$1 LIMIT 1 FOR UPDATE',
          [normalizedEmail]
        );
        user = byEmail.rows[0] || null;
      }
      if (!user) {
        try {
          const inserted = await client.query(
            `INSERT INTO users
              (legacy_user_id, username, email, display_name, status)
             VALUES ($1,$2,$3,$4,'active')
             RETURNING *`,
            [
              String(legacyUserId || '').trim() || null,
              String(username || '').trim() || null,
              normalizedEmail || null,
              String(displayName || username || normalizedEmail || 'Friend').trim()
            ]
          );
          user = inserted.rows[0];
        } catch (error) {
          mapUniqueViolation(error);
        }
      } else {
        const updated = await client.query(
          `UPDATE users SET
             email=COALESCE($2,email),
             display_name=CASE WHEN display_name='' THEN $3 ELSE display_name END,
             updated_at=now()
           WHERE id=$1 RETURNING *`,
          [user.id, normalizedEmail || null, String(displayName || '').trim()]
        );
        user = updated.rows[0];
      }
      if (!user || user.status !== 'active') throw new AuthServiceError('ACCOUNT_DISABLED', 403);
      await attachIdentity(client, user.id, identity);
      const wallet = await ensureWallet(client, user.id);
      const session = await createSession(client, user, { userAgent });
      return { user: normalizeDbUser(user), wallet, session };
    });

  const registerWithPassword = async ({
    legacyUserId,
    username,
    email,
    displayName,
    password,
    userAgent
  }) => {
    const encoded = await encodePassword(password);
    return withClientTransaction(pool, async (client) => {
      let user;
      try {
        const inserted = await client.query(
          `INSERT INTO users
            (legacy_user_id, username, email, display_name, password_hash, status)
           VALUES ($1,$2,$3,$4,$5,'active')
           RETURNING *`,
          [
            String(legacyUserId || '').trim() || null,
            String(username || '').trim(),
            String(email || '').trim().toLowerCase(),
            String(displayName || username || '').trim(),
            encoded
          ]
        );
        user = inserted.rows[0];
      } catch (error) {
        mapUniqueViolation(error);
      }
      await attachIdentity(client, user.id, {
        provider: 'password',
        subject: String(username || '').trim().toLowerCase()
      });
      const wallet = await ensureWallet(client, user.id);
      const session = await createSession(client, user, { userAgent });
      return { user: normalizeDbUser(user), wallet, session };
    });
  };

  const authenticatePassword = async ({ login, password, userAgent }) =>
    withClientTransaction(pool, async (client) => {
      const normalized = String(login || '').trim().toLowerCase();
      const result = await client.query(
        `SELECT * FROM users
         WHERE username=$1 OR email=$1
         LIMIT 1 FOR UPDATE`,
        [normalized]
      );
      const user = result.rows[0];
      if (!user || user.status !== 'active') throw new AuthServiceError('INVALID_CREDENTIALS', 401);
      const checked = await verifyEncodedPassword(user.password_hash, password);
      if (!checked.ok) throw new AuthServiceError('INVALID_CREDENTIALS', 401);
      if (checked.upgrade) {
        user.password_hash = await encodePassword(password);
        await client.query(
          'UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1',
          [user.id, user.password_hash]
        );
      }
      await attachIdentity(client, user.id, {
        provider: 'password',
        subject: String(user.username || user.email || '').trim().toLowerCase()
      });
      const wallet = await ensureWallet(client, user.id);
      const session = await createSession(client, user, { userAgent });
      return { user: normalizeDbUser(user), wallet, session };
    });

  const resolveSession = async (token) => {
    const raw = String(token || '').trim();
    if (!raw) return { ok: false, status: 401, error: 'LOGIN_REQUIRED' };
    const found = await pool.query(
      `SELECT s.id AS session_id, s.user_id, s.created_at AS session_created_at,
              s.expires_at, s.revoked_at, u.id, u.legacy_user_id, u.username,
              u.email, u.display_name, u.status
       FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 LIMIT 1`,
      [hashSessionToken(raw, env)]
    );
    const row = found.rows[0];
    if (!row || row.revoked_at || row.status !== 'active') {
      return { ok: false, status: 401, error: 'SESSION_INVALID' };
    }
    const current = now();
    const expiresAt = new Date(row.expires_at);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= current) {
      await pool.query(
        'UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1',
        [row.session_id]
      ).catch(() => {});
      return { ok: false, status: 401, error: 'SESSION_EXPIRED' };
    }
    const notBefore = parseSessionNotBefore(env);
    const createdAt = new Date(row.session_created_at);
    if (notBefore && (!Number.isFinite(createdAt.getTime()) || createdAt.getTime() < notBefore)) {
      await pool.query(
        'UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1',
        [row.session_id]
      ).catch(() => {});
      return { ok: false, status: 401, error: 'SESSION_INVALID' };
    }
    // Avoid a write on every request; one update per five minutes is enough.
    await pool.query(
      `UPDATE sessions SET last_seen_at=now()
       WHERE id=$1 AND last_seen_at < now() - interval '5 minutes'`,
      [row.session_id]
    ).catch(() => {});
    const user = normalizeDbUser(row);
    return {
      ok: true,
      ...user,
      sessionId: String(row.session_id),
      sessionCreatedAt: createdAt,
      expiresAt,
      csrfToken: deriveCsrfToken(raw, env)
    };
  };

  const revokeSession = async (sessionId) =>
    withClientTransaction(pool, async (client) => {
      const revoked = await client.query(
        `UPDATE sessions SET revoked_at=COALESCE(revoked_at,now())
         WHERE id=$1 RETURNING id, revoked_at`,
        [sessionId]
      );
      return Boolean(revoked.rowCount);
    });

  const findUserByEmail = async (email) => {
    const result = await pool.query(
      'SELECT * FROM users WHERE email=$1 LIMIT 1',
      [String(email || '').trim().toLowerCase()]
    );
    return result.rows[0] ? normalizeDbUser(result.rows[0]) : null;
  };

  const checkRegistrationAvailability = async ({ username, email }) => {
    const result = await pool.query(
      `SELECT username, email FROM users
       WHERE username=$1 OR email=$2 LIMIT 1`,
      [String(username || '').trim().toLowerCase(), String(email || '').trim().toLowerCase()]
    );
    if (!result.rowCount) return { ok: true };
    const row = result.rows[0];
    if (String(row.email || '').toLowerCase() === String(email || '').trim().toLowerCase()) {
      return { ok: false, error: 'EMAIL_EXISTS' };
    }
    return { ok: false, error: 'USERNAME_EXISTS' };
  };

  const resetPassword = async ({ email, password }) => {
    const encoded = await encodePassword(password);
    return withClientTransaction(pool, async (client) => {
      const updated = await client.query(
        `UPDATE users SET password_hash=$2, updated_at=now()
         WHERE email=$1 AND status='active' RETURNING id`,
        [String(email || '').trim().toLowerCase(), encoded]
      );
      if (!updated.rowCount) throw new AuthServiceError('USER_NOT_FOUND', 404);
      await client.query(
        `UPDATE sessions SET revoked_at=COALESCE(revoked_at,now())
         WHERE user_id=$1 AND revoked_at IS NULL`,
        [updated.rows[0].id]
      );
      return true;
    });
  };

  return {
    loginWithVerifiedIdentity,
    registerWithPassword,
    authenticatePassword,
    resolveSession,
    revokeSession,
    findUserByEmail,
    checkRegistrationAvailability,
    resetPassword
  };
};

module.exports = {
  AuthServiceError,
  DEFAULT_SESSION_TTL_MS,
  createAuthService,
  encodePassword,
  verifyEncodedPassword,
  generateSessionToken,
  hashSessionToken,
  hashCsrfToken,
  usesDatabaseAuth,
  withClientTransaction
};
