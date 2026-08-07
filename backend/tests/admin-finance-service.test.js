const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AdminFinanceError,
  normalizeIdempotencyKey,
  resolveAdminFinancialDataSource,
  withPoolTransaction
} = require('../services/admin-finance-service');

test('admin finance source is PostgreSQL first, legacy only by explicit development opt-in', () => {
  assert.equal(resolveAdminFinancialDataSource({
    env: { NODE_ENV: 'production', DATABASE_URL: 'postgres://database' }
  }), 'postgres');
  assert.equal(resolveAdminFinancialDataSource({
    env: { NODE_ENV: 'development', DATABASE_URL: 'postgres://database', ENABLE_LEGACY_JSON_BILLING: '1' }
  }), 'postgres');
  assert.equal(resolveAdminFinancialDataSource({
    env: { NODE_ENV: 'development', ENABLE_LEGACY_JSON_BILLING: '1' }
  }), 'legacy');
  assert.equal(resolveAdminFinancialDataSource({
    env: { NODE_ENV: 'development' }
  }), 'unavailable');
  assert.equal(resolveAdminFinancialDataSource({
    env: { NODE_ENV: 'production', ENABLE_LEGACY_JSON_BILLING: '1' }
  }), 'unavailable');
});

test('admin adjustment idempotency keys are opaque, stable across actors and validated', () => {
  const first = normalizeIdempotencyKey({ key: 'request:12345678', actor: 'owner' });
  assert.match(first, /^admin-adjust:[a-f0-9]{64}$/);
  assert.equal(first, normalizeIdempotencyKey({ key: 'request:12345678', actor: 'owner' }));
  assert.equal(first, normalizeIdempotencyKey({ key: 'request:12345678', actor: 'operator' }));
  assert.throws(() => normalizeIdempotencyKey({ key: '', actor: 'owner' }), AdminFinanceError);
  assert.throws(() => normalizeIdempotencyKey({ key: 'contains spaces', actor: 'owner' }), {
    code: 'INVALID_IDEMPOTENCY_KEY'
  });
});

test('admin finance transaction commits and always releases the client', async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      return { rows: [], rowCount: 0 };
    },
    release: () => calls.push('RELEASE')
  };
  const pool = { connect: async () => client };
  const value = await withPoolTransaction(pool, async () => 'done');
  assert.equal(value, 'done');
  assert.deepEqual(calls, ['BEGIN', 'COMMIT', 'RELEASE']);
});

test('admin finance transaction rolls back and releases on failure', async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      return { rows: [], rowCount: 0 };
    },
    release: () => calls.push('RELEASE')
  };
  const pool = { connect: async () => client };
  await assert.rejects(
    withPoolTransaction(pool, async () => {
      throw new Error('boom');
    }),
    /boom/
  );
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});
