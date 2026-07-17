const crypto = require('crypto');
const { promisify } = require('util');

const LOGIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const generateToken = () => {
  try {
    return `${crypto.randomBytes(24).toString('hex')}${Date.now().toString(36)}`;
  } catch {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
};

const normalizeUsername = (raw) => String(raw || '').trim();
const normalizeEmail = (input) => String(input || '').trim().toLowerCase();
const hasControlChars = (s) => /[\u0000-\u001f\u007f]/.test(String(s || ''));

const makeUserId = () => {
  const ts = Date.now().toString(36);
  const rnd = (() => {
    try {
      return crypto.randomBytes(6).toString('hex');
    } catch {
      return Math.random().toString(16).slice(2);
    }
  })();
  return `user_${ts}_${rnd.slice(0, 12)}`;
};

const scryptAsync = promisify(crypto.scrypt);

const hashPassword = async (password, salt) => {
  const pw = String(password || '');
  const s = String(salt || '');
  const buf = await scryptAsync(pw, s, 32);
  return buf.toString('hex');
};

const verifyPassword = async (user, password) => {
  const pw = String(password || '');
  const algo = typeof user?.passwordAlgo === 'string' ? user.passwordAlgo : '';
  const salt = typeof user?.passwordSalt === 'string' ? user.passwordSalt : '';
  const expected = typeof user?.passwordHash === 'string' ? user.passwordHash : '';
  if (algo === 'scrypt' && salt && expected) {
    try {
      const actual = await hashPassword(pw, salt);
      const a = Buffer.from(actual, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length) return { ok: false, upgraded: false };
      return { ok: crypto.timingSafeEqual(a, b), upgraded: false };
    } catch {
      return { ok: false, upgraded: false };
    }
  }

  const legacy = typeof user?.password === 'string' ? user.password : '';
  if (legacy) {
    try {
      const a = Buffer.from(legacy, 'utf8');
      const b = Buffer.from(pw, 'utf8');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return { ok: true, upgraded: true };
      }
    } catch {}
  }
  return { ok: false, upgraded: false };
};

const sanitizeUserProfile = (u) => {
  if (!u || typeof u !== 'object') return u;
  const out = { ...u };
  delete out.password;
  delete out.passwordHash;
  delete out.passwordSalt;
  delete out.passwordAlgo;
  delete out.sessionToken;
  delete out.sessionTokenIssuedAt;
  return out;
};

// The JSON user/session file is migration input only. Runtime database auth never
// reads it, and the no-database development adapter is deliberately process-local.
let developmentUsers = Object.create(null);
const databaseAuthEnabled = (env = process.env) =>
  isProductionRuntime(env) || Boolean(String(env.DATABASE_URL || '').trim());
const canUseLegacyFileQueryToken = (env = process.env) =>
  !databaseAuthEnabled(env) &&
  String(env.ALLOW_LEGACY_FILE_QUERY_TOKEN || '').trim() === '1';
const readUsersMap = () => {
  if (databaseAuthEnabled(process.env)) return {};
  return { ...developmentUsers };
};
const writeUsersMap = (users) => {
  if (databaseAuthEnabled(process.env)) return false;
  developmentUsers = users && typeof users === 'object'
    ? { ...users }
    : Object.create(null);
  return true;
};
const resetDevelopmentUsers = () => {
  developmentUsers = Object.create(null);
};

const parseBearerToken = (req) => {
  const raw = typeof req?.headers?.authorization === 'string' ? req.headers.authorization.trim() : '';
  if (!raw) return '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || '').trim() : '';
};

const parseCookieToken = (req) => {
  const raw = typeof req?.headers?.cookie === 'string' ? req.headers.cookie : '';
  if (!raw) return '';
  const parts = raw.split(';');
  for (const part of parts) {
    const s = String(part || '').trim();
    if (!s) continue;
    const eq = s.indexOf('=');
    if (eq <= 0) continue;
    const k = s.slice(0, eq).trim();
    if (k !== 'auth_token') continue;
    const v = s.slice(eq + 1);
    if (!v) return '';
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return '';
};

const parseSessionNotBefore = (env = process.env) => {
  const raw = String(env.SESSION_NOT_BEFORE || env.AUTH_SESSION_NOT_BEFORE || '').trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) return Number.MAX_SAFE_INTEGER;
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.MAX_SAFE_INTEGER;
};

