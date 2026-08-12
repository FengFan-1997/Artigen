const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
require("dotenv").config({
  path: path.resolve(__dirname, ".env"),
  // Deployment-provided secrets and feature gates must always win over a
  // developer's optional local file.
  override: false,
});
const { fetchWithTimeout } = require("./lib/fetch-utils");
const {
  fetchRemoteImageWithPinnedDns,
  validateRemoteImageMime,
} = require("./lib/remote-image-guard");

const {
  readJson,
  writeJson,
  readUserMemory,
  writeUserMemory,
  getUserMemoryFile,
  MEMORY_DIR,
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
const { installAuthRoutes } = require("./routes/auth");
const { installAdminRoutes } = require("./routes/admin");
const { installConvertRoutes, isConvertJsonRequest } = require("./routes/convert");
const { installToolTaskRoutes } = require("./routes/tool-tasks");
const { installPaymentRoutes } = require("./routes/payments");
const { installProjectRoutes } = require("./routes/projects");
const { installAgentRoutes } = require("./routes/agent-runs");
const { csrfProtection } = require("./lib/csrf-protection");
const { installFrontendHosting } = require("./lib/frontend-hosting");
const { installSessionMiddleware } = require("./middleware/session-auth");
const { createDevAccessGate, devAccessEnabled } = require("./lib/dev-access-gate");
const { getPool, isDatabaseConfigured } = require("./db/pool");
const {
  createBehaviorRetentionService,
} = require("./services/behavior-event-service");
const {
  createAgentDesktopRelay,
} = require("./services/agent-desktop-relay-service");
const {
  listOperationalRecords,
  upsertOperationalRecord,
  usesOperationalRecordStore,
} = require("./services/operational-record-service");

const {
  assertAdmin,
  resolveAuthUser,
  parseBearerToken,
  canUseLegacyFileQueryToken,
  readUsersMap,
  assertAuthUserMatches,
} = require("./lib/auth-utils");
const { resolveAdminForFiles } = require("./lib/files-admin-auth");
const {
  NODE_ENV,
  isProd,
  SILICONFLOW_API_KEY,
  SILICONFLOW_API_BASE,
  SILICONFLOW_MODEL,
  activeTextProvider,
} = require("./lib/config");
const {
  callSiliconFlowImageGenerate,
  callSiliconFlowChat,
  callTextGenerate,
} = require("./lib/ai-providers");
const {
  persistImageRefForUser,
  persistGenerateImageInputForUser,
  appendUserImageHistory,
  appendUserAuditHistory,
} = require("./lib/memory-manager");
const { ensureUserMemoryShape } = require("./lib/memory-utils");

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

// A cloud DEV deployment is intentionally private even when it uses Render's
// public hostname. The shallow platform health check stays unauthenticated.
app.use(createDevAccessGate());
if (devAccessEnabled()) {
  console.log("DEV access gate: enabled");
}

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
        "X-CSRF-Token",
        "Idempotency-Key",
      ],
    }),
  );
} else {
  if (!isProd) app.use(cors());
}
const JSON_BODY_LIMIT =
  String(process.env.JSON_BODY_LIMIT || (isProd ? "1mb" : "25mb")).trim() ||
  (isProd ? "1mb" : "25mb");
