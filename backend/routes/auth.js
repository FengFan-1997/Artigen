const crypto = require("crypto");
const { rateLimit, getClientIp } = require("../lib/rateLimit");
const {
  LOGIN_EMAIL_RE,
  normalizeEmail,
  normalizeUsername,
  hasControlChars,
  generateToken,
  makeUserId,
  hashPassword,
  verifyPassword,
  readUsersMap,
  writeUsersMap,
  resolveAuthUser,
  sanitizeUserProfile,
  createAdminToken,
  verifyAdminToken,
} = require("../lib/auth-utils");
const {
  readUserMemory,
  writeUserMemory,
} = require("../utils/storage");
const { ensureUserMemoryShape } = require("../lib/memory-utils");
const { mergeUserData } = require("../lib/user-utils");
const { credits: imgCredits } = require("../imgagent");
const { fetchWithTimeout } = require("../lib/fetch-utils");
const { deriveCsrfToken } = require("../lib/csrf-protection");
const {
  generateOtpCode,
  getOtpHmacSecret,
  hashOtpCode,
  verifyOtpCode,
} = require("../lib/otp-security");
const { getPool } = require("../db/pool");
const {
  AuthServiceError,
  createAuthService,
  usesDatabaseAuth,
} = require("../services/auth-service");
const {
  createAuthCleanupService,
} = require("../services/auth-cleanup-service");
const { createOtpService } = require("../services/otp-service");
const {
  MailDeliveryError,
  createMailService,
} = require("../services/mail-service");
const {
  OtpDeliveryError,
  createOtpDeliveryService,
  resolveOtpSendIdempotencyKey,
} = require("../services/otp-delivery-service");
const {
  TurnstileError,
  verifyTurnstileToken,
} = require("../lib/turnstile");

const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;
const LOGIN_SEND_COOLDOWN_MS = 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginCodes = new Map();
const passwordResetCodes = new Map();
const isProd =
  String(process.env.NODE_ENV || "")
    .trim()
    .toLowerCase() === "production";

const sendOtpConfigurationError = (res, error) => {
  if (String(error?.code || error?.message || "") !== "OTP_HMAC_NOT_CONFIGURED") return false;
  res.status(503).json({ ok: false, error: "OTP_NOT_CONFIGURED" });
  return true;
};

const setAuthCookie = (res, token) => {
  const t = String(token || "").trim();
  if (!t) return;
  const cookie = `auth_token=${encodeURIComponent(t)}; Path=/; HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}`;
  try {
    if (typeof res.append === "function") res.append("Set-Cookie", cookie);
    else res.setHeader("Set-Cookie", cookie);
  } catch {
    try {
      res.setHeader("Set-Cookie", cookie);
    } catch {}
  }
};
const clearAuthCookie = (res) => {
  const cookie = `auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${isProd ? "; Secure" : ""}`;
  try {
    if (typeof res.append === "function") res.append("Set-Cookie", cookie);
    else res.setHeader("Set-Cookie", cookie);
  } catch {
    try {
      res.setHeader("Set-Cookie", cookie);
    } catch {}
  }
};
const getGoogleOauthClientId = () =>
  String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
