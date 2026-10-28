const test = require('node:test');
const assert = require('node:assert/strict');
const { getRenderFallbackQuotaIp } = require('../lib/otp-fallback-ip');

test('fallback quota uses the Cloudflare edge peer, never the forwarded chain', () => {
  const env = { RENDER: 'true' };
  const req = { headers: { 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '198.51.100.1' } };
  assert.equal(getRenderFallbackQuotaIp(req, env), '203.0.113.5');
  req.headers['x-forwarded-for'] = '198.51.100.2';
  assert.equal(getRenderFallbackQuotaIp(req, env), '203.0.113.5');
  req.headers['cf-connecting-ip'] = '2001:db8::1';
  assert.equal(getRenderFallbackQuotaIp(req, env), '2001:db8::1');
});

test('fallback rejects absent, invalid, repeated and non-Render source headers', () => {
  const env = { RENDER: 'true' };
  for (const value of [undefined, '', 'invalid', '203.0.113.5, 198.51.100.1', ['203.0.113.5']]) {
    assert.equal(getRenderFallbackQuotaIp({ headers: { 'cf-connecting-ip': value } }, env), null);
  }
  assert.equal(getRenderFallbackQuotaIp({ headers: { 'cf-connecting-ip': '203.0.113.5' } }, {}), null);
});
