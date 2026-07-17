const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const tempMemory = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-auth-otp-test-'));
process.env.MEMORY_DIR = tempMemory;
process.env.NODE_ENV = 'development';
process.env.OTP_HMAC_SECRET = 'auth-otp-route-test-secret';
delete process.env.DATABASE_URL;
delete process.env.DATABASE_MIGRATION_URL;

const { installAuthRoutes } = require('../routes/auth');
const { writeUsersMap } = require('../lib/auth-utils');
const { TurnstileError } = require('../lib/turnstile');
const { MailDeliveryError } = require('../services/mail-service');

const buildFakeApp = () => {
  const routes = new Map();
  const register = (method) => (route, ...handlers) => {
    routes.set(`${method} ${route}`, handlers[handlers.length - 1]);
  };
  return {
    routes,
    get: register('GET'),
    post: register('POST'),
    options: register('OPTIONS'),
    delete: register('DELETE')
  };
};

const response = () => {
  const state = { status: 200, body: null, headers: {} };
  return {
    state,
    status(code) {
      state.status = code;
      return this;
    },
    json(body) {
      state.body = body;
      return this;
    },
    setHeader(name, value) {
      state.headers[String(name).toLowerCase()] = value;
    },
    append(name, value) {
      state.headers[String(name).toLowerCase()] = value;
    },
    end() {}
  };
};

const request = (body, headers = {}) => ({
  body,
  headers,
  socket: { remoteAddress: '127.0.0.1' }
});

const install = ({
  databaseMode = false,
  env,
  mailService,
  otpService,
  otpDeliveryService,
  turnstileVerifier
} = {}) => {
  const app = buildFakeApp();
  installAuthRoutes(app, {
    databaseMode,
    authCleanupService: { maybeRun() {} },
    env: env || {
      NODE_ENV: 'development',
      OTP_HMAC_SECRET: 'auth-otp-route-test-secret'
    },
    mailService: mailService || {
      async sendOtp() {
        return { state: 'accepted', provider: 'test', messageId: 'message-id' };
      }
    },
    ...(otpService ? { otpService } : {}),
    ...(otpDeliveryService ? { otpDeliveryService } : {}),
    turnstileVerifier: turnstileVerifier || (async () => ({ ok: true }))
  });
  return app;
};

test('login, registration and password reset reject malformed OTPs before consuming a challenge', async () => {
  const app = install();
  const verify = app.routes.get('POST /api/login/verify');
  const verifyRes = response();
  await verify(request({
    email: 'person@example.com',
    code: 'not-six-digits'
  }), verifyRes);
  assert.equal(verifyRes.state.status, 400);
  assert.equal(verifyRes.state.body.error, 'OTP_FORMAT_INVALID');

  const register = app.routes.get('POST /api/auth/register');
  const registerRes = response();
  await register(request({
    username: 'person',
    password: 'StrongPass1',
    email: 'new@example.com',
    code: '1234567'
  }), registerRes);
  assert.equal(registerRes.state.status, 400);
  assert.equal(registerRes.state.body.error, 'OTP_FORMAT_INVALID');

  const reset = app.routes.get('POST /api/auth/password-reset/reset');
  const resetRes = response();
  await reset(request({
    email: 'person@example.com',
    code: '12x456',
    newPassword: 'StrongPass1'
  }), resetRes);
  assert.equal(resetRes.state.status, 400);
  assert.equal(resetRes.state.body.error, 'OTP_FORMAT_INVALID');
});

