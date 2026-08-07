const assert = require('node:assert/strict');
const test = require('node:test');

const {
  decodeConfiguredKey,
  decryptTaskPayload,
  encryptTaskPayload,
  hasPayloadKey,
  resolvePayloadKey
} = require('../services/task-payload-service');

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const RAW_KEY = Buffer.from('0123456789abcdef0123456789abcdef');
const ENV = { TASK_PAYLOAD_ENCRYPTION_KEY: `base64:${RAW_KEY.toString('base64')}` };

test('task payload key accepts only exact 256-bit material and fails closed when absent', () => {
  assert.deepEqual(decodeConfiguredKey(ENV.TASK_PAYLOAD_ENCRYPTION_KEY), RAW_KEY);
  assert.deepEqual(decodeConfiguredKey(RAW_KEY.toString('hex')), RAW_KEY);
  assert.equal(decodeConfiguredKey('too-short'), null);
  assert.equal(hasPayloadKey(ENV), true);
  assert.equal(hasPayloadKey({}), false);
  assert.throws(() => resolvePayloadKey({}), { code: 'TASK_PAYLOAD_KEY_MISSING' });
});

test('AES-256-GCM task payload hides prompt text and decrypts with task-bound AAD', () => {
  const payload = {
    options: {
      prompt: 'private red handbag campaign prompt',
      productProfile: { material: 'leather' }
    }
  };
  const encrypted = encryptTaskPayload({
    taskId: TASK_ID,
    payload,
    env: ENV,
    iv: Buffer.alloc(12, 7)
  });
  assert.equal(encrypted.algorithm, 'aes-256-gcm-v1');
  assert.equal(encrypted.authTag.length, 16);
  assert.equal(encrypted.ciphertext.includes(Buffer.from('private red handbag')), false);
  assert.deepEqual(
    decryptTaskPayload({
      taskId: TASK_ID,
      record: {
        algorithm: encrypted.algorithm,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        ciphertext: encrypted.ciphertext
      },
      env: ENV
    }),
    payload
  );
});

test('task payload authentication rejects tampering and cross-task replay', () => {
  const encrypted = encryptTaskPayload({
    taskId: TASK_ID,
    payload: { options: { prompt: 'confidential' } },
    env: ENV
  });
  const record = {
    algorithm: encrypted.algorithm,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    ciphertext: Buffer.from(encrypted.ciphertext)
  };
  record.ciphertext[0] ^= 1;
  assert.throws(
    () => decryptTaskPayload({ taskId: TASK_ID, record, env: ENV }),
    { code: 'TASK_PAYLOAD_DECRYPT_FAILED' }
  );
  assert.throws(
    () => decryptTaskPayload({
      taskId: '22222222-2222-4222-8222-222222222222',
      record: { ...record, ciphertext: encrypted.ciphertext },
      env: ENV
    }),
    { code: 'TASK_PAYLOAD_DECRYPT_FAILED' }
  );
});
