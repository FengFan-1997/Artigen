const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dns = require('dns');
const { FILES_DIR, readUserMemory, writeUserMemory } = require('../utils/storage');
const { ensureUserMemoryShape } = require('./memory-utils');
const { callTextGenerate, callGeminiGenerate } = require('./ai-providers');
const { fetchWithTimeout } = require('./fetch-utils');
const { dedupeStrings } = require('./user-utils');
const { API_KEY } = require('./config');

const toOneLine = (text) => {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
};

const stripControlText = (text) => {
  let t = String(text || '');
  t = t.replace(/\n\n（我本地找到了这些相关笔记：）[\s\S]*$/g, '');
  t = t.replace(/\n\n\(I did find these local notes:\)[\s\S]*$/g, '');
  const lines = t.split('\n');
  const cleaned = [];
  for (const line of lines) {
    const raw = String(line || '');
    const s = raw.trim();
    if (
      /^(highlight|navigate|click|hover|scroll|input|press)\s*:/i.test(s) ||
      /^(emotionTag|expressionTag|motionTag|avatarPlan|plan)\s*:/i.test(s)
    ) {
      continue;
    }
    cleaned.push(raw);
  }
  return cleaned.join('\n').trim();
};

const tryParseJsonStringArray = (text) => {
  const s = String(text || '').trim();
  if (!s) return null;
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(s.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    const cleaned = parsed.map((x) => String(x || '').trim()).filter(Boolean);
    return cleaned;
  } catch {
    return null;
  }
};

const safeUserSegment = (userId) => {
  const raw = String(userId || '').trim() || 'anonymous';
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return safe || 'anonymous';
};

const extFromMime = (mime) => {
  const m = String(mime || '').toLowerCase().trim();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/svg+xml') return 'svg';
  return 'png';
};

