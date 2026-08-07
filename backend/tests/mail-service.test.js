const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BREVO_SEND_URL,
  MailDeliveryError,
  createRelaySignature,
  createMailService
} = require('../services/mail-service');

const jsonResponse = (status, body, headers = {}) => ({
  status,
  headers: {
    get(name) {
      return headers[String(name || '').toLowerCase()] || null;
    }
  },
  async text() {
    return JSON.stringify(body);
  }
});

const textResponse = (status, body, headers = {}) => ({
  status,
  headers: {
    get(name) {
      return headers[String(name || '').toLowerCase()] || null;
    }
  },
  async text() {
    return String(body || '');
  }
});

const productionBrevoEnv = (overrides = {}) => ({
  NODE_ENV: 'production',
  MAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: 'brevo-test-key',
  MAIL_FROM_EMAIL: 'sender@example.com',
  MAIL_FROM_NAME: 'Artigen',
  ...overrides
});

const productionRelayEnv = (overrides = {}) => ({
  NODE_ENV: 'production',
  MAIL_PROVIDER: 'relay',
  MAIL_RELAY_URL: 'https://artigen-mail-relay.vercel.app/api/send-otp',
  MAIL_RELAY_SHARED_SECRET: 'relay_9Xv2Lm8Qp4Rz7Nc5Wt1Ks6Hd3Fa0Bq7Z',
  ...overrides
});

const otpRequest = {
  to: 'person@example.com',
  purpose: 'login',
  code: '123456'
};

test('Brevo OTP delivery uses the fixed HTTPS endpoint and primary sender env names', async () => {
  let request = null;
  const service = createMailService({
    env: {
      NODE_ENV: 'production',
      MAIL_PROVIDER: 'brevo',
      BREVO_API_KEY: 'brevo-test-key',
      MAIL_FROM_EMAIL: 'Sender@Example.com',
      MAIL_FROM_NAME: 'Artigen Mail'
    },
    fetchRequest: async (...args) => {
      request = args;
      return jsonResponse(201, { messageId: '<brevo-message-id>' });
    },
    logger: { warn() {} }
  });

  const delivered = await service.sendOtp({
    to: 'Person@Example.com',
    purpose: 'login',
    code: '123456',
    idempotencyKey: '123e4567-e89b-42d3-a456-426614174000'
  });

  assert.deepEqual(delivered, {
    state: 'accepted',
    provider: 'brevo',
    messageId: '<brevo-message-id>'
  });
  assert.equal(request[0], BREVO_SEND_URL);
  assert.equal(request[1].method, 'POST');
  assert.equal(request[1].redirect, 'error');
  assert.equal(request[1].headers['api-key'], 'brevo-test-key');
  const payload = JSON.parse(request[1].body);
  assert.deepEqual(payload.sender, {
    email: 'sender@example.com',
    name: 'Artigen Mail'
  });
  assert.deepEqual(payload.to, [{ email: 'person@example.com' }]);
  assert.equal(payload.headers.idempotencyKey, '123e4567-e89b-42d3-a456-426614174000');
  assert.match(payload.textContent, /123456/);
});

test('Brevo throttling and ambiguous delivery are classified without leaking provider bodies', async () => {
  const throttled = createMailService({
    env: {
      NODE_ENV: 'production',
      MAIL_PROVIDER: 'brevo',
      BREVO_API_KEY: 'key',
      BREVO_SENDER_EMAIL: 'sender@example.com'
    },
    fetchRequest: async () =>
      jsonResponse(429, { message: 'sensitive provider detail' }, {
        'retry-after': '17'
      }),
    logger: { warn() {} }
  });
  await assert.rejects(
    () => throttled.sendOtp({
      to: 'person@example.com',
      purpose: 'login',
      code: '123456'
    }),
    (error) => {
      assert.equal(error.code, 'MAIL_PROVIDER_THROTTLED');
      assert.equal(error.retryAfterSec, 17);
      assert.equal(error.message.includes('sensitive'), false);
      return true;
    }
  );

  const missingId = createMailService({
    env: {
      NODE_ENV: 'production',
      MAIL_PROVIDER: 'brevo',
      BREVO_API_KEY: 'key',
      BREVO_FROM_EMAIL: 'sender@example.com'
    },
    fetchRequest: async () => jsonResponse(201, {}),
    logger: { warn() {} }
  });
  await assert.rejects(
    () => missingId.sendOtp({
      to: 'person@example.com',
      purpose: 'password-reset',
      code: '654321'
    }),
    (error) => {
      assert.equal(error.code, 'MAIL_DELIVERY_UNKNOWN');
      assert.equal(error.deliveryUnknown, true);
      return true;
    }
  );
});

