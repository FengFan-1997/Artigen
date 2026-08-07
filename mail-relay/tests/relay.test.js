'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SMTP_HOST,
  SMTP_PORT,
  createRelayHandler
} = require('../lib/handler');
const {
  createRelaySignature,
  normalizeRelayRequest
} = require('../lib/security');

const SHARED_SECRET = 'relay_9Xv2Lm8Qp4Rz7Nc5Wt1Ks6Hd3Fa0Bq7Z';
const NOW = 1_750_000_000_000;
const BASE_REQUEST = Object.freeze({
  to: 'person@example.com',
  purpose: 'login',
  code: '123456',
  idempotencyKey: '123e4567-e89b-42d3-a456-426614174000'
});
const ENV = Object.freeze({
  MAIL_RELAY_SHARED_SECRET: SHARED_SECRET,
  SMTP_USER: 'sorates1997@163.com',
  SMTP_PASS: 'smtp-authorization-code',
  MAIL_FROM_EMAIL: 'sorates1997@163.com',
  MAIL_FROM_NAME: 'Artigen'
});

const createResponse = () => {
  const state = { status: 0, headers: {}, body: null };
  const response = {
    status(value) {
      state.status = value;
      return response;
    },
    setHeader(name, value) {
      state.headers[String(name).toLowerCase()] = value;
      return response;
    },
    json(body) {
      state.body = body;
      return state;
    }
  };
  return { response, state };
};

const signedRequest = (body = BASE_REQUEST, overrides = {}) => ({
  method: 'POST',
  body,
  headers: {
    'x-artigen-timestamp': String(NOW),
    'x-artigen-signature': createRelaySignature({
      secret: SHARED_SECRET,
      timestamp: String(NOW),
      ...body
    })
  },
  ...overrides
});

test('relay sends fixed Artigen OTP mail through fixed 163 TLS endpoint', async () => {
  let transportOptions;
  let mail;
  const handler = createRelayHandler({
    env: ENV,
    now: () => NOW,
    createTransport(options) {
      transportOptions = options;
      return {
        async sendMail(value) {
          mail = value;
          return { messageId: '<provider-message-id>' };
        },
        close() {}
      };
    }
  });
  const { response, state } = createResponse();
  await handler(signedRequest(), response);

  assert.equal(state.status, 200);
  assert.equal(state.body.deliveryStatus, 'accepted');
  assert.match(state.body.messageId, /^[a-f0-9]{64}$/);
  assert.equal(transportOptions.host, SMTP_HOST);
  assert.equal(transportOptions.port, SMTP_PORT);
  assert.equal(transportOptions.secure, true);
  assert.equal(transportOptions.tls.rejectUnauthorized, true);
  assert.equal(mail.from, 'Artigen <sorates1997@163.com>');
  assert.equal(mail.to, 'person@example.com');
  assert.match(mail.text, /123456/);
});

test('relay rejects stale or forged requests before touching SMTP', async () => {
  let calls = 0;
  const handler = createRelayHandler({
    env: ENV,
    now: () => NOW,
    createTransport() {
      calls += 1;
      throw new Error('must not run');
    }
  });
  const { response, state } = createResponse();
  await handler({
    ...signedRequest(),
    headers: {
      'x-artigen-timestamp': String(NOW),
      'x-artigen-signature': '0'.repeat(64)
    }
  }, response);
  assert.equal(state.status, 401);
  assert.equal(state.body.code, 'SIGNATURE_INVALID');
  assert.equal(calls, 0);
});

test('same idempotency key shares one SMTP dispatch and conflicting content is rejected', async () => {
  let sends = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const handler = createRelayHandler({
    env: ENV,
    now: () => NOW,
    createTransport() {
      return {
        async sendMail() {
          sends += 1;
          await gate;
          return { messageId: '<one-message>' };
        },
        close() {}
      };
    }
  });
  const firstResponse = createResponse();
  const secondResponse = createResponse();
  const first = handler(signedRequest(), firstResponse.response);
  const second = handler(signedRequest(), secondResponse.response);
  release();
  await Promise.all([first, second]);
  assert.equal(sends, 1);
  assert.equal(firstResponse.state.status, 200);
  assert.equal(secondResponse.state.status, 200);

  const conflict = {
    ...BASE_REQUEST,
    to: 'other@example.com'
  };
  const conflictResponse = createResponse();
  await handler(signedRequest(conflict), conflictResponse.response);
  assert.equal(conflictResponse.state.status, 409);
  assert.equal(conflictResponse.state.body.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(sends, 1);
});

test('SMTP auth failure is definite while transport failure stays delivery-unknown', async (t) => {
  for (const item of [
    {
      name: 'auth',
      error: Object.assign(new Error('secret detail'), { code: 'EAUTH' }),
      status: 503,
      code: 'SMTP_AUTH_FAILED'
    },
    {
      name: 'timeout',
      error: Object.assign(new Error('secret detail'), { code: 'ETIMEDOUT' }),
      status: 202,
      code: 'DELIVERY_UNKNOWN'
    }
  ]) {
    await t.test(item.name, async () => {
      const handler = createRelayHandler({
        env: ENV,
        now: () => NOW,
        createTransport() {
          return {
            async sendMail() {
              throw item.error;
            },
            close() {}
          };
        }
      });
      const { response, state } = createResponse();
      await handler(signedRequest({
        ...BASE_REQUEST,
        idempotencyKey: item.name === 'auth'
          ? '123e4567-e89b-42d3-a456-426614174001'
          : '123e4567-e89b-42d3-a456-426614174002'
      }), response);
      assert.equal(state.status, item.status);
      assert.equal(state.body.code, item.code);
      assert.equal(JSON.stringify(state.body).includes('secret detail'), false);
    });
  }
});

test('relay request validation accepts only OTP-shaped signed fields', () => {
  assert.deepEqual(normalizeRelayRequest(BASE_REQUEST), BASE_REQUEST);
  assert.equal(normalizeRelayRequest({ ...BASE_REQUEST, code: '1234567' }), null);
  assert.equal(normalizeRelayRequest({ ...BASE_REQUEST, purpose: 'newsletter' }), null);
  assert.equal(normalizeRelayRequest({ ...BASE_REQUEST, to: 'not-an-email' }), null);
});
