const assert = require('node:assert/strict');
const test = require('node:test');

const { initialCredits } = require('../services/signup-credits');
const { buildReleaseMetadata } = require('../services/release-metadata');

test('signup credits preserve the wallet configuration defaults and local override', () => {
  assert.equal(initialCredits({}), 100);
  assert.equal(initialCredits({ CREDITS_INIT: '275' }), 275);
  assert.equal(initialCredits({ CREDITS_INIT: '0' }), 0);
  assert.equal(initialCredits({ CREDITS_INIT: '-1' }), 100);
  assert.equal(initialCredits({ CREDITS_INIT: 'invalid' }), 100);
  assert.equal(initialCredits({ CREDITS_INIT: '125' }, 0), 0);
  assert.equal(initialCredits({ CREDITS_INIT: '125' }, 35), 35);
});

test('public signup metadata uses the configured wallet grant', () => {
  const metadata = buildReleaseMetadata({ env: { APP_ENV: 'development', CREDITS_INIT: '275' } });
  assert.deepEqual(metadata.signupOffer, { available: true, credits: 275 });
});

test('public signup metadata omits the offer when the grant is zero', () => {
  const metadata = buildReleaseMetadata({ env: { APP_ENV: 'development', CREDITS_INIT: '0' } });
  assert.equal(metadata.capabilities.publicSignup, true);
  assert.deepEqual(metadata.signupOffer, { available: false, credits: 0 });
});

test('closed signup never advertises a grant, including invite-only deployments', () => {
  for (const env of [
    { APP_ENV: 'development', ARTIGEN_PUBLIC_SIGNUP_ENABLED: 'false' },
    { APP_ENV: 'dev', ARTIGEN_PUBLIC_SIGNUP_ENABLED: 'true' },
    { APP_ENV: 'production', ARTIGEN_PUBLIC_SIGNUP_ENABLED: 'true' }
  ]) {
    const metadata = buildReleaseMetadata({ env: { ...env, CREDITS_INIT: '275' } });
    assert.equal(metadata.capabilities.publicSignup, false);
    assert.deepEqual(metadata.signupOffer, { available: false, credits: 275 });
  }
});
