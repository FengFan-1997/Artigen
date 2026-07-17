const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assertAfdianQueryEndpoint,
  buildAfdianApiRequest,
  buildAfdianPayUrl,
  claimAfdianPaymentOrder,
  parseAmountMinor,
  processAfdianPaymentCallback,
  reconcileAfdianDeadLetter,
  requiresAfdianWebhookSignature,
  resolveActivePaymentPackage
} = require('../services/payment-service');
const {
  assertRequestedUserOwner,
  containsClientPaymentAuthority,
  isAfdianDocumentedWebhookProbe,
  legacyJsonBillingEnabled,
  publicCreditsBalance,
  publicCreditsHold,
  publicCreditsOrder
} = require('../routes/payments');

const LOCAL_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const PACKAGE_ID = '22222222-2222-4222-8222-222222222222';

class FakePaymentRepository {
  constructor({ withOrder = true, orderId = LOCAL_ORDER_ID } = {}) {
    this.events = new Map();
    this.rejections = [];
    this.audits = [];
    this.creditCount = 0;
    this.availableCredits = 0;
    this.order = withOrder
      ? {
          id: orderId,
          userId: '33333333-3333-4333-8333-333333333333',
          legacyUserId: 'user_target_123',
          packageId: PACKAGE_ID,
          packageSku: 'credits.starter.v1',
          amountMinor: 990,
          credits: 400,
          status: 'pending'
        }
      : null;
  }

  async transaction(callback) {
    return callback({
      claimEvent: async ({ providerEventId, payloadHash }) => {
        // There is no await before this check-and-set, mirroring the database
        // unique constraint as an atomic event claim for the concurrency test.
        const existing = this.events.get(providerEventId);
        if (existing) {
          if (!String(existing.status || '').startsWith('dead_letter:')) return null;
          existing.status = 'received';
          existing.payloadHash = payloadHash;
          existing.attempts = Number(existing.attempts || 1) + 1;
          return existing.id;
        }
        const id = `event-${this.events.size + 1}`;
        this.events.set(providerEventId, { id, payloadHash, status: 'received', attempts: 1 });
        return id;
      },
      lockOrder: async (orderId) => {
        return this.order && orderId === this.order.id ? this.order : null;
      },
      rejectEvent: async ({ eventId, paymentOrderId, error }) => {
        this.rejections.push({ eventId, paymentOrderId, error });
        const event = [...this.events.values()].find((item) => item.id === eventId);
        if (event) event.status = `dead_letter:${error}`;
      },
      creditPayment: async ({ eventId, order, providerEventId }) => {
        assert.equal(order.status, 'pending');
        order.status = 'paid';
        order.providerEventId = providerEventId;
        this.availableCredits += order.credits;
        this.creditCount += 1;
        const event = [...this.events.values()].find((item) => item.id === eventId);
        if (event) event.status = 'processed';
      },
      recordReconciliationAudit: async (entry) => {
        this.audits.push(entry);
      }
    });
  }
}

const callbackBody = (overrides = {}) => ({
  sign: 'fixture-signature',
  data: {
    order: {
      status: 2,
      out_trade_no: 'afdian-provider-order-001',
      user_id: 'afdian-donor-id',
      plan_id: 'plan-starter',
      total_amount: '9.90',
      custom_order_id: LOCAL_ORDER_ID,
      package_sku: 'credits.starter.v1',
      // These values are deliberately hostile. The payment service does not
      // read either as the credited user or credited amount.
      userId: 'attacker',
      credits: 999999,
      ...overrides
    }
  }
});

const documentedWebhookProbe = () => ({
  ec: 200,
  em: 'ok',
  data: {
    type: 'order',
    order: {
      out_trade_no: '202106232138371083454010626',
      user_id: 'adf397fe8374811eaacee52540025c377',
      plan_id: 'a45353328af911eb973052540025c377',
      month: 1,
      total_amount: '5.00',
      show_amount: '5.00',
      status: 2,
      remark: '',
      redeem_id: '',
      product_type: 0,
      discount: '0.00',
      sku_detail: []
    }
  }
});