test('Brevo deterministic 400/401/402/403 failures open a process-local circuit', async (t) => {
  for (const status of [400, 401, 402, 403]) {
    await t.test(`status ${status}`, async () => {
      let calls = 0;
      const service = createMailService({
        env: productionBrevoEnv(),
        fetchRequest: async () => {
          calls += 1;
          return jsonResponse(status, { code: 'provider-error' });
        },
        logger: { warn() {} }
      });
      await assert.rejects(
        () => service.sendOtp(otpRequest),
        (error) => {
          assert.equal(
            error.code,
            status === 400 ? 'MAIL_PROVIDER_REQUEST_INVALID' : 'MAIL_PROVIDER_UNAVAILABLE'
          );
          return true;
        }
      );
      assert.equal(service.circuitState().open, true);
      await assert.rejects(
        () => service.sendOtp(otpRequest),
        (error) =>
          error.code === 'MAIL_PROVIDER_UNAVAILABLE' &&
          error.retryAfterSec > 0
      );
      assert.equal(calls, 1);
    });
  }
});

test('Brevo circuit expires after the configured interval and a success closes it', async () => {
  let clock = 0;
  let calls = 0;
  const service = createMailService({
    env: productionBrevoEnv({ MAIL_PROVIDER_CIRCUIT_MS: '1000' }),
    now: () => clock,
    fetchRequest: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(400, { code: 'invalid_parameter' })
        : jsonResponse(201, { messageId: `message-${calls}` });
    },
    logger: { warn() {} }
  });
  await assert.rejects(
    () => service.sendOtp(otpRequest),
    (error) => error.code === 'MAIL_PROVIDER_REQUEST_INVALID'
  );
  clock = 500;
  await assert.rejects(
    () => service.sendOtp(otpRequest),
    (error) => error.code === 'MAIL_PROVIDER_UNAVAILABLE'
  );
  assert.equal(calls, 1);
  clock = 1001;
  assert.equal((await service.sendOtp(otpRequest)).state, 'accepted');
  assert.deepEqual(service.circuitState(), { open: false, retryAfterSec: 0 });
  assert.equal(calls, 2);
});

test('Brevo 429, 5xx, non-JSON and transport failures preserve delivery certainty', async (t) => {
  const cases = [
    {
      name: '429',
      response: () => jsonResponse(429, {}, { 'retry-after': '23' }),
      code: 'MAIL_PROVIDER_THROTTLED',
      deliveryUnknown: false,
      retryAfterSec: 23
    },
    {
      name: '5xx',
      response: () => jsonResponse(503, { message: 'provider outage' }),
      code: 'MAIL_DELIVERY_UNKNOWN',
      deliveryUnknown: true
    },
    {
      name: 'non-JSON 201 without message id',
      response: () => textResponse(201, '<html>not json</html>'),
      code: 'MAIL_DELIVERY_UNKNOWN',
      deliveryUnknown: true
    },
    {
      name: 'non-JSON 400',
      response: () => textResponse(400, '<html>bad request</html>'),
      code: 'MAIL_PROVIDER_REQUEST_INVALID',
      deliveryUnknown: false
    }
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      const service = createMailService({
        env: productionBrevoEnv(),
        fetchRequest: async () => item.response(),
        logger: { warn() {} }
      });
      await assert.rejects(
        () => service.sendOtp(otpRequest),
        (error) => {
          assert.equal(error.code, item.code);
          assert.equal(error.deliveryUnknown, item.deliveryUnknown);
          if (item.retryAfterSec) assert.equal(error.retryAfterSec, item.retryAfterSec);
          return true;
        }
      );
    });
  }

  for (const transport of ['DNS', 'TLS', 'timeout', 'disconnect']) {
    await t.test(transport, async () => {
      const service = createMailService({
        env: productionBrevoEnv(),
        fetchRequest: async () => {
          const error = new Error(`${transport} sensitive detail`);
          error.code = transport.toUpperCase();
          throw error;
        },
        logger: { warn() {} }
      });
      await assert.rejects(
        () => service.sendOtp(otpRequest),
        (error) =>
          error.code === 'MAIL_DELIVERY_UNKNOWN' &&
          error.deliveryUnknown === true
      );
    });
  }
});

test('signed relay OTP delivery uses one fixed HTTPS request and opaque result', async () => {
  let request = null;
  const now = 1_750_000_000_000;
  const service = createMailService({
    env: productionRelayEnv(),
    now: () => now,
    fetchRequest: async (...args) => {
      request = args;
      return jsonResponse(200, {
        ok: true,
        deliveryStatus: 'accepted',
        messageId: 'a'.repeat(64)
      });
    },
    logger: { warn() {} }
  });
  const delivered = await service.sendOtp({
    ...otpRequest,
    idempotencyKey: '123e4567-e89b-42d3-a456-426614174000'
  });
  assert.deepEqual(delivered, {
    state: 'accepted',
    provider: 'relay',
    messageId: 'a'.repeat(64)
  });
  assert.equal(
    request[0],
    'https://artigen-mail-relay.vercel.app/api/send-otp'
  );
  assert.equal(request[1].method, 'POST');
  assert.equal(request[1].redirect, 'error');
  assert.equal(request[1].headers['x-artigen-timestamp'], String(now));
  const payload = JSON.parse(request[1].body);
  assert.deepEqual(payload, {
    ...otpRequest,
    idempotencyKey: '123e4567-e89b-42d3-a456-426614174000'
  });
  assert.equal(
    request[1].headers['x-artigen-signature'],
    createRelaySignature({
      secret: productionRelayEnv().MAIL_RELAY_SHARED_SECRET,
      timestamp: String(now),
      ...payload
    })
  );
});