const defaultJsonParser = express.json({ limit: JSON_BODY_LIMIT });
app.use((req, res, next) => {
  // The explicit-consent Word conversion route has a bounded, rate-limited
  // parser sized for base64 overhead. All other JSON stays on the tight global
  // production limit.
  if (isConvertJsonRequest(req)) return next();
  return defaultJsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
// Cookie sessions are only meaningful for API and private file requests.
// Keeping them off SPA/static/health requests prevents a logged-in page load
// from waking Neon once per asset.
installSessionMiddleware(app);
app.use(csrfProtection());

const readQueryToken = (req) => {
  if (!canUseLegacyFileQueryToken(process.env)) return "";
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

const serveLocalFileFromFilesDir = async (req, res, next) => {
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
      const admin = await resolveAdminForFiles(req);
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

app.get(
  "/api/proxy/image",
  rateLimit("proxy_image", { max: 60, windowMs: 60 * 1000 }),
  async (req, res) => {
    try {
      const raw = typeof req.query.url === "string" ? req.query.url : "";
      const target = String(raw || "").trim();
      if (!target) return res.status(400).json({ error: "MISSING_URL" });
      try {
        new URL(target);
      } catch {
        return res.status(400).json({ error: "INVALID_URL" });
      }

      const safe = await fetchRemoteImageWithPinnedDns({
        startUrl: target,
        options: {
          method: "GET",
          headers: {
            Accept: "image/*,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0",
          },
        },
        timeoutMs: 20000,
      });
      if (!safe.ok || !safe.response) {
        const err = String(safe.error || "").trim();
        const status = Number(safe.status || 0) || 502;
        return res.status(status).json({ error: err || "PROXY_FAILED" });
      }
      const upstream = safe.response;
      if (!upstream.ok)
        return res
          .status(502)
          .json({ error: `UPSTREAM_${upstream.status || 502}` });

      const ct = String(upstream.headers.get("content-type") || "").trim();
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

      const finalType = validateRemoteImageMime(ct, buf);
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

// Routes Installation

const ledger = createLedger({
  readJson,
  writeJson,
  USAGE_LEDGER_FILE,
  ANALYTICS_EVENTS_FILE,
  getClientIp,
});
const upsertPersistentUsageLedgerItem = async (entry) => {
  if (!usesOperationalRecordStore()) return ledger.upsertUsageLedgerItem(entry);
  return upsertOperationalRecord({
    kind: "usage",
    userId: entry?.userId,
    entry,
  });
};
const appendPersistentUserImageHistory = async (input) => {
  if (!usesOperationalRecordStore()) return appendUserImageHistory(input);
  return upsertOperationalRecord({
    kind: "image_history",
    userId: input?.userId,
    entry: input?.entry,
  });
};
const appendPersistentUserAuditHistory = async (input) => {
  if (!usesOperationalRecordStore()) return appendUserAuditHistory(input);
  return upsertOperationalRecord({
    kind: "audit_history",
    userId: input?.userId,
    entry: input?.entry,
  });
};

installAuthRoutes(app);
installAdminRoutes(app);

installConvertRoutes(app, {
  rateLimit,
});

installToolTaskRoutes(app, {
  rateLimit,
  callSiliconFlowImageGenerate,
  callSiliconFlowChat,
});

installProjectRoutes(app, {
  rateLimit,
});

installAgentRoutes(app, {
  rateLimit,
});

installPaymentRoutes(app, {
  rateLimit,
});

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
  listOperationalRecords,
  upsertUsageLedgerItem: upsertPersistentUsageLedgerItem,
  usesOperationalRecordStore,
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
  appendUserImageHistory: appendPersistentUserImageHistory,
  appendUserAuditHistory: appendPersistentUserAuditHistory,
  imgCredits,
  sanitizeLedgerId: ledger.sanitizeLedgerId,
  upsertUsageLedgerItem: upsertPersistentUsageLedgerItem,
  getClientIp,
  rateLimit,
  assertAuthUserMatches,
  isProd,
});

// ... System Routes ...
const requireLlmProvider =
  String(process.env.REQUIRE_LLM_PROVIDER || "").trim() === "1";

installSystemRoutes(app, {
  NODE_ENV,
  isProd,
  requireLlmProvider,
  SILICONFLOW_API_KEY,
  activeTextProvider,
  imgCredits,
  fs,
  path,
  rateLimit,
  assertAuthUserMatches,
  callSiliconFlowImageGenerate,
  callSiliconFlowChat,
  callTextGenerate,
  SILICONFLOW_API_BASE,
  SILICONFLOW_MODEL,
  getClientIp,
  MEMORY_DIR,
  upsertUsageLedgerItem: upsertPersistentUsageLedgerItem,
  computeCreditsDelta: ledger.computeCreditsDelta,
  appendUserImageHistory: appendPersistentUserImageHistory,
  appendUserAuditHistory: appendPersistentUserAuditHistory,
});

const frontendHosting = installFrontendHosting(app);
if (frontendHosting.enabled) {
  console.log("FRONTEND_DIST_DIR:", frontendHosting.distDir);
} else {
  console.warn("Frontend dist not found; API-only mode:", frontendHosting.distDir);
}

const httpServer = http.createServer(app);
const agentDesktopRelay = createAgentDesktopRelay({ server: httpServer });
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  if (isDatabaseConfigured()) {
    const behaviorRetention = createBehaviorRetentionService({ pool: getPool() });
    behaviorRetention.start();
    console.log("Behavior retention scheduler: enabled", behaviorRetention.config);
  }
});

const closeAgentRelay = () => agentDesktopRelay.close();
process.once("SIGTERM", closeAgentRelay);
process.once("SIGINT", closeAgentRelay);
