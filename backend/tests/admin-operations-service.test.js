const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AdminOperationsError,
  createAdminOperationsService
} = require('../services/admin-operations-service');

const ACTOR_ID = '16c07d40-bbb0-4d65-9d4f-7bc6f9c9e63b';
const USER_ID = 'dd44e50b-1e0b-4e47-8aa3-d1008f30eb39';

test('admin overview maps operational data into stable dashboard groups', async () => {
  const pool = {
    connect: async () => ({ release() {} }),
    query: async () => ({
      rows: [{
        users_total: '20',
        users_new_7d: '4',
        users_active_24h: '7',
        credits_available: '800',
        credits_frozen: '15',
        ledger_entries_24h: '12',
        overdue_holds: '2',
        orders_7d: '5',
        first_buyers_7d: '3',
        repeat_buyers_7d: '2',
        revenue_minor_7d: '9900',
        tasks_24h: '30',
        tasks_success_24h: '27',
        tasks_failed_24h: '3',
        behavior_events_24h: '180',
        page_views_24h: '80',
        clicks_24h: '90',
        audit_events_24h: '6',
        projects_total: '18',
        projects_created_7d: '6',
        projects_success_7d: '4',
        north_star_projects_7d: '3',
        d1_eligible: '10',
        d1_returned: '4',
        d7_eligible: '8',
        d7_returned: '2',
        costed_success_tasks_7d: '20',
        estimated_task_revenue_minor_7d: '1200',
        provider_cost_minor_7d: '480',
        tasks_below_margin_7d: '1'
      }]
    })
  };
  const overview = await createAdminOperationsService({ pool }).getOverview();

  assert.deepEqual(overview.users, { total: 20, new7d: 4, active24h: 7 });
  assert.deepEqual(overview.credits, {
    available: 800,
    frozen: 15,
    ledgerEntries24h: 12,
    overdueHolds: 2
  });
  assert.deepEqual(overview.generation, { tasks24h: 30, success24h: 27, failed24h: 3 });
  assert.equal(overview.behavior.clicks24h, 90);
  assert.deepEqual(overview.projects, {
    total: 18,
    created7d: 6,
    successful7d: 4,
    northStar7d: 3
  });
  assert.equal(overview.retention.d1.rate, 0.4);
  assert.equal(overview.retention.d7.rate, 0.25);
  assert.equal(overview.economics.estimatedGrossMargin7d, 0.6);
});

test('credit ledger is read from the immutable PostgreSQL ledger', async () => {
  const queries = [];
  const pool = {
    connect: async () => ({ release() {} }),
    query: async (sql, values) => {
      queries.push({ sql, values });
      if (/count\(\*\)::bigint AS count/.test(sql)) return { rows: [{ count: '1' }] };
      return {
        rows: [{
          id: '88',
          entryType: 'admin_adjustment',
          deltaAvailable: '10',
          deltaFrozen: '0',
          balanceAvailable: '110',
          balanceFrozen: '0',
          referenceType: 'admin',
          referenceId: 'change-1',
          createdAt: new Date('2026-07-23T01:00:00.000Z'),
          userId: 'customer-42',
          username: 'customer',
          email: 'customer@example.test'
        }]
      };
    }
  };
  const result = await createAdminOperationsService({ pool }).listCreditLedger({
    userId: 'customer-42',
    entryType: 'admin_adjustment',
    limit: 20
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].deltaAvailable, 10);
  assert.equal(result.items[0].balanceAvailable, 110);
  assert.match(queries[0].sql, /FROM wallet_ledger/);
});

test('status changes revoke sessions and append an attributable audit event', async () => {
  const calls = [];
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
      if (/FROM users WHERE id=/.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: USER_ID,
            legacy_user_id: 'customer-42',
            username: 'customer',
            email: 'customer@example.test',
            display_name: 'Customer',
            status: 'active'
          }]
        };
      }
      if (/UPDATE users/.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: USER_ID,
            legacy_user_id: 'customer-42',
            username: 'customer',
            email: 'customer@example.test',
            display_name: 'Customer',
            status: 'disabled',
            updated_at: new Date('2026-07-23T02:00:00.000Z')
          }]
        };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const pool = {
    query: async () => ({ rows: [] }),
    connect: async () => client
  };
  const user = await createAdminOperationsService({ pool }).updateUserStatus({
    userId: USER_ID,
    status: 'disabled',
    actorUserId: ACTOR_ID,
    requestId: 'request-1'
  });

  assert.equal(user.status, 'disabled');
  assert.equal(calls.some((entry) => /UPDATE sessions/.test(entry.sql)), true);
  const audit = calls.find((entry) => /INSERT INTO audit_events/.test(entry.sql));
  assert.ok(audit);
  assert.equal(audit.values[0], ACTOR_ID);
  assert.equal(JSON.parse(audit.values[3]).to, 'disabled');
});

test('an administrator cannot disable their own account', async () => {
  const client = {
    query: async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      return {
        rowCount: 1,
        rows: [{
          id: ACTOR_ID,
          legacy_user_id: 'owner',
          username: 'owner',
          status: 'active'
        }]
      };
    },
    release() {}
  };
  const service = createAdminOperationsService({
    pool: {
      query: async () => ({ rows: [] }),
      connect: async () => client
    }
  });

  await assert.rejects(
    service.updateUserStatus({
      userId: ACTOR_ID,
      status: 'disabled',
      actorUserId: ACTOR_ID
    }),
    (error) =>
      error instanceof AdminOperationsError &&
      error.code === 'ADMIN_CANNOT_DISABLE_SELF' &&
      error.status === 409
  );
});
