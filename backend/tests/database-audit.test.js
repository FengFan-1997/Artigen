const assert = require('node:assert/strict');
const test = require('node:test');

const {
  COUNT_CHECKS,
  REQUIRED_TABLES,
  runDatabaseAudit
} = require('../scripts/lib/database-audit');

class AuditClient {
  constructor({ missingTables = [], violations = {}, throwOn = '' } = {}) {
    this.missingTables = new Set(missingTables);
    this.violations = violations;
    this.throwOn = throwOn;
    this.queries = [];
  }

  async query(sql) {
    const text = String(sql);
    this.queries.push(text);
    if (text.includes('FROM pg_catalog.pg_tables')) {
      return {
        rows: REQUIRED_TABLES
          .filter((table) => !this.missingTables.has(table))
          .map((tablename) => ({ tablename }))
      };
    }
    const marker = text.match(/artigen_database_audit:([a-z0-9_:]+)/i)?.[1] || '';
    if (marker) {
      if (marker === this.throwOn) throw new Error(`query failed: ${marker}`);
      return {
        rows: [{ violations: String(this.violations[marker] || '0') }]
      };
    }
    return { rows: [] };
  }
}

test('database audit runs every invariant in one read-only repeatable-read snapshot', async () => {
  const client = new AuditClient();
  const checkedAt = new Date('2026-07-16T00:00:00.000Z');
  const result = await runDatabaseAudit(client, { now: checkedAt });

  assert.equal(result.ok, true);
  assert.equal(result.checkedAt, checkedAt.toISOString());
  assert.equal(result.totalViolations, '0');
  assert.deepEqual(result.failedChecks, []);
  assert.equal(
    result.checks.length,
    REQUIRED_TABLES.length + COUNT_CHECKS.length
  );
  assert.equal(client.queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(client.queries.at(-1), 'COMMIT');
  for (const definition of COUNT_CHECKS) {
    assert.equal(
      client.queries.some((query) =>
        query.includes(`artigen_database_audit:${definition.name}`)
      ),
      true,
      definition.name
    );
  }
});

test('database audit returns stable failed check names and aggregate counts', async () => {
  const client = new AuditClient({
    violations: {
      wallet_matches_ledger_tail: '2',
      payment_order_callback_and_ledger: '1'
    }
  });
  const result = await runDatabaseAudit(client);

  assert.equal(result.ok, false);
  assert.equal(result.totalViolations, '3');
  assert.deepEqual(result.failedChecks, [
    'wallet_matches_ledger_tail',
    'payment_order_callback_and_ledger'
  ]);
});

test('database audit reports missing tables and skips unsafe dependent queries', async () => {
  const client = new AuditClient({ missingTables: ['wallets'] });
  const result = await runDatabaseAudit(client);

  assert.equal(result.ok, false);
  assert.equal(result.totalViolations, '1');
  assert.equal(result.failedChecks.includes('required_table:wallets'), true);
  const walletCheck = result.checks.find((check) => check.name === 'wallet_nonnegative');
  assert.deepEqual(walletCheck, {
    name: 'wallet_nonnegative',
    ok: false,
    violations: '0',
    skipped: true,
    reason: 'required_table_missing',
    missingTables: ['wallets']
  });
  assert.equal(
    client.queries.some((query) =>
      query.includes('artigen_database_audit:wallet_nonnegative')
    ),
    false
  );
});

test('database audit rolls back when a PostgreSQL check fails to execute', async () => {
  const client = new AuditClient({ throwOn: 'wallet_ledger_chain' });
  await assert.rejects(
    runDatabaseAudit(client),
    /query failed: wallet_ledger_chain/
  );
  assert.equal(client.queries.at(-1), 'ROLLBACK');
});
