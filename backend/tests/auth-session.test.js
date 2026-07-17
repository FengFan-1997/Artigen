const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const tempMemory = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-auth-test-'));
process.env.MEMORY_DIR = tempMemory;
process.env.NODE_ENV = 'development';
process.env.CSRF_SECRET = 'auth-session-test-secret';
delete process.env.DATABASE_URL;
delete process.env.DATABASE_MIGRATION_URL;
delete process.env.SESSION_NOT_BEFORE;
delete process.env.AUTH_SESSION_NOT_BEFORE;

const { installAuthRoutes } = require('../routes/auth');
const {
  readUsersMap,
  resetDevelopmentUsers,
  writeUsersMap
} = require('../lib/auth-utils');

const buildFakeApp = () => {
  const routes = new Map();
  const register = (method) => (route, ...handlers) => {
    routes.set(`${method} ${route}`, handlers[handlers.length - 1]);
  };
  return {
    routes,
    get: register('GET'),
    post: register('POST'),
    options: register('OPTIONS'),
    delete: register('DELETE')
  };
};

const response = () => {
  const state = { status: 200, body: null, headers: {} };
  return {
    state,
    status(code) {
      state.status = code;
      return this;
    },
    json(body) {
      state.body = body;
      return this;
    },
    setHeader(name, value) {
      state.headers[String(name).toLowerCase()] = value;
    },
    append(name, value) {
      state.headers[String(name).toLowerCase()] = value;
    },
    end() {}
  };
};

test('session reports cookie authentication without exposing secrets and logout revokes it', async () => {
  writeUsersMap({
    user_test: {
      id: 'user_test',
      username: 'tester',
      email: 'tester@example.com',
      name: 'Tester',
      passwordHash: 'not-public',
      passwordSalt: 'not-public',
      passwordAlgo: 'scrypt',
      sessionToken: 'cookie-session-token',
      sessionTokenIssuedAt: Date.now()
    }
  });

  const app = buildFakeApp();
  installAuthRoutes(app);
  const session = app.routes.get('GET /api/auth/session');
  const logout = app.routes.get('POST /api/auth/logout');
  assert.equal(typeof session, 'function');
  assert.equal(typeof logout, 'function');

  const sessionRes = response();
  await session({ headers: { cookie: 'auth_token=cookie-session-token' } }, sessionRes);
  assert.equal(sessionRes.state.body.ok, true);
  assert.equal(sessionRes.state.body.authenticated, true);
  assert.equal(sessionRes.state.body.userId, 'user_test');
  assert.equal(sessionRes.state.body.user.id, 'user_test');
  assert.ok(sessionRes.state.body.csrfToken);
  assert.equal('sessionToken' in sessionRes.state.body.user, false);
  assert.equal('passwordHash' in sessionRes.state.body.user, false);

  const logoutRes = response();
  await logout({ headers: { cookie: 'auth_token=cookie-session-token' } }, logoutRes);
  assert.equal(logoutRes.state.body.ok, true);
  assert.match(String(logoutRes.state.headers['set-cookie']), /Max-Age=0/);
  const saved = readUsersMap();
  assert.equal(saved.user_test.sessionToken, undefined);

  const afterRes = response();
  await session({ headers: { cookie: 'auth_token=cookie-session-token' } }, afterRes);
  assert.equal(afterRes.state.body.authenticated, false);
});

test.after(() => {
  resetDevelopmentUsers();
  fs.rmSync(tempMemory, { recursive: true, force: true });
});
