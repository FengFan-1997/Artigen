const crypto = require('crypto');

const {
  canUseLegacyAdminKey,
  isProductionRuntime,
  parseBearerToken,
  verifyAdminToken
} = require('./auth-utils');
const {
  AdminAuthorizationError,
  requireActiveAdministrator
} = require('../services/admin-auth-service');

const safeEqual = (left, right) => {
  try {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

/**
 * Authorize the administrator fallback used by the legacy /files route.
 *
 * Production deliberately delegates to the database-backed authorization
 * service on every request. A validly signed token is not sufficient: the
 * administrator must still exist, be active, and hold at least operator role.
 */
const resolveAdminForFiles = async (
  req,
  {
    env = process.env,
    pool,
    activeAdministratorResolver = requireActiveAdministrator
  } = {}
) => {
  if (isProductionRuntime(env)) {
    try {
      await activeAdministratorResolver({
        req,
        minimumRole: 'operator',
        pool,
        env
      });
      return { ok: true, status: 200 };
    } catch (error) {
      if (error instanceof AdminAuthorizationError) {
        return { ok: false, status: error.status === 401 ? 401 : 403 };
      }
      // Database/configuration failures must fail closed without being
      // misreported as a valid administrator credential.
      return { ok: false, status: 503 };
    }
  }

  // Preserve the explicitly enabled development adapter without weakening
  // production. Development bearer tokens retain their legacy behavior.
  const bearer = parseBearerToken(req);
  if (bearer) {
    const verified = verifyAdminToken(bearer);
    if (verified?.ok) return { ok: true, status: 200 };
    return {
      ok: false,
      status: String(verified?.error || '') === 'EXPIRED' ? 401 : 403
    };
  }

  if (!canUseLegacyAdminKey(env)) return { ok: false, status: 401 };
  const expected = String(env.ADMIN_KEY || '').trim();
  const header = req?.headers?.['x-admin-key'];
  const received = typeof header === 'string' ? header.trim() : '';
  if (!received) return { ok: false, status: 401 };
  if (!expected || !safeEqual(received, expected)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, status: 200 };
};

module.exports = { resolveAdminForFiles };
