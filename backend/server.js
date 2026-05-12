const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const dns = require("dns");
require("dotenv").config({
  path: path.resolve(__dirname, ".env"),
  override: true,
});
const { fetch, fetchWithTimeout } = require("./lib/fetch-utils");

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
  CREDITS_ORDERS_FILE,
} = require("./utils/storage");

const { installImgagentRoutes, credits: imgCredits } = require("./imgagent");
const { getClientIp, rateLimit } = require("./lib/rateLimit");
const { createLedger } = require("./lib/usageLedger");
const { installSystemRoutes } = require("./routes/system");
const { installUsageRoutes } = require("./routes/usage");
const { installHfRoutes } = require("./routes/hf");
const { installAuthRoutes } = require("./routes/auth");
const { installAdminRoutes } = require("./routes/admin");

const {
  assertAdmin,
  sanitizeUserProfile,
  resolveAuthUser,
  parseBearerToken,
  verifyAdminToken,
  normalizeEmail,
  canUseTestLoginCode,
  readUsersMap,
  assertAuthUserMatches,
} = require("./lib/auth-utils");
const {
  readApiKeysMap,
  createApiKeyForUser,
  resolveApiKeyUser,
  maskApiKey,
} = require("./lib/api-key-utils");
const {
  NODE_ENV,
  isProd,
  API_KEY,
  SILICONFLOW_API_KEY,
  SILICONFLOW_API_BASE,
  SILICONFLOW_MODEL,
  activeTextProvider,
  GEMINI_GENERATE_URLS,
  GEMINI_EMBED_URLS,
  GEMINI_TIMEOUT_MS,
  GEMINI_REACTION_TIMEOUT_MS,
  SILICONFLOW_TIMEOUT_MS,
  SILICONFLOW_REACTION_TIMEOUT_MS,
  HF_RESOLVE_BASES,
  HF_API_BASES,
  HF_CACHE_DIR,
  HF_CACHE_TTL_MS,
  HF_CACHE_MAX_BYTES,
  HF_CACHE_MAX_FILES,
  HF_PROXY_RATE_MAX,
  HF_PROXY_RATE_WINDOW_MS,
  normalizeUrl,
  normalizeUpstreamBase,
} = require("./lib/config");
const {
  callGeminiGenerate,
  callSiliconFlowChat,
  callSiliconFlowImageGenerate,
  callTextGenerate,
  callGeminiEmbed,
} = require("./lib/ai-providers");
const {
  proxyHuggingFace,
  proxyLive2DCubismCore,
  getHfCacheUsage,
  getHfCacheStats,
  hfProxyBaseHealth,
} = require("./lib/hf-proxy");
const { buildModeDocIndex, MODEDOC_ROOT } = require("./lib/modedoc");
const {
  buildOfflineReply,
  extractRagKeywords,
  scoreRagKeywordHit,
  stripControlText,
  analyzeIntent,
  buildChatPrompt,
} = require("./lib/intent");
const {
  persistImageRefForUser,
  persistGenerateImageInputForUser,
  appendUserImageHistory,
  appendUserAuditHistory,
  appendUserMemoryItems,
  buildLongMemoryText,
  toImageHistoryRef,
  summarizeHistory,
} = require("./lib/memory-manager");
const { ensureUserMemoryShape } = require("./lib/memory-utils");
const { dedupeStrings, trimPromptText } = require("./lib/user-utils");
const { getEmbedding, cosineSimilarity } = require("./lib/vector-utils");

const app = express();
console.log("Raw process.env.PORT:", process.env.PORT);
const PORT = process.env.PORT || 8080;
console.log("Resolved PORT:", PORT);
const DEBUG_FILES = String(process.env.DEBUG_FILES || "").trim() === "1";
const FILES_DIR = path.join(MEMORY_DIR, "files");

try {
  if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
} catch {}
console.log("MEMORY_DIR:", MEMORY_DIR);
console.log("FILES_DIR:", FILES_DIR);

if (String(process.env.TRUST_PROXY || "").trim() === "1") {
  app.set("trust proxy", true);
}

app.disable("x-powered-by");

