const assert = require('node:assert/strict');
const test = require('node:test');

const { createAdminToken } = require('../lib/auth-utils');
const { resolveAdminForFiles } = require('../lib/files-admin-auth');

const ADMIN_ID = '22222222-2222-4222-8222-222222222222';

const requestFor = (token) => ({
  headers: { authorization: `Bearer ${token}` }
});

test('/files rechecks PostgreSQL and rejects the same token after administrator revocation', async () => {
  const token = createAdminToken('files-admin@example.test', {
    userId: ADMIN_ID,
    role: 'owner'
  }).token;
  let active = true;
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (!active) return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [{ user_id: ADMIN_ID, role: 'operator', username: 'files-admin' }]
      };
    }
  };

  assert.deepEqual(
    await resolveAdminForFiles(requestFor(token), {
      env: { NODE_ENV: 'production' },
      pool
    }),
    { ok: true, status: 200 }
  );

  active = false;
  assert.deepEqual(
    await resolveAdminForFiles(requestFor(token), {
      env: { NODE_ENV: 'production' },
      pool
    }),
    { ok: false, status: 403 }
  );

  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /a\.active=true/);
  assert.deepEqual(queries[0].params, [ADMIN_ID]);
});

test('/files production fallback rejects legacy tokens and fails closed on database errors', async () => {
  const legacyToken = createAdminToken('legacy-files-admin').token;
  assert.deepEqual(
    await resolveAdminForFiles(requestFor(legacyToken), {
      env: { NODE_ENV: 'production' },
      pool: { query: async () => ({ rowCount: 1, rows: [] }) }
    }),
    { ok: false, status: 403 }
  );

  const databaseToken = createAdminToken('files-admin@example.test', {
    userId: ADMIN_ID,
    role: 'owner'
  }).token;
  assert.deepEqual(
    await resolveAdminForFiles(requestFor(databaseToken), {
      env: { NODE_ENV: 'production' },
      pool: {
        async query() {
          throw new Error('database unavailable');
        }
      }
    }),
    { ok: false, status: 503 }
  );
});