test('password reset send response is identical for registered and unknown emails', async () => {
  writeUsersMap({
    user_known: {
      id: 'user_known',
      username: 'known',
      email: 'known@example.com',
      name: 'Known'
    }
  });
  let deliveries = 0;
  let turnstileChecks = 0;
  const app = install({
    mailService: {
      async sendOtp() {
        deliveries += 1;
        return { state: 'accepted', provider: 'test', messageId: 'message-id' };
      }
    },
    turnstileVerifier: async ({ expectedAction }) => {
      turnstileChecks += 1;
      assert.equal(expectedAction, 'password_reset_otp');
      return { ok: true };
    }
  });
  const send = app.routes.get('POST /api/auth/password-reset/send-code');
  const knownRes = response();
  const unknownRes = response();
  await send(request({ email: 'known@example.com' }), knownRes);
  await send(request({ email: 'unknown@example.com' }), unknownRes);

  assert.equal(knownRes.state.status, 200);
  assert.equal(unknownRes.state.status, 200);
  assert.deepEqual(knownRes.state.body, unknownRes.state.body);
  assert.equal(knownRes.state.body.deliveryStatus, 'accepted');
  assert.equal(knownRes.state.body.challengeId, 'memory');
  assert.equal(deliveries, 2);
  assert.equal(turnstileChecks, 2);
});

test('production email OTP endpoints fail closed while the feature flag is disabled', async () => {
  const app = install({
    env: {
      NODE_ENV: 'production',
      AUTH_EMAIL_OTP_ENABLED: 'false',
      OTP_HMAC_SECRET: 'auth-otp-route-test-secret'
    }
  });
  const send = app.routes.get('POST /api/login/send-code');
  const sendRes = response();
  await send(request({ email: 'disabled@example.com' }), sendRes);
  assert.equal(sendRes.state.status, 503);
  assert.equal(sendRes.state.body.error, 'OTP_DELIVERY_UNAVAILABLE');
});

test('production OTP sends require a browser-provided Idempotency-Key', async () => {
  const app = install({
    env: {
      NODE_ENV: 'production',
      AUTH_EMAIL_OTP_ENABLED: 'true',
      OTP_HMAC_SECRET: 'auth-otp-route-test-secret'
    }
  });
  const send = app.routes.get('POST /api/login/send-code');
  const sendRes = response();
  await send(request({
    email: 'missing-key@example.com',
    turnstileToken: 'turnstile-token'
  }), sendRes);
  assert.equal(sendRes.state.status, 400);
  assert.equal(sendRes.state.body.error, 'IDEMPOTENCY_KEY_REQUIRED');

  const bodyOnlyRes = response();
  await send(request({
    email: 'body-key@example.com',
    idempotencyKey: 'otp:123e4567-e89b-42d3-a456-426614174000',
    turnstileToken: 'turnstile-token'
  }), bodyOnlyRes);
  assert.equal(bodyOnlyRes.state.status, 400);
  assert.equal(bodyOnlyRes.state.body.error, 'IDEMPOTENCY_KEY_REQUIRED');
});

test('password reset remains non-enumerating when the provider is throttled', async () => {
  writeUsersMap({
    user_throttled: {
      id: 'user_throttled',
      username: 'throttled',
      email: 'reset-throttled@example.com',
      name: 'Throttled'
    }
  });
  const app = install({
    mailService: {
      async sendOtp() {
        throw new MailDeliveryError('MAIL_PROVIDER_THROTTLED', {
          provider: 'brevo',
          retryable: true,
          retryAfterSec: 30
        });
      }
    }
  });
  const send = app.routes.get('POST /api/auth/password-reset/send-code');
  const knownRes = response();
  const unknownRes = response();
  await send(request({ email: 'reset-throttled@example.com' }), knownRes);
  await send(request({ email: 'reset-missing@example.com' }), unknownRes);
  assert.equal(knownRes.state.status, 429);
  assert.equal(unknownRes.state.status, 429);
  assert.deepEqual(knownRes.state.body, unknownRes.state.body);
  assert.equal(knownRes.state.body.error, 'OTP_PROVIDER_THROTTLED');
  assert.equal(knownRes.state.headers['retry-after'], '30');
  assert.equal(unknownRes.state.headers['retry-after'], '30');
});