const process = (
  repository,
  body,
  verifySignature = () => ({ ok: true }),
  canonicalOrder = body?.data?.order,
  envOverrides = {}
) => {
  return processAfdianPaymentCallback({
    body,
    repository,
    verifySignature,
    reconcileProviderOrder: async () => canonicalOrder,
    env: {
      AFDIAN_PLAN_PACKAGE_MAP: JSON.stringify({ 'plan-starter': 'starter' }),
      AFDIAN_WEBHOOK_REQUIRE_SIGN: '0',
      ...envOverrides
    }
  });
};

test('50 concurrent copies of one provider-verified event credit exactly once', async () => {
  const repository = new FakePaymentRepository();
  const results = await Promise.all(
    Array.from({ length: 50 }, () => process(repository, callbackBody()))
  );

  assert.equal(results.filter((result) => result.credited).length, 1);
  assert.equal(results.filter((result) => result.replayed).length, 49);
  assert.equal(repository.events.size, 1);
  assert.equal(repository.creditCount, 1);
  assert.equal(repository.availableCredits, 400);
  assert.equal(repository.order.status, 'paid');
});

test('the documented unsigned webhook settles only after an authenticated provider query', async () => {
  const repository = new FakePaymentRepository();
  const body = callbackBody();
  delete body.sign;
  let providerQueries = 0;
  let signatureChecks = 0;
  const result = await processAfdianPaymentCallback({
    body,
    repository,
    env: {
      AFDIAN_PLAN_PACKAGE_MAP: JSON.stringify({ 'plan-starter': 'starter' }),
      AFDIAN_WEBHOOK_REQUIRE_SIGN: '0'
    },
    verifySignature: () => {
      signatureChecks += 1;
      return { ok: false, error: 'MISSING_SIGN' };
    },
    reconcileProviderOrder: async () => {
      providerQueries += 1;
      return body.data.order;
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.credited, true);
  assert.equal(providerQueries, 1);
  assert.equal(signatureChecks, 0);
  assert.equal(repository.creditCount, 1);
});

test('an authenticated user claims a paid Afdian order without trusting checkout metadata', async () => {
  let claimed = null;
  const canonicalOrder = callbackBody({
    custom_order_id: '44444444-4444-4444-8444-444444444444',
    remark: 'attacker supplied text',
    package_sku: undefined
  }).data.order;
  const result = await claimAfdianPaymentOrder({
    localOrderId: LOCAL_ORDER_ID,
    actorUserId: '33333333-3333-4333-8333-333333333333',
    providerOrderId: canonicalOrder.out_trade_no,
    env: {
      AFDIAN_PACKAGE_PLAN_ID_MAP: JSON.stringify({ starter: 'plan-starter' })
    },
    repository: {
      claimVerifiedOrder: async (input) => {
        claimed = input;
        return { ok: true, credited: true, replayed: false, credits: 400 };
      }
    },
    reconcileProviderOrder: async () => canonicalOrder
  });

  assert.equal(result.credited, true);
  assert.equal(claimed.localOrderId, LOCAL_ORDER_ID);
  assert.equal(claimed.parsed.localOrderId, LOCAL_ORDER_ID);
  assert.equal(claimed.parsed.appUserId, '');
  assert.equal(claimed.parsed.packageRef, 'starter');
  assert.equal(claimed.parsed.amountMinor, 990);
});

test('signed wrong amount, package, user and unknown orders never credit', async () => {
  const cases = [
    { override: { total_amount: '0.01' }, error: 'AMOUNT_MISMATCH' },
    { override: { package_sku: 'credits.ultimate.v1' }, error: 'PACKAGE_MISMATCH' },
    { override: { app_user_id: 'attacker' }, error: 'USER_MISMATCH' },
    {
      override: { custom_order_id: '44444444-4444-4444-8444-444444444444' },
      error: 'UNKNOWN_ORDER'
    }
  ];

  for (const [index, entry] of cases.entries()) {
    const repository = new FakePaymentRepository();
    const result = await process(
      repository,
      callbackBody({
        out_trade_no: `afdian-rejected-${index}`,
        ...entry.override
      })
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, entry.error);
    assert.equal(repository.creditCount, 0);
    assert.equal(repository.availableCredits, 0);
    assert.deepEqual(repository.rejections.map((item) => item.error), [entry.error]);
  }
});

test('a dead-letter callback can be safely replayed after the local order is repaired', async () => {
  const repository = new FakePaymentRepository({ withOrder: false });
  const body = callbackBody({ out_trade_no: 'afdian-repairable-order' });
  const first = await process(repository, body);
  assert.equal(first.error, 'UNKNOWN_ORDER');
  assert.equal(repository.events.get('afdian-repairable-order').status, 'dead_letter:UNKNOWN_ORDER');

  repository.order = {
    id: LOCAL_ORDER_ID,
    userId: '33333333-3333-4333-8333-333333333333',
    legacyUserId: 'user_target_123',
    packageId: PACKAGE_ID,
    packageSku: 'credits.starter.v1',
    amountMinor: 990,
    credits: 400,
    status: 'pending'
  };
  const repaired = await process(repository, body);
  assert.equal(repaired.credited, true);
  assert.equal(repository.creditCount, 1);
  assert.equal(repository.availableCredits, 400);
  assert.equal(repository.events.get('afdian-repairable-order').attempts, 2);
  assert.equal(repository.events.get('afdian-repairable-order').status, 'processed');

  const replay = await process(repository, body);
  assert.equal(replay.replayed, true);
  assert.equal(repository.creditCount, 1);
});

test('admin reconciliation re-queries a dead-letter provider order before crediting', async () => {
  const repository = new FakePaymentRepository({ withOrder: false });
  const body = callbackBody({ out_trade_no: 'afdian-manual-reconcile' });
  const first = await process(repository, body);
  assert.equal(first.error, 'UNKNOWN_ORDER');
  repository.order = {
    id: LOCAL_ORDER_ID,
    userId: '33333333-3333-4333-8333-333333333333',
    legacyUserId: 'user_target_123',
    packageId: PACKAGE_ID,
    packageSku: 'credits.starter.v1',
    amountMinor: 990,
    credits: 400,
    status: 'pending'
  };

  const reconciled = await reconcileAfdianDeadLetter({
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    actorUserId: '55555555-5555-4555-8555-555555555555',
    repository,
    loadEvent: async () => ({
      providerEventId: 'afdian-manual-reconcile',
      signatureValid: true
    }),
    reconcileProviderOrder: async () => body.data.order,
    env: { AFDIAN_PLAN_PACKAGE_MAP: JSON.stringify({ 'plan-starter': 'starter' }) }
  });
  assert.equal(reconciled.credited, true);
  assert.equal(repository.availableCredits, 400);
  assert.deepEqual(repository.audits.map((entry) => entry.actorUserId), [
    '55555555-5555-4555-8555-555555555555'
  ]);
});

test('payment package short aliases fail closed when more than one active version matches', async () => {
  const client = {
    calls: 0,
    async query() {
      this.calls += 1;
      if (this.calls === 1) return { rowCount: 0, rows: [] };
      return {
        rowCount: 2,
        rows: [
          { id: 'package-v2', sku: 'credits.starter.v2' },
          { id: 'package-v1', sku: 'credits.starter.v1' }
        ]
      };
    }
  };
  await assert.rejects(
    resolveActivePaymentPackage(client, 'starter'),
    { code: 'PACKAGE_ALIAS_AMBIGUOUS', status: 409 }
  );
});

test('explicit RSA mode rejects missing and forged signatures before claiming an event', async () => {
  for (const signature of [
    { ok: false, error: 'MISSING_SIGN' },
    { ok: false, error: 'INVALID_SIGN' }
  ]) {
    const repository = new FakePaymentRepository();
    const body = callbackBody();
    const result = await process(
      repository,
      body,
      () => signature,
      body.data.order,
      { AFDIAN_WEBHOOK_REQUIRE_SIGN: '1' }
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, signature.error);
    assert.equal(repository.events.size, 0);
    assert.equal(repository.creditCount, 0);
  }
});

test('a valid signature cannot rebind unsigned callback fields to another local order', async () => {
  const attackerOrderId = '44444444-4444-4444-8444-444444444444';
  const repository = new FakePaymentRepository({ orderId: attackerOrderId });
  const canonicalOrder = callbackBody().data.order;
  const tampered = callbackBody({ custom_order_id: attackerOrderId });

  const result = await process(repository, tampered, () => ({ ok: true }), canonicalOrder);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'UNKNOWN_ORDER');
  assert.equal(repository.creditCount, 0);
  assert.equal(repository.availableCredits, 0);
});

test('provider reconciliation rejects a different signature-covered order', async () => {
  const repository = new FakePaymentRepository();
  const received = callbackBody();
  const canonicalOrder = { ...received.data.order, total_amount: '19.90' };

  const result = await process(repository, received, () => ({ ok: true }), canonicalOrder);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'PROVIDER_ORDER_MISMATCH');
  assert.equal(repository.events.size, 0);
  assert.equal(repository.creditCount, 0);
});

