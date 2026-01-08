const crypto = require('crypto');
const {
  readJson,
  writeJson,
  USERS_FILE
} = require('../utils/storage');

const normalizeUserId = (userId) => String(userId || '').trim();
const now = () => Date.now();

const readUsersMap = () => {
  const raw = readJson(USERS_FILE, {});
  return raw && typeof raw === 'object' ? raw : {};
};

const writeUsersMap = (m) => writeJson(USERS_FILE, m && typeof m === 'object' ? m : {});

const getProfile = (userId) => {
  const uid = normalizeUserId(userId);
  if (!uid) return null;
  const users = readUsersMap();
  return users[uid] || { userId: uid, displayName: 'User ' + uid.slice(0, 6), emailNotify: true, apiKeys: [] };
};

const updateProfile = (userId, data) => {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, error: 'MISSING_USER_ID' };

  const users = readUsersMap();
  const current = users[uid] || { userId: uid, apiKeys: [] };

  users[uid] = {
    ...current,
    displayName: data.displayName || current.displayName,
    emailNotify: data.emailNotify !== undefined ? data.emailNotify : current.emailNotify,
    updatedAt: now()
  };

  writeUsersMap(users);
  return { ok: true, profile: users[uid] };
};

const getApiKeys = (userId) => {
  const profile = getProfile(userId);
  return profile ? (profile.apiKeys || []) : [];
};

const createApiKey = (userId, name) => {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, error: 'MISSING_USER_ID' };

  const users = readUsersMap();
  const current = users[uid] || { userId: uid, apiKeys: [] };

  const newKey = `sk-${crypto.randomBytes(24).toString('hex')}`;
  const keyEntry = {
    id: crypto.randomUUID(),
    name: name || 'Default Key',
    key: newKey, // In real app, hash this!
    masked: `${newKey.slice(0, 4)}...${newKey.slice(-4)}`,
    createdAt: now()
  };

  current.apiKeys = [...(current.apiKeys || []), keyEntry];
  users[uid] = current;
  writeUsersMap(users);

  return { ok: true, apiKey: keyEntry };
};

const revokeApiKey = (userId, keyId) => {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, error: 'MISSING_USER_ID' };

  const users = readUsersMap();
  const current = users[uid];
  if (!current) return { ok: false, error: 'USER_NOT_FOUND' };

  current.apiKeys = (current.apiKeys || []).filter(k => k.id !== keyId);
  users[uid] = current;
  writeUsersMap(users);

  return { ok: true };
};

module.exports = {
  getProfile,
  updateProfile,
  getApiKeys,
  createApiKey,
  revokeApiKey
};
