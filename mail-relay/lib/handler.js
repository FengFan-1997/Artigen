'use strict';

const crypto = require('node:crypto');
const nodemailer = require('nodemailer');

const { otpCopy } = require('./otp-mail');
const {
  normalizeRelayRequest,
  requestFingerprint,
  verifyRelaySignature
} = require('./security');

const SMTP_HOST = 'smtp.163.com';
const SMTP_PORT = 465;
const DEFAULT_TIMEOUT_MS = 8000;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const MAX_IDEMPOTENCY_ENTRIES = 1000;

const json = (response, status, body) => response
  .status(status)
  .setHeader('Cache-Control', 'no-store')
  .setHeader('X-Content-Type-Options', 'nosniff')
  .json(body);

const strongSharedSecret = (value) =>
  Buffer.byteLength(String(value || '').trim(), 'utf8') >= 32;

const resolveConfig = (env = process.env) => {
  const user = String(env.SMTP_USER || '').trim().toLowerCase();
  const pass = String(env.SMTP_PASS || '').trim();
  const fromEmail = String(env.MAIL_FROM_EMAIL || user).trim().toLowerCase();
  const fromName = String(env.MAIL_FROM_NAME || 'Artigen').trim().slice(0, 120);
  const sharedSecret = String(env.MAIL_RELAY_SHARED_SECRET || '').trim();
  const timeoutCandidate = Number(env.SMTP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timeoutMs = Math.max(
    2000,
    Math.min(15_000, Number.isFinite(timeoutCandidate) ? timeoutCandidate : DEFAULT_TIMEOUT_MS)
  );

  if (
    !strongSharedSecret(sharedSecret) ||
    !user ||
    !pass ||
    !fromName ||
    fromEmail !== user
  ) {
    return null;
  }
  return { user, pass, fromEmail, fromName, sharedSecret, timeoutMs };
};

const classifySmtpError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const command = String(error?.command || '').trim().toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  if (code === 'EAUTH' || command.startsWith('AUTH') || [530, 535].includes(responseCode)) {
    return { status: 503, code: 'SMTP_AUTH_FAILED', cache: false };
  }
  if ([421, 450, 451, 452].includes(responseCode)) {
    return { status: 429, code: 'SMTP_THROTTLED', cache: false, retryAfterSec: 60 };
  }
  return { status: 202, code: 'DELIVERY_UNKNOWN', cache: true };
};

const createRelayHandler = ({
  env = process.env,
  createTransport = nodemailer.createTransport,
  now = () => Date.now()
} = {}) => {
  const idempotency = new Map();

  const prune = () => {
    const current = Number(now());
    for (const [key, item] of idempotency) {
      if (item.expiresAt <= current) idempotency.delete(key);
    }
    while (idempotency.size > MAX_IDEMPOTENCY_ENTRIES) {
      idempotency.delete(idempotency.keys().next().value);
    }
  };

  const deliver = async (request, config) => {
    const transport = createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true,
      auth: { user: config.user, pass: config.pass },
      tls: {
        servername: SMTP_HOST,
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      },
      connectionTimeout: config.timeoutMs,
      greetingTimeout: config.timeoutMs,
      socketTimeout: config.timeoutMs,
      disableFileAccess: true,
      disableUrlAccess: true
    });
    const copy = otpCopy(request);
    try {
      const result = await transport.sendMail({
        from: `${config.fromName} <${config.fromEmail}>`,
        to: request.to,
        subject: copy.subject,
        text: copy.text,
        html: copy.html
      });
      const providerMessageId = String(result?.messageId || '').trim();
      if (!providerMessageId) {
        return { status: 202, body: { ok: true, deliveryStatus: 'unknown' }, cache: true };
      }
      const messageId = crypto
        .createHash('sha256')
        .update(providerMessageId)
        .digest('hex');
      return {
        status: 200,
        body: { ok: true, deliveryStatus: 'accepted', messageId },
        cache: true
      };
    } catch (error) {
      const classification = classifySmtpError(error);
      return {
        status: classification.status,
        body: {
          ok: classification.status === 202,
          deliveryStatus: classification.status === 202 ? 'unknown' : 'failed',
          code: classification.code,
          ...(classification.retryAfterSec
            ? { retryAfterSec: classification.retryAfterSec }
            : {})
        },
        cache: classification.cache
      };
    } finally {
      try {
        transport.close();
      } catch {}
    }
  };

  return async (request, response) => {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return json(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
    }
    const config = resolveConfig(env);
    if (!config) return json(response, 503, { ok: false, code: 'RELAY_NOT_CONFIGURED' });

    const normalized = normalizeRelayRequest(request.body);
    if (!normalized) return json(response, 400, { ok: false, code: 'REQUEST_INVALID' });
    const timestamp = String(request.headers?.['x-artigen-timestamp'] || '').trim();
    const signature = String(request.headers?.['x-artigen-signature'] || '').trim();
    if (!verifyRelaySignature({
      secret: config.sharedSecret,
      timestamp,
      signature,
      request: normalized,
      now: Number(now())
    })) {
      return json(response, 401, { ok: false, code: 'SIGNATURE_INVALID' });
    }

    prune();
    const fingerprint = requestFingerprint(normalized);
    const prior = idempotency.get(normalized.idempotencyKey);
    if (prior && prior.fingerprint !== fingerprint) {
      return json(response, 409, { ok: false, code: 'IDEMPOTENCY_CONFLICT' });
    }
    if (prior) {
      const result = await prior.promise;
      return json(response, result.status, result.body);
    }

    const promise = deliver(normalized, config);
    idempotency.set(normalized.idempotencyKey, {
      fingerprint,
      promise,
      expiresAt: Number(now()) + IDEMPOTENCY_TTL_MS
    });
    const result = await promise;
    if (!result.cache) idempotency.delete(normalized.idempotencyKey);
    return json(response, result.status, result.body);
  };
};

module.exports = {
  DEFAULT_TIMEOUT_MS,
  IDEMPOTENCY_TTL_MS,
  MAX_IDEMPOTENCY_ENTRIES,
  SMTP_HOST,
  SMTP_PORT,
  classifySmtpError,
  createRelayHandler,
  resolveConfig,
  strongSharedSecret
};