test('provider API reconciliation request uses the documented token/key ordering', () => {
  const env = { AFDIAN_API_USER_ID: 'creator-id', AFDIAN_API_TOKEN: 'secret-token' };
  const request = buildAfdianApiRequest({
    providerEventId: 'provider-order-1',
    env,
    now: () => 1_720_000_000_000
  });
  const expected = require('node:crypto')
    .createHash('md5')
    .update(
      `secret-tokenparams${request.params}ts${request.ts}user_idcreator-id`,
      'utf8'
    )
    .digest('hex');
  assert.deepEqual(JSON.parse(request.params), { out_trade_no: 'provider-order-1' });
  assert.equal(request.user_id, 'creator-id');
  assert.equal(request.sign, expected);
});

test('only the exact documented Afdian webhook probe is acknowledged without billing', () => {
  const probe = documentedWebhookProbe();
  assert.equal(isAfdianDocumentedWebhookProbe(probe), true);
  assert.equal(
    isAfdianDocumentedWebhookProbe({
      ...probe,
      data: {
        ...probe.data,
        order: { ...probe.data.order, total_amount: '9.90', show_amount: '9.90' }
      }
    }),
    false
  );
  assert.equal(
    isAfdianDocumentedWebhookProbe({
      ...probe,
      data: {
        ...probe.data,
        order: { ...probe.data.order, out_trade_no: '202106232138371083454010627' }
      }
    }),
    false
  );
});

