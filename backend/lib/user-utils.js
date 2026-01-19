const fs = require('fs');
const { CHATS_FILE, USERS_FILE, getUserMemoryFile, readJson, writeJson, readUserMemory, writeUserMemory } = require('../utils/storage');
const { ensureUserMemoryShape } = require('./memory-utils');

const dedupeStrings = (items, limit) => {
  const out = [];
  const seen = new Set();
  for (const raw of items || []) {
    const s = String(raw || '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (typeof limit === 'number' && out.length >= limit) break;
  }
  return out;
};

const trimPromptText = (text, maxChars) => {
  const s = (text || '').trim();
  if (!s) return '';
  const limit = typeof maxChars === 'number' ? Math.max(200, maxChars) : 5000;
  if (s.length <= limit) return s;
  return `${s.slice(0, limit)}\n...(truncated)`;
};

const IMAGE_HISTORY_MAX_ITEMS = (() => {
  const v = Number.parseInt(String(process.env.IMAGE_HISTORY_MAX_ITEMS || ''), 10);
  return Number.isFinite(v) && v > 0 ? v : 80;
})();

const mergeUserData = (fromUserId, toUserId, imgCredits) => {
  const from = String(fromUserId || '').trim();
  const to = String(toUserId || '').trim();
  if (!from || !to || from === to) return { ok: false, reason: 'invalid' };

  try {
    const allChats = readJson(CHATS_FILE, {});
    const fromChats = Array.isArray(allChats[from]) ? allChats[from] : [];
    const toChats = Array.isArray(allChats[to]) ? allChats[to] : [];
    if (fromChats.length) {
      const merged = [...toChats, ...fromChats].filter((m) => m && typeof m === 'object');
      allChats[to] = merged.slice(-240);
      delete allChats[from];
      writeJson(CHATS_FILE, allChats);
    }
  } catch { }

  try {
    const a = ensureUserMemoryShape(from, readUserMemory(from, null));
    const b = ensureUserMemoryShape(to, readUserMemory(to, null));
    const core = dedupeStrings([...(b.core_memory || []), ...(a.core_memory || [])], 80);
    const buffer = [...(b.short_term_buffer || []), ...(a.short_term_buffer || [])]
      .filter((x) => x && typeof x === 'object')
      .slice(-12);
    const imageHistory = (() => {
      const listA = Array.isArray(a.image_history) ? a.image_history : [];
      const listB = Array.isArray(b.image_history) ? b.image_history : [];
      const merged0 = [...listB, ...listA].filter((x) => x && typeof x === 'object');
      merged0.sort((x, y) => (Number(y?.ts || 0) || 0) - (Number(x?.ts || 0) || 0));
      const out = [];
      const seen = new Set();
      for (const it of merged0) {
        const id = typeof it?.id === 'string' ? it.id.trim() : '';
        const key = id ? `id:${id}` : '';
        if (key) {
          if (seen.has(key)) continue;
          seen.add(key);
        }
        out.push(it);
        if (out.length >= IMAGE_HISTORY_MAX_ITEMS) break;
      }
      return out;
    })();
    const merged = ensureUserMemoryShape(to, {
      user_id: to,
      meta: {
        ...(b.meta || {}),
        updatedAt: Date.now(),
        migratedFrom: from
      },
      core_memory: core,
      short_term_buffer: buffer,
      ...(imageHistory.length ? { image_history: imageHistory } : {})
    });
    writeUserMemory(to, merged);
  } catch { }

  try {
    if (imgCredits) imgCredits.mergeWallet(from, to);
  } catch { }

  if (from.startsWith('guest_')) {
    try {
      const p = getUserMemoryFile(from);
      if (p && fs.existsSync(p)) fs.unlinkSync(p);
    } catch { }
    try {
      const users = readJson(USERS_FILE, {});
      if (users && typeof users === 'object' && users[from]) {
        delete users[from];
        writeJson(USERS_FILE, users);
      }
    } catch { }
  }

  return { ok: true };
};

module.exports = {
  mergeUserData,
  dedupeStrings,
  trimPromptText
};
