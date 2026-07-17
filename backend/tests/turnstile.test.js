const assert = require('node:assert/strict');
const test = require('node:test');

const {
  TURNSTILE_VERIFY_URL,
  checkTurnstileHostnameConfiguration,
  verifyTurnstileToken
} = require('../lib/turnstile');

test('Turnstile is skipped only when email OTP is not production-enabled', async () => {
  const result = await verifyTurnstileToken({
    token: '',
    env: { NODE_ENV: 'production', AUTH_EMAIL_OTP_ENABLED: 'false' }
  });
  assert.deepEqual(result, { ok: true, skipped: true });

  await assert.rejects(
    () => verifyTurnstileToken({
      token: 'browser-token',
      env: { NODE_ENV: 'production', AUTH_EMAIL_OTP_ENABLED: 'true' }
    }),
    (error) =>
      error.code === 'TURNSTILE_NOT_CONFIGURED' &&
      error.status === 503
  );
});

test('Turnstile verifies token, action and hostname against the fixed endpoint', async () => {
  let request = null;
  const result = await verifyTurnstileToken({
    token: 'browser-token',
    remoteIp: '203.0.113.10',
    expectedAction: 'login_otp',
    env: {
      TURNSTILE_SECRET_KEY: 'server-secret',
      TURNSTILE_HOSTNAMES: 'artigen.example'
    },
    fetchRequest: async (...args) => {
      request = args;
      return {
        ok: true,
        async json() {
          return {
            success: true,
            action: 'login_otp',
            hostname: 'artigen.example'
          };
        }
      };
    }
  });
  assert.equal(request[0], TURNSTILE_VERIFY_URL);
  assert.equal(request[1].redirect, 'error');
  const form = new URLSearchParams(request[1].body);
  assert.equal(form.get('secret'), 'server-secret');
  assert.equal(form.get('response'), 'browser-token');
  assert.equal(form.get('remoteip'), '203.0.113.10');
  assert.equal(result.ok, true);
  assert.equal(result.hostname, 'artigen.example');
});

test('production Turnstile fails closed before Cloudflare when hostname configuration is unsafe', async () => {
  let requests = 0;
  const baseEnv = {
    NODE_ENV: 'production',
    AUTH_EMAIL_OTP_ENABLED: 'true',
    TURNSTILE_SECRET_KEY: 'server-secret'
  };
  for (const [overrides, code] of [
    [{ APP_ORIGIN: 'https://artigen.example' }, 'TURNSTILE_HOSTNAMES_NOT_CONFIGURED'],
    [{
      TURNSTILE_HOSTNAMES: '*.artigen.example',
      APP_ORIGIN: 'https://artigen.example'
    }, 'TURNSTILE_HOSTNAMES_INVALID'],
    [{
      TURNSTILE_HOSTNAMES: 'artigen.example',
      APP_ORIGIN: 'https://other.example'
    }, 'TURNSTILE_APP_ORIGIN_MISMATCH']
  ]) {
    await assert.rejects(
      () => verifyTurnstileToken({
        token: 'browser-token',
        env: { ...baseEnv, ...overrides },
        fetchRequest: async () => {
          requests += 1;
          throw new Error('must not call Cloudflare');
        }
      }),
      (error) => error.code === code && error.status === 503
    );
  }
  assert.equal(requests, 0);
});

test('production Turnstile accepts only exact public hostnames matching APP_ORIGIN', () => {
  assert.deepEqual(
    checkTurnstileHostnameConfiguration({
      NODE_ENV: 'production',
      AUTH_EMAIL_OTP_ENABLED: 'true',
      TURNSTILE_HOSTNAMES: 'artigen.example,auth.artigen.example',
      APP_ORIGIN: 'https://artigen.example'
    }),
    {
      ok: true,
      required: true,
      hostnames: ['artigen.example', 'auth.artigen.example'],
      appHostname: 'artigen.example'
    }
  );
  for (const hostname of [
    'https://artigen.example',
    'artigen.example:443',
    'artigen.example/path',
    '*.artigen.example',
    'localhost',
    '127.0.0.1'
  ]) {
    assert.equal(
      checkTurnstileHostnameConfiguration({
        NODE_ENV: 'production',
        AUTH_EMAIL_OTP_ENABLED: 'true',
        TURNSTILE_HOSTNAMES: hostname,
        APP_ORIGIN: 'https://artigen.example'
      }).code,
      'TURNSTILE_HOSTNAMES_INVALID'
    );
  }
});

test('Turnstile rejects missing, mismatched and unavailable verification', async () => {
  await assert.rejects(
    () => verifyTurnstileToken({
      token: '',
      env: { TURNSTILE_SECRET_KEY: 'secret' }
    }),
    (error) => error.code === 'TURNSTILE_REQUIRED' && error.status === 400
  );
  await assert.rejects(
    () => verifyTurnstileToken({
      token: 'token',
      expectedAction: 'expected',
      env: { TURNSTILE_SECRET_KEY: 'secret' },
      fetchRequest: async () => ({
        ok: true,
        async json() {
          return { success: true, action: 'other' };
        }
      })
    }),
    (error) => error.code === 'TURNSTILE_ACTION_MISMATCH'
  );
  await assert.rejects(
    () => verifyTurnstileToken({
      token: 'token',
      env: { TURNSTILE_SECRET_KEY: 'secret' },
      fetchRequest: async () => {
        throw new Error('network detail');
      }
    }),
    (error) => error.code === 'TURNSTILE_UNAVAILABLE' && error.retryable === true
  );
});