const isSessionCurrent = (user, env = process.env) => {
  const notBefore = parseSessionNotBefore(env);
  if (!notBefore) return true;
  const issuedAt = Number(user?.sessionTokenIssuedAt || 0);
  return Number.isFinite(issuedAt) && issuedAt >= notBefore;
};

const base64UrlEncode = (input) => {
  const raw = typeof input === 'string' ? input : JSON.stringify(input ?? null);
  return Buffer.from(raw, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const base64UrlDecodeToString = (input) => {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  try {
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return '';
  }
};

const getAdminTokenSecret = (() => {
  let cached = '';
  return () => {
    if (cached) return cached;
    const fromEnv = String(process.env.CONSOLE_ADMIN_TOKEN_SECRET || '').trim();
    if (fromEnv) {
      cached = fromEnv;
      return cached;
    }
    try {
      cached = crypto.randomBytes(32).toString('hex');
    } catch {
      cached = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    }
    return cached;
  };
})();

const signAdminTokenPart = (data) => {
  const secret = getAdminTokenSecret();
  return crypto
    .createHmac('sha256', secret)
    .update(String(data || ''), 'utf8')
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const isProductionRuntime = (env = process.env) => {
  return String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
};

const resolveConsoleAdminAccount = (isProdOverride) => {
  // A false override must never downgrade a real production runtime.
  const isProd = isProductionRuntime(process.env) || isProdOverride === true;
  const username = String(process.env.CONSOLE_ADMIN_USERNAME || '').trim();
  const password = String(process.env.CONSOLE_ADMIN_PASSWORD || '');
  if (username && password) {
    const isKnownDefault = username.toLowerCase() === 'admin' && password === 'admin123456';
    if (isProd && (isKnownDefault || password.length < 16)) {
      return { ok: false, username: '', password: '' };
    }
    return { ok: true, username, password };
  }
  if (!isProd) return { ok: true, username: 'admin', password: 'admin123456' };
  return { ok: false, username: '', password: '' };
};

const canUseLegacyAdminKey = (env = process.env) => {
  if (isProductionRuntime(env)) return false;
  return String(env.ALLOW_LEGACY_ADMIN_KEY || '').trim() === '1';
};

const resolveConsoleAdminTokenTtlMs = () => {
  const hours = (() => {
    const v = Number.parseInt(String(process.env.CONSOLE_ADMIN_TOKEN_TTL_HOURS || '24'), 10);
    return Number.isFinite(v) && v > 0 ? Math.min(Math.max(v, 1), 168) : 24;
  })();
  return hours * 60 * 60 * 1000;
};

const createAdminToken = (username, principal = {}) => {
  const ttlMs = resolveConsoleAdminTokenTtlMs();
  const exp = Date.now() + ttlMs;
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const userId = String(principal.userId || '').trim();
  const role = String(principal.role || '').trim();
  const payload = base64UrlEncode({
    sub: 'admin',
    u: String(username || '').trim(),
    ...(userId ? { uid: userId } : {}),
    ...(role ? { r: role } : {}),
    exp
  });
  const data = `${header}.${payload}`;
  const sig = signAdminTokenPart(data);
  return { token: `${data}.${sig}`, expiresAt: exp };
};

const verifyAdminToken = (token) => {
  const raw = String(token || '').trim();
  if (!raw) return { ok: false, error: 'MISSING_TOKEN' };
  const parts = raw.split('.');
  if (parts.length !== 3) return { ok: false, error: 'INVALID_TOKEN' };
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = signAdminTokenPart(data);
  try {
    const a = Buffer.from(String(s || ''), 'utf8');
    const b = Buffer.from(String(expected || ''), 'utf8');
    if (a.length !== b.length) return { ok: false, error: 'INVALID_TOKEN' };
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, error: 'INVALID_TOKEN' };
  } catch {
    return { ok: false, error: 'INVALID_TOKEN' };
  }
  const payloadStr = base64UrlDecodeToString(p);
  if (!payloadStr) return { ok: false, error: 'INVALID_TOKEN' };
  let payload = null;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    payload = null;
  }
  const sub = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
  const username = typeof payload?.u === 'string' ? payload.u.trim() : '';
  const userId = typeof payload?.uid === 'string' ? payload.uid.trim() : '';
  const role = typeof payload?.r === 'string' ? payload.r.trim() : '';
  const exp = Number(payload?.exp || 0) || 0;
  if (sub !== 'admin' || !username || !Number.isFinite(exp) || exp <= 0) {
    return { ok: false, error: 'INVALID_TOKEN' };
  }
  if (exp <= Date.now()) return { ok: false, error: 'EXPIRED' };
  return { ok: true, username, userId, role, expiresAt: exp };
};

const assertAdmin = (req, res) => {
  const bearer = parseBearerToken(req);
  if (bearer) {
    const v = verifyAdminToken(bearer);
    if (v.ok) return true;
    if (v.error === 'EXPIRED') {
      res.status(401).json({ error: 'ADMIN_AUTH_EXPIRED' });
      return false;
    }
    res.status(403).json({ error: 'ADMIN_AUTH_FORBIDDEN' });
    return false;
  }

  if (!canUseLegacyAdminKey(process.env)) {
    res.status(401).json({ error: 'ADMIN_AUTH_REQUIRED' });
    return false;
  }

  const expected = String(process.env.ADMIN_KEY || '').trim();
  if (!expected) {
    res.status(501).json({ error: 'ADMIN_NOT_CONFIGURED' });
    return false;
  }
  const got = typeof req?.headers?.['x-admin-key'] === 'string' ? String(req.headers['x-admin-key']).trim() : '';
  if (!got) {
    res.status(401).json({ error: 'ADMIN_AUTH_REQUIRED' });
    return false;
  }
  try {
    const a = Buffer.from(got, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) {
      res.status(403).json({ error: 'ADMIN_AUTH_FORBIDDEN' });
      return false;
    }
    if (!crypto.timingSafeEqual(a, b)) {
      res.status(403).json({ error: 'ADMIN_AUTH_FORBIDDEN' });
      return false;
    }
  } catch {
    res.status(403).json({ error: 'ADMIN_AUTH_FORBIDDEN' });
    return false;
  }
  return true;
};

const resolveAuthUser = (req) => {
  if (req?.authResolution && typeof req.authResolution === 'object') {
    return req.authResolution;
  }
  if (databaseAuthEnabled(process.env)) {
    if (parseBearerToken(req)) {
      return { ok: false, status: 401, error: 'BEARER_AUTH_DISABLED' };
    }
    return {
      ok: false,
      status: 503,
      error: parseCookieToken(req) ? 'SESSION_MIDDLEWARE_REQUIRED' : 'LOGIN_REQUIRED'
    };
  }
  const token = parseBearerToken(req) || parseCookieToken(req);
  if (!token) return { ok: false, status: 401, error: 'LOGIN_REQUIRED' };
  const users = readUsersMap();
  const hit = Object.values(users).find((u) => String(u?.sessionToken || '') === token);
  const userId = typeof hit?.id === 'string' ? hit.id.trim() : '';
  if (!userId || !isSessionCurrent(hit, process.env)) {
    return { ok: false, status: 401, error: 'SESSION_INVALID' };
  }
  return { ok: true, userId, token };
};

module.exports = {
  LOGIN_EMAIL_RE,
  generateToken,
  normalizeUsername,
  normalizeEmail,
  hasControlChars,
  makeUserId,
  hashPassword,
  verifyPassword,
  sanitizeUserProfile,
  readUsersMap,
  writeUsersMap,
  resetDevelopmentUsers,
  databaseAuthEnabled,
  canUseLegacyFileQueryToken,
  parseBearerToken,
  parseCookieToken,
  parseSessionNotBefore,
  isSessionCurrent,
  base64UrlEncode,
  base64UrlDecodeToString,
  getAdminTokenSecret,
  signAdminTokenPart,
  isProductionRuntime,
  resolveConsoleAdminAccount,
  canUseLegacyAdminKey,
  resolveConsoleAdminTokenTtlMs,
  createAdminToken,
  verifyAdminToken,
  assertAdmin,
  resolveAuthUser
};

const canUseTestLoginCode = () => {
  return String(process.env.ENABLE_TEST_LOGIN_CODE || '').trim() === '1';
};

const assertAuthUserMatches = (req, res, targetUserId) => {
  const resolved = resolveAuthUser(req);
  if (!resolved.ok) {
    res.status(resolved.status || 401).json({ error: resolved.error || 'LOGIN_REQUIRED' });
    return false;
  }
  const uid = String(targetUserId || '').trim();
  if (uid && uid !== resolved.userId) {
    res.status(403).json({ error: 'FORBIDDEN' });
    return false;
  }
  return true;
};

module.exports.canUseTestLoginCode = canUseTestLoginCode;
module.exports.assertAuthUserMatches = assertAuthUserMatches;