const writeUserImageFile = (input) => {
  const userId = String(input?.userId || '').trim();
  if (!userId) return '';
  const buf = input?.buf;
  const mime = String(input?.mime || '').trim();
  const prefix = String(input?.prefix || 'img').trim() || 'img';
  if (!Buffer.isBuffer(buf) || !buf.length) return '';
  if (!/^image\//i.test(mime)) return '';
  const safeUser = safeUserSegment(userId);
  const dir = path.join(FILES_DIR, safeUser);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    return '';
  }
  const ext = extFromMime(mime);
  const name = `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const full = path.join(dir, name);
  try {
    fs.writeFileSync(full, buf);
    return `/files/${encodeURIComponent(safeUser)}/${encodeURIComponent(name)}`;
  } catch {
    return '';
  }
};

const tryParseDataUrl = (raw) => {
  const s = String(raw || '').trim();
  if (!s.startsWith('data:')) return null;
  const m = s.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = String(m[1] || '').trim();
  const b64 = String(m[2] || '').trim();
  if (!/^image\//i.test(mime) || !b64) return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) return null;
    return { mime, buf };
  } catch {
    return null;
  }
};

// Summarize Conversation History
const summarizeHistory = async (oldSummary, newMessages) => {
  try {
    if (!API_KEY) {
      return oldSummary;
    }
    const conversationText = newMessages
      .map((m) => `${m.role}: ${stripControlText(m.text)}`)
      .join('\n');
    const prompt = `
      Please summarize the following conversation history between a User and an AI Assistant (Lumina).
      Combine it with the previous summary if it exists.
      Keep important details like user preferences, name, and key context.
      
      Previous Summary: ${oldSummary || "None"}
      
      New Conversation:
      ${conversationText}
      
      Output a concise summary paragraph.
    `;

    const { data } = await callGeminiGenerate({
      timeoutMs: 10000,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || oldSummary;
  } catch (e) {
    console.error("Summarization failed:", e);
    return oldSummary;
  }
};

const persistImageRefForUser = async (input) => {
  const userId = String(input?.userId || '').trim();
  const rawUrl = String(input?.url || '').trim();
  const prefix = String(input?.prefix || 'img').trim() || 'img';
  const wantMeta = !!(input && (input.withMeta || input.returnMeta || input.meta));
  const ok = (url) => (wantMeta ? { ok: true, url } : url);
  const fail = (error) => (wantMeta ? { ok: false, error: String(error || 'PERSIST_FAILED') } : '');
  if (!userId || !rawUrl) return fail('INVALID_INPUT');
  if (rawUrl.startsWith('/files/')) return ok(rawUrl);

  const inferMimeFromUrl = (u) => {
    try {
      const parsed = new URL(u);
      const p = parsed.pathname.toLowerCase();
      if (p.endsWith('.png')) return 'image/png';
      if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
      if (p.endsWith('.webp')) return 'image/webp';
      if (p.endsWith('.gif')) return 'image/gif';
      if (p.endsWith('.svg')) return 'image/svg+xml';
      return '';
    } catch {
      return '';
    }
  };

  const parsed = tryParseDataUrl(rawUrl);
  if (parsed) {
    const saved = writeUserImageFile({ userId, buf: parsed.buf, mime: parsed.mime, prefix });
    return saved ? ok(saved) : fail('WRITE_FAILED');
  }

  if (/^https?:\/\//i.test(rawUrl)) {
    try {
      const maxBytes = 25 * 1024 * 1024;

      const dnsLookupAll = async (hostname, timeoutMs = 1200) => {
        const h = String(hostname || '').trim();
        if (!h) throw new Error('INVALID_HOST');
        const lookup = dns.promises.lookup(h, { all: true, verbatim: true });
        const timer = new Promise((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error('DNS_TIMEOUT'), { code: 'DNS_TIMEOUT' })), timeoutMs)
        );
        return await Promise.race([lookup, timer]);
      };

      const isPrivateHost = (host) => {
        let h = String(host || '').trim().toLowerCase();
        if (!h) return true;
        h = h.replace(/\.+$/g, '');
        if (h === 'localhost' || h === 'localhost.localdomain') return true;
        if (h.endsWith('.local') || h.endsWith('.localdomain') || h.endsWith('.lan') || h.endsWith('.internal'))
          return true;
        if (h === '::1' || h === '[::1]') return true;
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
          const parts = h.split('.').map((x) => Number.parseInt(x, 10));
          if (parts.some((x) => !Number.isFinite(x) || x < 0 || x > 255)) return true;
          const [a, b] = parts;
          if (a === 10) return true;
          if (a === 127) return true;
          if (a === 0) return true;
          if (a === 169 && b === 254) return true;
          if (a === 192 && b === 168) return true;
          if (a === 172 && b >= 16 && b <= 31) return true;
          return false;
        }
        if (h.includes(':')) {
          if (h.startsWith('::') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
        }
        return false;
      };

      const isIpHost = (h) => {
        const host = String(h || '').trim();
        if (!host) return false;
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
        return host.includes(':');
      };

      const parseAllowedHosts = () => {
        const raw = String(process.env.PERSIST_IMAGE_ALLOWED_HOSTS || '').trim();
        if (!raw) return [];
        return raw
          .split(',')
          .map((x) => String(x || '').trim().toLowerCase())
          .map((x) => x.replace(/\.+$/g, ''))
          .filter(Boolean);
      };

      const allowedHosts = parseAllowedHosts();
      const isAllowedHost = (hostname) => {
        if (!allowedHosts.length) return true;
        const h = String(hostname || '').trim().toLowerCase().replace(/\.+$/g, '');
        if (!h) return false;
        for (const rule of allowedHosts) {
          if (!rule) continue;
          if (rule.startsWith('.')) {
            if (h === rule.slice(1) || h.endsWith(rule)) return true;
          } else if (h === rule) return true;
        }
        return false;
      };

      const readUpstreamBodyLimited = async (upstream, capBytes) => {
        const cap = Math.max(1, Number(capBytes) || 1);
        const body = upstream?.body;
        if (!body || typeof body.on !== 'function') {
          const buf = Buffer.from(await upstream.arrayBuffer());
          if (buf.length > cap) throw Object.assign(new Error('TOO_LARGE'), { code: 'TOO_LARGE' });
          return buf;
        }
        const chunks = [];
        let total = 0;
        for await (const chunk of body) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += buf.length;
          if (total > cap) throw Object.assign(new Error('TOO_LARGE'), { code: 'TOO_LARGE' });
          chunks.push(buf);
        }
        return Buffer.concat(chunks, total);
      };

      const validateRemoteUrl = async (u) => {
        let parsed = null;
        try {
          parsed = new URL(u);
        } catch {
          return { ok: false, url: '' };
        }
        const proto = String(parsed.protocol || '').toLowerCase();
        if (proto !== 'http:' && proto !== 'https:') return { ok: false, url: '' };
        if (parsed.username || parsed.password) return { ok: false, url: '' };
        const hostname = String(parsed.hostname || '').trim();
        if (!hostname || isPrivateHost(hostname) || !isAllowedHost(hostname)) return { ok: false, url: '' };
        if (parsed.port) {
          const p = Number.parseInt(String(parsed.port || ''), 10);
          if (!(p === 80 || p === 443)) return { ok: false, url: '' };
        }
        if (!isIpHost(hostname)) {
          if (!hostname.includes('.')) return { ok: false, url: '' };
          let addrs = [];
          try {
            addrs = await dnsLookupAll(hostname);
          } catch {
            addrs = [];
          }
          if (!Array.isArray(addrs) || !addrs.length) return { ok: false, url: '' };
          for (const a of addrs) {
            const ip = String(a?.address || '').trim();
            if (!ip) return { ok: false, url: '' };
            if (isPrivateHost(ip)) return { ok: false, url: '' };
          }
        }
        return { ok: true, url: parsed.toString() };
      };

      let currentUrl = rawUrl;
      for (let i = 0; i < 5; i += 1) {
        const checked = await validateRemoteUrl(currentUrl);
        if (!checked.ok) return fail('URL_BLOCKED');
        currentUrl = checked.url;
        const upstream = await fetchWithTimeout(
          currentUrl,
          {
            method: 'GET',
            redirect: 'manual',
            headers: {
              Accept: 'image/*,*/*;q=0.8',
              'User-Agent': 'Mozilla/5.0'
            }
          },
          20000
        );

        const status = Number(upstream?.status || 0) || 0;
        if (status >= 300 && status < 400) {
          const loc = String(upstream.headers.get('location') || '').trim();
          if (!loc) return fail('REDIRECT_NO_LOCATION');
          try {
            try {
              upstream.body?.cancel?.();
            } catch { }
            try {
              upstream.body?.destroy?.();
            } catch { }
            currentUrl = new URL(loc, currentUrl).toString();
          } catch {
            return fail('REDIRECT_INVALID');
          }
          continue;
        }

        if (!upstream.ok) {
          try {
            upstream.body?.cancel?.();
          } catch { }
          try {
            upstream.body?.destroy?.();
          } catch { }
          return fail(`HTTP_${status || 0}`);
        }
        const ctRaw = String(upstream.headers.get('content-type') || '').trim();
        const inferred = inferMimeFromUrl(currentUrl);
        const ct = /^image\//i.test(ctRaw) ? ctRaw : inferred;
        if (!/^image\//i.test(ct)) return fail('NON_IMAGE');
        const len = Number.parseInt(String(upstream.headers.get('content-length') || ''), 10);
        if (Number.isFinite(len) && len > maxBytes) return fail('TOO_LARGE');
        const buf = await readUpstreamBodyLimited(upstream, maxBytes);
        if (!buf.length || buf.length > maxBytes) return fail('EMPTY_BODY');
        const saved = writeUserImageFile({ userId, buf, mime: ct, prefix });
        return saved ? ok(saved) : fail('WRITE_FAILED');
      }
      return fail('TOO_MANY_REDIRECTS');
    } catch (e) {
      const code = typeof e?.code === 'string' && e.code.trim() ? e.code.trim() : '';
      const msg = typeof e?.message === 'string' && e.message.trim() ? e.message.trim() : '';
      return fail(code || msg || 'FETCH_FAILED');
    }
  }
  return fail('UNSUPPORTED_URL');
};

const persistGenerateImageInputForUser = (input) => {
  const userId = String(input?.userId || '').trim();
  const img = input?.image && typeof input.image === 'object' ? input.image : null;
  const prefix = String(input?.prefix || 'img').trim() || 'img';
  if (!userId || !img) return '';
  const mime = String(img.mimeType || '').trim();
  const b64 = String(img.dataBase64 || '').trim();
  if (!/^image\//i.test(mime) || !b64) return '';
  try {
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) return '';
    return writeUserImageFile({ userId, buf, mime, prefix });
  } catch {
    return '';
  }
};

const IMAGE_HISTORY_MAX_ITEMS = (() => {
  const v = Number.parseInt(String(process.env.IMAGE_HISTORY_MAX_ITEMS || ''), 10);
  return Number.isFinite(v) && v > 0 ? v : 80;
})();

const appendUserImageHistory = (input) => {
  try {
    const userId = String(input?.userId || '').trim();
    if (!userId) return false;
    const entry = input?.entry && typeof input.entry === 'object' ? input.entry : null;
    if (!entry) return false;

    const mem = ensureUserMemoryShape(userId, readUserMemory(userId, null));
    const list = Array.isArray(mem.image_history) ? mem.image_history : [];
    const next = [entry, ...list].slice(0, IMAGE_HISTORY_MAX_ITEMS);
    mem.image_history = next;
    mem.meta = mem.meta && typeof mem.meta === 'object' ? mem.meta : {};
    mem.meta.updatedAt = Date.now();
    writeUserMemory(userId, mem);
    return true;
  } catch {
    return false;
  }
};

const AUDIT_HISTORY_MAX_ITEMS = (() => {
  const v = Number.parseInt(String(process.env.AUDIT_HISTORY_MAX_ITEMS || ''), 10);
  return Number.isFinite(v) && v > 0 ? v : 400;
})();

const appendUserAuditHistory = (input) => {
  try {
    const userId = String(input?.userId || '').trim();
    if (!userId) return false;
    const entry = input?.entry && typeof input.entry === 'object' ? input.entry : null;
    if (!entry) return false;

    const mem = ensureUserMemoryShape(userId, readUserMemory(userId, null));
    const list = Array.isArray(mem.audit_history) ? mem.audit_history : [];
    const next = [entry, ...list].slice(0, AUDIT_HISTORY_MAX_ITEMS);
    mem.audit_history = next;
    mem.meta = mem.meta && typeof mem.meta === 'object' ? mem.meta : {};
    mem.meta.updatedAt = Date.now();
    writeUserMemory(userId, mem);
    return true;
  } catch {
    return false;
  }
};

const extractCoreFacts = async (input) => {
  const lang = input?.lang === 'en' ? 'en' : 'zh';
  const personaName = String(input?.personaName || 'Lumina').trim() || 'Lumina';
  const existing = Array.isArray(input?.existingCore) ? input.existingCore : [];
  const buffer = Array.isArray(input?.buffer) ? input.buffer : [];

  const lines = [];
  for (const m of buffer) {
    const role = m?.role === 'user' ? 'user' : m?.role === 'agent' ? 'assistant' : 'system';
    const t = toOneLine(stripControlText(m?.text || ''));
    if (!t) continue;
    lines.push(`${role}: ${t.slice(0, 220)}`);
    if (lines.length >= 30) break;
  }
  const convo = lines.join('\n');
  if (!convo) return [];

  const existingBlock = dedupeStrings(existing, 30)
    .map((x) => `- ${x}`)
    .join('\n');

  const prompt =
    lang === 'en'
      ? [
        `You are extracting long-term memory facts for an anime-style website agent named ${personaName}.`,
        `From the following short-term buffer, extract 1–5 durable facts worth remembering.`,
        `Good facts: user preferences, recurring habits, names, boundaries, repeated interaction patterns.`,
        `Bad facts: temporary chit-chat, one-off questions, tool output, URLs, code blocks, raw UI selectors.`,
        `Existing core memory (avoid duplicates):`,
        existingBlock || '(none)',
        `Short-term buffer:`,
        convo,
        `Return ONLY a strict JSON array of strings, no extra text.`
      ].join('\n\n')
      : [
        `你在为站内二次元助手「${personaName}」提取长期记忆。`,
        `从下面的短期缓冲中提取 1–5 条“值得长期记住”的事实。`,
        `要：用户偏好/称呼/边界/反复出现的习惯/反复的特殊互动。`,
        `不要：一次性闲聊、临时任务细节、工具输出、URL、代码块、DOM 选择器。`,
        `已有长期记忆（尽量避免重复）：`,
        existingBlock || '（无）',
        `短期缓冲：`,
        convo,
        `只输出严格 JSON 字符串数组，不要输出任何多余文字。`
      ].join('\n\n');

  const { text } = await callTextGenerate({
    timeoutMs: 8000,
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });
  const parsed = tryParseJsonStringArray(text);
  if (parsed && parsed.length) return dedupeStrings(parsed, 6);

  const fallback = [];
  for (const m of buffer) {
    const raw = toOneLine(stripControlText(m?.text || '')).slice(0, 140);
    if (!raw) continue;
    if (m?.role === 'system' || /(喜欢|讨厌|偏好|习惯|名字|叫我|记住|不喜欢|别这样|边界)/.test(raw)) {
      fallback.push(raw);
    }
    if (fallback.length >= 4) break;
  }
  return dedupeStrings(fallback, 4);
};

const getIsoDay = () => {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const appendUserMemoryItems = async (input) => {
  const userId = String(input?.userId || 'anonymous');
  const lang = input?.lang === 'en' ? 'en' : 'zh';
  const personaName = String(input?.personaName || 'Lumina').trim() || 'Lumina';
  const items = Array.isArray(input?.items) ? input.items : [];

  const mem0 = ensureUserMemoryShape(userId, readUserMemory(userId, null));
  const now = Date.now();
  mem0.meta.last_interaction = getIsoDay() || mem0.meta.last_interaction || '';
  mem0.meta.updatedAt = now;

  for (const it of items) {
    const role = it?.role === 'user' ? 'user' : it?.role === 'agent' ? 'agent' : 'system';
    const text = String(it?.text || '').trim();
    if (!text) continue;
    mem0.short_term_buffer.push({
      role,
      text: text.slice(0, 1200),
      type: typeof it?.type === 'string' && it.type.trim() ? it.type.trim() : undefined,
      ts: typeof it?.ts === 'number' ? it.ts : now
    });
  }

  if (mem0.short_term_buffer.length > 140) {
    mem0.short_term_buffer = mem0.short_term_buffer.slice(-140);
  }

  const compressThreshold = 20;
  if (mem0.short_term_buffer.length > compressThreshold) {
    const toCompress = mem0.short_term_buffer.slice(0, compressThreshold);
    const remaining = mem0.short_term_buffer.slice(compressThreshold);
    const facts = await extractCoreFacts({
      lang,
      personaName,
      buffer: toCompress,
      existingCore: mem0.core_memory
    });
    if (facts.length) {
      mem0.core_memory = dedupeStrings([...mem0.core_memory, ...facts], 80);
    }
    mem0.short_term_buffer = remaining.slice(-3);
    mem0.meta.coreUpdatedAt = Date.now();
  }

  writeUserMemory(userId, mem0);
  return mem0;
};

const buildLongMemoryText = (input) => {
  const core = Array.isArray(input?.coreMemory) ? input.coreMemory : [];
  const summary = String(input?.summary || '').trim();
  const coreBlock = dedupeStrings(core, 60)
    .map((x) => `- ${x}`)
    .join('\n');
  return [coreBlock ? `CoreMemory:\n${coreBlock}` : '', summary ? `Summary:\n${summary}` : '']
    .filter((x) => x && String(x).trim())
    .join('\n\n')
    .trim();
};

const toImageHistoryRef = (rawUrl) => {
  const url = String(rawUrl || '').trim();
  if (!url) return null;
  if (url.startsWith('/files/')) return { kind: 'url', url: url.slice(0, 800) };
  if (url.startsWith('data:')) {
    const semi = url.indexOf(';');
    const mime = semi > 5 ? url.slice(5, semi).trim() : '';
    return { kind: 'data', ...(mime ? { mime } : {}) };
  }
  if (/^https?:\/\//i.test(url)) return { kind: 'url', url: url.slice(0, 800) };
  return null;
};

module.exports = {
  persistImageRefForUser,
  persistGenerateImageInputForUser,
  appendUserImageHistory,
  appendUserAuditHistory,
  appendUserMemoryItems,
  buildLongMemoryText,
  toImageHistoryRef,
  writeUserImageFile,
  tryParseDataUrl,
  toOneLine,
  summarizeHistory
};
