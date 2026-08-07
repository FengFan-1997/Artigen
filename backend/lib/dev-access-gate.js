const crypto = require('crypto');

const normalize = (value) => String(value || '').trim();
const DEV_ACCESS_COOKIE = 'artigen_dev_access';
const DEFAULT_COOKIE_TTL_HOURS = 12;

const safeEqual = (left, right) => {
  const actual = Buffer.from(String(left || ''), 'utf8');
  const expected = Buffer.from(String(right || ''), 'utf8');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
};

const readBasicCredentials = (authorization) => {
  const value = normalize(authorization);
  const match = value.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
};

const readCookie = (header, name) => {
  const target = `${String(name || '').trim()}=`;
  if (target === '=') return '';
  for (const part of String(header || '').split(';')) {
    const value = part.trim();
    if (value.startsWith(target)) return value.slice(target.length);
  }
  return '';
};

const cookieTtlMs = (env = process.env) => {
  const parsed = Number.parseInt(String(env.DEV_ACCESS_COOKIE_TTL_HOURS || ''), 10);
  const hours = Number.isFinite(parsed)
    ? Math.min(168, Math.max(1, parsed))
    : DEFAULT_COOKIE_TTL_HOURS;
  return hours * 60 * 60 * 1000;
};

const signAccessToken = (payload, password) =>
  crypto
    .createHmac('sha256', String(password || ''))
    .update(`artigen-dev-access-v1:${payload}`, 'utf8')
    .digest('base64url');

const createAccessToken = ({ username, password, expiresAt }) => {
  const payload = Buffer.from(JSON.stringify({
    username: String(username || ''),
    expiresAt: Number(expiresAt || 0)
  }), 'utf8').toString('base64url');
  return `${payload}.${signAccessToken(payload, password)}`;
};

const verifyAccessToken = ({
  token,
  username,
  password,
  now = Date.now()
}) => {
  const [payload, signature, ...extra] = String(token || '').split('.');
  if (!payload || !signature || extra.length) return false;
  if (!safeEqual(signature, signAccessToken(payload, password))) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return (
      safeEqual(decoded?.username, username) &&
      Number.isFinite(Number(decoded?.expiresAt)) &&
      Number(decoded.expiresAt) > Number(now)
    );
  } catch {
    return false;
  }
};

const devAccessEnabled = (env = process.env) =>
  Boolean(normalize(env.DEV_ACCESS_PASSWORD));

const createDevAccessGate = ({ env = process.env, now = () => Date.now() } = {}) => {
  const expectedUsername = normalize(env.DEV_ACCESS_USERNAME) || 'artigen-dev';
  const expectedPassword = normalize(env.DEV_ACCESS_PASSWORD);
  const ttlMs = cookieTtlMs(env);

  return (req, res, next) => {
    if (!expectedPassword || req.path === '/healthz') return next();
    const currentTime = Number(now());
    const cookieToken = readCookie(req.headers?.cookie, DEV_ACCESS_COOKIE);
    if (verifyAccessToken({
      token: cookieToken,
      username: expectedUsername,
      password: expectedPassword,
      now: currentTime
    })) {
      return next();
    }

    const credentials = readBasicCredentials(req.headers?.authorization);
    if (
      credentials &&
      safeEqual(credentials.username, expectedUsername) &&
      safeEqual(credentials.password, expectedPassword)
    ) {
      const accessToken = createAccessToken({
        username: expectedUsername,
        password: expectedPassword,
        expiresAt: currentTime + ttlMs
      });
      res.setHeader(
        'Set-Cookie',
        `${DEV_ACCESS_COOKIE}=${accessToken}; Max-Age=${Math.floor(ttlMs / 1000)}; Path=/; HttpOnly; Secure; SameSite=Strict`
      );
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Vary', 'Authorization, Cookie');
      return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Artigen DEV", charset="UTF-8"');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization, Cookie');
    return res.status(401).send('Artigen DEV access required');
  };
};

module.exports = {
  DEV_ACCESS_COOKIE,
  cookieTtlMs,
  createAccessToken,
  createDevAccessGate,
  devAccessEnabled,
  readCookie,
  readBasicCredentials,
  safeEqual,
  verifyAccessToken
};
