const { getPool } = require('../db/pool');
const { parseBearerToken, parseCookieToken } = require('../lib/auth-utils');
const { createAuthService, usesDatabaseAuth } = require('../services/auth-service');

const SESSION_MIDDLEWARE_PATHS = Object.freeze(['/api', '/files']);

const createSessionMiddleware = ({ pool, authService, env = process.env } = {}) => {
  let cachedService = authService || null;
  const getService = () => {
    if (!cachedService) cachedService = createAuthService({ pool: pool || getPool(), env });
    return cachedService;
  };

  return async (req, _res, next) => {
    if (!usesDatabaseAuth(env)) return next();
    try {
      if (parseBearerToken(req)) {
        req.authResolution = { ok: false, status: 401, error: 'BEARER_AUTH_DISABLED' };
        return next();
      }
      const token = parseCookieToken(req);
      if (!token) {
        req.authResolution = { ok: false, status: 401, error: 'LOGIN_REQUIRED' };
        return next();
      }
      req.authResolution = await getService().resolveSession(token);
      if (req.authResolution.ok) req.authUser = req.authResolution;
      return next();
    } catch (error) {
      console.error('Session hydration failed:', String(error?.code || error?.message || error));
      req.authResolution = {
        ok: false,
        status: 503,
        error: String(error?.code || '') === 'SESSION_HASH_NOT_CONFIGURED'
          ? 'SESSION_NOT_CONFIGURED'
          : 'SESSION_STORE_UNAVAILABLE'
      };
      return next();
    }
  };
};

const installSessionMiddleware = (app, { middleware, ...options } = {}) => {
  if (!app || typeof app.use !== 'function') {
    throw new TypeError('SESSION_MIDDLEWARE_APP_REQUIRED');
  }
  const resolvedMiddleware = middleware || createSessionMiddleware(options);
  app.use(SESSION_MIDDLEWARE_PATHS, resolvedMiddleware);
  return resolvedMiddleware;
};

module.exports = {
  SESSION_MIDDLEWARE_PATHS,
  createSessionMiddleware,
  installSessionMiddleware
};