test('password reset invalid-code responses do not reveal account existence', async () => {
  writeUsersMap({
    user_reset_known: {
      id: 'user_reset_known',
      username: 'reset-known',
      email: 'reset-known@example.com',
      name: 'Known'
    }
  });
  const app = install();
  const send = app.routes.get('POST /api/auth/password-reset/send-code');
  await send(request({ email: 'reset-known@example.com' }), response());
  await send(request({ email: 'reset-unknown@example.com' }), response());

  const reset = app.routes.get('POST /api/auth/password-reset/reset');
  const knownRes = response();
  const unknownRes = response();
  const resetBody = {
    code: '000000',
    newPassword: 'StrongPass1'
  };
  await reset(request({
    ...resetBody,
    email: 'reset-known@example.com'
  }), knownRes);
  await reset(request({
    ...resetBody,
    email: 'reset-unknown@example.com'
  }), unknownRes);
  assert.equal(knownRes.state.status, 400);
  assert.equal(unknownRes.state.status, 400);
  assert.deepEqual(knownRes.state.body, unknownRes.state.body);
  assert.equal(knownRes.state.body.error, 'OTP_INVALID');
  assert.equal('attemptsLeft' in knownRes.state.body, false);
});

test('Turnstile validation details collapse to the public TURNSTILE_INVALID code', async () => {
  const app = install({
    turnstileVerifier: async () => {
      throw new TurnstileError('TURNSTILE_ACTION_MISMATCH', { status: 400 });
    }
  });
  const send = app.routes.get('POST /api/login/send-code');
  const sendRes = response();
  await send(request({
    email: 'turnstile-invalid@example.com',
    turnstileToken: 'invalid-token'
  }), sendRes);
  assert.equal(sendRes.state.status, 400);
  assert.equal(sendRes.state.body.error, 'TURNSTILE_INVALID');
});

test('ambiguous mail delivery keeps the OTP valid and returns a pending response', async () => {
  let issuedCode = '';
  const app = install({
    mailService: {
      async sendOtp({ code }) {
        issuedCode = code;
        throw new MailDeliveryError('MAIL_DELIVERY_UNKNOWN', {
          provider: 'test',
          retryable: true,
          deliveryUnknown: true
        });
      }
    }
  });
  const send = app.routes.get('POST /api/login/send-code');
  const sendRes = response();
  await send(request({ email: 'pending@example.com' }), sendRes);
  assert.equal(sendRes.state.status, 202);
  assert.equal(sendRes.state.body.deliveryPending, true);
  assert.equal(sendRes.state.body.challengeId, 'memory');
  assert.match(issuedCode, /^\d{6}$/);

  const verify = app.routes.get('POST /api/login/verify');
  const verifyRes = response();
  await verify(request({
    email: 'pending@example.com',
    code: issuedCode
  }), verifyRes);
  assert.equal(verifyRes.state.status, 200);
  assert.equal(verifyRes.state.body.ok, true);
});

test('login OTP verifies the shared email_otp Turnstile action', async () => {
  let expectedAction = '';
  const app = install({
    turnstileVerifier: async (input) => {
      expectedAction = input.expectedAction;
      return { ok: true };
    }
  });
  const send = app.routes.get('POST /api/login/send-code');
  const sendRes = response();
  await send(request({
    email: 'action@example.com',
    turnstileToken: 'turnstile-token'
  }), sendRes);
  assert.equal(sendRes.state.status, 200);
  assert.equal(expectedAction, 'email_otp');
  assert.equal(sendRes.state.body.challengeId, 'memory');
});

test('database idempotency replay does not require a consumed Turnstile token again', async () => {
  let turnstileChecks = 0;
  let deliveries = 0;
  const app = install({
    databaseMode: true,
    otpDeliveryService: {
      async findAttempt() {
        return {
          id: '00000000-0000-4000-8000-000000000001',
          challengeId: '10000000-0000-4000-8000-000000000001',
          state: 'accepted',
          cooldownSec: 42
        };
      }
    },
    mailService: {
      async sendOtp() {
        deliveries += 1;
        return { state: 'accepted', provider: 'test', messageId: 'message-id' };
      }
    },
    turnstileVerifier: async () => {
      turnstileChecks += 1;
      throw new Error('single-use token must not be verified on a replay');
    }
  });
  const send = app.routes.get('POST /api/login/send-code');
  const sendRes = response();
  await send(request(
    { email: 'replay@example.com', turnstileToken: 'already-consumed' },
    { 'idempotency-key': 'otp:123e4567-e89b-42d3-a456-426614174000' }
  ), sendRes);
  assert.equal(sendRes.state.status, 200);
  assert.equal(sendRes.state.body.ok, true);
  assert.equal(sendRes.state.body.cooldownSec, 42);
  assert.equal(
    sendRes.state.body.challengeId,
    '10000000-0000-4000-8000-000000000001'
  );
  assert.equal(turnstileChecks, 0);
  assert.equal(deliveries, 0);
});

