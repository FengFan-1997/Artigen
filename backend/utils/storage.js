const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '../memory');
const VECTORS_FILE = path.join(MEMORY_DIR, 'vectors.json');
const CHATS_FILE = path.join(MEMORY_DIR, 'chats.json');
const USERS_FILE = path.join(MEMORY_DIR, 'users.json');

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

module.exports = {
  MEMORY_DIR,
  VECTORS_FILE,
  CHATS_FILE,
  USERS_FILE,
  readJson,
  writeJson
};