const getOrCreateRequestId = (req) => {
  const h =
    typeof req.headers["x-request-id"] === "string"
      ? req.headers["x-request-id"]
      : Array.isArray(req.headers["x-request-id"])
        ? String(req.headers["x-request-id"][0] || "")
        : "";
  const existing = String(h || "").trim();
  if (existing && existing.length <= 120) return existing;
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}`;
  }
};

app.use((req, res, next) => {
  const requestId = getOrCreateRequestId(req);
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader("X-Frame-Options", "DENY");

  if (String(process.env.ENABLE_CROSS_ORIGIN_ISOLATION || "").trim() === "1") {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  }

  if (isProd && String(process.env.ENABLE_HSTS || "").trim() === "1") {
    const maxAge = Math.max(
      0,
      Number.parseInt(process.env.HSTS_MAX_AGE || "15552000", 10) || 15552000,
    );
    res.setHeader(
      "Strict-Transport-Security",
      `max-age=${maxAge}; includeSubDomains`,
    );
  }
  next();
});

const shouldLogRequests = (() => {
  const raw = String(process.env.LOG_REQUESTS || "").trim();
  if (raw === "0") return false;
  if (raw === "1") return true;
  return isProd;
})();

app.use((req, res, next) => {
  if (!shouldLogRequests) return next();
  const startedAt = process.hrtime.bigint();
  const ip = getClientIp(req);
  res.on("finish", () => {
    const durMs = Number((process.hrtime.bigint() - startedAt) / 1000000n);
    const status = typeof res.statusCode === "number" ? res.statusCode : 0;
    const method = String(req.method || "").toUpperCase();
    const url = String(req.originalUrl || req.url || "").split("?")[0];
    const rid = String(res.locals.requestId || "");
    const ua =
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"].slice(0, 160)
        : "";
    console.log(
      JSON.stringify({
        ts: Date.now(),
        rid,
        ip,
        method,
        url,
        status,
        durMs,
        ua,
      }),
    );
  });
  next();
});

const parseCorsOrigins = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s === "*") return "*";
  const list = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length ? list : null;
};

const corsOrigins = parseCorsOrigins(
  process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || "",
);
if (corsOrigins === "*") {
  app.use(cors());
} else if (corsOrigins && corsOrigins.length) {
  const allowed = new Set(corsOrigins);
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowed.has(origin)) return cb(null, true);
        return cb(new Error("CORS_NOT_ALLOWED"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Afdian-Token",
        "X-Api-Key",
        "X-Admin-Key",
      ],
    }),
  );
} else {
  if (!isProd) app.use(cors());
}
const JSON_BODY_LIMIT =
  String(process.env.JSON_BODY_LIMIT || (isProd ? "10mb" : "25mb")).trim() ||
  (isProd ? "10mb" : "25mb");
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

const resolveAdminForFiles = (req) => {
  const bearer =
    typeof parseBearerToken === "function" ? parseBearerToken(req) : "";
  if (bearer) {
    const v =
      typeof verifyAdminToken === "function"
        ? verifyAdminToken(bearer)
        : { ok: false, error: "INVALID_TOKEN" };
    if (v && v.ok) return { ok: true, status: 200 };
    if (String(v?.error || "") === "EXPIRED") return { ok: false, status: 401 };
    return { ok: false, status: 403 };
  }

  const expected = String(process.env.ADMIN_KEY || "").trim();
  if (!expected) return { ok: false, status: 403 };
  const got =
    typeof req?.headers?.["x-admin-key"] === "string"
      ? String(req.headers["x-admin-key"]).trim()
      : "";
  if (!got) return { ok: false, status: 401 };
  try {
    const a = Buffer.from(got, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return { ok: false, status: 403 };
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, status: 403 };
  } catch {
    return { ok: false, status: 403 };
  }
  return { ok: true, status: 200 };
};

const readQueryToken = (req) => {
  try {
    const q = req?.query?.token;
    if (typeof q === "string") return q.trim();
    if (Array.isArray(q) && typeof q[0] === "string")
      return String(q[0] || "").trim();
  } catch {}
  try {
    const raw =
      typeof req?.originalUrl === "string"
        ? req.originalUrl
        : typeof req?.url === "string"
          ? req.url
          : "";
    const s = String(raw || "");
    const idx = s.indexOf("?");
    if (idx < 0) return "";
    const qs = s.slice(idx + 1);
    const params = new URLSearchParams(qs);
    return String(params.get("token") || "").trim();
  } catch {
    return "";
  }
};

const serveLocalFileFromFilesDir = (req, res, next) => {
  if (!req.path || typeof req.path !== "string") return next();
  const rawParam = req.path.replace(/^\/+/, "");
  if (!rawParam) return res.status(404).end();
  if (req.method !== "GET" && req.method !== "HEAD")
    return res.status(405).end();

  let decoded = rawParam;
  try {
    decoded = decodeURIComponent(rawParam);
  } catch {}
  decoded = String(decoded || "").replace(/\\/g, "/");
  if (!decoded) return res.status(404).end();
  if (decoded.includes("\0")) return res.status(400).end();

  const parts = decoded.split("/").filter(Boolean);
  if (!parts.length) return res.status(404).end();
  for (const seg of parts) {
    if (seg === "." || seg === "..") return res.status(400).end();
  }
  if (parts.length < 2) return res.status(404).end();

  const userSegment = String(parts[0] || "").trim();
  if (!userSegment) return res.status(404).end();
  const isGuestFile = userSegment.startsWith("guest_");
  if (!isGuestFile) {
    const resolved =
      typeof resolveAuthUser === "function"
        ? resolveAuthUser(req)
        : { ok: false, status: 401 };
    const isOwner =
      resolved?.ok && String(resolved.userId || "").trim() === userSegment;
    if (!isOwner) {
      const queryToken = readQueryToken(req);
      if (queryToken && typeof readUsersMap === "function") {
        try {
          const users = readUsersMap();
          const hit = Object.values(users).find(
            (u) => String(u?.sessionToken || "") === queryToken,
          );
          const qUserId = typeof hit?.id === "string" ? hit.id.trim() : "";
          if (qUserId && qUserId === userSegment) {
            res.setHeader("Cache-Control", "private, max-age=2592000");
            res.setHeader("Vary", "Authorization, Cookie");
            const root = path.resolve(FILES_DIR);
            const full = path.resolve(root, ...parts);
            const rootLower = root.toLowerCase();
            const fullLower = full.toLowerCase();
            if (
              fullLower !== rootLower &&
              !fullLower.startsWith(rootLower + path.sep.toLowerCase())
            ) {
              return res.status(403).end();
            }
            let st = null;
            try {
              st = fs.statSync(full);
            } catch {
              st = null;
            }
            if (!st || !st.isFile()) return res.status(404).end();
            return res.sendFile(full);
          }
        } catch {}
      }
      if (DEBUG_FILES) {
        let tokenLen = 0;
        try {
          tokenLen = queryToken ? String(queryToken).length : 0;
        } catch {}
        let tokenMatchedUser = false;
        try {
          if (queryToken && typeof readUsersMap === "function") {
            const users = readUsersMap();
            const hit = Object.values(users).find(
              (u) => String(u?.sessionToken || "") === queryToken,
            );
            const qUserId = typeof hit?.id === "string" ? hit.id.trim() : "";
            tokenMatchedUser = !!qUserId && qUserId === userSegment;
          }
        } catch {}
        const hasBearer = !!(typeof parseBearerToken === "function"
          ? parseBearerToken(req)
          : "");
        const hasCookie =
          typeof req?.headers?.cookie === "string" &&
          req.headers.cookie.includes("auth_token=");
        console.log("FILES_DEBUG_AUTH", {
          userSegment,
          tokenLen,
          tokenMatchedUser,
          hasBearer,
          hasCookie,
        });
      }
      const admin = resolveAdminForFiles(req);
      if (!admin?.ok) return res.status(admin?.status || 401).end();
    }
  }

  const root = path.resolve(FILES_DIR);
  const full = path.resolve(root, ...parts);
  const rootLower = root.toLowerCase();
  const fullLower = full.toLowerCase();
  if (
    fullLower !== rootLower &&
    !fullLower.startsWith(rootLower + path.sep.toLowerCase())
  ) {
    return res.status(403).end();
  }

  if (DEBUG_FILES) {
    let exists = false;
    try {
      exists = fs.existsSync(full);
    } catch {}
    console.log("FILES_DEBUG", {
      reqPath: req.path,
      rawParam,
      decoded,
      root,
      full,
      exists,
    });
  }

  let st = null;
  try {
    st = fs.statSync(full);
  } catch {
    st = null;
  }
  if (!st || !st.isFile()) return res.status(404).end();

  res.setHeader(
    "Cache-Control",
    isGuestFile ? "public, max-age=2592000" : "private, max-age=2592000",
  );
  if (!isGuestFile) res.setHeader("Vary", "Authorization, Cookie");
  return res.sendFile(full);
};

app.use("/files", serveLocalFileFromFilesDir);

app.use((err, req, res, next) => {
  const status = typeof err?.status === "number" ? err.status : 0;
  const type = typeof err?.type === "string" ? err.type : "";
  if (String(err?.message || "") === "CORS_NOT_ALLOWED")
    return res.status(403).json({ error: "CORS_NOT_ALLOWED" });
  if (type === "entity.too.large")
    return res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
  if (status === 400 && err instanceof SyntaxError)
    return res.status(400).json({ error: "INVALID_JSON" });
  return next(err);
});

const enableApiRateLimit = (() => {
  const raw = String(process.env.API_RATE_LIMIT || "").trim();
  if (raw === "0") return false;
  if (raw === "1") return true;
  return isProd;
})();
const API_RATE_MAX = (() => {
  const v = Number.parseInt(process.env.API_RATE_MAX || "", 10);
  return Number.isFinite(v) && v > 0 ? v : 900;
})();
const API_RATE_WINDOW_MS = (() => {
  const v = Number.parseInt(process.env.API_RATE_WINDOW_MS || "", 10);
  return Number.isFinite(v) && v > 0 ? v : 60 * 1000;
})();
if (enableApiRateLimit) {
  app.use(
    "/api",
    rateLimit("api", { max: API_RATE_MAX, windowMs: API_RATE_WINDOW_MS }),
  );
}

const isPrivateHost = (host) => {
  const h = String(host || "")
    .trim()
    .toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h === "localhost.localdomain") return true;
  if (h === "::1" || h === "[::1]") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split(".").map((x) => Number.parseInt(x, 10));
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
  if (h.includes(":")) {
    if (
      h.startsWith("::") ||
      h.startsWith("fc") ||
      h.startsWith("fd") ||
      h.startsWith("fe80")
    )
      return true;
  }
  return false;
};

const dnsLookupAll = async (hostname, timeoutMs = 1200) => {
  const h = String(hostname || "").trim();
  if (!h) throw new Error("INVALID_HOST");
  const lookup = dns.promises.lookup(h, { all: true, verbatim: true });
  const timer = new Promise((_, reject) =>
    setTimeout(
      () =>
        reject(
          Object.assign(new Error("DNS_TIMEOUT"), { code: "DNS_TIMEOUT" }),
        ),
      timeoutMs,
    ),
  );
  return await Promise.race([lookup, timer]);
};

const isPrivateResolvedHost = async (hostname) => {
  const h = String(hostname || "").trim();
  if (!h) return true;
  if (isPrivateHost(h)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return false;
  let addrs = [];
  try {
    addrs = await dnsLookupAll(h);
  } catch {
    return true;
  }
  for (const it of addrs) {
    const addr = String(it?.address || "").trim();
    if (!addr) continue;
    if (isPrivateHost(addr)) return true;
  }
  return false;
};

const safeRedirectUrl = (fromUrl, location) => {
  try {
    const next = new URL(String(location || "").trim(), fromUrl);
    return next.toString();
  } catch {
    return "";
  }
};

const fetchWithSafeRedirects = async (startUrl, opts, timeoutMs) => {
  let cur = String(startUrl || "").trim();
  const maxRedirects = 5;
  for (let i = 0; i <= maxRedirects; i += 1) {
    let parsed = null;
    try {
      parsed = new URL(cur);
    } catch {
      return { ok: false, error: "INVALID_URL", res: null, url: cur };
    }
    const proto = String(parsed.protocol || "").toLowerCase();
    if (proto !== "http:" && proto !== "https:")
      return { ok: false, error: "INVALID_PROTOCOL", res: null, url: cur };
    if (parsed.username || parsed.password)
      return { ok: false, error: "INVALID_URL", res: null, url: cur };
    const hostname = String(parsed.hostname || "").trim();
    if (!hostname)
      return { ok: false, error: "INVALID_URL", res: null, url: cur };
    if (isPrivateHost(hostname))
      return { ok: false, error: "FORBIDDEN_HOST", res: null, url: cur };
    if (await isPrivateResolvedHost(hostname))
      return { ok: false, error: "FORBIDDEN_HOST", res: null, url: cur };

    const res = await fetchWithTimeout(
      cur,
      { ...opts, redirect: "manual" },
      timeoutMs,
    );
    const status = Number(res?.status || 0) || 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const loc = res.headers.get("location");
      try {
        res.body?.cancel?.();
      } catch {}
      try {
        res.body?.destroy?.();
      } catch {}
      const next = safeRedirectUrl(cur, loc);
      if (!next)
        return { ok: false, error: "UPSTREAM_REDIRECT", res: null, url: cur };
      cur = next;
      continue;
    }
    return { ok: true, res, url: cur };
  }
  return { ok: false, error: "TOO_MANY_REDIRECTS", res: null, url: cur };
};

const readUpstreamBodyLimited = async (upstream, maxBytes) => {
  const cap = Math.max(1, Number(maxBytes) || 1);
  const body = upstream?.body;
  if (!body || typeof body.on !== "function") {
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > cap)
      throw Object.assign(new Error("TOO_LARGE"), { code: "TOO_LARGE" });
    return buf;
  }

  return await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const onData = (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > cap) {
        try {
          body.destroy();
        } catch {}
        reject(Object.assign(new Error("TOO_LARGE"), { code: "TOO_LARGE" }));
        return;
      }
      chunks.push(buf);
    };
    const onEnd = () => resolve(Buffer.concat(chunks, total));
    const onErr = (e) => reject(e);
    body.on("data", onData);
    body.on("end", onEnd);
    body.on("error", onErr);
  });
};

const inferImageContentType = (pathname) => {
  const raw = String(pathname || "")
    .trim()
    .toLowerCase();
  const clean = raw.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop() || "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  return "";
};

const sniffImageContentType = (buf) => {
  if (!buf || buf.length < 12) return "";
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
    return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";
  const head6 = buf.subarray(0, 6).toString("ascii");
  if (head6 === "GIF87a" || head6 === "GIF89a") return "image/gif";
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp";
  const riff = buf.subarray(0, 4).toString("ascii");
  const webp = buf.subarray(8, 12).toString("ascii");
  if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  return "";
};

app.get(
  "/api/proxy/image",
  rateLimit("proxy_image", { max: 60, windowMs: 60 * 1000 }),
  async (req, res) => {
    try {
      const raw = typeof req.query.url === "string" ? req.query.url : "";
      const target = String(raw || "").trim();
      if (!target) return res.status(400).json({ error: "MISSING_URL" });
      let parsed0 = null;
      try {
        parsed0 = new URL(target);
      } catch {
        return res.status(400).json({ error: "INVALID_URL" });
      }

      const safe = await fetchWithSafeRedirects(
        target,
        {
          method: "GET",
          headers: {
            Accept: "image/*,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0",
          },
        },
        20000,
      );
      if (!safe.ok || !safe.res) {
        const err = String(safe.error || "").trim();
        const status =
          err === "FORBIDDEN_HOST"
            ? 403
            : err === "INVALID_PROTOCOL" || err === "INVALID_URL"
              ? 400
              : 502;
        return res.status(status).json({ error: err || "PROXY_FAILED" });
      }
      const upstream = safe.res;
      if (!upstream.ok)
        return res
          .status(502)
          .json({ error: `UPSTREAM_${upstream.status || 502}` });

      const parsed = (() => {
        try {
          return new URL(String(upstream.url || safe.url || target));
        } catch {
          return parsed0;
        }
      })();

      const ct = String(upstream.headers.get("content-type") || "").trim();
      const ctLower = ct.toLowerCase();
      let finalType = "";
      if (/^image\//i.test(ctLower)) finalType = ctLower.split(";")[0].trim();
      if (
        !finalType ||
        ctLower === "application/octet-stream" ||
        ctLower === "binary/octet-stream"
      ) {
        finalType = inferImageContentType(parsed.pathname || "");
      }
      const len = Number.parseInt(
        String(upstream.headers.get("content-length") || ""),
        10,
      );
      const maxBytes = 25 * 1024 * 1024;
      if (Number.isFinite(len) && len > maxBytes)
        return res.status(413).json({ error: "TOO_LARGE" });

      let buf = null;
      try {
        buf = await readUpstreamBodyLimited(upstream, maxBytes);
      } catch (e) {
        const code = String(e?.code || e?.message || "").trim();
        if (code === "TOO_LARGE")
          return res.status(413).json({ error: "TOO_LARGE" });
        return res.status(502).json({ error: "PROXY_FAILED" });
      }
      if (!buf || !buf.length)
        return res.status(502).json({ error: "PROXY_FAILED" });

      if (!finalType) finalType = sniffImageContentType(buf);
      if (!finalType) return res.status(415).json({ error: "NOT_IMAGE" });

      res.status(200);
      res.setHeader("Content-Type", finalType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end(buf);
    } catch {
      res.status(502).json({ error: "PROXY_FAILED" });
    }
  },
);

app.get(
  "/api/proxy/google-gsi",
  rateLimit("proxy_google_gsi", { max: 120, windowMs: 60 * 1000 }),
  async (req, res) => {
    try {
      const upstream = await fetchWithTimeout(
        "https://accounts.google.com/gsi/client",
        {
          method: "GET",
          redirect: "follow",
          headers: {
            Accept: "*/*",
            "User-Agent": "Mozilla/5.0",
          },
        },
        20000,
      );
      if (!upstream.ok)
        return res
          .status(502)
          .json({ error: `UPSTREAM_${upstream.status || 502}` });
      const ct =
        String(upstream.headers.get("content-type") || "").trim() ||
        "application/javascript";
      const text = await upstream.text();
      res.status(200);
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end(text);
    } catch {
      res.status(502).json({ error: "PROXY_FAILED" });
    }
  },
);

const clampInt = (n, min, max) => {
  const v = Number.parseInt(String(n || ""), 10);
  return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : min;
};

const normalizeUserId = (raw) => {
  const s = String(raw || "").trim();
  if (s) return s;
  return "";
};

const stringifyPageContext = (input) => {
  if (typeof input === "string") return input.trim();
  if (!input) return "";
  try {
    return JSON.stringify(input);
  } catch {
    return "";
  }
};

const appendChatHistory = (userId, item) => {
  if (!userId || !item) return;
  try {
    const store = readJson(CHATS_FILE, {});
    const list = Array.isArray(store[userId]) ? store[userId] : [];
    list.push(item);
    store[userId] = list.slice(-240);
    writeJson(CHATS_FILE, store);
  } catch {}
};

const formatHistoryLines = (history, lang) => {
  const userLabel = lang === "en" ? "User" : "用户";
  const assistantLabel = lang === "en" ? "Assistant" : "助手";
  const lines = [];
  for (const m of history) {
    const role = String(m?.role || "").trim();
    const text = trimPromptText(String(m?.text || ""), 1600);
    if (!text) continue;
    const label = role === "user" ? userLabel : assistantLabel;
    lines.push(`${label}: ${text}`);
  }
  return lines;
};

const buildEventsText = (events) => {
  const lines = [];
  for (const it of events || []) {
    const text = String(it?.text || "").trim();
    if (!text) continue;
    lines.push(text.slice(0, 600));
    if (lines.length >= 12) break;
  }
  return lines.join("\n");
};

// Routes Installation

const ledger = createLedger({
  readJson,
  writeJson,
  USAGE_LEDGER_FILE,
  ANALYTICS_EVENTS_FILE,
  getClientIp,
});

app.post(
  "/api/chat",
  rateLimit("chat", { max: 60, windowMs: 60 * 1000 }),
  async (req, res) => {
    const body = req.body || {};
    const requestId = String(
      body.requestId || res.locals.requestId || "",
    ).trim();
    const rawMessage = String(body.message || "").trim();
    const agentContext =
      body.agentContext && typeof body.agentContext === "object"
        ? body.agentContext
        : null;
    const userId =
      normalizeUserId(body.userId) ||
      normalizeUserId(agentContext?.user?.id) ||
      `guest_${Date.now().toString(36)}`;
    const sessionId = ledger.sanitizeLedgerId(body.sessionId);
    const projectId = ledger.sanitizeLedgerId(body.projectId);

    if (!rawMessage)
      return res.status(400).json({ error: "EMPTY_MESSAGE", requestId });
    if (userId && !userId.startsWith("guest_")) {
      if (!assertAuthUserMatches(req, res, userId)) return;
    }

    const lang = agentContext?.runtime?.lang === "en" ? "en" : "zh";
    const personaName =
      String(
        agentContext?.persona?.name ||
          agentContext?.character?.name ||
          "Lumina",
      ).trim() || "Lumina";
    const personaId =
      String(agentContext?.persona?.id || "persona_default").trim() ||
      "persona_default";
    const personaRules = String(agentContext?.persona?.rules || "").trim();
    const userName =
      String(agentContext?.user?.name || "Friend").trim() || "Friend";
    const allowedMotions = Array.isArray(
      agentContext?.constraints?.allowedMotions,
    )
      ? agentContext.constraints.allowedMotions
      : [];
    const allowedExpressions = Array.isArray(
      agentContext?.constraints?.allowedExpressions,
    )
      ? agentContext.constraints.allowedExpressions
      : [];

    const mem = ensureUserMemoryShape(userId, readUserMemory(userId, null));
    const longMemory = buildLongMemoryText({
      coreMemory: Array.isArray(mem?.core_memory) ? mem.core_memory : [],
      summary: String(mem?.meta?.summary || "").trim(),
    });
    const memorySummary = String(agentContext?.memory?.summary || "").trim();
    const eventsText = buildEventsText(
      agentContext?.memory?.recentEvents || [],
    );

    const intent = analyzeIntent({
      message: rawMessage,
      ctx: agentContext,
      lang,
    });

    const projectKnowledge = String(body.projectKnowledge || "").trim();
    const pageContextText = trimPromptText(
      stringifyPageContext(body.pageContext),
      1600,
    );
    const requestSource = String(body.requestSource || "")
      .trim()
      .slice(0, 160);

    let ragText = "";
    let ragMeta = null;
    let ragUsed = false;

    if (intent.includeRag) {
      try {
        const vectorsRaw = readJson(VECTORS_FILE, []);
        const vectors = Array.isArray(vectorsRaw) ? vectorsRaw : [];
        const keywords = extractRagKeywords(rawMessage, lang);
        const keywordScores = [];
        if (keywords.length) {
          for (const v of vectors) {
            const text = typeof v?.text === "string" ? v.text.trim() : "";
            if (!text) continue;
            const lower = text.toLowerCase();
            let score = 0;
            for (const k of keywords)
              score += scoreRagKeywordHit(lower, String(k || "").toLowerCase());
            if (score > 0) keywordScores.push({ v, score });
          }
          keywordScores.sort((a, b) => b.score - a.score);
        }
        const embedding = await getEmbedding(rawMessage);
        const embScores = [];
        if (Array.isArray(embedding) && embedding.length) {
          for (const v of vectors) {
            if (
              !Array.isArray(v?.embedding) ||
              v.embedding.length !== embedding.length
            )
              continue;
            const sim = cosineSimilarity(embedding, v.embedding);
            if (!Number.isFinite(sim)) continue;
            embScores.push({ v, score: sim });
          }
          embScores.sort((a, b) => b.score - a.score);
        }
        const picked = (embScores.length ? embScores : keywordScores).slice(
          0,
          6,
        );
        const blocks = [];
        const metaItems = [];
        for (const p of picked) {
          const text = typeof p?.v?.text === "string" ? p.v.text.trim() : "";
          if (!text) continue;
          const source =
            typeof p?.v?.metadata?.sourceRel === "string"
              ? p.v.metadata.sourceRel
              : typeof p?.v?.metadata?.source === "string"
                ? p.v.metadata.source
                : "";
          blocks.push(
            [source ? `Source: ${source}` : "", text.slice(0, 1600)]
              .filter(Boolean)
              .join("\n"),
          );
          metaItems.push({
            id: String(p?.v?.id || "").trim(),
            source,
            score: Number(p?.score || 0) || 0,
          });
        }
        if (blocks.length) {
          ragText = blocks.join("\n\n").slice(0, 6000);
          ragUsed = true;
          ragMeta = { keywords, hits: metaItems };
        }
      } catch {}
    }

    const systemPrompt = buildChatPrompt({
      lang,
      personaName,
      personaId,
      personaProfile: "",
      personaRules,
      userName,
      memorySummary,
      longMemory,
      eventsText,
      allowedMotions,
      allowedExpressions,
      projectKnowledge,
      pageContextText,
      ragText,
      intent,
    });

    const allChats = (() => {
      try {
        const data = readJson(CHATS_FILE, {});
        return data && typeof data === "object" ? data : {};
      } catch {
        return {};
      }
    })();
    const historyRaw = Array.isArray(allChats[userId]) ? allChats[userId] : [];
    const history = historyRaw.slice(-12);
    const historyLines = formatHistoryLines(history, lang);
    const userLabel = lang === "en" ? "User" : "用户";
    const assistantLabel = lang === "en" ? "Assistant" : "助手";
    const prompt = [
      systemPrompt,
      historyLines.length
        ? `${lang === "en" ? "Conversation:" : "对话历史："}\n${historyLines.join("\n")}`
        : "",
      `${userLabel}: ${trimPromptText(rawMessage, 4000)}`,
      `${assistantLabel}:`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const startedAt = Date.now();
    let result = null;
    try {
      result = await callTextGenerate({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        timeoutMs: Number(body.timeoutMs) || 60000,
      });
    } catch (e) {
      result = {
        text: "",
        provider: "offline",
        usage: null,
        model: "offline",
        usedUrl: "",
        error: e,
      };
    }

    let replyText = String(result?.text || "").trim();
    let status = "ok";
    if (!replyText) {
      replyText = buildOfflineReply({ lang, personaName, message: rawMessage });
      status = "offline";
    }

    const now = Date.now();
    appendChatHistory(userId, {
      role: "user",
      text: trimPromptText(rawMessage, 4000),
      timestamp: now,
    });
    appendChatHistory(userId, {
      role: "agent",
      text: trimPromptText(replyText, 4000),
      timestamp: now,
    });

    if (!agentContext?.suppressMemorySave) {
      try {
        await appendUserMemoryItems({
          userId,
          lang,
          personaName,
          items: [
            { role: "user", text: trimPromptText(rawMessage, 1200), ts: now },
            { role: "agent", text: trimPromptText(replyText, 1200), ts: now },
          ],
        });
      } catch {}
    }

    try {
      const usage = result?.usage || null;
      const ledgerItem = {
        requestId:
          requestId || res.locals.requestId || `chat_${now.toString(36)}`,
        ts: now,
        userId,
        ...(sessionId ? { sessionId } : {}),
        ...(projectId ? { projectId } : {}),
        trigger: typeof intent?.kind === "string" ? intent.kind : "chat",
        provider: String(result?.provider || "").trim() || "offline",
        model: String(result?.model || "").trim(),
        usedUrl: String(result?.usedUrl || "").trim(),
        tokensIn: Number(usage?.promptTokens || 0) || 0,
        tokensOut: Number(usage?.completionTokens || 0) || 0,
        tokensTotal: Number(usage?.totalTokens || 0) || 0,
        rag: ragMeta || undefined,
        ragUsed,
        ...(requestSource ? { requestSource } : {}),
        status,
        durationMs: Date.now() - startedAt,
        ip: getClientIp(req),
        ua:
          typeof req.headers["user-agent"] === "string"
            ? req.headers["user-agent"].slice(0, 200)
            : "",
      };
      const creditsDelta = ledger.computeCreditsDelta(ledgerItem);
      ledger.upsertUsageLedgerItem({ ...ledgerItem, creditsDelta });
    } catch {}

    try {
      if (typeof appendUserAuditHistory === "function" && userId) {
        const usage = result?.usage || null;
        const entry = {
          id: requestId || res.locals.requestId || `chat_${now.toString(36)}`,
          ts: now,
          kind: "chat",
          biz: typeof intent?.kind === "string" ? intent.kind : "chat",
          provider: String(result?.provider || "").trim() || "offline",
          model: String(result?.model || "").trim(),
          usedUrl: String(result?.usedUrl || "").trim() || undefined,
          tokensIn: Number(usage?.promptTokens || 0) || 0,
          tokensOut: Number(usage?.completionTokens || 0) || 0,
          tokensTotal: Number(usage?.totalTokens || 0) || 0,
          ragUsed: !!ragUsed,
          rag: ragMeta || undefined,
          status,
          durationMs: Math.max(0, Date.now() - startedAt),
          userText: trimPromptText(rawMessage, 8000),
          aiText: trimPromptText(replyText, 20000),
          persona: { id: personaId, name: personaName },
          ...(sessionId ? { sessionId } : {}),
          ...(projectId ? { projectId } : {}),
          ...(requestSource ? { requestSource } : {}),
          ...(pageContextText ? { pageContext: pageContextText } : {}),
          ip: getClientIp(req),
          ua:
            typeof req.headers["user-agent"] === "string"
              ? req.headers["user-agent"].slice(0, 200)
              : "",
        };
        appendUserAuditHistory({ userId, entry });
      }
    } catch {}

    return res.json({
      reply: replyText,
      requestId: requestId || res.locals.requestId || "",
      rag: ragMeta || undefined,
    });
  },
);

app.get(
  "/api/chat/history/:userId",
  rateLimit("chat_history", { max: 120, windowMs: 60 * 1000 }),
  (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "MISSING_USER_ID" });
    if (!userId.startsWith("guest_")) {
      if (!assertAuthUserMatches(req, res, userId)) return;
    }

    try {
      const limit = clampInt(req.query.limit, 1, 200);
      const offset = clampInt(req.query.offset, 0, 5000);
      const allChats = readJson(CHATS_FILE, {});
      const history =
        allChats &&
        typeof allChats === "object" &&
        Array.isArray(allChats[userId])
          ? allChats[userId]
          : [];
      const total = history.length;
      const end = Math.max(0, Math.min(total, total - offset));
      const start = Math.max(0, end - limit);
      const items = history.slice(start, end);
      return res.json({ ok: true, total, history: items });
    } catch (e) {
      console.error("Error in GET /api/chat/history:", e);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
);

app.get(
  "/api/memory/:userId",
  rateLimit("memory_get", { max: 120, windowMs: 60 * 1000 }),
  (req, res) => {
    try {
      const userId = String(req.params.userId || "").trim();
      if (!userId)
        return res.status(400).json({ ok: false, error: "MISSING_USER_ID" });
      if (!userId.startsWith("guest_")) {
        if (!assertAuthUserMatches(req, res, userId)) return;
      }
      const mem = ensureUserMemoryShape(userId, readUserMemory(userId, null));
      return res.json({ ok: true, memory: mem });
    } catch (e) {
      console.error("Error in GET /api/memory/:userId:", e);
      return res
        .status(500)
        .json({ ok: false, error: "Internal Server Error" });
    }
  },
);

app.post(
  "/api/memory/ingest",
  rateLimit("memory_ingest", { max: 120, windowMs: 60 * 1000 }),
  async (req, res) => {
    const body = req.body || {};
    const requestId = String(
      body.requestId || res.locals.requestId || "",
    ).trim();
    const userId =
      normalizeUserId(body.userId) || `guest_${Date.now().toString(36)}`;
    if (!userId.startsWith("guest_")) {
      if (!assertAuthUserMatches(req, res, userId)) return;
    }

    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    const items = itemsRaw.slice(0, 120);
    const sessionId = ledger.sanitizeLedgerId(body.sessionId);
    const projectId = ledger.sanitizeLedgerId(body.projectId);
    const pageContextText = trimPromptText(
      stringifyPageContext(body.pageContext),
      1600,
    );
    const requestSource = String(body.requestSource || "").trim();
    const lang = body.lang === "en" ? "en" : "zh";
    const personaName =
      typeof body.personaName === "string" ? body.personaName : undefined;

    const startedAt = Date.now();
    try {
      await appendUserMemoryItems({
        userId,
        lang,
        ...(personaName ? { personaName } : {}),
        items,
      });
    } catch (e) {
      console.error("Error in POST /api/memory/ingest:", e);
      return res.status(500).json({ ok: false, error: "INGEST_FAILED" });
    }

    try {
      if (typeof appendUserAuditHistory === "function" && userId) {
        const now = Date.now();
        const entry = {
          id: requestId || res.locals.requestId || `mem_${now.toString(36)}`,
          ts: now,
          kind: "memory_ingest",
          biz: "memory_ingest",
          provider: "local",
          model: "",
          status: "ok",
          durationMs: Math.max(0, Date.now() - startedAt),
          itemsCount: items.length,
          itemsPreview: items
            .slice(0, 6)
            .map((it) => ({
              role: it?.role,
              type: it?.type,
              ts: it?.ts,
              text: trimPromptText(String(it?.text || ""), 240),
            }))
            .filter((x) => x.text),
          ...(sessionId ? { sessionId } : {}),
          ...(projectId ? { projectId } : {}),
          ...(requestSource ? { requestSource } : {}),
          ...(pageContextText ? { pageContext: pageContextText } : {}),
          ip: getClientIp(req),
          ua:
            typeof req.headers["user-agent"] === "string"
              ? req.headers["user-agent"].slice(0, 200)
              : "",
        };
        appendUserAuditHistory({ userId, entry });
      }
    } catch {}

    return res.json({
      ok: true,
      requestId: requestId || res.locals.requestId || "",
    });
  },
);

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
  ...ledger,
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
  appendUserAuditHistory,
  imgCredits,
  sanitizeLedgerId: ledger.sanitizeLedgerId,
  upsertUsageLedgerItem: ledger.upsertUsageLedgerItem,
  getClientIp,
  rateLimit,
  assertAuthUserMatches,
});

// ... System Routes ...
const requireLlmProvider =
  String(process.env.REQUIRE_LLM_PROVIDER || "").trim() === "1";
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
  rateLimit,
  assertAdmin,
  fetchWithTimeout,
  PORT,
  assertAuthUserMatches,
  HF_RESOLVE_BASES,
  HF_API_BASES,
  hfProxyBaseHealth,
  normalizeUpstreamBase,
  HF_CACHE_DIR,
  HF_CACHE_TTL_MS,
  HF_CACHE_MAX_BYTES,
  HF_CACHE_MAX_FILES,
  getHfCacheUsage,
  getHfCacheStats,
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
  summarizeHistory,
  upsertUsageLedgerItem: ledger.upsertUsageLedgerItem,
  computeCreditsDelta: ledger.computeCreditsDelta,
  appendUserImageHistory,
  appendUserAuditHistory,
});

// ... HF Routes ...
installHfRoutes(app, {
  rateLimit,
  fetchWithTimeout,
  HF_API_BASES,
  HF_PROXY_RATE_MAX,
  HF_PROXY_RATE_WINDOW_MS,
  proxyHuggingFace,
  proxyLive2DCubismCore,
});

const drainResponseBody = async (resp) => {
  const body = resp && resp.body;
  if (!body || typeof body.on !== "function") return 0;
  return await new Promise((resolve, reject) => {
    let bytes = 0;
    body.on("data", (chunk) => {
      try {
        bytes += chunk ? chunk.length || 0 : 0;
      } catch {}
    });
    body.on("end", () => resolve(bytes));
    body.on("error", (e) => reject(e));
    try {
      if (typeof body.resume === "function") body.resume();
    } catch {}
  });
};

let hfPrewarmStarted = false;
const maybeStartHfPrewarm = () => {
  if (hfPrewarmStarted) return;
  const raw = String(process.env.HF_PREWARM_URLS || "").trim();
  if (!raw) return;
  hfPrewarmStarted = true;

  const urls = raw
    .split(/[\r\n,]+/g)
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 30);
  if (!urls.length) return;

  const selfBase = (() => {
    const base = String(process.env.SELF_BASE_URL || "").trim();
    if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, "");
    return `http://127.0.0.1:${PORT}`;
  })();

  setTimeout(async () => {
    for (const rawUrl of urls) {
      const url = /^https?:\/\//i.test(rawUrl)
        ? rawUrl
        : `${selfBase}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;
      try {
        const resp = await fetchWithTimeout(
          url,
          { method: "GET", redirect: "follow" },
          180000,
        );
        const bytes = await drainResponseBody(resp);
        console.log("[HF][Prewarm]", resp.status, bytes, rawUrl);
      } catch (e) {
        console.log("[HF][Prewarm][Fail]", rawUrl, String(e?.message || e));
      }
    }
  }, 800);
};

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  maybeStartHfPrewarm();
});