test('production provider queries cannot redirect API credentials to another host', () => {
  assert.equal(requiresAfdianWebhookSignature({ AFDIAN_WEBHOOK_REQUIRE_SIGN: '1' }), true);
  assert.equal(requiresAfdianWebhookSignature({ AFDIAN_WEBHOOK_REQUIRE_SIGN: '0' }), false);
  assert.equal(
    assertAfdianQueryEndpoint('', { NODE_ENV: 'production' }).toString(),
    'https://afdian.com/api/open/query-order'
  );
  assert.throws(
    () => assertAfdianQueryEndpoint(
      'https://attacker.example/query-order',
      { NODE_ENV: 'production' }
    ),
    { code: 'PAYMENT_RECONCILIATION_NOT_CONFIGURED', status: 503 }
  );
});

test('a signed callback fails closed when provider reconciliation is not configured', async () => {
  const repository = new FakePaymentRepository();
  await assert.rejects(
    processAfdianPaymentCallback({
      body: callbackBody(),
      repository,
      verifySignature: () => ({ ok: true }),
      env: { AFDIAN_WEBHOOK_REQUIRE_SIGN: '1' }
    }),
    { code: 'PAYMENT_RECONCILIATION_NOT_CONFIGURED', status: 503 }
  );
  assert.equal(repository.events.size, 0);
  assert.equal(repository.creditCount, 0);
});

test('payment amounts use exact minor units and reject ambiguous decimals', () => {
  assert.equal(parseAmountMinor('9.9'), 990);
  assert.equal(parseAmountMinor('9.90'), 990);
  assert.equal(parseAmountMinor('9.900'), null);
  assert.equal(parseAmountMinor('9e1'), null);
  assert.equal(parseAmountMinor('-1.00'), null);
});

test('payment URL uses only documented checkout parameters and carries no local identity', () => {
  const payUrl = buildAfdianPayUrl(
    {
      orderId: LOCAL_ORDER_ID,
      packageId: PACKAGE_ID,
      packageSku: 'credits.starter.v1',
      userId: 'user_target_123',
      credits: 400
    },
    {
      NODE_ENV: 'production',
      AFDIAN_PACKAGE_PLAN_ID_MAP: JSON.stringify({ starter: 'plan-starter' }),
      AFDIAN_ORDER_CREATE_URL: 'https://afdian.example/order/create'
    }
  );
  const url = new URL(payUrl);
  assert.equal(url.searchParams.get('plan_id'), 'plan-starter');
  assert.equal(url.searchParams.get('product_type'), '0');
  assert.equal(url.searchParams.has('custom_order_id'), false);
  assert.equal(url.searchParams.has('remark'), false);
  assert.equal(payUrl.includes(LOCAL_ORDER_ID), false);
  assert.equal(payUrl.includes('credits.starter.v1'), false);
  assert.equal(payUrl.includes('user_target_123'), false);
  assert.equal(payUrl.includes('credits=400'), false);

  assert.throws(
    () => buildAfdianPayUrl(
      { orderId: LOCAL_ORDER_ID, packageSku: 'credits.starter.v1' },
      { NODE_ENV: 'production', AFDIAN_PAGE_URL: 'http://unsafe.example/pay' }
    ),
    { code: 'PAYMENT_PROVIDER_NOT_CONFIGURED' }
  );
});

