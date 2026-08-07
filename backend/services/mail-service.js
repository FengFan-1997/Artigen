const crypto = require('crypto');

const { fetchWithTimeout } = require('../lib/fetch-utils');

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const RELAY_SIGNATURE_VERSION = 'artigen-mail-relay-v1';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_CIRCUIT_MS = 5 * 60 * 1000;
const MAX_PROVIDER_BODY_CHARS = 16 * 1024;

const enabled = (value) => /^(1|true)$/i.test(String(value || '').trim());
const isProduction = (env = process.env) =>
  String(env.NODE_ENV || '').trim().toLowerCase() === 'production';

class MailDeliveryError extends Error {
  constructor(code, {
    provider = '',
    retryable = false,
    retryAfterSec = 0,
    deliveryUnknown = false,
    status = 503
  } = {}) {
    super(code);
    this.name = 'MailDeliveryError';
    this.code = code;
    this.provider = provider;
    this.retryable = Boolean(retryable);
    this.retryAfterSec = Math.max(0, Number(retryAfterSec) || 0);
    this.deliveryUnknown = Boolean(deliveryUnknown);
    this.status = Number(status) || 503;
  }
}

const boundedTimeoutMs = (env = process.env) => {
  const parsed = Number(env.MAIL_TIMEOUT_MS || env.BREVO_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Math.max(2000, Math.min(20_000, Number.isFinite(parsed) ? parsed : DEFAULT_TIMEOUT_MS));
};

const boundedCircuitMs = (env = process.env) => {
  const parsed = Number(
    env.MAIL_PROVIDER_CIRCUIT_MS ||
    env.BREVO_CIRCUIT_BREAKER_MS ||
    DEFAULT_CIRCUIT_MS
  );
  return Math.max(
    1000,
    Math.min(60 * 60 * 1000, Number.isFinite(parsed) ? parsed : DEFAULT_CIRCUIT_MS)
  );
};

const resolveFromEmail = (env = process.env) =>
  String(
    env.MAIL_FROM_EMAIL ||
    env.BREVO_SENDER_EMAIL ||
    env.BREVO_FROM_EMAIL ||
    ''
  ).trim().toLowerCase();

const resolveFromName = (env = process.env) =>
  String(
    env.MAIL_FROM_NAME ||
    env.BREVO_SENDER_NAME ||
    env.BREVO_FROM_NAME ||
    'Artigen'
  ).trim().slice(0, 120) ||
  'Artigen';

const resolveMailProvider = (env = process.env) => {
  const configured = String(env.MAIL_PROVIDER || '').trim().toLowerCase();
  if (configured) return configured;
  if (
    String(env.MAIL_RELAY_URL || '').trim() &&
    String(env.MAIL_RELAY_SHARED_SECRET || '').trim()
  ) return 'relay';
  if (String(env.BREVO_API_KEY || '').trim()) return 'brevo';
  if (!isProduction(env)) {
    const smtpUser = String(env.MAIL_SMTP_USER || env.QQ_SMTP_USER || '').trim();
    const smtpPass = String(env.MAIL_SMTP_PASS || env.QQ_SMTP_PASS || '').trim();
    if (smtpUser && smtpPass) return 'smtp';
    if (enabled(env.MAIL_DEBUG_RETURN_CODE || env.LOGIN_DEBUG_RETURN_CODE)) return 'debug';
  }
  return '';
};

const resolveRelayConfig = (env = process.env) => {
  const sharedSecret = String(env.MAIL_RELAY_SHARED_SECRET || '').trim();
  let endpoint;
  try {
    endpoint = new URL(String(env.MAIL_RELAY_URL || '').trim());
  } catch {
    endpoint = null;
  }
  const validEndpoint = Boolean(
    endpoint &&
    ['http:', 'https:'].includes(endpoint.protocol) &&
    (!isProduction(env) || endpoint.protocol === 'https:') &&
    !endpoint.username &&
    !endpoint.password &&
    !endpoint.search &&
    !endpoint.hash &&
    endpoint.pathname.replace(/\/+$/, '') === '/api/send-otp'
  );
  if (
    !validEndpoint ||
    Buffer.byteLength(sharedSecret, 'utf8') < 32
  ) {
    throw new MailDeliveryError('MAIL_PROVIDER_NOT_CONFIGURED', {
      provider: 'relay',
      retryable: false
    });
  }
  return {
    endpoint: endpoint.toString(),
    sharedSecret,
    timeoutMs: boundedTimeoutMs(env)
  };
};

const resolveBrevoConfig = (env = process.env) => {
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  const fromEmail = resolveFromEmail(env);
  if (!apiKey || !fromEmail) {
    throw new MailDeliveryError('MAIL_PROVIDER_NOT_CONFIGURED', {
      provider: 'brevo',
      retryable: false
    });
  }
  return {
    apiKey,
    fromEmail,
    fromName: resolveFromName(env),
    timeoutMs: boundedTimeoutMs(env)
  };
};

const resolveSmtpConfig = (env = process.env) => {
  if (isProduction(env)) {
    throw new MailDeliveryError('MAIL_SMTP_LOCAL_ONLY', {
      provider: 'smtp',
      retryable: false
    });
  }
  const user = String(env.MAIL_SMTP_USER || env.QQ_SMTP_USER || '').trim();
  const pass = String(env.MAIL_SMTP_PASS || env.QQ_SMTP_PASS || '').trim();
  const host = String(env.MAIL_SMTP_HOST || env.QQ_SMTP_HOST || 'smtp.qq.com').trim();
  const port = Number(env.MAIL_SMTP_PORT || env.QQ_SMTP_PORT || 465);
  const secure = String(
    env.MAIL_SMTP_SECURE ||
    env.QQ_SMTP_SECURE ||
    (port === 465 ? 'true' : 'false')
  ).trim().toLowerCase() === 'true';
  const fromEmail = resolveFromEmail(env) || user.toLowerCase();
  if (!user || !pass || !host || !fromEmail) {
    throw new MailDeliveryError('MAIL_PROVIDER_NOT_CONFIGURED', {
      provider: 'smtp',
      retryable: false
    });
  }
  return {
    user,
    pass,
    host,
    port,
    secure,
    fromEmail,
    fromName: resolveFromName(env),
    timeoutMs: boundedTimeoutMs(env)
  };
};

const debugAllowlist = (env = process.env) => new Set(
  String(
    env.MAIL_DEBUG_EMAILS ||
    env.LOGIN_TEST_EMAILS ||
    env.LOGIN_TEST_EMAIL_ALLOWLIST ||
    ''
  )
    .split(',')
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
);

const assertDebugRecipient = (
  to,
  env = process.env,
  { isLoopback = false } = {}
) => {
  if (
    isProduction(env) ||
    !enabled(env.MAIL_DEBUG_RETURN_CODE || env.LOGIN_DEBUG_RETURN_CODE)
  ) {
    throw new MailDeliveryError('MAIL_DEBUG_DISABLED', {
      provider: 'debug',
      retryable: false
    });
  }
  if (!isLoopback) {
    throw new MailDeliveryError('MAIL_DEBUG_LOOPBACK_REQUIRED', {
      provider: 'debug',
      retryable: false
    });
  }
  const allowlist = debugAllowlist(env);
  if (!allowlist.size || !allowlist.has(String(to || '').trim().toLowerCase())) {
    throw new MailDeliveryError('MAIL_DEBUG_RECIPIENT_FORBIDDEN', {
      provider: 'debug',
      retryable: false
    });
  }
};

const otpCopy = ({ purpose, code }) => {
  const passwordReset = purpose === 'password-reset';
  const title = passwordReset ? '密码重置验证' : '邮箱验证码登录';
  const subject = passwordReset ? '重置密码验证码' : '登录验证码';
  const resetNotice = passwordReset
    ? '\n如果该邮箱没有对应账户，验证码不会生效。'
    : '';
  const text = `${title}\n\n你的验证码是：${code}\n\n验证码 10 分钟内有效。${resetNotice}\n如非本人操作，请忽略。`;
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Arial; line-height: 1.6; color: #0f172a;">
      <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">${title}</div>
      <div style="margin-bottom: 12px;">你的验证码是：</div>
      <div style="font-size: 28px; font-weight: 900; letter-spacing: 4px; margin: 10px 0;">${code}</div>
      <div style="color: #475569; font-size: 12px;">
        10 分钟内有效。${passwordReset ? '如果该邮箱没有对应账户，验证码不会生效。' : ''}
        如非本人操作，请忽略。
      </div>
    </div>
  `;
  return { subject, text, html };
};

const parseRetryAfterSec = (response) => {
  const candidates = [
    response?.headers?.get?.('x-sib-ratelimit-reset'),
    response?.headers?.get?.('retry-after')
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(24 * 60 * 60, Math.ceil(parsed));
  }
  return 60;
};

const readProviderJson = async (response) => {
  const text = String(await response.text().catch(() => '')).slice(0, MAX_PROVIDER_BODY_CHARS);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const classifyBrevoFailure = ({ response, body }) => {
  const status = Number(response?.status || 0);
  const providerCode = String(body?.code || '').trim().toLowerCase();
  if (status === 429) {
    return new MailDeliveryError('MAIL_PROVIDER_THROTTLED', {
      provider: 'brevo',
      retryable: true,
      retryAfterSec: parseRetryAfterSec(response)
    });
  }
  if (
    status === 401 ||
    status === 402 ||
    status === 403 ||
    ['unauthorized', 'not_enough_credits', 'account_under_validation', 'permission_denied']
      .includes(providerCode)
  ) {
    return new MailDeliveryError('MAIL_PROVIDER_UNAVAILABLE', {
      provider: 'brevo',
      retryable: false
    });
  }
  if (status >= 400 && status < 500) {
    return new MailDeliveryError('MAIL_PROVIDER_REQUEST_INVALID', {
      provider: 'brevo',
      retryable: false
    });
  }
  return new MailDeliveryError('MAIL_DELIVERY_UNKNOWN', {
    provider: 'brevo',
    retryable: true,
    deliveryUnknown: true
  });
};

const createRelaySignature = ({
  secret,
  timestamp,
  idempotencyKey,
  to,
  purpose,
  code
}) => crypto
  .createHmac('sha256', String(secret || ''))
  .update([
    RELAY_SIGNATURE_VERSION,
    String(timestamp || '').trim(),
    String(idempotencyKey || '').trim().toLowerCase(),
    String(to || '').trim().toLowerCase(),
    String(purpose || '').trim().toLowerCase(),
    String(code || '').trim()
  ].join('\n'))
  .digest('hex');

const classifyRelayFailure = ({ response, body }) => {
  const status = Number(response?.status || 0);
  const relayCode = String(body?.code || '').trim().toUpperCase();
  if (status === 429) {
    return new MailDeliveryError('MAIL_PROVIDER_THROTTLED', {
      provider: 'relay',
      retryable: true,
      retryAfterSec: Number(body?.retryAfterSec) || parseRetryAfterSec(response)
    });
  }
  if (
    [400, 401, 403, 404, 405, 409].includes(status) ||
    ['RELAY_NOT_CONFIGURED', 'SMTP_AUTH_FAILED'].includes(relayCode)
  ) {
    return new MailDeliveryError('MAIL_PROVIDER_UNAVAILABLE', {
      provider: 'relay',
      retryable: false
    });
  }
  return new MailDeliveryError('MAIL_DELIVERY_UNKNOWN', {
    provider: 'relay',
    retryable: true,
    deliveryUnknown: true
  });
};

const validUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || '').trim());

const createMailService = ({
  env = process.env,
  fetchRequest,
  nodemailerModule,
  logger = console,
  now = () => Date.now()
} = {}) => {
  let providerCircuitOpenUntil = 0;
  let circuitProvider = '';
  const openProviderCircuit = (provider) => {
    circuitProvider = provider;
    providerCircuitOpenUntil = Math.max(
      providerCircuitOpenUntil,
      Number(now()) + boundedCircuitMs(env)
    );
  };
  const closeProviderCircuit = () => {
    providerCircuitOpenUntil = 0;
    circuitProvider = '';
  };
  const assertProviderCircuitClosed = (provider) => {
    const remainingMs = providerCircuitOpenUntil - Number(now());
    if (remainingMs <= 0) return;
    throw new MailDeliveryError('MAIL_PROVIDER_UNAVAILABLE', {
      provider: circuitProvider || provider,
      retryable: true,
      retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000))
    });
  };
  const sendViaBrevo = async ({ to, purpose, code, idempotencyKey }) => {
    assertProviderCircuitClosed('brevo');
    const config = resolveBrevoConfig(env);
    const copy = otpCopy({ purpose, code });
    const payload = {
      sender: { email: config.fromEmail, name: config.fromName },
      to: [{ email: String(to || '').trim().toLowerCase() }],
      subject: copy.subject,
      htmlContent: copy.html,
      textContent: copy.text,
      tags: [`artigen-otp-${purpose === 'password-reset' ? 'password-reset' : 'login'}`],
      ...(validUuid(idempotencyKey)
        ? { headers: { idempotencyKey: String(idempotencyKey).trim() } }
        : {})
    };
    let response;
    try {
      const request = fetchRequest || ((url, options, timeoutMs) =>
        fetchWithTimeout(url, { ...options, disableProxy: true }, timeoutMs));
      response = await request(
        BREVO_SEND_URL,
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'api-key': config.apiKey
          },
          body: JSON.stringify(payload)
        },
        config.timeoutMs
      );
    } catch (error) {
      logger.warn?.('[MailDelivery]', {
        provider: 'brevo',
        code: 'MAIL_DELIVERY_UNKNOWN',
        category: String(error?.name || error?.code || 'network').slice(0, 80)
      });
      throw new MailDeliveryError('MAIL_DELIVERY_UNKNOWN', {
        provider: 'brevo',
        retryable: true,
        deliveryUnknown: true
      });
    }

    const body = await readProviderJson(response);
    if (response.status === 201) {
      const messageId = String(body?.messageId || '').trim();
      if (!messageId) {
        throw new MailDeliveryError('MAIL_DELIVERY_UNKNOWN', {
          provider: 'brevo',
          retryable: true,
          deliveryUnknown: true
        });
      }
      closeProviderCircuit();
      return { state: 'accepted', provider: 'brevo', messageId };
    }
    const failure = classifyBrevoFailure({ response, body });
    if ([400, 401, 402, 403].includes(Number(response.status || 0))) {
      openProviderCircuit('brevo');
    }
    throw failure;
  };

  const sendViaRelay = async ({ to, purpose, code, idempotencyKey }) => {
    assertProviderCircuitClosed('relay');
    if (!validUuid(idempotencyKey)) {
      throw new MailDeliveryError('MAIL_REQUEST_INVALID', {
        provider: 'relay',
        retryable: false,
        status: 400
      });
    }
    const config = resolveRelayConfig(env);
    const normalizedIdempotencyKey = String(idempotencyKey).trim().toLowerCase();
    const timestamp = String(Math.trunc(Number(now())));
    const payload = {
      to,
      purpose,
      code,
      idempotencyKey: normalizedIdempotencyKey
    };
    const signature = createRelaySignature({
      secret: config.sharedSecret,
      timestamp,
      ...payload
    });
    let response;
    try {
      const request = fetchRequest || ((url, options, timeoutMs) =>
        fetchWithTimeout(url, { ...options, disableProxy: true }, timeoutMs));
      response = await request(
        config.endpoint,
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-artigen-timestamp': timestamp,
            'x-artigen-signature': signature
          },
          body: JSON.stringify(payload)
        },
        config.timeoutMs
      );
    } catch (error) {
      logger.warn?.('[MailDelivery]', {
        provider: 'relay',
        code: 'MAIL_DELIVERY_UNKNOWN',
        category: String(error?.name || error?.code || 'network').slice(0, 80)
      });
      throw new MailDeliveryError('MAIL_DELIVERY_UNKNOWN', {
        provider: 'relay',
        retryable: true,
        deliveryUnknown: true
      });
    }

    const body = await readProviderJson(response);
    if (
      response.status === 200 &&
      body?.ok === true &&
      body?.deliveryStatus === 'accepted'
    ) {
      const messageId = String(body?.messageId || '').trim();
      if (!/^[a-f0-9]{64}$/i.test(messageId)) {
        throw new MailDeliveryError('MAIL_DELIVERY_UNKNOWN', {
          provider: 'relay',
          retryable: true,
          deliveryUnknown: true
        });
      }
      closeProviderCircuit();
      return { state: 'accepted', provider: 'relay', messageId };
    }
    if (response.status === 202 && body?.deliveryStatus === 'unknown') {
      throw new MailDeliveryError('MAIL_DELIVERY_UNKNOWN', {
        provider: 'relay',
        retryable: true,
        deliveryUnknown: true
      });
    }
    const failure = classifyRelayFailure({ response, body });
    if (
      [400, 401, 403, 404, 405, 409].includes(Number(response.status || 0)) ||
      ['RELAY_NOT_CONFIGURED', 'SMTP_AUTH_FAILED']
        .includes(String(body?.code || '').trim().toUpperCase())
    ) {
      openProviderCircuit('relay');
    }
    throw failure;
  };

  const sendViaSmtp = async ({ to, purpose, code }) => {
    const config = resolveSmtpConfig(env);
    const nodemailer = nodemailerModule || require('nodemailer');
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure,
      auth: { user: config.user, pass: config.pass },
      tls: { servername: config.host },
      connectionTimeout: config.timeoutMs,
      greetingTimeout: config.timeoutMs,
      socketTimeout: config.timeoutMs
    });
    const copy = otpCopy({ purpose, code });
    try {
      const result = await transport.sendMail({
        from: `${config.fromName} <${config.fromEmail}>`,
        to,
        subject: copy.subject,
        html: copy.html,
        text: copy.text
      });
      return {
        state: 'accepted',
        provider: 'smtp',
        messageId: String(result?.messageId || crypto.randomUUID())
      };
    } catch (error) {
      const providerCode = String(error?.code || '').trim().toUpperCase();
      const definite = providerCode === 'EAUTH' || String(error?.command || '')
        .trim()
        .toUpperCase()
        .startsWith('AUTH');
      logger.warn?.('[MailDelivery]', {
        provider: 'smtp',
        code: definite ? 'MAIL_PROVIDER_UNAVAILABLE' : 'MAIL_DELIVERY_UNKNOWN',
        category: providerCode.slice(0, 80)
      });
      throw new MailDeliveryError(
        definite ? 'MAIL_PROVIDER_UNAVAILABLE' : 'MAIL_DELIVERY_UNKNOWN',
        {
          provider: 'smtp',
          retryable: !definite,
          deliveryUnknown: !definite
        }
      );
    } finally {
      try {
        transport.close();
      } catch {}
    }
  };

  const sendOtp = async ({
    to,
    purpose,
    code,
    idempotencyKey,
    requestContext
  }) => {
    const target = String(to || '').trim().toLowerCase();
    const normalizedPurpose = String(purpose || '').trim().toLowerCase();
    if (!target || !['login', 'password-reset'].includes(normalizedPurpose)) {
      throw new MailDeliveryError('MAIL_REQUEST_INVALID', { retryable: false, status: 400 });
    }
    if (!/^\d{6}$/.test(String(code || '').trim())) {
      throw new MailDeliveryError('MAIL_REQUEST_INVALID', { retryable: false, status: 400 });
    }
    const provider = resolveMailProvider(env);
    if (provider === 'relay') {
      return sendViaRelay({
        to: target,
        purpose: normalizedPurpose,
        code: String(code).trim(),
        idempotencyKey
      });
    }
    if (provider === 'brevo') {
      return sendViaBrevo({
        to: target,
        purpose: normalizedPurpose,
        code: String(code).trim(),
        idempotencyKey
      });
    }
    if (provider === 'smtp') {
      return sendViaSmtp({
        to: target,
        purpose: normalizedPurpose,
        code: String(code).trim()
      });
    }
    if (provider === 'debug') {
      assertDebugRecipient(target, env, {
        isLoopback: Boolean(requestContext?.isLoopback)
      });
      return { state: 'debug', provider: 'debug', messageId: '' };
    }
    throw new MailDeliveryError('MAIL_PROVIDER_NOT_CONFIGURED', {
      provider: '',
      retryable: false
    });
  };

  return {
    provider: resolveMailProvider(env),
    sendOtp,
    circuitState() {
      const remainingMs = Math.max(0, providerCircuitOpenUntil - Number(now()));
      return {
        open: remainingMs > 0,
        retryAfterSec: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0
      };
    }
  };
};

module.exports = {
  BREVO_SEND_URL,
  DEFAULT_CIRCUIT_MS,
  MailDeliveryError,
  RELAY_SIGNATURE_VERSION,
  assertDebugRecipient,
  boundedCircuitMs,
  boundedTimeoutMs,
  classifyBrevoFailure,
  classifyRelayFailure,
  createRelaySignature,
  createMailService,
  debugAllowlist,
  otpCopy,
  parseRetryAfterSec,
  resolveBrevoConfig,
  resolveFromEmail,
  resolveFromName,
  resolveMailProvider,
  resolveRelayConfig,
  resolveSmtpConfig,
  validUuid
};
