const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
const { fetch, fetchWithTimeout } = require('./lib/fetch-utils');

const {
  readJson,
  writeJson,
  readUserMemory,
  writeUserMemory,
  getUserMemoryFile,
  MEMORY_DIR,
  VECTORS_FILE,
  CHATS_FILE,
  USERS_FILE,
  API_KEYS_FILE,
  USAGE_LEDGER_FILE,
  ANALYTICS_EVENTS_FILE,
  PAY_ORDERS_FILE,
  CREDITS_ORDERS_FILE
} = require('./utils/storage');

const { installImgagentRoutes, credits: imgCredits } = require('./imgagent');
const { getClientIp, rateLimit } = require('./lib/rateLimit');
const { createLedger } = require('./lib/usageLedger');
const { installSystemRoutes } = require('./routes/system');
const { installUsageRoutes } = require('./routes/usage');
const { installHfRoutes } = require('./routes/hf');
const { installAuthRoutes } = require('./routes/auth');
const { installAdminRoutes } = require('./routes/admin');

const { assertAdmin, sanitizeUserProfile, resolveAuthUser, parseBearerToken, normalizeEmail, canUseTestLoginCode, readUsersMap, assertAuthUserMatches } = require('./lib/auth-utils');
const { readApiKeysMap, createApiKeyForUser, resolveApiKeyUser, maskApiKey } = require('./lib/api-key-utils');
const {
  NODE_ENV, isProd, API_KEY, SILICONFLOW_API_KEY, SILICONFLOW_API_BASE, SILICONFLOW_MODEL,
  activeTextProvider, GEMINI_GENERATE_URLS, GEMINI_EMBED_URLS, GEMINI_TIMEOUT_MS, GEMINI_REACTION_TIMEOUT_MS,
  SILICONFLOW_TIMEOUT_MS, SILICONFLOW_REACTION_TIMEOUT_MS, HF_RESOLVE_BASES, HF_API_BASES,
  HF_CACHE_DIR, HF_CACHE_TTL_MS, HF_CACHE_MAX_BYTES, HF_CACHE_MAX_FILES, HF_PROXY_RATE_MAX, HF_PROXY_RATE_WINDOW_MS,
  normalizeUrl, normalizeUpstreamBase
} = require('./lib/config');
const {
  callGeminiGenerate, callSiliconFlowChat, callSiliconFlowImageGenerate, callTextGenerate, callGeminiEmbed
} = require('./lib/ai-providers');
const {
  proxyHuggingFace, proxyLive2DCubismCore, getHfCacheUsage, hfProxyBaseHealth
} = require('./lib/hf-proxy');
const {
  buildModeDocIndex, MODEDOC_ROOT
} = require('./lib/modedoc');
const {
  buildOfflineReply, extractRagKeywords, scoreRagKeywordHit, stripControlText, analyzeIntent, buildChatPrompt
} = require('./lib/intent');
const {
  persistImageRefForUser, persistGenerateImageInputForUser, appendUserImageHistory, appendUserMemoryItems, buildLongMemoryText, toImageHistoryRef, summarizeHistory
} = require('./lib/memory-manager');
const { ensureUserMemoryShape } = require('./lib/memory-utils');
const {
  dedupeStrings, trimPromptText
} = require('./lib/user-utils');
const {
  getEmbedding, cosineSimilarity
} = require('./lib/vector-utils');

const app = express();
console.log('Raw process.env.PORT:', process.env.PORT);
const PORT = process.env.PORT || 8080;
console.log('Resolved PORT:', PORT);
const DEBUG_FILES = String(process.env.DEBUG_FILES || '').trim() === '1';
const FILES_DIR = path.join(MEMORY_DIR, 'files');

try {
  if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
} catch { }
console.log('MEMORY_DIR:', MEMORY_DIR);
console.log('FILES_DIR:', FILES_DIR);

if (String(process.env.TRUST_PROXY || '').trim() === '1') {
  app.set('trust proxy', true);
}

app.disable('x-powered-by');

