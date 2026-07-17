const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { getPool } = require('../db/pool');
const {
  claimAfdianPaymentOrder,
  processAfdianPaymentCallback
} = require('../services/payment-service');

const hasDatabase = Boolean(String(process.env.DATABASE_URL || '').trim());

const createFixture = async ({ withWallet = true, initialCredits = 10 } = {}) => {
  const suffix = crypto.randomUUID();
  const legacyUserId = `payment_pg_${suffix}`;
  const user = await getPool().query(
    `INSERT INTO users (legacy_user_id, username, display_name)
     VALUES ($1::text,$1::citext,$1::text) RETURNING id`,
    [legacyUserId]
  );
  if (withWallet) {
    await getPool().query(
      `INSERT INTO wallets (user_id, available_credits, frozen_credits)
       VALUES ($1,$2,0)`,
      [user.rows[0].id, initialCredits]
    );
  }
  const sku = `credits.pg${suffix.replace(/-/g, '')}.v1`;
  const paymentPackage = await getPool().query(
    `INSERT INTO payment_packages (sku, title, amount_minor, currency, credits, active)
     VALUES ($1,'PG payment fixture',1234,'CNY',77,true) RETURNING id`,
    [sku]
  );
  const order = await getPool().query(
    `INSERT INTO payment_orders
      (user_id, package_id, provider, expected_amount_minor, currency,
       expected_credits, status)
     VALUES ($1,$2,'afdian',1234,'CNY',77,'pending') RETURNING id`,
    [user.rows[0].id, paymentPackage.rows[0].id]
  );
  return {
    dbUserId: user.rows[0].id,
    legacyUserId,
    packageId: paymentPackage.rows[0].id,
    sku,
    orderId: order.rows[0].id
  };
};

const callbackBody = (fixture, providerEventId) => ({
  sign: 'verified-by-fixture',
  data: {
    order: {
      status: 2,
      out_trade_no: providerEventId,
      total_amount: '12.34',
      custom_order_id: fixture.orderId,
      package_sku: fixture.sku,
      app_user_id: fixture.legacyUserId
    }
  }
});

const processFixture = (body) => processAfdianPaymentCallback({
  body,
  verifySignature: () => ({ ok: true }),
  reconcileProviderOrder: ({ receivedOrder }) => receivedOrder
});

test('PostgreSQL rejects UUID-shaped legacy IDs and duplicate active package aliases', {
  skip: !hasDatabase
}, async () => {
  await assert.rejects(
    getPool().query(
      `INSERT INTO users (legacy_user_id, username, display_name)
       VALUES ($1,$2,'namespace collision fixture')`,
      [crypto.randomUUID(), `namespace_${crypto.randomUUID()}`]
    ),
    { code: '23514', constraint: 'users_legacy_id_not_uuid' }
  );

  const alias = `alias${crypto.randomUUID().replace(/-/g, '')}`;
  await getPool().query(
    `INSERT INTO payment_packages (sku, title, amount_minor, currency, credits, active)
     VALUES ($1,'alias v1',100,'CNY',1,true)`,
    [`credits.${alias}.v1`]
  );
  await assert.rejects(
    getPool().query(
      `INSERT INTO payment_packages (sku, title, amount_minor, currency, credits, active)
       VALUES ($1,'alias v2',200,'CNY',2,true)`,
      [`credits.${alias}.v2`]
    ),
    { code: '23505', constraint: 'payment_packages_active_alias_unique' }
  );
});

test('50 PostgreSQL copies of one verified payment event credit exactly once', {
  skip: !hasDatabase
}, async () => {
  const fixture = await createFixture();
  const providerEventId = `afdian-pg-same-${crypto.randomUUID()}`;
  const body = callbackBody(fixture, providerEventId);
  const results = await Promise.all(Array.from({ length: 50 }, () => processFixture(body)));
  assert.equal(results.filter((result) => result.credited).length, 1);
  assert.equal(results.filter((result) => result.replayed).length, 49);

  const state = await getPool().query(
    `SELECT w.available_credits,
            (SELECT count(*)::int FROM wallet_ledger
              WHERE user_id=$1 AND entry_type='purchase') AS purchases,
            (SELECT count(*)::int FROM payment_callback_events
              WHERE provider='afdian' AND provider_event_id=$2) AS events
       FROM wallets w WHERE w.user_id=$1`,
    [fixture.dbUserId, providerEventId]
  );
  assert.deepEqual({
    available: Number(state.rows[0].available_credits),
    purchases: Number(state.rows[0].purchases),
    events: Number(state.rows[0].events)
  }, { available: 87, purchases: 1, events: 1 });
});