test('client payment authority is rejected and JSON billing is dev-only opt-in', () => {
  assert.equal(containsClientPaymentAuthority({ packageId: 'starter' }), false);
  assert.equal(containsClientPaymentAuthority({ packageId: 'starter', credits: 999999 }), true);
  assert.equal(containsClientPaymentAuthority({ packageId: 'starter', userId: 'victim' }), true);
  assert.equal(
    legacyJsonBillingEnabled({ NODE_ENV: 'development', ENABLE_LEGACY_JSON_BILLING: '1' }),
    true
  );
  assert.equal(
    legacyJsonBillingEnabled({ NODE_ENV: 'production', ENABLE_LEGACY_JSON_BILLING: '1' }),
    false
  );
  assert.equal(legacyJsonBillingEnabled({ NODE_ENV: 'development' }), false);
});

test('PG credit compatibility reads preserve legacy shapes without provider identifiers', () => {
  const userId = '33333333-3333-4333-8333-333333333333';
  const balance = publicCreditsBalance({
    user_id: userId,
    legacy_user_id: 'user_target_123',
    available_credits: '900',
    frozen_credits: '100'
  });
  assert.deepEqual(balance, {
    userId: 'user_target_123',
    available: 900,
    frozen: 100,
    lastCheckinDay: ''
  });

  const order = publicCreditsOrder({
    id: LOCAL_ORDER_ID,
    user_id: userId,
    legacy_user_id: 'user_target_123',
    expected_credits: 400,
    package_sku: 'credits.starter.v1',
    provider_order_id: 'must-not-leak',
    status: 'paid',
    paid_at: '2026-07-15T00:00:00.000Z',
    created_at: '2026-07-14T00:00:00.000Z'
  });
  assert.equal(order.afdianOrderId, LOCAL_ORDER_ID);
  assert.equal(order.packageId, 'starter');
  assert.equal(order.credits, 400);
  assert.equal(order.createdAt, Date.parse('2026-07-15T00:00:00.000Z'));
  assert.equal('providerOrderId' in order, false);
  assert.equal(JSON.stringify(order).includes('must-not-leak'), false);

  const statuses = [
    ['held', 'frozen'],
    ['settled', 'confirmed'],
    ['released', 'refunded']
  ];
  for (const [databaseStatus, legacyStatus] of statuses) {
    const hold = publicCreditsHold({
      id: 'hold-id',
      user_id: userId,
      legacy_user_id: 'user_target_123',
      credits: '5',
      status: databaseStatus,
      task_id: 'task-id',
      tool_id: 'old-photo',
      operation: 'enhance',
      idempotency_key: 'task:key:12345678',
      created_at: '2026-07-15T00:00:00.000Z',
      task_updated_at: '2026-07-15T00:01:00.000Z'
    });
    assert.equal(hold.userId, 'user_target_123');
    assert.equal(hold.cost, 5);
    assert.equal(hold.reason, 'enhance');
    assert.equal(hold.status, legacyStatus);
  }
});

test('PG credit reads accept owner aliases and reject requested-user escalation', () => {
  const owner = {
    authUserId: 'user_target_123',
    dbUserId: '33333333-3333-4333-8333-333333333333',
    legacyUserId: 'user_target_123'
  };
  assert.equal(assertRequestedUserOwner('', owner), true);
  assert.equal(assertRequestedUserOwner(owner.authUserId, owner), true);
  assert.equal(assertRequestedUserOwner(owner.dbUserId, owner), true);
  assert.throws(
    () => assertRequestedUserOwner('user_victim_456', owner),
    { code: 'FORBIDDEN', status: 403 }
  );
});