const getOrCreateRequestId = (req) => {
  const h =
    typeof req.headers['x-request-id'] === 'string'
      ? req.headers['x-request-id']
      : Array.isArray(req.headers['x-request-id'])
        ? String(req.headers['x-request-id'][0] || '')
        : '';
  const existing = String(h || '').trim();
  if (existing && existing.length <= 120) return existing;
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
  }
};

app.use((req, res, next) => {
  const requestId = getOrCreateRequestId(req);
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'DENY');

  if (String(process.env.ENABLE_CROSS_ORIGIN_ISOLATION || '').trim() === '1') {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  if (isProd && String(process.env.ENABLE_HSTS || '').trim() === '1') {
    const maxAge = Math.max(0, Number.parseInt(process.env.HSTS_MAX_AGE || '15552000', 10) || 15552000);
    res.setHeader('Strict-Transport-Security', `max-age=${maxAge}; includeSubDomains`);
  }
  next();
});

const shouldLogRequests = (() => {
  const raw = String(process.env.LOG_REQUESTS || '').trim();
  if (raw === '0') return false;
  if (raw === '1') return true;
  return isProd;
})();

app.use((req, res, next) => {
  if (!shouldLogRequests) return next();
  const startedAt = process.hrtime.bigint();
  const ip = (() => {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
    if (Array.isArray(xf) && xf.length) return String(xf[0] || '').trim();
    return typeof req.ip === 'string' ? req.ip.trim() : '';
  })();
  res.on('finish', () => {
    const durMs = Number((process.hrtime.bigint() - startedAt) / 1000000n);
    const status = typeof res.statusCode === 'number' ? res.statusCode : 0;
    const method = String(req.method || '').toUpperCase();
    const url = String(req.originalUrl || req.url || '').split('?')[0];
    const rid = String(res.locals.requestId || '');
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 160) : '';
    console.log(JSON.stringify({ ts: Date.now(), rid, ip, method, url, status, durMs, ua }));
  });
  next();
});

const parseCorsOrigins = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s === '*') return '*';
  const list = s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length ? list : null;
};

const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '');
if (corsOrigins === '*') {
  app.use(cors());
} else if (corsOrigins && corsOrigins.length) {
  const allowed = new Set(corsOrigins);
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowed.has(origin)) return cb(null, true);
        return cb(new Error('CORS_NOT_ALLOWED'));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Afdian-Token', 'X-Api-Key', 'X-Admin-Key']
    })
  );
} else {
  if (!isProd) app.use(cors());
}
const JSON_BODY_LIMIT = String(process.env.JSON_BODY_LIMIT || '25mb').trim() || '25mb';
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

const serveLocalFileFromFilesDir = (req, res, next) => {
  if (!req.path || typeof req.path !== 'string') return next();
  const rawParam = req.path.replace(/^\/+/, '');
  if (!rawParam) return res.status(404).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();

  let decoded = rawParam;
  try {
    decoded = decodeURIComponent(rawParam);
  } catch { }
  decoded = String(decoded || '').replace(/\\/g, '/');
  if (!decoded) return res.status(404).end();
  if (decoded.includes('\0')) return res.status(400).end();

  const parts = decoded.split('/').filter(Boolean);
  if (!parts.length) return res.status(404).end();
  for (const seg of parts) {
    if (seg === '.' || seg === '..') return res.status(400).end();
  }

  const root = path.resolve(FILES_DIR);
  const full = path.resolve(root, ...parts);
  const rootLower = root.toLowerCase();
  const fullLower = full.toLowerCase();
  if (fullLower !== rootLower && !fullLower.startsWith(rootLower + path.sep.toLowerCase())) {
    return res.status(403).end();
  }

  if (DEBUG_FILES) {
    let exists = false;
    try {
      exists = fs.existsSync(full);
    } catch { }
    console.log('FILES_DEBUG', { reqPath: req.path, rawParam, decoded, root, full, exists });
  }

  let st = null;
  try {
    st = fs.statSync(full);
  } catch {
    st = null;
  }
  if (!st || !st.isFile()) return res.status(404).end();

  res.setHeader('Cache-Control', 'public, max-age=2592000');
  return res.sendFile(full);
};

