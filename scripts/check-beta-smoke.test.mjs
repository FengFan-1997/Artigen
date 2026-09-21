import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBetaSmoke } from './check-beta-smoke.mjs';
const sha = 'a'.repeat(40);
const fixture = () => ({
  '/healthz': { ok: true },
  '/readyz': { ok: true, checks: Object.fromEntries(['database','storage','provider','mail','authSecrets','turnstile'].map(k => [k, { ok: true }])) },
  '/api/meta': { ok: true, gitSha: sha, version: '1.0.0', environment: 'dev', capabilitySemantics: 'configured-not-readiness', releasePolicy: { violations: [] }, capabilities: { auth: true, projects: true, generation: true, fileUpload: true, artifactDownload: true, publicSignup: false, selfServePayments: false, agentRuntimeV2: false, agentSubagents: false, providerScheduler: false } }
});
const run = (bodies) => checkBetaSmoke({ origin: 'https://beta.example.invalid', sha, environment: 'dev', fetchImpl: async url => ({ ok: true, json: async () => bodies[url.pathname] }) });
test('accepts matching version and verified dependencies', async () => assert.equal((await run(fixture())).ok, true));
test('rejects stale SHA, environment and drift', async () => {
  const b = fixture(); b['/api/meta'].gitSha = 'b'.repeat(40); b['/api/meta'].environment = 'production'; b['/api/meta'].capabilities.agentRuntimeV2 = true;
  const r = await run(b); assert.equal(r.ok, false); assert.equal(r.failures.length, 3);
});
test('disabled readiness checks cannot make a Beta pass', async () => {
  const b = fixture(); b['/readyz'].checks.mail.skipped = true;
  assert.deepEqual((await run(b)).failures, ['/readyz: mail not verified']);
});
test('old metadata cannot pass without the capability contract', async () => {
  const b = fixture(); b['/api/meta'] = { ok: true, gitSha: sha };
  assert.equal((await run(b)).ok, false);
});
test('transport errors are redacted and fail closed', async () => {
  const r = await checkBetaSmoke({ origin: 'https://beta.example.invalid', sha, environment: 'dev', fetchImpl: async () => { throw Error('synthetic-secret'); } });
  assert.equal(r.ok, false); assert.equal(r.failures.length, 3); assert.ok(!JSON.stringify(r).includes('synthetic-secret'));
});
test('requires a full SHA and refuses credential-bearing origins', async () => {
  await assert.rejects(checkBetaSmoke({ origin: 'https://user:secret@example.invalid', sha, environment: 'dev' }));
  await assert.rejects(checkBetaSmoke({ origin: 'https://example.invalid', sha: 'main', environment: 'dev' }));
});

test('authenticated DEV smoke protects credentials and refuses redirects', async () => {
  const bodies = fixture();
  let calls = 0;
  const r = await checkBetaSmoke({ origin: 'https://beta.example.invalid', sha, environment: 'dev',
    devAuth: { username: 'fixture-user', password: 'fixture-password' },
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(options.headers.Authorization, `Basic ${Buffer.from('fixture-user:fixture-password').toString('base64')}`);
      assert.equal(options.redirect, 'error');
      return { ok: true, json: async () => bodies[url.pathname] };
    }
  });
  assert.equal(r.ok, true); assert.equal(calls, 3);
  assert.ok(!JSON.stringify(r).includes('fixture-password'));
  assert.ok(!JSON.stringify(r).includes('Basic'));
});
test('DEV credentials cannot be accidentally used for production or left incomplete', async () => {
  for (const [environment, devAuth] of [
    ['production', { username: 'fixture-user', password: 'fixture-password' }],
    ['dev', { username: 'fixture-user' }]
  ]) {
    await assert.rejects(checkBetaSmoke({ origin: 'https://beta.example.invalid', sha, environment, devAuth,
      fetchImpl: async () => assert.fail('invalid authentication must fail before making a request') }));
  }
});

test('existing payments may stay enabled without running payment transactions', async () => {
  for (const enabled of [true, false]) {
    const bodies = fixture();
    bodies['/api/meta'].capabilities.selfServePayments = enabled;
    const requested = [];
    const result = await checkBetaSmoke({ origin: 'https://beta.example.invalid', sha, environment: 'dev',
      fetchImpl: async (url) => {
        requested.push(url.pathname);
        return { ok: true, json: async () => bodies[url.pathname] };
      }
    });
    assert.equal(result.ok, true);
    assert.deepEqual(requested, ['/healthz', '/readyz', '/api/meta']);
  }
});
