const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveAuthUser } = require('../lib/auth-utils');
const { createSessionMiddleware } = require('../middleware/session-auth');
const { createAuthService } = require('../services/auth-service');
const { resolveUserId: resolveBillingUserId } = require('../services/billing-service');

const compact = (sql) => String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();

const createAuthPool = () => {
  const state = {
    users: [],
    identities: [],
    wallets: new Map(),
    ledger: [],
    sessions: [],
    transactions: []
  };
  let userCounter = 0;
  let sessionCounter = 0;

  const query = async (sql, params = []) => {
    const q = compact(sql);
    if (['begin', 'commit', 'rollback'].includes(q)) {
      state.transactions.push(q);
      return { rowCount: 0, rows: [] };
    }
    if (q.startsWith('insert into users')) {
      const [legacyUserId, username, email, displayName, passwordHash] = params;
      const duplicate = state.users.find(
        (user) => user.email === email || user.username === username || user.legacy_user_id === legacyUserId
      );
      if (duplicate) {
        const error = new Error('duplicate');
        error.code = '23505';
        error.constraint = duplicate.email === email ? 'users_email_key' : 'users_username_key';
        throw error;
      }
      const user = {
        id: `00000000-0000-4000-8000-${String(++userCounter).padStart(12, '0')}`,
        legacy_user_id: legacyUserId,
        username,
        email,
        display_name: displayName,
        password_hash: passwordHash || null,
        status: 'active'
      };
      state.users.push(user);
      return { rowCount: 1, rows: [{ ...user }] };
    }
    if (q.startsWith('select id from users where id=$1::uuid')) {
      const user = state.users.find((item) => item.id === params[0]);
      return { rowCount: user ? 1 : 0, rows: user ? [{ id: user.id }] : [] };
    }
    if (q.startsWith('select id from users where legacy_user_id=$1')) {
      const user = state.users.find((item) => item.legacy_user_id === params[0]);
      return { rowCount: user ? 1 : 0, rows: user ? [{ id: user.id }] : [] };
    }
    if (q.startsWith('insert into user_identities')) {
      const [userId, provider, subject] = params;
      let identity = state.identities.find((item) => item.provider === provider && item.subject === subject);
      if (!identity) {
        identity = { user_id: userId, provider, subject };
        state.identities.push(identity);
      }
      return { rowCount: 1, rows: [{ user_id: identity.user_id }] };
    }
    if (q.startsWith('insert into wallets')) {
      const [userId, available] = params;
      if (state.wallets.has(userId)) return { rowCount: 0, rows: [] };
      const wallet = { available_credits: Number(available), frozen_credits: 0 };
      state.wallets.set(userId, wallet);
      return { rowCount: 1, rows: [{ ...wallet }] };
    }
    if (q.startsWith('insert into wallet_ledger')) {
      state.ledger.push({
        userId: params[0],
        credits: Number(params[1]),
        referenceId: params[2],
        key: params[3]
      });
      return { rowCount: 1, rows: [] };
    }
    if (q.startsWith('select available_credits, frozen_credits from wallets')) {
      const wallet = state.wallets.get(params[0]);
      return { rowCount: wallet ? 1 : 0, rows: wallet ? [{ ...wallet }] : [] };
    }
    if (q.startsWith('insert into sessions')) {
      const [userId, tokenHash, csrfHash, userAgentHash, expiresAt, createdAt] = params;
      const session = {
        id: `10000000-0000-4000-8000-${String(++sessionCounter).padStart(12, '0')}`,
        user_id: userId,
        token_hash: Buffer.from(tokenHash),
        csrf_hash: Buffer.from(csrfHash),
        user_agent_hash: userAgentHash ? Buffer.from(userAgentHash) : null,
        expires_at: expiresAt,
        created_at: createdAt,
        revoked_at: null,
        last_seen_at: createdAt
      };
      state.sessions.push(session);
      return {
        rowCount: 1,
        rows: [{ id: session.id, created_at: createdAt, expires_at: expiresAt }]
      };
    }
    if (q.includes('from users') && q.includes('where username=$1 or email=$1') && q.includes('for update')) {
      const login = String(params[0]).toLowerCase();
      const user = state.users.find((item) => item.username === login || item.email === login);
      return { rowCount: user ? 1 : 0, rows: user ? [{ ...user }] : [] };
    }
    if (q.startsWith('update users set password_hash=')) {
      const user = state.users.find((item) => item.id === params[0]);
      if (user) user.password_hash = params[1];
      return { rowCount: user ? 1 : 0, rows: [] };
    }
    if (q.includes('from sessions s join users u')) {
      const expected = Buffer.from(params[0]);
      const session = state.sessions.find(
        (item) => item.token_hash.length === expected.length && item.token_hash.equals(expected)
      );
      if (!session) return { rowCount: 0, rows: [] };
      const user = state.users.find((item) => item.id === session.user_id);
      return {
        rowCount: 1,
        rows: [{
          session_id: session.id,
          user_id: session.user_id,
          session_created_at: session.created_at,
          expires_at: session.expires_at,
          revoked_at: session.revoked_at,
          ...user
        }]
      };
    }
    if (q.startsWith('update sessions set last_seen_at=')) {
      return { rowCount: 1, rows: [] };
    }
    if (q.startsWith('update sessions set revoked_at=')) {
      const session = state.sessions.find((item) => item.id === params[0]);
      if (session && !session.revoked_at) session.revoked_at = new Date();
      return {
        rowCount: session ? 1 : 0,
        rows: session ? [{ id: session.id, revoked_at: session.revoked_at }] : []
      };
    }
    throw new Error(`Unhandled fake auth SQL: ${q}`);
  };

  return {
    state,
    query,
    async connect() {
      return { query, release() {} };
    }
  };
};

