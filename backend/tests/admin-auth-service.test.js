const assert = require('node:assert/strict');
const test = require('node:test');

const { createAdminToken } = require('../lib/auth-utils');
const {
  AdminAuthorizationError,
  findActiveAdministrator,
  requireActiveAdministrator,
  roleAtLeast
} = require('../services/admin-auth-service');

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

const requestFor = (token) => ({
  headers: { authorization: `Bearer ${token}` }
});

test('administrator role ordering is explicit', () => {
  assert.equal(roleAtLeast('owner', 'admin'), true);
  assert.equal(roleAtLeast('admin', 'operator'), true);
  assert.equal(roleAtLeast('operator', 'admin'), false);
  assert.equal(roleAtLeast('unknown', 'operator'), false);
});

test('financial admin authorization rechecks the active PostgreSQL role', async () => {
  const issued = createAdminToken('owner@example.test', { userId: ADMIN_ID, role: 'owner' });
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rowCount: 1,
        rows: [{ user_id: ADMIN_ID, role: 'admin', username: 'owner@example.test' }]
      };
    }
  };
  const principal = await requireActiveAdministrator({
    req: requestFor(issued.token),
    minimumRole: 'admin',
    pool,
    env: { NODE_ENV: 'production' }
  });
  assert.deepEqual(principal, {
    actorUserId: ADMIN_ID,
    role: 'admin',
    username: 'owner@example.test'
  });
  assert.match(calls[0].sql, /a\.active=true/);
  assert.deepEqual(calls[0].params, [ADMIN_ID]);
});

test('revoked, insufficient and legacy-only production admin tokens fail closed', async () => {
  const activeToken = createAdminToken('operator', { userId: ADMIN_ID, role: 'owner' }).token;
  await assert.rejects(
    requireActiveAdministrator({
      req: requestFor(activeToken),
      minimumRole: 'operator',
      pool: { query: async () => ({ rowCount: 0, rows: [] }) },
      env: { NODE_ENV: 'production' }
    }),
    { code: 'ADMIN_ROLE_REVOKED', status: 403 }
  );
  await assert.rejects(
    requireActiveAdministrator({
      req: requestFor(activeToken),
      minimumRole: 'admin',
      pool: {
        query: async () => ({
          rowCount: 1,
          rows: [{ user_id: ADMIN_ID, role: 'operator', username: 'operator' }]
        })
      },
      env: { NODE_ENV: 'production' }
    }),
    { code: 'ADMIN_ROLE_INSUFFICIENT', status: 403 }
  );

  const legacyToken = createAdminToken('legacy-admin').token;
  await assert.rejects(
    requireActiveAdministrator({
      req: requestFor(legacyToken),
      minimumRole: 'operator',
      pool: { query: async () => ({ rowCount: 1, rows: [] }) },
      env: { NODE_ENV: 'production' }
    }),
    AdminAuthorizationError
  );
});

test('admin login identity resolves one active database principal', async () => {
  const pool = {
    async query(_sql, params) {
      assert.deepEqual(params, ['owner@example.test']);
      return {
        rowCount: 1,
        rows: [{
          user_id: ADMIN_ID,
          role: 'owner',
          username: 'owner',
          email: 'owner@example.test',
          legacy_user_id: 'owner-legacy'
        }]
      };
    }
  };
  assert.deepEqual(await findActiveAdministrator({
    username: 'owner@example.test',
    pool
  }), {
    actorUserId: ADMIN_ID,
    role: 'owner',
    username: 'owner'
  });
});