app.use('/files', serveLocalFileFromFilesDir);

app.use((err, req, res, next) => {
  const status = typeof err?.status === 'number' ? err.status : 0;
  const type = typeof err?.type === 'string' ? err.type : '';
  if (String(err?.message || '') === 'CORS_NOT_ALLOWED') return res.status(403).json({ error: 'CORS_NOT_ALLOWED' });
  if (type === 'entity.too.large') return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
  if (status === 400 && err instanceof SyntaxError) return res.status(400).json({ error: 'INVALID_JSON' });
  return next(err);
});

const enableApiRateLimit = (() => {
  const raw = String(process.env.API_RATE_LIMIT || '').trim();
  if (raw === '0') return false;
  if (raw === '1') return true;
  return isProd;
})();
const API_RATE_MAX = (() => {
  const v = Number.parseInt(process.env.API_RATE_MAX || '', 10);
  return Number.isFinite(v) && v > 0 ? v : 900;
})();
const API_RATE_WINDOW_MS = (() => {
  const v = Number.parseInt(process.env.API_RATE_WINDOW_MS || '', 10);
  return Number.isFinite(v) && v > 0 ? v : 60 * 1000;
})();
if (enableApiRateLimit) {
  app.use('/api', rateLimit('api', { max: API_RATE_MAX, windowMs: API_RATE_WINDOW_MS }));
}

const isPrivateHost = (host) => {
  const h = String(host || '').trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h === 'localhost.localdomain') return true;
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
    if (h.startsWith('::') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80'))
      return true;
  }
  return false;
};

const inferImageContentType = (pathname) => {
  const raw = String(pathname || '').trim().toLowerCase();
  const clean = raw.split('?')[0].split('#')[0];
  const ext = clean.split('.').pop() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  return '';
};

const sniffImageContentType = (buf) => {
  if (!buf || buf.length < 12) return '';
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  const head6 = buf.subarray(0, 6).toString('ascii');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  const riff = buf.subarray(0, 4).toString('ascii');
  const webp = buf.subarray(8, 12).toString('ascii');
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  return '';
};

app.get('/api/proxy/image', async (req, res) => {
  try {
    const raw = typeof req.query.url === 'string' ? req.query.url : '';
    const target = String(raw || '').trim();
    if (!target) return res.status(400).json({ error: 'MISSING_URL' });
    let parsed = null;
    try {
      parsed = new URL(target);
    } catch {
      return res.status(400).json({ error: 'INVALID_URL' });
    }
    const proto = String(parsed.protocol || '').toLowerCase();
    if (proto !== 'http:' && proto !== 'https:') return res.status(400).json({ error: 'INVALID_PROTOCOL' });
    const hostname = String(parsed.hostname || '').trim();
    if (isPrivateHost(hostname)) return res.status(403).json({ error: 'FORBIDDEN_HOST' });

    const upstream = await fetchWithTimeout(
      target,
      {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept: 'image/*,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0'
        }
      },
      20000
    );
    if (!upstream.ok) return res.status(502).json({ error: `UPSTREAM_${upstream.status || 502}` });

    const ct = String(upstream.headers.get('content-type') || '').trim();
    const ctLower = ct.toLowerCase();
    let finalType = '';
    if (/^image\//i.test(ctLower)) finalType = ctLower.split(';')[0].trim();
    if (!finalType || ctLower === 'application/octet-stream' || ctLower === 'binary/octet-stream') {
      finalType = inferImageContentType(parsed.pathname || '');
    }
    const len = Number.parseInt(String(upstream.headers.get('content-length') || ''), 10);
    if (Number.isFinite(len) && len > 25 * 1024 * 1024) return res.status(413).json({ error: 'TOO_LARGE' });

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (!buf.length || buf.length > 25 * 1024 * 1024) return res.status(413).json({ error: 'TOO_LARGE' });

    if (!finalType) finalType = sniffImageContentType(buf);
    if (!finalType) return res.status(415).json({ error: 'NOT_IMAGE' });

    res.status(200);
    res.setHeader('Content-Type', finalType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(buf);
  } catch {
    res.status(502).json({ error: 'PROXY_FAILED' });
  }
});

app.get('/api/proxy/google-gsi', async (req, res) => {
  try {
    const upstream = await fetchWithTimeout(
      'https://accounts.google.com/gsi/client',
      {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept: '*/*',
          'User-Agent': 'Mozilla/5.0'
        }
      },
      20000
    );
    if (!upstream.ok) return res.status(502).json({ error: `UPSTREAM_${upstream.status || 502}` });
    const ct = String(upstream.headers.get('content-type') || '').trim() || 'application/javascript';
    const text = await upstream.text();
    res.status(200);
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(text);
  } catch {
    res.status(502).json({ error: 'PROXY_FAILED' });
  }
});