test('PostgreSQL login creates one wallet and restart-safe hashed sessions', async () => {
  const pool = createAuthPool();
  const clock = { value: new Date('2026-07-15T00:00:00.000Z') };
  const env = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://test',
    SESSION_TOKEN_HASH_SECRET: 'session-hash-secret-for-tests',
    CSRF_SECRET: 'csrf-secret-for-tests',
    CREDITS_INIT: '125'
  };
  const firstProcess = createAuthService({ pool, env, now: () => new Date(clock.value) });
  const registered = await firstProcess.registerWithPassword({
    legacyUserId: 'user_restart',
    username: 'restart-user',
    email: 'restart@example.com',
    displayName: 'Restart User',
    password: 'StrongPass123',
    userAgent: 'test-agent'
  });

  assert.equal(registered.wallet.available, 125);
  assert.equal(pool.state.wallets.size, 1);
  assert.equal(pool.state.ledger.length, 1);
  assert.equal(pool.state.ledger[0].referenceId, registered.user.dbUserId);
  assert.equal(pool.state.ledger[0].key, `signup:${registered.user.dbUserId}`);
  const billingClient = await pool.connect();
  assert.equal(
    await resolveBillingUserId(billingClient, registered.user.userId),
    registered.user.dbUserId,
    'the login user alias must resolve to the wallet owner used by billing'
  );
  billingClient.release();
  assert.ok(registered.session.token);
  assert.equal('token' in pool.state.sessions[0], false);
  assert.ok(Buffer.isBuffer(pool.state.sessions[0].token_hash));
  assert.notEqual(pool.state.sessions[0].token_hash.toString('hex'), registered.session.token);

  // A new service instance simulates a process restart; no in-process session map is needed.
  const restartedProcess = createAuthService({ pool, env, now: () => new Date(clock.value) });
  const restored = await restartedProcess.resolveSession(registered.session.token);
  assert.equal(restored.ok, true);
  assert.equal(restored.userId, 'user_restart');
  assert.equal(restored.email, 'restart@example.com');

  const loggedIn = await restartedProcess.authenticatePassword({
    login: 'restart-user',
    password: 'StrongPass123',
    userAgent: 'second-agent'
  });
  assert.equal(loggedIn.user.userId, 'user_restart');
  assert.equal(pool.state.wallets.size, 1);
  assert.equal(pool.state.ledger.length, 1, 'repeat login must not grant signup credits twice');

  await restartedProcess.revokeSession(loggedIn.session.sessionId);
  const afterLogout = await restartedProcess.resolveSession(loggedIn.session.token);
  assert.deepEqual(
    { ok: afterLogout.ok, error: afterLogout.error },
    { ok: false, error: 'SESSION_INVALID' }
  );
  assert.ok(pool.state.transactions.includes('begin'));
  assert.ok(pool.state.transactions.includes('commit'));
});

test('database sessions reject expiry and SESSION_NOT_BEFORE', async () => {
  const pool = createAuthPool();
  const clock = { value: new Date('2026-07-15T00:00:00.000Z') };
  const env = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://test',
    SESSION_TOKEN_HASH_SECRET: 'session-hash-secret-for-tests',
    CSRF_SECRET: 'csrf-secret-for-tests',
    SESSION_TTL_MS: '60000'
  };
  const service = createAuthService({ pool, env, now: () => new Date(clock.value) });
  const account = await service.registerWithPassword({
    legacyUserId: 'user_expiry',
    username: 'expiry-user',
    email: 'expiry@example.com',
    displayName: 'Expiry User',
    password: 'StrongPass123'
  });
  clock.value = new Date('2026-07-15T00:01:01.000Z');
  const expired = await service.resolveSession(account.session.token);
  assert.equal(expired.error, 'SESSION_EXPIRED');

  const fresh = await service.authenticatePassword({
    login: 'expiry-user',
    password: 'StrongPass123'
  });
  env.SESSION_NOT_BEFORE = new Date(clock.value.getTime() + 1).toISOString();
  const invalidated = await service.resolveSession(fresh.session.token);
  assert.equal(invalidated.error, 'SESSION_INVALID');
});

test('production middleware rejects bearer user auth before session lookup', async () => {
  let lookups = 0;
  const middleware = createSessionMiddleware({
    env: { NODE_ENV: 'production', DATABASE_URL: 'postgres://test' },
    authService: {
      async resolveSession() {
        lookups += 1;
        return { ok: true, userId: 'should-not-run' };
      }
    }
  });
  const req = { headers: { authorization: 'Bearer legacy-user-token' } };
  await new Promise((resolve) => middleware(req, {}, resolve));
  assert.equal(lookups, 0);
  assert.deepEqual(resolveAuthUser(req), {
    ok: false,
    status: 401,
    error: 'BEARER_AUTH_DISABLED'
  });
});
