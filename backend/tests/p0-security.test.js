const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  assertAdmin,
  resolveConsoleAdminAccount
} = require('../lib/auth-utils');
const { allowInsecureGoogleVerify, canUseTestLoginCode } = require('../routes/auth');
const { resolveServerCreditCost } = require('../lib/credit-pricing');
const {
  buildAfdianSignPayload,
  processAfdianWebhook,
  shouldRequireAfdianSignature
} = require('../lib/afdian-webhook');

const withProcessEnv = (changes, fn) => {
  const previous = {};
  for (const [key, value] of Object.entries(changes)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const mockResponse = () => {
  const state = { status: 200, body: null };
  return {
    state,
    status(code) {
      state.status = code;
      return this;
    },
    json(body) {
      state.body = body;
      return this;
    }
  };
};

test('production never exposes the default admin or legacy ADMIN_KEY backdoor', () => {
  withProcessEnv(
    {
      NODE_ENV: 'production',
      CONSOLE_ADMIN_USERNAME: undefined,
      CONSOLE_ADMIN_PASSWORD: undefined,
      ADMIN_KEY: 'static-master-key',
      ALLOW_LEGACY_ADMIN_KEY: '1'
    },
    () => {
      assert.deepEqual(resolveConsoleAdminAccount(), {
        ok: false,
        username: '',
        password: ''
      });
      assert.equal(resolveConsoleAdminAccount(false).ok, false);

      const res = mockResponse();
      const allowed = assertAdmin(
        { headers: { 'x-admin-key': 'static-master-key' } },
        res
      );
      assert.equal(allowed, false);
      assert.equal(res.state.status, 401);
      assert.deepEqual(res.state.body, { error: 'ADMIN_AUTH_REQUIRED' });
    }
  );

  withProcessEnv(
    {
      NODE_ENV: 'production',
      CONSOLE_ADMIN_USERNAME: 'admin',
      CONSOLE_ADMIN_PASSWORD: 'admin123456'
    },
    () => {
      assert.deepEqual(resolveConsoleAdminAccount(), {
        ok: false,
        username: '',
        password: ''
      });
    }
  );

  withProcessEnv(
    {
      NODE_ENV: 'production',
      CONSOLE_ADMIN_USERNAME: 'operator',
      CONSOLE_ADMIN_PASSWORD: 'short-password'
    },
    () => assert.equal(resolveConsoleAdminAccount().ok, false)
  );
});

test('production cannot enable unsigned Google token decoding with a stale flag', () => {
  withProcessEnv(
    {
      NODE_ENV: 'production',
      GOOGLE_OAUTH_ALLOW_INSECURE: '1'
    },
    () => assert.equal(allowInsecureGoogleVerify(), false)
  );
  withProcessEnv(
    {
      NODE_ENV: 'development',
      GOOGLE_OAUTH_ALLOW_INSECURE: undefined
    },
    () => assert.equal(allowInsecureGoogleVerify(), false)
  );
  withProcessEnv(
    {
      NODE_ENV: 'development',
      GOOGLE_OAUTH_ALLOW_INSECURE: '1'
    },
    () => assert.equal(allowInsecureGoogleVerify(), true)
  );
});

test('test OTP requires explicit gates, a custom code and an email allowlist', () => {
  const localRequest = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {}
  };
  const remoteRequest = {
    ip: '203.0.113.10',
    socket: { remoteAddress: '203.0.113.10' },
    headers: {}
  };

  withProcessEnv(
    {
      NODE_ENV: 'development',
      LOGIN_TEST_CODE: undefined,
      LOGIN_ALLOW_TEST_CODE: undefined,
      LOGIN_ALLOW_TEST_CODE_REMOTE: undefined,
      LOGIN_TEST_EMAILS: undefined
    },
    () => {
      assert.equal(canUseTestLoginCode(localRequest, '123456', 'local@example.com'), false);
      assert.equal(canUseTestLoginCode(remoteRequest, '123456', 'remote@example.com'), false);
    }
  );

  withProcessEnv(
    {
      NODE_ENV: 'development',
      LOGIN_TEST_CODE: 'local-only-918273',
      LOGIN_ALLOW_TEST_CODE: '1',
      LOGIN_ALLOW_TEST_CODE_REMOTE: undefined,
      LOGIN_TEST_EMAILS: 'allowed@example.com'
    },
    () => {
      assert.equal(
        canUseTestLoginCode(localRequest, 'local-only-918273', 'allowed@example.com'),
        true
      );
      assert.equal(
        canUseTestLoginCode(localRequest, 'local-only-918273', 'other@example.com'),
        false
      );
      assert.equal(
        canUseTestLoginCode(remoteRequest, 'local-only-918273', 'allowed@example.com'),
        false
      );
    }
  );

  withProcessEnv(
    {
      NODE_ENV: 'staging',
      LOGIN_TEST_CODE: 'staging-only-918273',
      LOGIN_ALLOW_TEST_CODE: '1',
      LOGIN_ALLOW_TEST_CODE_REMOTE: '1',
      LOGIN_TEST_EMAILS: 'allowed@example.com'
    },
    () => assert.equal(
      canUseTestLoginCode(remoteRequest, 'staging-only-918273', 'allowed@example.com'),
      true
    )
  );

  withProcessEnv(
    {
      NODE_ENV: 'production',
      LOGIN_TEST_CODE: 'production-backdoor',
      LOGIN_ALLOW_TEST_CODE: '1',
      LOGIN_ALLOW_TEST_CODE_IN_PROD: '1',
      LOGIN_ALLOW_TEST_CODE_REMOTE: '1',
      LOGIN_TEST_EMAILS: 'allowed@example.com'
    },
    () => {
      assert.equal(
        canUseTestLoginCode(localRequest, 'production-backdoor', 'allowed@example.com'),
        false
      );
      assert.equal(
        canUseTestLoginCode(remoteRequest, 'production-backdoor', 'allowed@example.com'),
        false
      );
    }
  );
});

test('test OTP never treats a forged X-Forwarded-For loopback as a local request', () => {
  const forwardedLoopbackRequest = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '10.0.0.24' },
    connection: { remoteAddress: '10.0.0.24' },
    headers: { 'x-forwarded-for': '127.0.0.1, 203.0.113.10' },
    app: { get: (key) => key === 'trust proxy' }
  };

  withProcessEnv(
    {
      NODE_ENV: 'staging',
      LOGIN_TEST_CODE: 'staging-only-918273',
      LOGIN_ALLOW_TEST_CODE: '1',
      LOGIN_ALLOW_TEST_CODE_REMOTE: undefined,
      LOGIN_TEST_EMAILS: 'allowed@example.com'
    },
    () => assert.equal(
      canUseTestLoginCode(
        forwardedLoopbackRequest,
        'staging-only-918273',
        'allowed@example.com'
      ),
      false
    )
  );
});

