const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');
const { resolvePayloadKey } = require('./task-payload-service');

const ALGORITHM = 'aes-256-gcm-v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_PLAINTEXT_BYTES = 240 * 1024;
const ENTITY_TYPES = new Set(['project', 'version']);

const assertEntity = (entityType, entityId) => {
  const type = String(entityType || '').trim();
  const id = String(entityId || '').trim();
  if (!ENTITY_TYPES.has(type) || !id) throw new ApiError(500, 'INVALID_PROJECT_PAYLOAD_ENTITY');
  return { type, id };
};

const payloadAad = (entityType, entityId) => {
  const entity = assertEntity(entityType, entityId);
  return Buffer.from(`artigen:creative-${entity.type}-payload:v1:${entity.id}`, 'utf8');
};

const serializePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(400, 'INVALID_PROJECT_PAYLOAD');
  }
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  if (!plaintext.length || plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new ApiError(413, 'PROJECT_PAYLOAD_TOO_LARGE');
  }
  return plaintext;
};

const encryptProjectPayload = ({
  entityType,
  entityId,
  payload,
  env = process.env,
  iv = crypto.randomBytes(IV_BYTES)
}) => {
  const key = resolvePayloadKey(env);
  const plaintext = serializePayload(payload);
  if (!Buffer.isBuffer(iv) || iv.length !== IV_BYTES) {
    throw new ApiError(500, 'INVALID_PROJECT_PAYLOAD_IV');
  }
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(payloadAad(entityType, entityId));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    algorithm: ALGORITHM,
    keyVersion: 'v1',
    iv,
    authTag: cipher.getAuthTag(),
    ciphertext
  };
};

const decryptProjectPayload = ({
  entityType,
  entityId,
  record,
  env = process.env
}) => {
  if (!record || String(record.algorithm || '') !== ALGORITHM) {
    throw new ApiError(500, 'PROJECT_PAYLOAD_DECRYPT_FAILED');
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      resolvePayloadKey(env),
      Buffer.from(record.iv),
      { authTagLength: TAG_BYTES }
    );
    decipher.setAAD(payloadAad(entityType, entityId));
    decipher.setAuthTag(Buffer.from(record.auth_tag || record.authTag));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext)),
      decipher.final()
    ]);
    const parsed = JSON.parse(plaintext.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid payload');
    }
    return parsed;
  } catch (error) {
    if (error?.code === 'TASK_PAYLOAD_KEY_MISSING') throw error;
    throw new ApiError(500, 'PROJECT_PAYLOAD_DECRYPT_FAILED', { retryable: false });
  }
};

module.exports = {
  ALGORITHM,
  MAX_PLAINTEXT_BYTES,
  decryptProjectPayload,
  encryptProjectPayload,
  payloadAad,
  serializePayload
};