test('a late accepted provider result is reported as unknown when the durable attempt was already finalized', async () => {
  const events = [];
  const app = install({
    databaseMode: true,
    otpService: {
      async createChallenge() {
        events.push('challenge');
        return {
          ok: true,
          challengeId: '10000000-0000-4000-8000-000000000001',
          cooldownUntil: new Date(Date.now() + 60_000),
          cooldownSec: 60
        };
      }
    },
    otpDeliveryService: {
      async findAttempt() {
        return null;
      },
      async beginAttempt() {
        events.push('begin');
        return {
          ok: true,
          owner: true,
          replay: false,
          attempt: { id: '00000000-0000-4000-8000-000000000001' }
        };
      },
      async markChallengeReady() {
        events.push('ready');
      },
      async markProviderDispatched() {
        events.push('dispatched');
      },
      async completeAttempt() {
        events.push('late-complete-rejected');
        return false;
      }
    },
    mailService: {
      async sendOtp() {
        events.push('provider-accepted');
        return { state: 'accepted', provider: 'brevo', messageId: 'message-id' };
      }
    }
  });
  const send = app.routes.get('POST /api/login/send-code');
  const sendRes = response();
  await send(request({ email: 'late@example.com' }), sendRes);
  assert.equal(sendRes.state.status, 202);
  assert.equal(sendRes.state.body.deliveryStatus, 'unknown');
  assert.deepEqual(events, [
    'begin',
    'challenge',
    'ready',
    'dispatched',
    'provider-accepted',
    'late-complete-rejected'
  ]);
});

test('provider throttling returns 429 with Retry-After and a stable public error', async () => {
  const app = install({
    mailService: {
      async sendOtp() {
        throw new MailDeliveryError('MAIL_PROVIDER_THROTTLED', {
          provider: 'brevo',
          retryable: true,
          retryAfterSec: 19
        });
      }
    }
  });
  const send = app.routes.get('POST /api/login/send-code');
  const sendRes = response();
  await send(request({ email: 'throttled@example.com' }), sendRes);
  assert.equal(sendRes.state.status, 429);
  assert.equal(sendRes.state.body.error, 'OTP_PROVIDER_THROTTLED');
  assert.equal(sendRes.state.body.retryAfterSec, 19);
  assert.equal(sendRes.state.headers['retry-after'], '19');
});

test('database quota maps global budget separately from target and IP throttles', async () => {
  const createQuotaApp = (scope) => install({
    databaseMode: true,
    otpDeliveryService: {
      async findAttempt() {
        return null;
      },
      async beginAttempt() {
        return {
          ok: false,
          error: 'OTP_SEND_QUOTA_EXCEEDED',
          scope,
          retryAfterSec: 60
        };
      }
    }
  });
  const globalSend = createQuotaApp('global_day').routes.get('POST /api/login/send-code');
  const globalRes = response();
  await globalSend(request({ email: 'global@example.com' }), globalRes);
  assert.equal(globalRes.state.status, 429);
  assert.equal(globalRes.state.body.error, 'OTP_DAILY_BUDGET_EXHAUSTED');

  const targetSend = createQuotaApp('target_hour').routes.get('POST /api/login/send-code');
  const targetRes = response();
  await targetSend(request({ email: 'target@example.com' }), targetRes);
  assert.equal(targetRes.state.status, 429);
  assert.equal(targetRes.state.body.error, 'OTP_PROVIDER_THROTTLED');
});

test.after(() => {
  fs.rmSync(tempMemory, { recursive: true, force: true });
});