test('generate and img2img pricing ignores injected cost and prices normalized/unknown operations', () => {
  const env = {
    CREDITS_COST_GENERATE: '17',
    CREDITS_COST_IMG2IMG: '23',
    CREDITS_COST_AIDESIGN_QUICK: '11',
    CREDITS_COST_AIDESIGN_SEMANTIC: '7'
  };

  assert.equal(
    resolveServerCreditCost({
      endpoint: 'generate',
      operation: 'AI-DESIGN',
      cost: 1,
      env
    }),
    11
  );
  assert.equal(
    resolveServerCreditCost({
      endpoint: 'generate',
      operation: 'unknown-free-operation',
      cost: 0,
      env
    }),
    17
  );
  assert.equal(
    resolveServerCreditCost({
      endpoint: 'img2img',
      operation: 'unknown-free-operation',
      cost: 999999,
      env
    }),
    23
  );
});

const createWebhookHarness = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const env = {
    NODE_ENV: 'production',
    AFDIAN_WEBHOOK_PUBLIC_KEY: publicKey
  };
  const packages = {
    starter: { packageId: 'starter', amountCny: 9.9, credits: 400 },
    pro: { packageId: 'pro', amountCny: 49.9, credits: 3000 }
  };
  const payOrders = new Map();
  const appliedProviderOrders = new Map();
  const grants = [];

  const addPendingOrder = (orderId, overrides = {}) => {
    payOrders.set(orderId, {
      orderId,
      userId: 'user_target_123',
      packageId: 'starter',
      amountCny: 9.9,
      credits: 400,
      status: 'pending',
      ...overrides
    });
  };
  const signOrder = (order) => {
    return crypto
      .sign('RSA-SHA256', Buffer.from(buildAfdianSignPayload(order), 'utf8'), privateKey)
      .toString('base64');
  };
  const makeOrder = (localOrderId, providerOrderId, overrides = {}) => ({
    status: 2,
    out_trade_no: providerOrderId,
    user_id: 'afdian_member_456',
    plan_id: 'plan_starter',
    total_amount: '9.90',
    custom_order_id: localOrderId,
    remark: `userId=user_target_123 packageId=starter orderId=${localOrderId}`,
    ...overrides
  });
  const process = (body) =>
    processAfdianWebhook({
      body,
      env,
      isProd: true,
      getPayOrder: (orderId) => payOrders.get(orderId) || null,
      resolvePayPackage: (packageId) => packages[packageId] || null,
      planPackageMap: { plan_starter: 'starter', plan_pro: 'pro' },
      applyCredits(payment) {
        const existing = appliedProviderOrders.get(payment.afdianOrderId);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(payment)) {
            return { ok: false, error: 'ORDER_REPLAY_MISMATCH' };
          }
          return { ok: true, alreadyProcessed: true };
        }
        appliedProviderOrders.set(payment.afdianOrderId, payment);
        grants.push(payment);
        return { ok: true, alreadyProcessed: false };
      },
      completePayOrder({ localOrderId, providerOrderId }) {
        const current = payOrders.get(localOrderId);
        if (!current || current.status !== 'pending') {
          return { ok: false, error: 'ORDER_NOT_PENDING' };
        }
        payOrders.set(localOrderId, {
          ...current,
          status: 'paid',
          afdianOrderId: providerOrderId
        });
        return { ok: true };
      }
    });

  return {
    addPendingOrder,
    env,
    grants,
    makeOrder,
    payOrders,
    process,
    signOrder
  };
};

