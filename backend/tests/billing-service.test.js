const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assetIdentitiesEqual,
  assertHoldLive
} = require('../services/billing-service');

test('legacy idempotency compatibility requires the same ordered upload fingerprints', () => {
  const original = [
    { sha256: 'A'.repeat(64), mimeType: 'image/png', byteSize: 32 },
    { sha256: 'b'.repeat(64), mimeType: 'image/jpeg', byteSize: 64 }
  ];
  assert.equal(assetIdentitiesEqual(original, [
    { sha256: 'a'.repeat(64), mime_type: 'image/png', byte_size: 32 },
    { sha256: 'b'.repeat(64), mime_type: 'image/jpeg', byte_size: 64 }
  ]), true);
  assert.equal(assetIdentitiesEqual(original, [
    { sha256: 'c'.repeat(64), mimeType: 'image/png', byteSize: 32 },
    { sha256: 'b'.repeat(64), mimeType: 'image/jpeg', byteSize: 64 }
  ]), false);
  assert.equal(assetIdentitiesEqual(original, original.slice().reverse()), false);
  assert.equal(assetIdentitiesEqual(original, original.slice(0, 1)), false);
});

test('expired credit holds fail closed before dispatch or settlement', () => {
  assert.equal(assertHoldLive({ hold_live: true }), true);
  assert.throws(
    () => assertHoldLive({ hold_live: false }),
    { code: 'TASK_TIMEOUT', status: 409 }
  );
  assert.throws(
    () => assertHoldLive({ hold_expires_at: new Date(Date.now() - 1_000) }),
    { code: 'TASK_TIMEOUT', status: 409 }
  );
});
