const crypto = require('crypto');
const { ApiError } = require('./api-error');
const { parseBearerToken, parseCookieToken, isProductionRuntime } = require('./auth-utils');

let developmentSecret = '';

const getCsrfSecret = (env = process.env) => {
  const configured = String(env.CSRF_SECRET || env.SESSION_CSRF_SECRET || '').trim();
  if (configured) return configured;
  if (isProductionRuntime(env)) return '';
  if (!developmentSecret) developmentSecret = crypto.randomBytes(32).toString('hex');
  return developmentSecret;
};

const deriveCsrfToken = (sessionToken, env = process.env) => {
  const token = String(sessionToken || '').trim();
  const secret = getCsrfSecret(env);
  if (!token || !secret) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(`artigen-csrf-v1:${token}`, 'utf8')
    .digest('base64url');
};

const timingSafeTextEqual = (left, right) => {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
};

const requestOrigin = (req) => {
  const protocol = String(req.protocol || '').trim() ||
    (req.socket?.encrypted ? 'https' : 'http');
  const host = String(req.headers?.host || '').trim();
  return host ? `${protocol}://${host}` : '';
};

const configuredOrigins = (env = process.env) => {
  const raw = [
    env.APP_ORIGIN,
    env.PUBLIC_ORIGIN,
    env.SITE_ORIGIN,
    env.FRONTEND_ORIGIN,
    env.FRONTEND_URL,
    env.CORS_ORIGIN,
    env.CORS_ORIGINS
  ].filter(Boolean).join(',');
  const origins = new Set();
  for (const entry of raw.split(',')) {
    const text = String(entry || '').trim();
    if (!text || text === '*') continue;
    try {
      origins.add(new URL(text).origin);
    } catch {}
  }
  if (!isProductionRuntime(env)) {
    origins.add('http://localhost:4000');
    origins.add('http://127.0.0.1:4000');
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
  }
  return origins;
};

const assertSameOrigin = (req, env = process.env) => {
  const originHeader = String(req.headers?.origin || '').trim();
  if (!originHeader || originHeader === 'null') {
    throw new ApiError(403, 'ORIGIN_REQUIRED');
  }
  let origin;
  try {
    origin = new URL(originHeader).origin;
  } catch {
    throw new ApiError(403, 'ORIGIN_FORBIDDEN');
  }
  const allowed = configuredOrigins(env);
  const ownOrigin = requestOrigin(req);
  if (ownOrigin) allowed.add(ownOrigin);
  if (!allowed.has(origin)) throw new ApiError(403, 'ORIGIN_FORBIDDEN');
  return true;
};

const DEFAULT_EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/google/verify',
  '/api/auth/password-reset/',
  '/api/login/',
  '/api/pay/afdian/webhook'
];

const csrfProtection = (options = {}) => {
  const env = options.env || process.env;
  const exemptPaths = options.exemptPaths || DEFAULT_EXEMPT_PATHS;
  return (req, res, next) => {
    const method = String(req.method || 'GET').toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();
    const path = String(req.path || req.originalUrl || req.url || '').split('?')[0];
    if (path === '/api/pay/afdian/webhook') return next();
    if (exemptPaths.some((prefix) => path === prefix || (prefix.endsWith('/') && path.startsWith(prefix)))) {
      try {
        assertSameOrigin(req, env);
        return next();
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError(403, 'ORIGIN_FORBIDDEN');
        return res.status(apiError.status).json({ error: apiError.toJSON() });
      }
    }

    // Bearer credentials are not ambient browser credentials, so they do not
    // need a CSRF token. Anonymous browser writes still require an allowed
    // Origin: otherwise a third-party page could make the visitor run costly
    // converters or allocate temporary files without ever reading a response.
    if (parseBearerToken(req)) return next();
    const sessionToken = parseCookieToken(req);
    if (!sessionToken) {
      try {
        assertSameOrigin(req, env);
        return next();
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError(403, 'ORIGIN_FORBIDDEN');
        return res.status(apiError.status).json({ error: apiError.toJSON() });
      }
    }

    try {
      assertSameOrigin(req, env);
      const expected = deriveCsrfToken(sessionToken, env);
      if (!expected) throw new ApiError(503, 'CSRF_NOT_CONFIGURED', { retryable: true });
      const supplied = String(req.headers?.['x-csrf-token'] || '').trim();
      if (!timingSafeTextEqual(supplied, expected)) throw new ApiError(403, 'CSRF_INVALID');
      return next();
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(403, 'CSRF_INVALID');
      return res.status(apiError.status).json({ error: apiError.toJSON() });
    }
  };
};

module.exports = {
  assertSameOrigin,
  configuredOrigins,
  csrfProtection,
  deriveCsrfToken,
  getCsrfSecret,
  timingSafeTextEqual
};
