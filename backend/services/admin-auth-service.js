const { getPool, isDatabaseConfigured } = require('../db/pool');
const {
  canUseLegacyAdminKey,
  isProductionRuntime,
  parseBearerToken,
  verifyAdminToken
} = require('../lib/auth-utils');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_RANK = Object.freeze({ operator: 1, admin: 2, owner: 3 });

class AdminAuthorizationError extends Error {
  constructor(code, status = 403) {
    super(code);
    this.name = 'AdminAuthorizationError';
    this.code = code;
    this.status = status;
  }
}

const roleAtLeast = (actual, required) => {
  return Number(ROLE_RANK[String(actual || '')] || 0) >= Number(ROLE_RANK[String(required || '')] || 0);
};

const findActiveAdministrator = async ({ username, pool = getPool() } = {}) => {
  const reference = String(username || '').trim();
  if (!reference) throw new AdminAuthorizationError('ADMIN_AUTH_REQUIRED', 401);
  const result = await pool.query(
    `SELECT a.user_id, a.role, u.username, u.email, u.legacy_user_id
       FROM administrators a
       JOIN users u ON u.id=a.user_id
      WHERE a.active=true
        AND (lower(COALESCE(u.username,''))=lower($1)
          OR lower(COALESCE(u.email::text,''))=lower($1)
          OR lower(COALESCE(u.legacy_user_id,''))=lower($1))
      LIMIT 2`,
    [reference]
  );
  if (result.rowCount !== 1) {
    throw new AdminAuthorizationError('ADMIN_DATABASE_ROLE_REQUIRED', 403);
  }
  return {
    actorUserId: String(result.rows[0].user_id),
    role: String(result.rows[0].role),
    username: String(result.rows[0].username || reference)
  };
};

const requireActiveAdministrator = async ({
  req,
  minimumRole = 'operator',
  pool,
  env = process.env
} = {}) => {
  const bearer = parseBearerToken(req);
  if (!bearer) {
    // The legacy key is only a local-development adapter and can never create
    // an attributable production finance event.
    if (!isProductionRuntime(env) && canUseLegacyAdminKey(env)) {
      return { actorUserId: null, role: 'owner', username: 'legacy-development-admin', legacy: true };
    }
    throw new AdminAuthorizationError('ADMIN_AUTH_REQUIRED', 401);
  }
  const verified = verifyAdminToken(bearer);
  if (!verified.ok) {
    throw new AdminAuthorizationError(
      verified.error === 'EXPIRED' ? 'ADMIN_AUTH_EXPIRED' : 'ADMIN_AUTH_FORBIDDEN',
      verified.error === 'EXPIRED' ? 401 : 403
    );
  }
  if (!UUID_RE.test(String(verified.userId || ''))) {
    if (!isProductionRuntime(env)) {
      return {
        actorUserId: null,
        role: 'owner',
        username: verified.username,
        legacy: true
      };
    }
    throw new AdminAuthorizationError('ADMIN_DATABASE_ROLE_REQUIRED', 403);
  }
  const result = await (pool || getPool()).query(
    `SELECT a.user_id, a.role, u.username
       FROM administrators a
       JOIN users u ON u.id=a.user_id
      WHERE a.user_id=$1::uuid AND a.active=true
      LIMIT 1`,
    [verified.userId]
  );
  if (!result.rowCount) throw new AdminAuthorizationError('ADMIN_ROLE_REVOKED', 403);
  const role = String(result.rows[0].role || '');
  if (!roleAtLeast(role, minimumRole)) {
    throw new AdminAuthorizationError('ADMIN_ROLE_INSUFFICIENT', 403);
  }
  return {
    actorUserId: String(result.rows[0].user_id),
    role,
    username: String(result.rows[0].username || verified.username)
  };
};

const requireAdminDatabaseAtLogin = async ({ username, env = process.env, pool } = {}) => {
  if (!isDatabaseConfigured()) {
    if (isProductionRuntime(env)) {
      throw new AdminAuthorizationError('ADMIN_DATABASE_REQUIRED', 503);
    }
    return null;
  }
  try {
    return await findActiveAdministrator({ username, pool: pool || getPool() });
  } catch (error) {
    if (!isProductionRuntime(env) && error instanceof AdminAuthorizationError) return null;
    throw error;
  }
};

module.exports = {
  AdminAuthorizationError,
  findActiveAdministrator,
  requireActiveAdministrator,
  requireAdminDatabaseAtLogin,
  roleAtLeast
};