test('50 authenticated claims of one paid provider order credit the local order once', {
  skip: !hasDatabase
}, async () => {
  const fixture = await createFixture();
  const providerEventId = `afdian-pg-claim-${crypto.randomUUID()}`;
  const canonicalOrder = callbackBody(fixture, providerEventId).data.order;
  canonicalOrder.custom_order_id = crypto.randomUUID();
  canonicalOrder.app_user_id = 'unrelated-afdian-user';
  const results = await Promise.all(Array.from({ length: 50 }, () =>
    claimAfdianPaymentOrder({
      localOrderId: fixture.orderId,
      actorUserId: fixture.dbUserId,
      providerOrderId: providerEventId,
      reconcileProviderOrder: async () => canonicalOrder
    })
  ));
  assert.equal(results.filter((result) => result.credited).length, 1);
  assert.equal(results.filter((result) => result.replayed).length, 49);
  const state = await getPool().query(
    `SELECT po.provider_order_id, w.available_credits,
            (SELECT count(*)::int FROM wallet_ledger
              WHERE user_id=$1 AND entry_type='purchase') AS purchases
       FROM payment_orders po
       JOIN wallets w ON w.user_id=po.user_id
      WHERE po.id=$2`,
    [fixture.dbUserId, fixture.orderId]
  );
  assert.deepEqual({
    providerOrderId: state.rows[0].provider_order_id,
    available: Number(state.rows[0].available_credits),
    purchases: Number(state.rows[0].purchases)
  }, { providerOrderId: providerEventId, available: 87, purchases: 1 });
});

test('two verified provider events for one local order still credit once', {
  skip: !hasDatabase
}, async () => {
  const fixture = await createFixture();
  const bodies = [
    callbackBody(fixture, `afdian-pg-double-a-${crypto.randomUUID()}`),
    callbackBody(fixture, `afdian-pg-double-b-${crypto.randomUUID()}`)
  ];
  const results = await Promise.all(bodies.map(processFixture));
  assert.equal(results.filter((result) => result.credited).length, 1);
  assert.equal(results.filter((result) => result.error === 'ORDER_NOT_PENDING').length, 1);
  const state = await getPool().query(
    `SELECT available_credits,
            (SELECT count(*)::int FROM wallet_ledger
              WHERE user_id=$1 AND entry_type='purchase') AS purchases
       FROM wallets WHERE user_id=$1`,
    [fixture.dbUserId]
  );
  assert.equal(Number(state.rows[0].available_credits), 87);
  assert.equal(Number(state.rows[0].purchases), 1);
});

test('payment transaction failure rolls back the event claim and can be retried', {
  skip: !hasDatabase
}, async () => {
  const fixture = await createFixture({ withWallet: false });
  const providerEventId = `afdian-pg-rollback-${crypto.randomUUID()}`;
  const body = callbackBody(fixture, providerEventId);
  await assert.rejects(processFixture(body), { code: 'WALLET_NOT_FOUND' });
  const rolledBack = await getPool().query(
    `SELECT 1 FROM payment_callback_events
      WHERE provider='afdian' AND provider_event_id=$1`,
    [providerEventId]
  );
  assert.equal(rolledBack.rowCount, 0);

  await getPool().query(
    `INSERT INTO wallets (user_id, available_credits, frozen_credits)
     VALUES ($1,10,0)`,
    [fixture.dbUserId]
  );
  const retried = await processFixture(body);
  assert.equal(retried.credited, true);
  const wallet = await getPool().query(
    'SELECT available_credits FROM wallets WHERE user_id=$1',
    [fixture.dbUserId]
  );
  assert.equal(Number(wallet.rows[0].available_credits), 87);
});

test('a verified purchase can credit a wallet beyond PostgreSQL INT_MAX', {
  skip: !hasDatabase
}, async () => {
  const fixture = await createFixture({ initialCredits: 2_147_483_647 });
  const providerEventId = `afdian-pg-bigint-${crypto.randomUUID()}`;
  const result = await processFixture(callbackBody(fixture, providerEventId));
  assert.equal(result.credited, true);
  const wallet = await getPool().query(
    'SELECT available_credits FROM wallets WHERE user_id=$1',
    [fixture.dbUserId]
  );
  assert.equal(Number(wallet.rows[0].available_credits), 2_147_483_724);
});
