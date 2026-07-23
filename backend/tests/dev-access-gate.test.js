const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEV_ACCESS_COOKIE,
  createDevAccessGate,
  devAccessEnabled,
  readBasicCredentials
} = require('../lib/dev-access-gate');

const response = () => {
  const state = { status: 200, headers: {}, body: '' };
  return {
    state,
    setHeader(name, value) {
      state.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      state.status = code;
      return this;
    },
    send(body) {
      state.body = body;
      return this;
    }
  };
};

test('DEV access gate is disabled unless a password is configured', () => {
  assert.equal(devAccessEnabled({}), false);
  assert.equal(devAccessEnabled({ DEV_ACCESS_PASSWORD: '  ' }), false);
  assert.equal(devAccessEnabled({ DEV_ACCESS_PASSWORD: 'private-value' }), true);

  let nextCalls = 0;
  createDevAccessGate({ env: {} })(
    { path: '/', headers: {} },
    response(),
    () => { nextCalls += 1; }
  );
  assert.equal(nextCalls, 1);
});

test('DEV access gate protects the app and accepts exact Basic credentials', () => {
  const gate = createDevAccessGate({
    env: {
      DEV_ACCESS_USERNAME: 'artigen-dev',
      DEV_ACCESS_PASSWORD: 'independent-dev-password'
    }
  });
  const denied = response();
  gate({ path: '/artigen', headers: {} }, denied, () => assert.fail('must not continue'));
  assert.equal(denied.state.status, 401);
  assert.match(denied.state.headers['www-authenticate'], /^Basic /);
  assert.equal(denied.state.headers['cache-control'], 'no-store');

  let nextCalls = 0;
  const authorization = `Basic ${Buffer.from(
    'artigen-dev:independent-dev-password'
  ).toString('base64')}`;
  gate(
    { path: '/artigen', headers: { authorization } },
    response(),
    () => { nextCalls += 1; }
  );
  assert.equal(nextCalls, 1);
  assert.deepEqual(readBasicCredentials(authorization), {
    username: 'artigen-dev',
    password: 'independent-dev-password'
  });
});

test('DEV access gate leaves only the platform health check public', () => {
  const gate = createDevAccessGate({
    env: { DEV_ACCESS_PASSWORD: 'independent-dev-password' }
  });
  let nextCalls = 0;
  gate({ path: '/healthz', headers: {} }, response(), () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);

  const ready = response();
  gate({ path: '/readyz', headers: {} }, ready, () => assert.fail('must not continue'));
  assert.equal(ready.state.status, 401);
});

test('DEV access gate exchanges Basic auth for a secure cookie so Bearer auth remains usable', () => {
  let currentTime = 1_800_000_000_000;
  const gate = createDevAccessGate({
    env: {
      DEV_ACCESS_USERNAME: 'artigen-dev',
      DEV_ACCESS_PASSWORD: 'independent-dev-password',
      DEV_ACCESS_COOKIE_TTL_HOURS: '2'
    },
    now: () => currentTime
  });
  const authorization = `Basic ${Buffer.from(
    'artigen-dev:independent-dev-password'
  ).toString('base64')}`;
  const basicResponse = response();
  let basicNextCalls = 0;
  gate(
    { path: '/console', headers: { authorization } },
    basicResponse,
    () => { basicNextCalls += 1; }
  );
  assert.equal(basicNextCalls, 1);

  const setCookie = String(basicResponse.state.headers['set-cookie'] || '');
  assert.match(setCookie, new RegExp(`^${DEV_ACCESS_COOKIE}=`));
  assert.match(setCookie, /Max-Age=7200/);
  assert.match(setCookie, /Path=\//);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(';')[0];

  let bearerNextCalls = 0;
  gate(
    {
      path: '/api/admin/me',
      headers: {
        authorization: 'Bearer short-lived-admin-token',
        cookie
      }
    },
    response(),
    () => { bearerNextCalls += 1; }
  );
  assert.equal(bearerNextCalls, 1);

  currentTime += 2 * 60 * 60 * 1000 + 1;
  const expired = response();
  gate(
    {
      path: '/api/admin/me',
      headers: {
        authorization: 'Bearer short-lived-admin-token',
        cookie
      }
    },
    expired,
    () => assert.fail('expired cookie must not continue')
  );
  assert.equal(expired.state.status, 401);
});