test('production webhook requires a valid signature and rejects forged payloads', () => {
  const h = createWebhookHarness();
  assert.equal(shouldRequireAfdianSignature(h.env, false), true);
  h.addPendingOrder('pay_security_0001');
  const order = h.makeOrder('pay_security_0001', 'afdian_security_0001');

  assert.equal(
    h.process({ data: { order } }).error,
    'MISSING_SIGN'
  );
  assert.equal(
    h.process({ data: { order }, sign: Buffer.from('forged').toString('base64') }).error,
    'INVALID_SIGN'
  );
  assert.equal(h.grants.length, 0);
  assert.equal(h.payOrders.get('pay_security_0001').status, 'pending');
});

test('webhook credits only the local pending order once and ignores top-level authority fields', () => {
  const h = createWebhookHarness();
  h.addPendingOrder('pay_security_0002');
  const order = h.makeOrder('pay_security_0002', 'afdian_security_0002');
  const body = {
    userId: 'user_attacker',
    credits: 999999,
    packageId: 'pro',
    remark: 'userId=user_attacker packageId=pro',
    data: { order },
    sign: h.signOrder(order)
  };

  const first = h.process(body);
  assert.equal(first.ok, true);
  assert.equal(first.credited, true);
  assert.deepEqual(h.grants, [
    {
      afdianOrderId: 'afdian_security_0002',
      localOrderId: 'pay_security_0002',
      userId: 'user_target_123',
      packageId: 'starter',
      credits: 400
    }
  ]);
  assert.equal(h.payOrders.get('pay_security_0002').status, 'paid');

  const replay = h.process(body);
  assert.equal(replay.ok, false);
  assert.equal(replay.error, 'ORDER_NOT_PENDING');
  assert.equal(h.grants.length, 1);

  h.addPendingOrder('pay_security_0003');
  const reboundOrder = h.makeOrder(
    'pay_security_0003',
    'afdian_security_0002'
  );
  const rebound = h.process({
    data: { order: reboundOrder },
    sign: h.signOrder(reboundOrder)
  });
  assert.equal(rebound.error, 'ORDER_REPLAY_MISMATCH');
  assert.equal(h.payOrders.get('pay_security_0003').status, 'pending');
  assert.equal(h.grants.length, 1);
});

test('webhook strictly matches local user, package and amount', () => {
  const cases = [
    {
      id: 'pay_security_1001',
      provider: 'afdian_security_1001',
      override: { remark: 'userId=user_other packageId=starter' },
      error: 'USER_MISMATCH'
    },
    {
      id: 'pay_security_1002',
      provider: 'afdian_security_1002',
      override: { plan_id: 'plan_pro', remark: 'userId=user_target_123 packageId=pro' },
      error: 'PACKAGE_MISMATCH'
    },
    {
      id: 'pay_security_1003',
      provider: 'afdian_security_1003',
      override: { total_amount: '0.01' },
      error: 'AMOUNT_MISMATCH'
    }
  ];

  for (const item of cases) {
    const h = createWebhookHarness();
    h.addPendingOrder(item.id);
    const order = h.makeOrder(item.id, item.provider, item.override);
    const result = h.process({ data: { order }, sign: h.signOrder(order) });
    assert.equal(result.error, item.error);
    assert.equal(h.grants.length, 0);
  }
});

test('top-level order, user, credits and remark cannot create a payment', () => {
  const h = createWebhookHarness();
  h.addPendingOrder('pay_security_2001');
  const forged = h.process({
    afdianOrderId: 'afdian_security_2001',
    payOrderId: 'pay_security_2001',
    userId: 'user_target_123',
    packageId: 'starter',
    credits: 400,
    amount: 9.9,
    remark: 'userId=user_target_123 packageId=starter orderId=pay_security_2001'
  });
  assert.equal(forged.error, 'MISSING_ORDER');
  assert.equal(h.grants.length, 0);
});
