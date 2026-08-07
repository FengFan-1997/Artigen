'use strict';

const crypto = require('node:crypto');

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeRelayRequest = (body) => {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const to = String(input.to || '').trim().toLowerCase();
  const purpose = String(input.purpose || '').trim().toLowerCase();
  const code = String(input.code || '').trim();
  const idempotencyKey = String(input.idempotencyKey || '').trim().toLowerCase();

  if (
    !EMAIL_RE.test(to) ||
    to.length > 254 ||
    !['login', 'password-reset'].includes(purpose) ||
    !/^\d{6}$/.test(code) ||
    !UUID_RE.test(idempotencyKey)
  ) {
    return null;
  }
  return { to, purpose, code, idempotencyKey };
};

const relaySignaturePayload = ({
  timestamp,
  idempotencyKey,
  to,
  purpose,
  code
}) => [
  'artigen-mail-relay-v1',
  String(timestamp || '').trim(),
  String(idempotencyKey || '').trim().toLowerCase(),
  String(to || '').trim().toLowerCase(),
  String(purpose || '').trim().toLowerCase(),
  String(code || '').trim()
].join('\n');

const createRelaySignature = ({
  secret,
  timestamp,
  idempotencyKey,
  to,
  purpose,
  code
}) => crypto
  .createHmac('sha256', String(secret || ''))
  .update(relaySignaturePayload({ timestamp, idempotencyKey, to, purpose, code }))
  .digest('hex');

const verifyRelaySignature = ({
  secret,
  timestamp,
  signature,
  request,
  now = Date.now()
}) => {
  const timestampMs = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(Number(now) - timestampMs) > MAX_CLOCK_SKEW_MS
  ) {
    return false;
  }
  const provided = String(signature || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(provided)) return false;
  const expected = createRelaySignature({
    secret,
    timestamp: String(timestampMs),
    ...request
  });
  return crypto.timingSafeEqual(
    Buffer.from(provided, 'hex'),
    Buffer.from(expected, 'hex')
  );
};

const requestFingerprint = (request) => crypto
  .createHash('sha256')
  .update(JSON.stringify(request))
  .digest('hex');

module.exports = {
  MAX_CLOCK_SKEW_MS,
  createRelaySignature,
  normalizeRelayRequest,
  relaySignaturePayload,
  requestFingerprint,
  verifyRelaySignature
};
