const crypto = require('crypto');
const { API_KEYS_FILE, readJson, writeJson } = require('../utils/storage');
const { parseBearerToken } = require('./auth-utils');

const readApiKeysMap = () => {
  const raw = readJson(API_KEYS_FILE, {});
  return raw && typeof raw === 'object' ? raw : {};
};

const writeApiKeysMap = (m) => writeJson(API_KEYS_FILE, m && typeof m === 'object' ? m : {});

const makeApiKeyId = () => {
  try {
    return crypto.randomBytes(10).toString('hex');
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  }
};

const makeApiKeySecret = () => {
  try {
    return crypto.randomBytes(32).toString('base64url');
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
};

const hashApiKeySecret = (secret, salt) => {
  const s = String(secret || '');
  const p = String(salt || '');
  return crypto.createHash('sha256').update(`${p}:${s}`, 'utf8').digest('hex');
};

const maskApiKey = (input) => {
  const prefix = typeof input?.prefix === 'string' ? input.prefix : '';
  const last4 = typeof input?.last4 === 'string' ? input.last4 : '';
  const shownPrefix = prefix ? prefix.slice(0, 16) : 'sk-';
  return `${shownPrefix}....................${last4 || '****'}`;
};

const createApiKeyForUser = (userId, name) => {
  const uid = String(userId || '').trim();
  if (!uid) return { ok: false, error: 'MISSING_USER_ID' };

  const displayName = String(name || '').trim().slice(0, 64);
  const id = makeApiKeyId();
  const secret = makeApiKeySecret();
  const salt = crypto.randomBytes(16).toString('hex');
  const secretHash = hashApiKeySecret(secret, salt);

  const prefix = `sk-${id}.`;
  const last4 = secret.slice(-4);
  const createdAt = Date.now();
  const apiKey = `${prefix}${secret}`;

  const keys = readApiKeysMap();
  keys[id] = {
    id,
    userId: uid,
    name: displayName || 'Default Key',
    secretSalt: salt,
    secretHash,
    prefix,
    last4,
    createdAt,
    lastUsedAt: 0,
    revokedAt: 0
  };
  writeApiKeysMap(keys);

  return { ok: true, id, userId: uid, name: keys[id].name, createdAt, apiKey, maskedKey: maskApiKey(keys[id]) };
};

const parseApiKeyFromRequest = (req) => {
  const h1 = typeof req?.headers?.['x-api-key'] === 'string' ? req.headers['x-api-key'] : '';
  const xApiKey = String(h1 || '').trim();
  if (xApiKey) return xApiKey;
  const bearer = parseBearerToken(req);
  return bearer && bearer.startsWith('sk-') ? bearer : '';
};

const resolveApiKeyUser = (req) => {
  const raw = parseApiKeyFromRequest(req);
  if (!raw) return { ok: false, status: 401, error: 'Missing API key' };
  const m = raw.match(/^sk-([a-f0-9]{8,64})\.(.+)$/i);
  if (!m) return { ok: false, status: 401, error: 'Invalid API key' };
  const id = String(m[1] || '').trim();
  const secret = String(m[2] || '').trim();
  if (!id || !secret) return { ok: false, status: 401, error: 'Invalid API key' };

  const keys = readApiKeysMap();
  const rec = keys[id];
  if (!rec || typeof rec !== 'object') return { ok: false, status: 401, error: 'Invalid API key' };
  if (Number(rec.revokedAt || 0) > 0) return { ok: false, status: 401, error: 'API key revoked' };

  const salt = typeof rec.secretSalt === 'string' ? rec.secretSalt : '';
  const expected = typeof rec.secretHash === 'string' ? rec.secretHash : '';
  const actual = hashApiKeySecret(secret, salt);
  try {
    const a = Buffer.from(String(actual || ''), 'hex');
    const b = Buffer.from(String(expected || ''), 'hex');
    if (a.length !== b.length) return { ok: false, status: 401, error: 'Invalid API key' };
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, status: 401, error: 'Invalid API key' };
  } catch {
    return { ok: false, status: 401, error: 'Invalid API key' };
  }

  const uid = typeof rec.userId === 'string' ? rec.userId.trim() : '';
  if (!uid) return { ok: false, status: 401, error: 'Invalid API key' };
  if (uid.startsWith('guest_')) return { ok: false, status: 401, error: 'Invalid API key' };

  const now = Date.now();
  keys[id] = { ...rec, lastUsedAt: now };
  writeApiKeysMap(keys);
  return { ok: true, userId: uid, apiKeyId: id };
};

module.exports = {
  readApiKeysMap,
  writeApiKeysMap,
  createApiKeyForUser,
  resolveApiKeyUser,
  maskApiKey
};