const clampInt = (n, min, max) => {
  const v = Number.parseInt(String(n || ''), 10);
  return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : min;
};

// Routes Installation

const ledger = createLedger({
  readJson,
  writeJson,
  USAGE_LEDGER_FILE,
  ANALYTICS_EVENTS_FILE,
  getClientIp
});

installAuthRoutes(app);
installAdminRoutes(app);

// ... Usage Routes ...
installUsageRoutes(app, {
  readJson,
  writeJson,
  USAGE_LEDGER_FILE,
  ANALYTICS_EVENTS_FILE,
  CREDITS_ORDERS_FILE,
  PAY_ORDERS_FILE,
  getClientIp,
  rateLimit,
  assertAuthUserMatches,
  assertAdmin,
  readUsersMap,
  clampInt,
  ...ledger
});

// ... Imgagent Routes ...
installImgagentRoutes(app, {
  readJson,
  writeJson,
  readUserMemory,
  writeUserMemory,
  getUserMemoryFile,
  ensureUserMemoryShape,
  FILES_DIR,
  callSiliconFlowImageGenerate,
  persistImageRefForUser,
  persistGenerateImageInputForUser,
  appendUserImageHistory,
  imgCredits,
  getClientIp,
  assertAuthUserMatches
});

// ... System Routes ...
const requireLlmProvider = String(process.env.REQUIRE_LLM_PROVIDER || '').trim() === '1';
const buildModeDocIndexGetter = () => buildModeDocIndex();
const modeDocRootGetter = () => MODEDOC_ROOT;

installSystemRoutes(app, {
  NODE_ENV,
  isProd,
  requireLlmProvider,
  API_KEY,
  SILICONFLOW_API_KEY,
  activeTextProvider,
  imgCredits,
  VECTORS_FILE,
  readJson,
  fs,
  path,
  HF_RESOLVE_BASES,
  HF_API_BASES,
  hfProxyBaseHealth,
  normalizeUpstreamBase,
  HF_CACHE_DIR,
  HF_CACHE_TTL_MS,
  HF_CACHE_MAX_BYTES,
  HF_CACHE_MAX_FILES,
  getHfCacheUsage,
  buildModeDocIndex: buildModeDocIndexGetter,
  callGeminiGenerate,
  callSiliconFlowChat,
  callTextGenerate,
  GEMINI_GENERATE_URLS,
  GEMINI_EMBED_URLS,
  GEMINI_TIMEOUT_MS,
  GEMINI_REACTION_TIMEOUT_MS,
  SILICONFLOW_API_BASE,
  SILICONFLOW_MODEL,
  MODEDOC_ROOT: modeDocRootGetter,
  getClientIp,
  normalizeEmail,
  canUseTestLoginCode,
  MEMORY_DIR,
  buildOfflineReply,
  extractRagKeywords,
  scoreRagKeywordHit,
  stripControlText,
  analyzeIntent,
  buildChatPrompt,
  buildLongMemoryText,
  appendUserMemoryItems,
  trimPromptText,
  getEmbedding,
  cosineSimilarity,
  summarizeHistory
});

// ... HF Routes ...
installHfRoutes(app, {
  rateLimit,
  fetchWithTimeout,
  HF_API_BASES,
  HF_PROXY_RATE_MAX,
  HF_PROXY_RATE_WINDOW_MS,
  proxyHuggingFace,
  proxyLive2DCubismCore
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