const allowInsecureGoogleVerify = () => {
  const env = String(process.env.NODE_ENV || "")
    .trim()
    .toLowerCase();
  // Decoding a JWT payload is not signature verification. Keep the fallback
  // available only for an explicitly opted-in local mock environment; a stale
  // deployment flag can never weaken production Google login.
  return (
    env !== "production" &&
    String(process.env.GOOGLE_OAUTH_ALLOW_INSECURE || "").trim() === "1"
  );
};
const decodeBase64Url = (input) => {
  let s = String(input || "");
  if (!s) return "";
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  try {
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    return "";
  }
};
const decodeJwtPayload = (token) => {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  const raw = decodeBase64Url(parts[1]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const canUseTestLoginCode = (req, code, email) => {
  const env = String(process.env.NODE_ENV || "")
    .trim()
    .toLowerCase();
  // A deployment flag must never turn a shared production OTP backdoor on.
  if (env === "production") return false;

  const configuredCode = String(process.env.LOGIN_TEST_CODE || "").trim();
  const got = String(code || "").trim();
  if (String(process.env.LOGIN_ALLOW_TEST_CODE || "").trim() !== "1") return false;
  if (!configuredCode || configuredCode === "123456") return false;
  if (!got || got !== configuredCode) return false;

  const allowEmailsRaw =
    String(process.env.LOGIN_TEST_EMAILS || "").trim() ||
    String(process.env.LOGIN_TEST_EMAIL_ALLOWLIST || "").trim();
  if (!allowEmailsRaw) return false;
  const e = normalizeEmail(email);
  const allowSet = new Set(
    allowEmailsRaw
      .split(",")
      .map((s) => normalizeEmail(s))
      .filter(Boolean),
  );
  if (!e || !allowSet.has(e)) return false;

  // Only the TCP peer can establish that this is a local request. Express
  // req.ip and X-Forwarded-For are intentionally ignored because deployments
  // may enable trust proxy and receive a client-controlled forwarded chain.
  const socketAddress = String(
    req?.socket?.remoteAddress || req?.connection?.remoteAddress || "",
  )
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  const isLocalSocket =
    socketAddress === "::1" ||
    socketAddress === "127.0.0.1" ||
    socketAddress.startsWith("127.") ||
    socketAddress === "::ffff:127.0.0.1" ||
    socketAddress.startsWith("::ffff:127.") ||
    socketAddress === "::ffff:7f00:1";
  if (isLocalSocket) return true;

  // Remote non-production environments require a second explicit opt-in in
  // addition to the global gate, custom code, and email allowlist above.
  return (
    String(process.env.LOGIN_ALLOW_TEST_CODE_REMOTE || "").trim() === "1"
  );
};

const emailToUserId = (email) => {
  const e = normalizeEmail(email);
  if (!e) return "";
  const h = crypto.createHash("sha1").update(e).digest("hex").slice(0, 16);
  return `email_${h}`;
};

const sendOtpConsumeError = (
  res,
  result,
  { hideAccountState = false } = {},
) => {
  const error = String(result?.error || "OTP_REQUIRED");
  if (hideAccountState) {
    res.status(400).json({
      ok: false,
      error: "OTP_INVALID",
      message: "验证码无效或已过期",
    });
    return false;
  }
  if (error === "OTP_ATTEMPTS_EXCEEDED") {
    res.status(429).json({ ok: false, error, message: "尝试次数过多，请重新发送验证码" });
    return false;
  }
  if (error === "OTP_EXPIRED") {
    res.status(400).json({ ok: false, error, message: "验证码已过期，请重新发送" });
    return false;
  }
  if (error === "OTP_INCORRECT") {
    res.status(400).json({
      ok: false,
      error,
      message: "验证码错误",
      attemptsLeft: Number(result?.attemptsLeft || 0),
    });
    return false;
  }
  res.status(400).json({ ok: false, error, message: "请先发送验证码" });
  return false;
};

const verifyEmailCode = async (
  req,
  res,
  email,
  code,
  {
    databaseMode = false,
    otpService = null,
    purpose = "login",
    hideAccountState = false,
  } = {},
) => {
  getOtpHmacSecret();
  if (canUseTestLoginCode(req, code, email)) return true;
  if (!/^\d{6}$/.test(String(code || "").trim())) {
    res.status(400).json({
      ok: false,
      error: "OTP_FORMAT_INVALID",
      message: "验证码格式不正确",
    });
    return false;
  }

  if (databaseMode) {
    const result = await otpService.consumeChallenge({
      target: email,
      purpose,
      code,
    });
    return result.ok
      ? true
      : sendOtpConsumeError(res, result, { hideAccountState });
  }

  const store = purpose === "password-reset" ? passwordResetCodes : loginCodes;
  const st = store.get(email);
  if (!st) {
    sendOtpConsumeError(res, { error: "OTP_REQUIRED" }, { hideAccountState });
    return false;
  }

  const now = Date.now();
  if (now > Number(st.expiresAt || 0)) {
    store.delete(email);
    sendOtpConsumeError(res, { error: "OTP_EXPIRED" }, { hideAccountState });
    return false;
  }

  if (Number(st.attemptsLeft || 0) <= 0) {
    store.delete(email);
    sendOtpConsumeError(
      res,
      { error: "OTP_ATTEMPTS_EXCEEDED" },
      { hideAccountState },
    );
    return false;
  }

  if (!verifyOtpCode({ target: email, purpose, code }, st.codeHmac)) {
    st.attemptsLeft = Number(st.attemptsLeft || 0) - 1;
    store.set(email, st);
    sendOtpConsumeError(
      res,
      { error: "OTP_INCORRECT", attemptsLeft: st.attemptsLeft },
      { hideAccountState },
    );
    return false;
  }

  store.delete(email);
  return true;
};

const installAuthRoutes = (app, options = {}) => {
  const env = options.env || process.env;
  const databaseMode = () =>
    typeof options.databaseMode === "boolean"
      ? options.databaseMode
      : usesDatabaseAuth(env);
  let authService = options.authService || null;
  let otpService = options.otpService || null;
  let mailService = options.mailService || null;
  let otpDeliveryService = options.otpDeliveryService || null;
  let authCleanupService = options.authCleanupService || null;
  let cleanupInitAttemptAt = 0;
  const logger = options.logger || console;
  const sleep =
    options.sleep ||
    ((delayMs) =>
      new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      }));
  const turnstileVerifier =
    options.turnstileVerifier || verifyTurnstileToken;
  const resolvePool = () => options.pool || getPool();
  const getAuthService = () => {
    if (!authService) authService = createAuthService({ pool: resolvePool(), env });
    return authService;
  };
  const getOtpService = () => {
    if (!otpService) otpService = createOtpService({ pool: resolvePool(), env });
    return otpService;
  };
  const getMailService = () => {
    if (!mailService) mailService = createMailService({ env, logger });
    return mailService;
  };
  const getOtpDeliveryService = () => {
    if (!otpDeliveryService) {
      otpDeliveryService = createOtpDeliveryService({
        pool: resolvePool(),
        env,
      });
    }
    return otpDeliveryService;
  };
  const triggerAuthCleanup = () => {
    if (!databaseMode()) return;
    try {
      if (!authCleanupService) {
        const current = Date.now();
        if (
          cleanupInitAttemptAt > 0 &&
          current - cleanupInitAttemptAt < 60 * 60 * 1000
        ) {
          return;
        }
        cleanupInitAttemptAt = current;
        authCleanupService = createAuthCleanupService({
          pool: resolvePool(),
          env,
          logger,
        });
      }
      authCleanupService.maybeRun();
    } catch (error) {
      logger.warn?.("[AuthCleanup]", {
        kind: "trigger",
        code: String(error?.code || error?.name || "CLEANUP_FAILED")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9_:-]/g, "_")
          .slice(0, 80),
      });
    }
  };
  const userAgent = (req) => String(req?.headers?.["user-agent"] || "").slice(0, 512);
  const respondAuthError = (res, error, fallback = "AUTH_FAILED") => {
    if (sendOtpConfigurationError(res, error)) return true;
    const code = String(error?.code || error?.message || fallback);
    const known = error instanceof AuthServiceError || Number(error?.status || 0) > 0;
    const status = known ? Number(error.status || 500) : 500;
    res.status(status).json({ ok: false, error: code, message: code });
    return true;
  };
  const returnDatabaseLogin = (res, result) => {
    setAuthCookie(res, result.session.token);
    return res.json({
      ok: true,
      userId: result.user.userId,
      email: result.user.email,
      name: result.user.name,
      csrfToken: result.session.csrfToken,
    });
  };
  const reserveOtpChallenge = async ({ target, purpose, code }) => {
    if (databaseMode()) {
      return getOtpService().createChallenge({ target, purpose, code });
    }
    const store = purpose === "password-reset" ? passwordResetCodes : loginCodes;
    const now = Date.now();
    const existing = store.get(target);
    if (existing && existing.nextSendAt > now) {
      return {
        ok: false,
        error: "OTP_COOLDOWN",
        cooldownSec: Math.ceil((existing.nextSendAt - now) / 1000),
      };
    }
    store.set(target, {
      codeHmac: hashOtpCode({ target, purpose, code }),
      expiresAt: now + LOGIN_CODE_TTL_MS,
      nextSendAt: now + LOGIN_SEND_COOLDOWN_MS,
      attemptsLeft: LOGIN_MAX_ATTEMPTS,
    });
    return {
      ok: true,
      challengeId: "memory",
      cooldownUntil: new Date(now + LOGIN_SEND_COOLDOWN_MS),
      cooldownSec: Math.ceil(LOGIN_SEND_COOLDOWN_MS / 1000),
    };
  };
  const invalidateOtpChallenge = async ({
    target,
    purpose,
    challengeId,
    releaseCooldown = false,
  }) => {
    if (databaseMode()) {
      await getOtpService()
        .invalidateChallenge(challengeId, { releaseCooldown })
        .catch(() => {});
      return;
    }
    const store = purpose === "password-reset" ? passwordResetCodes : loginCodes;
    store.delete(target);
  };
  const readTurnstileToken = (body = {}) =>
    String(
      body.turnstileToken ||
        body.cfTurnstileToken ||
        body["cf-turnstile-response"] ||
        "",
    ).trim();
  const readIdempotencyKey = (req, body = {}) => {
    const rawHeader = req?.headers?.["idempotency-key"];
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const normalizedHeader = String(header || "").trim();
    if (
      String(env.NODE_ENV || "").trim().toLowerCase() === "production"
    ) {
      return normalizedHeader;
    }
    return String(
      normalizedHeader || body.idempotencyKey || body.requestId || "",
    ).trim();
  };
  const emailOtpEnabled = () => {
    const configured = String(env.AUTH_EMAIL_OTP_ENABLED || "")
      .trim()
      .toLowerCase();
    if (configured) return /^(1|true)$/.test(configured);
    return String(env.NODE_ENV || "").trim().toLowerCase() !== "production";
  };
  const requireEmailOtpEnabled = (res) => {
    if (emailOtpEnabled()) return true;
    res.status(503).json({
      ok: false,
      error: "OTP_DELIVERY_UNAVAILABLE",
      message: "邮箱验证码登录暂未开放",
      retryable: false,
    });
    return false;
  };
  const localSocketRequest = (req) => {
    const address = String(
      req?.socket?.remoteAddress || req?.connection?.remoteAddress || "",
    )
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, "");
    return (
      address === "::1" ||
      address === "127.0.0.1" ||
      address.startsWith("127.") ||
      address === "::ffff:127.0.0.1" ||
      address.startsWith("::ffff:127.")
    );
  };
  const mayReturnDebugCode = (req) =>
    !(
      String(env.NODE_ENV || "")
        .trim()
        .toLowerCase() === "production"
    ) && localSocketRequest(req);
  const turnstileAction = (purpose) =>
    String(
      purpose === "password-reset"
        ? env.TURNSTILE_PASSWORD_RESET_ACTION ||
            env.TURNSTILE_ACTION ||
            "password_reset_otp"
        : env.TURNSTILE_LOGIN_ACTION ||
            env.TURNSTILE_ACTION ||
            "email_otp",
    ).trim();
  const verifyOtpTurnstile = async ({ req, body, purpose }) =>
    turnstileVerifier({
      token: readTurnstileToken(body),
      remoteIp: getClientIp(req),
      expectedAction: turnstileAction(purpose),
      env,
    });
  const setRetryAfter = (res, seconds) => {
    const value = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (value > 0) res.setHeader("Retry-After", String(value));
  };
  const otpSendRequestKey = ({ req, body, target, purpose }) => {
    const resolved = resolveAuthUser(req);
    const explicitKey = readIdempotencyKey(req, body);
    if (
      String(env.NODE_ENV || "").trim().toLowerCase() === "production" &&
      !explicitKey
    ) {
      throw new OtpDeliveryError("IDEMPOTENCY_KEY_REQUIRED", {
        status: 400,
        retryable: false,
      });
    }
    return resolveOtpSendIdempotencyKey({
      explicitKey,
      sessionId: resolved.ok ? resolved.sessionId : "",
      projectId: String(body.projectId || "").trim().slice(0, 160),
      target,
      purpose,
      ip: getClientIp(req),
    });
  };
  const replayOtpAttempt = (attempt) => {
    const state = String(attempt?.state || "");
    const base = {
      cooldownSec: Math.max(1, Number(attempt?.cooldownSec || 60)),
      challengeId: String(attempt?.challengeId || ""),
      replay: true,
    };
    if (state === "accepted" || state === "debug") {
      return { kind: "sent", ...base };
    }
    if (
      state === "reserved" ||
      state === "challenge_ready" ||
      state === "unknown"
    ) {
      return { kind: "pending", ...base };
    }
    if (
      state === "rejected" &&
      String(attempt?.errorCode || "") === "OTP_COOLDOWN"
    ) {
      return { kind: "cooldown", ...base };
    }
    return {
      kind: "unavailable",
      ...base,
      errorCode: String(attempt?.errorCode || "OTP_DELIVERY_UNAVAILABLE"),
    };
  };
  const deliverOtpCode = async ({
    req,
    body,
    target,
    purpose,
  }) => {
    const requestKey = otpSendRequestKey({
      req,
      body,
      target,
      purpose,
    });
    let attemptId = "";
    if (databaseMode()) {
      const existingAttempt = await getOtpDeliveryService().findAttempt({
        target,
        purpose,
        requestKey,
      });
      const recoverableExpiredAttempt =
        existingAttempt?.leaseExpired &&
        ["reserved", "challenge_ready"].includes(existingAttempt.state);
      if (existingAttempt && !recoverableExpiredAttempt) {
        return replayOtpAttempt(existingAttempt);
      }
      if (!existingAttempt) {
        await verifyOtpTurnstile({
          req,
          body,
          purpose,
        });
      }
      const started = await getOtpDeliveryService().beginAttempt({
        target,
        purpose,
        ip: getClientIp(req),
        requestKey,
      });
      if (!started.ok) {
        return {
          kind: "quota",
          errorCode: String(started.error || "OTP_SEND_QUOTA_EXCEEDED"),
          scope: String(started.scope || ""),
          retryAfterSec: Number(started.retryAfterSec || 60),
        };
      }
      if (!started.owner) return replayOtpAttempt(started.attempt);
      attemptId = String(started.attempt?.id || "");
      if (started.replacedChallengeId) {
        await invalidateOtpChallenge({
          target,
          purpose,
          challengeId: started.replacedChallengeId,
          releaseCooldown: true,
        });
      }
    } else {
      await verifyOtpTurnstile({
        req,
        body,
        purpose,
      });
    }

    const code = generateOtpCode();
    const reserved = await reserveOtpChallenge({
      target,
      purpose,
      code,
    });
    if (!reserved.ok) {
      if (attemptId) {
        await getOtpDeliveryService().completeAttempt({
          attemptId,
          state: "rejected",
          errorCode: "OTP_COOLDOWN",
        });
      }
      return {
        kind: "cooldown",
        cooldownSec: Math.max(1, Number(reserved.cooldownSec || 60)),
      };
    }

    if (attemptId) {
      await getOtpDeliveryService().markChallengeReady({
        attemptId,
        challengeId: reserved.challengeId,
        cooldownUntil: reserved.cooldownUntil,
      });
    }

    try {
      const mailer = getMailService();
      if (attemptId) {
        await getOtpDeliveryService().markProviderDispatched({
          attemptId,
          provider: mailer.provider,
        });
      }
      const delivery = await mailer.sendOtp({
        to: target,
        purpose,
        code,
        idempotencyKey: attemptId || crypto.randomUUID(),
        requestContext: {
          isLoopback: localSocketRequest(req),
        },
      });
      const state = delivery?.state === "debug" ? "debug" : "accepted";
      if (attemptId) {
        const completed = await getOtpDeliveryService().completeAttempt({
          attemptId,
          state,
          provider: delivery?.provider,
          messageId: delivery?.messageId,
        });
        if (!completed) {
          return {
            kind: "pending",
            cooldownSec: Math.max(1, Number(reserved.cooldownSec || 60)),
            challengeId: String(reserved.challengeId || ""),
          };
        }
      }
      return {
        kind: "sent",
        cooldownSec: Math.max(1, Number(reserved.cooldownSec || 60)),
        challengeId: String(reserved.challengeId || ""),
        ...(state === "debug" && mayReturnDebugCode(req) ? { debugCode: code } : {}),
      };
    } catch (error) {
      const deliveryError =
        error instanceof MailDeliveryError
          ? error
          : new MailDeliveryError("MAIL_DELIVERY_UNKNOWN", {
              retryable: true,
              deliveryUnknown: true,
            });
      if (deliveryError.deliveryUnknown) {
        if (attemptId) {
          await getOtpDeliveryService().completeAttempt({
            attemptId,
            state: "unknown",
            provider: deliveryError.provider,
            errorCode: deliveryError.code,
          });
        }
        return {
          kind: "pending",
          cooldownSec: Math.max(1, Number(reserved.cooldownSec || 60)),
          challengeId: String(reserved.challengeId || ""),
        };
      }
      if (attemptId) {
        await getOtpDeliveryService().completeAttempt({
          attemptId,
          state: "failed",
          provider: deliveryError.provider,
          errorCode: deliveryError.code,
        });
      }
      await invalidateOtpChallenge({
        target,
        purpose,
        challengeId: reserved.challengeId,
        releaseCooldown: true,
      });
      return {
        kind: "unavailable",
        errorCode: deliveryError.code,
        retryAfterSec: deliveryError.retryAfterSec,
      };
    }
  };
  const respondTurnstileError = (res, error) => {
    const internalCode = String(error?.code || "TURNSTILE_FAILED");
    const code =
      internalCode === "TURNSTILE_REQUIRED"
        ? "TURNSTILE_REQUIRED"
        : [
              "TURNSTILE_FAILED",
              "TURNSTILE_ACTION_MISMATCH",
              "TURNSTILE_HOSTNAME_MISMATCH",
            ].includes(internalCode)
          ? "TURNSTILE_INVALID"
          : "OTP_DELIVERY_UNAVAILABLE";
    const status =
      code === "OTP_DELIVERY_UNAVAILABLE"
        ? 503
        : Math.max(400, Number(error?.status || 400));
    const message =
      code === "OTP_DELIVERY_UNAVAILABLE"
        ? "安全验证暂时不可用，请稍后重试"
        : "请先完成安全验证";
    return res.status(status).json({
      ok: false,
      error: code,
      message,
      retryable: Boolean(error?.retryable),
    });
  };
  const applyEnumerationDelay = async (startedAt) => {
    const production =
      String(env.NODE_ENV || "")
        .trim()
        .toLowerCase() === "production";
    const configured = Number(env.OTP_ENUMERATION_DELAY_MS);
    const floorMs = Number.isFinite(configured)
      ? Math.max(0, Math.min(5000, configured))
      : production
        ? 900
        : 0;
    const jitterMs = production ? Math.floor(Math.random() * 75) : 0;
    const remaining = floorMs + jitterMs - (Date.now() - startedAt);
    if (remaining > 0) await sleep(remaining);
  };
  const respondOtpDeliveryOutcome = (res, outcome, {
    successMessage = "",
  } = {}) => {
    if (outcome.kind === "quota") {
      const left = Math.max(1, Number(outcome.retryAfterSec || 60));
      setRetryAfter(res, left);
      const globalBudget = outcome.scope === "global_day";
      const errorCode = globalBudget
        ? "OTP_DAILY_BUDGET_EXHAUSTED"
        : "OTP_PROVIDER_THROTTLED";
      return res.status(429).json({
        ok: false,
        error: errorCode,
        message: `发送太频繁，请 ${left}s 后再试`,
        retryAfterSec: left,
      });
    }
    if (outcome.kind === "cooldown") {
      const left = Math.max(1, Number(outcome.cooldownSec || 60));
      setRetryAfter(res, left);
      return res.status(429).json({
        ok: false,
        error: "OTP_COOLDOWN",
        message: `发送太频繁，请 ${left}s 后再试`,
        cooldownSec: left,
      });
    }
    if (outcome.kind === "unavailable") {
      setRetryAfter(res, outcome.retryAfterSec);
      if (outcome.errorCode === "MAIL_PROVIDER_THROTTLED") {
        return res.status(429).json({
          ok: false,
          error: "OTP_PROVIDER_THROTTLED",
          message: "发送服务繁忙，请稍后重试",
          retryable: true,
          retryAfterSec: Math.max(1, Number(outcome.retryAfterSec || 60)),
        });
      }
      return res.status(503).json({
        ok: false,
        error: "OTP_DELIVERY_UNAVAILABLE",
        message: "验证码暂时无法发送，请稍后重试",
        retryable: Boolean(outcome.retryAfterSec),
      });
    }
    const status = outcome.kind === "pending" ? 202 : 200;
    return res.status(status).json({
      ok: true,
      cooldownSec: Math.max(1, Number(outcome.cooldownSec || 60)),
      challengeId: String(outcome.challengeId || ""),
      deliveryStatus: outcome.kind === "pending" ? "unknown" : "accepted",
      ...(successMessage ? { message: successMessage } : {}),
      ...(outcome.kind === "pending" ? { deliveryPending: true } : {}),
      ...(outcome.debugCode ? { debugCode: outcome.debugCode } : {}),
    });
  };
  const setAuthCors = (req, res) => {
    const origin =
      typeof req?.headers?.origin === "string" ? req.headers.origin.trim() : "";
    if (!origin) return;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  };

  app.get("/api/auth/session", async (req, res) => {
    triggerAuthCleanup();
    res.setHeader("Cache-Control", "no-store");
    const resolved = resolveAuthUser(req);
    if (!resolved.ok) {
      clearAuthCookie(res);
      return res.json({ ok: true, authenticated: false, userId: null, user: null });
    }
    if (databaseMode()) {
      const user = {
        id: resolved.userId,
        userId: resolved.userId,
        username: String(resolved.username || "").trim(),
        email: String(resolved.email || "").trim(),
        name: String(resolved.name || resolved.username || "").trim(),
      };
      return res.json({
        ok: true,
        authenticated: true,
        userId: resolved.userId,
        user,
        csrfToken: String(resolved.csrfToken || ""),
      });
    }
    const users = readUsersMap();
    const rawUser = Object.values(users).find(
      (user) => String(user?.id || "").trim() === resolved.userId,
    );
    if (!rawUser) {
      clearAuthCookie(res);
      return res.json({ ok: true, authenticated: false, userId: null, user: null });
    }
    const sanitized = sanitizeUserProfile(rawUser) || {};
    const user = {
      id: resolved.userId,
      userId: resolved.userId,
      username: String(sanitized.username || "").trim(),
      email: String(sanitized.email || "").trim(),
      name: String(sanitized.name || sanitized.displayName || sanitized.username || "").trim(),
    };
    return res.json({
      ok: true,
      authenticated: true,
      userId: resolved.userId,
      user,
      csrfToken: deriveCsrfToken(resolved.token),
    });
  });

  app.post("/api/auth/logout", async (req, res) => {
    triggerAuthCleanup();
    res.setHeader("Cache-Control", "no-store");
    try {
      const resolved = resolveAuthUser(req);
      if (databaseMode()) {
        if (resolved.ok && resolved.sessionId) {
          await getAuthService().revokeSession(resolved.sessionId);
        }
        clearAuthCookie(res);
        return res.json({ ok: true, authenticated: false });
      }
      if (resolved.ok) {
        const users = readUsersMap();
        const entry = Object.entries(users).find(([, user]) =>
          String(user?.sessionToken || "") === resolved.token,
        );
        if (entry) {
          const [key, user] = entry;
          const nextUser = { ...user };
          delete nextUser.sessionToken;
          delete nextUser.sessionTokenIssuedAt;
          users[key] = nextUser;
          if (writeUsersMap(users) === false) throw new Error("SESSION_REVOKE_FAILED");
        }
      }
      clearAuthCookie(res);
      return res.json({ ok: true, authenticated: false });
    } catch {
      clearAuthCookie(res);
      return res.status(500).json({ ok: false, error: "LOGOUT_FAILED" });
    }
  });

  app.options("/api/auth/google/config", (req, res) => {
    setAuthCors(req, res);
    res.status(204).end();
  });
  app.options("/api/auth/google/verify", (req, res) => {
    setAuthCors(req, res);
    res.status(204).end();
  });

  app.get("/api/auth/google/config", (req, res) => {
    setAuthCors(req, res);
    const clientId = getGoogleOauthClientId();
    res.json({ ok: true, clientId: clientId || "" });
  });
  app.post(
    "/api/auth/google/verify",
    rateLimit("google_login", { max: 20, windowMs: 60 * 1000 }),
    async (req, res) => {
      triggerAuthCleanup();
      setAuthCors(req, res);
      try {
        const idToken = String((req.body || {}).idToken || "").trim();
        const fromUserId = String((req.body || {}).fromUserId || "").trim();
        const googleClientId = getGoogleOauthClientId();
        if (!googleClientId)
          return res
            .status(503)
            .json({ ok: false, message: "GOOGLE_OAUTH_NOT_CONFIGURED" });
        if (!idToken)
          return res
            .status(400)
            .json({ ok: false, message: "MISSING_ID_TOKEN" });
        const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
        let payload = null;
        try {
          const response = await fetchWithTimeout(
            url,
            { method: "GET" },
            10000,
          );
          if (!response.ok) {
            const txt = await response.text().catch(() => "");
            const status = response.status || 500;
            const msg = txt || `GOOGLE_TOKENINFO_${status}`;
            return res.status(401).json({ ok: false, message: msg });
          }
          payload = await response.json().catch(() => null);
        } catch (e) {
          if (allowInsecureGoogleVerify()) {
            payload = decodeJwtPayload(idToken);
            if (!payload)
              return res
                .status(503)
                .json({ ok: false, message: "GOOGLE_TOKENINFO_UNAVAILABLE" });
          } else {
            console.error("Google tokeninfo fetch failed:", e);
            return res
              .status(503)
              .json({ ok: false, message: "GOOGLE_TOKENINFO_TIMEOUT" });
          }
        }
        if (!payload)
          return res
            .status(401)
            .json({ ok: false, message: "GOOGLE_TOKENINFO_INVALID" });
        const aud = String(payload?.aud || "").trim();
        const sub = String(payload?.sub || "").trim();
        const email = normalizeEmail(payload?.email || "");
        const emailVerified =
          payload?.email_verified === true ||
          payload?.email_verified === "true";
        const name = String(payload?.name || "").trim();
        if (!aud || aud !== googleClientId)
          return res
            .status(401)
            .json({ ok: false, message: "INVALID_AUDIENCE" });
        if (!sub)
          return res
            .status(401)
            .json({ ok: false, message: "INVALID_GOOGLE_SUB" });
        if (!email || !emailVerified)
          return res
            .status(401)
            .json({ ok: false, message: "EMAIL_NOT_VERIFIED" });

        if (databaseMode()) {
          const h = require("crypto")
            .createHash("sha1")
            .update(`google_${sub}`)
            .digest("hex")
            .slice(0, 16);
          const result = await getAuthService().loginWithVerifiedIdentity({
            legacyUserId: `google_${h}`,
            email,
            username: email,
            displayName: name || email.split("@")[0] || "Friend",
            identity: { provider: "google", subject: sub },
            userAgent: userAgent(req),
          });
          return returnDatabaseLogin(res, result);
        }

        const users = readUsersMap();
        const existingByGoogle = Object.values(users).find(
          (u) =>
            String(u?.oauthProvider || "") === "google" &&
            String(u?.oauthSub || "") === sub,
        );
        const existingByEmail = Object.values(users).find(
          (u) => normalizeEmail(u?.email) === email,
        );
        const userId = existingByGoogle?.id
          ? String(existingByGoogle.id).trim()
          : existingByEmail?.id
            ? String(existingByEmail.id).trim()
            : (() => {
                const crypto = require("crypto");
                const h = crypto
                  .createHash("sha1")
                  .update(`google_${sub}`)
                  .digest("hex")
                  .slice(0, 16);
                return `google_${h}`;
              })();
        if (!userId)
          return res.status(500).json({ ok: false, message: "USER_ID_FAILED" });

        const token = generateToken();
        const displayName = name || (email ? email.split("@")[0] : "Friend");
        const nextUser = users[userId]
          ? {
              ...users[userId],
              id: userId,
              email,
              username: String(users[userId].username || email).trim() || email,
              name: String(users[userId].name || "").trim() || displayName,
              oauthProvider: "google",
              oauthSub: sub,
              sessionToken: token,
              sessionTokenIssuedAt: Date.now(),
            }
          : {
              id: userId,
              email,
              username: email,
              name: displayName,
              visits: 0,
              preferences: {},
              createdAt: Date.now(),
              oauthProvider: "google",
              oauthSub: sub,
              sessionToken: token,
              sessionTokenIssuedAt: Date.now(),
            };

        users[userId] = nextUser;
        writeUsersMap(users);

        try {
          const mem = ensureUserMemoryShape(
            userId,
            readUserMemory(userId, null),
          );
          writeUserMemory(userId, mem);
        } catch {}

        try {
          imgCredits.ensureWallet(userId);
        } catch {}

        try {
          if (
            fromUserId &&
            fromUserId !== userId &&
            fromUserId.startsWith("guest_")
          )
            mergeUserData(fromUserId, userId, imgCredits);
        } catch {}

        setAuthCookie(res, token);
        return res.json({
          ok: true,
          userId,
          email,
          name: nextUser.name,
          csrfToken: deriveCsrfToken(token),
        });
      } catch (e) {
        console.error("Error in /api/auth/google/verify:", e);
        return res
          .status(500)
          .json({ ok: false, message: "GOOGLE_LOGIN_FAILED" });
      }
    },
  );

  app.post(
    "/api/login/send-code",
    rateLimit("login_send_code", { max: 10, windowMs: 60 * 1000 }),
    async (req, res) => {
      if (!requireEmailOtpEnabled(res)) return;
      triggerAuthCleanup();
      try {
        const body = req.body || {};
        const email = normalizeEmail(body.email);
        if (!email || email.length > 254 || !LOGIN_EMAIL_RE.test(email)) {
          return res.status(400).json({ ok: false, message: "邮箱格式不正确" });
        }

        const outcome = await deliverOtpCode({
          req,
          body,
          target: email,
          purpose: "login",
        });
        return respondOtpDeliveryOutcome(res, outcome);
      } catch (e) {
        if (sendOtpConfigurationError(res, e)) return;
        if (e instanceof TurnstileError) return respondTurnstileError(res, e);
        if (e instanceof OtpDeliveryError) {
          setRetryAfter(res, e.retryAfterSec);
          return res.status(Number(e.status || 400)).json({
            ok: false,
            error: e.code,
            message: e.code,
            retryable: e.retryable,
          });
        }
        logger.error?.("[AuthOtp]", {
          route: "login_send_code",
          code: String(e?.code || e?.name || "OTP_SEND_FAILED").slice(0, 96),
        });
        return res
          .status(500)
          .json({ ok: false, error: "OTP_SEND_FAILED", message: "发送失败，请稍后重试" });
      }
    },
  );

  app.post(
    "/api/login/verify",
    rateLimit("login_verify", { max: 30, windowMs: 60 * 1000 }),
    async (req, res) => {
      if (!requireEmailOtpEnabled(res)) return;
      triggerAuthCleanup();
      try {
        const body = req.body || {};
        const email = normalizeEmail(body.email);
        const code = String(body.code || "").trim();
        const fromUserId = String(body.fromUserId || "").trim();
        if (!email || !LOGIN_EMAIL_RE.test(email))
          return res.status(400).json({ ok: false, message: "邮箱格式不正确" });
        if (!/^\d{6}$/.test(code))
          return res.status(400).json({
            ok: false,
            error: "OTP_FORMAT_INVALID",
            message: "验证码格式不正确",
          });

        if (!await verifyEmailCode(req, res, email, code, {
          databaseMode: databaseMode(),
          otpService: databaseMode() ? getOtpService() : null,
          purpose: "login",
        })) return;

        const emailName = email.split("@")[0] || "Friend";
        if (databaseMode()) {
          const result = await getAuthService().loginWithVerifiedIdentity({
            legacyUserId: emailToUserId(email),
            email,
            username: email,
            displayName: emailName,
            identity: { provider: "email", subject: email },
            userAgent: userAgent(req),
          });
          return returnDatabaseLogin(res, result);
        }

        const users = readUsersMap();
        const existingUser = Object.values(users).find(
          (u) => normalizeEmail(u?.email) === email,
        );
        const userId = existingUser?.id
          ? String(existingUser.id).trim()
          : emailToUserId(email);
        if (!userId)
          return res.status(500).json({ ok: false, message: "USER_ID_FAILED" });

        const token = generateToken();
        const nameFallback = (() => {
          const idx = email.indexOf("@");
          const base = idx > 0 ? email.slice(0, idx) : email;
          return base || "Friend";
        })();

        const nextUser = existingUser
          ? {
              ...existingUser,
              id: userId,
              email,
              username: String(existingUser.username || email).trim() || email,
              name: String(existingUser.name || "").trim() || nameFallback,
              sessionToken: token,
              sessionTokenIssuedAt: Date.now(),
            }
          : {
              id: userId,
              email,
              username: email,
              name: nameFallback,
              visits: 0,
              preferences: {},
              createdAt: Date.now(),
              sessionToken: token,
              sessionTokenIssuedAt: Date.now(),
            };

        users[userId] = nextUser;
        writeUsersMap(users);

        try {
          const mem = ensureUserMemoryShape(
            userId,
            readUserMemory(userId, null),
          );
          writeUserMemory(userId, mem);
        } catch {}

        try {
          imgCredits.ensureWallet(userId);
        } catch {}

        try {
          if (
            fromUserId &&
            fromUserId !== userId &&
            fromUserId.startsWith("guest_")
          )
            mergeUserData(fromUserId, userId, imgCredits);
        } catch {}

        setAuthCookie(res, token);
        return res.json({
          ok: true,
          userId,
          email,
          name: nextUser.name,
          csrfToken: deriveCsrfToken(token),
        });
      } catch (e) {
        if (sendOtpConfigurationError(res, e)) return;
        console.error("Error in /api/login/verify:", e);
        return res.status(500).json({ ok: false, message: "验证失败" });
      }
    },
  );

  app.post(
    "/api/auth/login",
    rateLimit("auth_login", { max: 30, windowMs: 60 * 1000 }),
    async (req, res) => {
      triggerAuthCleanup();
      try {
        const body = req.body || {};
        const username = normalizeUsername(body.username);
        const password = String(body.password || "");
        const fromUserId = String(body.fromUserId || "").trim();
        if (!username || username.length > 254 || hasControlChars(username)) {
          return res.status(400).json({ ok: false, message: "请输入账号" });
        }
        if (!password || password.length > 128 || hasControlChars(password)) {
          return res.status(400).json({ ok: false, message: "请输入密码" });
        }

        if (databaseMode()) {
          try {
            const result = await getAuthService().authenticatePassword({
              login: username,
              password,
              userAgent: userAgent(req),
            });
            return returnDatabaseLogin(res, result);
          } catch (error) {
            if (String(error?.code || "") === "INVALID_CREDENTIALS") {
              return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS", message: "账号或密码错误" });
            }
            return respondAuthError(res, error, "LOGIN_FAILED");
          }
        }

        const users = readUsersMap();
        const lowered = username.toLowerCase();
        const entry = Object.entries(users).find(([, u]) => {
          const uname = normalizeUsername(u?.username).toLowerCase();
          const email = normalizeEmail(u?.email);
          return uname === lowered || email === lowered;
        });
        if (!entry) {
          return res.status(401).json({ ok: false, message: "账号或密码错误" });
        }

        const [key, user] = entry;
        const checked = await verifyPassword(user, password);
        if (!checked.ok) {
          return res.status(401).json({ ok: false, message: "账号或密码错误" });
        }

        const userId = String(user?.id || key || "").trim();
        if (!userId) return res.status(500).json({ ok: false, message: "USER_ID_FAILED" });

        const token = generateToken();
        const nextUser = {
          ...user,
          id: userId,
          username: String(user?.username || username).trim() || username,
          sessionToken: token,
          sessionTokenIssuedAt: Date.now(),
        };

        if (checked.upgraded) {
          const crypto = require("crypto");
          const salt = crypto.randomBytes(16).toString("hex");
          nextUser.passwordHash = await hashPassword(password, salt);
          nextUser.passwordSalt = salt;
          nextUser.passwordAlgo = "scrypt";
          delete nextUser.password;
        }

        users[userId] = nextUser;
        if (key !== userId) delete users[key];
        writeUsersMap(users);

        try {
          const mem = ensureUserMemoryShape(
            userId,
            readUserMemory(userId, null),
          );
          writeUserMemory(userId, mem);
        } catch {}

        try {
          imgCredits.ensureWallet(userId);
        } catch {}

        try {
          if (
            fromUserId &&
            fromUserId !== userId &&
            fromUserId.startsWith("guest_")
          )
            mergeUserData(fromUserId, userId, imgCredits);
        } catch {}

        setAuthCookie(res, token);
        return res.json({
          ok: true,
          userId,
          email: String(nextUser.email || "").trim(),
          name: String(nextUser.name || nextUser.username || "").trim(),
          csrfToken: deriveCsrfToken(token),
        });
      } catch (e) {
        console.error("Error in /api/auth/login:", e);
        return res.status(500).json({ ok: false, message: "登录失败" });
      }
    },
  );

  app.post(
    "/api/auth/password-reset/send-code",
    rateLimit("password_reset_send_code", { max: 10, windowMs: 60 * 1000 }),
    async (req, res) => {
      if (!requireEmailOtpEnabled(res)) return;
      triggerAuthCleanup();
      const startedAt = Date.now();
      try {
        const body = req.body || {};
        const email = normalizeEmail(body.email);
        if (!email || email.length > 254 || !LOGIN_EMAIL_RE.test(email)) {
          return res.status(400).json({ ok: false, message: "邮箱格式不正确" });
        }

        getOtpHmacSecret(env);
        // Always execute the same durable challenge and provider path. This
        // keeps account existence out of status, response shape and timing.
        const outcome = await deliverOtpCode({
          req,
          body,
          target: email,
          purpose: "password-reset",
        });
        await applyEnumerationDelay(startedAt);
        return respondOtpDeliveryOutcome(res, outcome, {
          successMessage: "如果该邮箱可用于重置，验证码将发送至该邮箱",
        });
      } catch (e) {
        if (sendOtpConfigurationError(res, e)) return;
        if (e instanceof TurnstileError) return respondTurnstileError(res, e);
        if (e instanceof OtpDeliveryError) {
          setRetryAfter(res, e.retryAfterSec);
          await applyEnumerationDelay(startedAt);
          return res.status(Number(e.status || 400)).json({
            ok: false,
            error: e.code,
            message: e.code,
            retryable: e.retryable,
          });
        }
        logger.error?.("[AuthOtp]", {
          route: "password_reset_send_code",
          code: String(e?.code || e?.name || "OTP_SEND_FAILED").slice(0, 96),
        });
        await applyEnumerationDelay(startedAt);
        return res.status(503).json({
          ok: false,
          error: "OTP_DELIVERY_UNAVAILABLE",
          message: "验证码暂时无法发送，请稍后重试",
          retryable: true,
        });
      }
    },
  );

  app.post(
    "/api/auth/password-reset/reset",
    rateLimit("password_reset", { max: 30, windowMs: 60 * 1000 }),
    async (req, res) => {
      if (!requireEmailOtpEnabled(res)) return;
      triggerAuthCleanup();
      try {
        const body = req.body || {};
        const email = normalizeEmail(body.email);
        const code = String(body.code || "").trim();
        const newPassword = String(body.newPassword || "");
        if (!email || email.length > 254 || !LOGIN_EMAIL_RE.test(email)) {
          return res.status(400).json({ ok: false, message: "邮箱格式不正确" });
        }
        if (!code)
          return res.status(400).json({ ok: false, message: "请输入验证码" });
        if (!/^\d{6}$/.test(code))
          return res
            .status(400)
            .json({
              ok: false,
              error: "OTP_FORMAT_INVALID",
              message: "验证码格式不正确",
            });
        if (
          !newPassword ||
          newPassword.length < 8 ||
          newPassword.length > 128 ||
          hasControlChars(newPassword) ||
          !/[a-z]/.test(newPassword) ||
          !/[A-Z]/.test(newPassword) ||
          !/\d/.test(newPassword)
        ) {
          return res.status(400).json({
            error: "PASSWORD_RULES",
            message: "密码需 8-128 位，且包含大写字母、小写字母和数字",
          });
        }

        if (!await verifyEmailCode(req, res, email, code, {
          databaseMode: databaseMode(),
          otpService: databaseMode() ? getOtpService() : null,
          purpose: "password-reset",
          hideAccountState: true,
        })) return;

        if (databaseMode()) {
          await getAuthService().resetPassword({ email, password: newPassword });
          return res.json({ ok: true, message: "密码已重置，请重新登录" });
        }

        const users = readUsersMap();
        const existingUser = Object.values(users).find(
          (u) => normalizeEmail(u?.email) === email,
        );
        if (!existingUser)
          return res.status(404).json({ ok: false, message: "该邮箱未注册" });
        const userId = String(existingUser.id || "").trim();
        if (!userId || !users[userId])
          return res.status(500).json({ ok: false, message: "USER_NOT_FOUND" });

        const crypto = require("crypto");
        const salt = crypto.randomBytes(16).toString("hex");
        const passwordHash = await hashPassword(newPassword, salt);
        const token = generateToken();
        users[userId] = {
          ...users[userId],
          passwordHash,
          passwordSalt: salt,
          passwordAlgo: "scrypt",
          sessionToken: token,
          sessionTokenIssuedAt: Date.now(),
        };
        delete users[userId].password;
        writeUsersMap(users);

        return res.json({ ok: true, message: "密码已重置" });
      } catch (e) {
        if (sendOtpConfigurationError(res, e)) return;
        console.error("Error in /api/auth/password-reset/reset:", e);
        return res.status(500).json({ ok: false, message: "重置失败" });
      }
    },
  );

  app.post(
    "/api/auth/register",
    rateLimit("auth_register", { max: 10, windowMs: 60 * 1000 }),
    async (req, res) => {
      if (!requireEmailOtpEnabled(res)) return;
      triggerAuthCleanup();
      try {
        const { username, password, name, fromUserId, email, code } =
          req.body || {};
        const uname = normalizeUsername(username);
        const pw = String(password || "");
        const mail = normalizeEmail(email);
        const c = String(code || "").trim();
        if (!uname || uname.length > 64 || hasControlChars(uname)) {
          return res.status(400).json({ error: "Invalid username" });
        }
        if (
          !pw ||
          pw.length < 8 ||
          pw.length > 128 ||
          hasControlChars(pw) ||
          !/[a-z]/.test(pw) ||
          !/[A-Z]/.test(pw) ||
          !/\d/.test(pw)
        ) {
          return res.status(400).json({
            error: "PASSWORD_RULES",
            message: "密码需 8-128 位，且包含大写字母、小写字母和数字",
          });
        }
        if (
          !mail ||
          mail.length > 254 ||
          !LOGIN_EMAIL_RE.test(mail) ||
          hasControlChars(mail)
        ) {
          return res.status(400).json({ error: "Invalid email format" });
        }
        if (!/^\d{6}$/.test(c)) {
          return res.status(400).json({
            error: "OTP_FORMAT_INVALID",
            message: "验证码格式不正确",
          });
        }
        const displayName = String(name || "").trim();
        if (
          displayName &&
          (displayName.length > 64 || hasControlChars(displayName))
        ) {
          return res.status(400).json({ error: "Invalid name" });
        }

        const users = databaseMode() ? null : readUsersMap();
        if (databaseMode()) {
          const availability = await getAuthService().checkRegistrationAvailability({
            username: uname,
            email: mail,
          });
          if (!availability.ok) {
            const emailConflict = availability.error === "EMAIL_EXISTS";
            return res.status(409).json({
              error: availability.error,
              message: emailConflict ? "Email already exists" : "Username already exists",
            });
          }
        } else {
          const existingEmail = Object.values(users).find(
            (u) => normalizeEmail(u?.email) === mail,
          );
          if (existingEmail)
            return res.status(409).json({ error: "Email already exists" });

          const existingUser = Object.values(users).find((u) => {
            const u0 = normalizeUsername(u?.username);
            return u0 && u0.toLowerCase() === uname.toLowerCase();
          });
          if (existingUser)
            return res.status(409).json({ error: "Username already exists" });
        }

        if (!await verifyEmailCode(req, res, mail, c, {
          databaseMode: databaseMode(),
          otpService: databaseMode() ? getOtpService() : null,
          purpose: "login",
        })) return;

        if (databaseMode()) {
          const result = await getAuthService().registerWithPassword({
            legacyUserId: makeUserId(),
            username: uname,
            email: mail,
            displayName: displayName || uname,
            password: pw,
            userAgent: userAgent(req),
          });
          return returnDatabaseLogin(res, result);
        }

        const userId = makeUserId();
        const crypto = require("crypto");
        const salt = crypto.randomBytes(16).toString("hex");
        const passwordHash = await hashPassword(pw, salt);
        const token = generateToken();

        const newUser = {
          id: userId,
          username: uname,
          email: mail,
          name: displayName || uname,
          passwordHash,
          passwordSalt: salt,
          passwordAlgo: "scrypt",
          visits: 0,
          preferences: {},
          createdAt: Date.now(),
          sessionToken: token,
          sessionTokenIssuedAt: Date.now(),
        };

        users[userId] = newUser;
        writeUsersMap(users);

        try {
          const mem = ensureUserMemoryShape(
            userId,
            readUserMemory(userId, null),
          );
          writeUserMemory(userId, mem);
        } catch {}

        try {
          imgCredits.ensureWallet(userId);
        } catch {}

        try {
          if (
            fromUserId &&
            fromUserId !== userId &&
            fromUserId.startsWith("guest_")
          )
            mergeUserData(fromUserId, userId, imgCredits);
        } catch {}

        setAuthCookie(res, token);
        res.json({
          ok: true,
          userId,
          name: newUser.name,
          csrfToken: deriveCsrfToken(token),
        });
      } catch (e) {
        if (sendOtpConfigurationError(res, e)) return;
        console.error("Error in /api/auth/register:", e);
        res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );
};

module.exports = {
  installAuthRoutes,
  allowInsecureGoogleVerify,
  canUseTestLoginCode,
  normalizeEmail, // Exporting for use in system.js
};
