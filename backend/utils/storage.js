const fs = require('fs');
const path = require('path');

const MEMORY_DIR = (() => {
  const raw = String(process.env.MEMORY_DIR || '').trim();
  if (raw) return path.resolve(raw);
  return path.join(__dirname, '../memory');
})();
const VECTORS_FILE = path.join(MEMORY_DIR, 'vectors.json');
const CHATS_FILE = path.join(MEMORY_DIR, 'chats.json');
const USERS_FILE = path.join(MEMORY_DIR, 'users.json');
const USAGE_LEDGER_FILE = path.join(MEMORY_DIR, 'usage_ledger.json');
const CREDITS_WALLET_FILE = path.join(MEMORY_DIR, 'credits_wallet.json');
const CREDITS_HOLDS_FILE = path.join(MEMORY_DIR, 'credits_holds.json');
const CREDITS_ORDERS_FILE = path.join(MEMORY_DIR, 'credits_orders.json');

// Ensure memory directory exists
if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

// Helper to read JSON
const readJson = (filePath, defaultValue = []) => {
  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
};

const writeJson = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
};

const sanitizeUserId = (userId) => {
  const raw = String(userId || '').trim() || 'anonymous';
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return safe || 'anonymous';
};

const getUserMemoryFile = (userId) => {
  return path.join(MEMORY_DIR, `user_${sanitizeUserId(userId)}.json`);
};

const readUserMemory = (userId, defaultValue = null) => {
  return readJson(getUserMemoryFile(userId), defaultValue);
};

const writeUserMemory = (userId, data) => {
  return writeJson(getUserMemoryFile(userId), data);
};

module.exports = {
  MEMORY_DIR,
  VECTORS_FILE,
  CHATS_FILE,
  USERS_FILE,
  USAGE_LEDGER_FILE,
  CREDITS_WALLET_FILE,
  CREDITS_HOLDS_FILE,
  CREDITS_ORDERS_FILE,
  readJson,
  writeJson,
  getUserMemoryFile,
  readUserMemory,
  writeUserMemory
};
