const crypto = require('crypto');

const normalize = (value) => String(value || '').trim();

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

const devAccessEnabled = (env = process.env) =>
  Boolean(normalize(env.DEV_ACCESS_PASSWORD));

const createDevAccessGate = ({ env = process.env } = {}) => {
  const expectedUsername = normalize(env.DEV_ACCESS_USERNAME) || 'artigen-dev';
  const expectedPassword = normalize(env.DEV_ACCESS_PASSWORD);

  return (req, res, next) => {
    if (!expectedPassword || req.path === '/healthz') return next();
    const credentials = readBasicCredentials(req.headers?.authorization);
    if (
      credentials &&
      safeEqual(credentials.username, expectedUsername) &&
      safeEqual(credentials.password, expectedPassword)
    ) {
      return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Artigen DEV", charset="UTF-8"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(401).send('Artigen DEV access required');
  };
};

module.exports = {
  createDevAccessGate,
  devAccessEnabled,
  readBasicCredentials,
  safeEqual
};