test('relay preserves unknown delivery and opens a circuit only on definite failures', async (t) => {
  await t.test('unknown delivery', async () => {
    const service = createMailService({
      env: productionRelayEnv(),
      fetchRequest: async () => jsonResponse(202, {
        ok: true,
        deliveryStatus: 'unknown'
      }),
      logger: { warn() {} }
    });
    await assert.rejects(
      () => service.sendOtp({
        ...otpRequest,
        idempotencyKey: '123e4567-e89b-42d3-a456-426614174001'
      }),
      (error) =>
        error.code === 'MAIL_DELIVERY_UNKNOWN' &&
        error.deliveryUnknown === true
    );
    assert.equal(service.circuitState().open, false);
  });

  await t.test('auth failure', async () => {
    let calls = 0;
    const service = createMailService({
      env: productionRelayEnv(),
      fetchRequest: async () => {
        calls += 1;
        return jsonResponse(503, {
          ok: false,
          deliveryStatus: 'failed',
          code: 'SMTP_AUTH_FAILED'
        });
      },
      logger: { warn() {} }
    });
    const request = {
      ...otpRequest,
      idempotencyKey: '123e4567-e89b-42d3-a456-426614174002'
    };
    await assert.rejects(
      () => service.sendOtp(request),
      (error) => error.code === 'MAIL_PROVIDER_UNAVAILABLE'
    );
    assert.equal(service.circuitState().open, true);
    await assert.rejects(
      () => service.sendOtp(request),
      (error) => error.code === 'MAIL_PROVIDER_UNAVAILABLE'
    );
    assert.equal(calls, 1);
  });
});

test('production relay requires HTTPS, a fixed path, a strong secret and idempotency', async () => {
  for (const env of [
    productionRelayEnv({ MAIL_RELAY_URL: 'http://example.com/api/send-otp' }),
    productionRelayEnv({ MAIL_RELAY_URL: 'https://example.com/other' }),
    productionRelayEnv({ MAIL_RELAY_URL: 'https://example.com/api/send-otp?target=other' }),
    productionRelayEnv({ MAIL_RELAY_SHARED_SECRET: 'short' })
  ]) {
    const service = createMailService({ env });
    await assert.rejects(
      () => service.sendOtp({
        ...otpRequest,
        idempotencyKey: '123e4567-e89b-42d3-a456-426614174003'
      }),
      (error) => error.code === 'MAIL_PROVIDER_NOT_CONFIGURED'
    );
  }
  const service = createMailService({ env: productionRelayEnv() });
  await assert.rejects(
    () => service.sendOtp(otpRequest),
    (error) => error.code === 'MAIL_REQUEST_INVALID'
  );
});

test('local SMTP and debug providers cannot become production OTP backdoors', async () => {
  const productionSmtp = createMailService({
    env: {
      NODE_ENV: 'production',
      MAIL_PROVIDER: 'smtp',
      MAIL_SMTP_USER: 'sender@example.com',
      MAIL_SMTP_PASS: 'secret'
    }
  });
  await assert.rejects(
    () => productionSmtp.sendOtp({
      to: 'person@example.com',
      purpose: 'login',
      code: '123456'
    }),
    (error) => error instanceof MailDeliveryError && error.code === 'MAIL_SMTP_LOCAL_ONLY'
  );

  const debug = createMailService({
    env: {
      NODE_ENV: 'development',
      MAIL_PROVIDER: 'debug',
      MAIL_DEBUG_RETURN_CODE: '1',
      MAIL_DEBUG_ALLOW_REMOTE: '1',
      MAIL_DEBUG_EMAILS: 'allowed@example.com'
    }
  });
  assert.equal(
    (await debug.sendOtp({
      to: 'allowed@example.com',
      purpose: 'login',
      code: '123456',
      requestContext: { isLoopback: true }
    })).state,
    'debug'
  );
  await assert.rejects(
    () => debug.sendOtp({
      to: 'blocked@example.com',
      purpose: 'login',
      code: '123456',
      requestContext: { isLoopback: true }
    }),
    (error) => error.code === 'MAIL_DEBUG_RECIPIENT_FORBIDDEN'
  );
  await assert.rejects(
    () => debug.sendOtp({
      to: 'allowed@example.com',
      purpose: 'login',
      code: '123456',
      requestContext: { isLoopback: false }
    }),
    (error) => error.code === 'MAIL_DEBUG_LOOPBACK_REQUIRED'
  );
});
