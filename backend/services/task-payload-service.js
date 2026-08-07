const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');

const ALGORITHM = 'aes-256-gcm-v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_PLAINTEXT_BYTES = 240 * 1024;
const DEFAULT_TTL_MINUTES = 60;

const payloadAad = (taskId) => Buffer.from(
  `artigen:tool-task-payload:v1:${String(taskId || '').trim()}`,
  'utf8'
);

const decodeConfiguredKey = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return null;
  let key;
  if (value.startsWith('base64:')) {
    key = Buffer.from(value.slice(7), 'base64');
  } else if (value.startsWith('hex:')) {
    key = Buffer.from(value.slice(4), 'hex');
  } else if (/^[0-9a-f]{64}$/i.test(value)) {
    key = Buffer.from(value, 'hex');
  } else {
    const decoded = Buffer.from(value, 'base64');
    key = decoded.length === KEY_BYTES && decoded.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '')
      ? decoded
      : Buffer.from(value, 'utf8');
  }
  return key.length === KEY_BYTES ? key : null;
};

const resolvePayloadKey = (env = process.env) => {
  const key = decodeConfiguredKey(env.TASK_PAYLOAD_ENCRYPTION_KEY);
  if (!key) {
    throw new ApiError(503, 'TASK_PAYLOAD_KEY_MISSING', { retryable: false });
  }
  return key;
};

const hasPayloadKey = (env = process.env) => Boolean(
  decodeConfiguredKey(env.TASK_PAYLOAD_ENCRYPTION_KEY)
);

const serializePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(500, 'INVALID_TASK_PAYLOAD');
  }
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  if (!plaintext.length || plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new ApiError(413, 'TASK_PAYLOAD_TOO_LARGE', { field: 'options' });
  }
  return plaintext;
};

const encryptTaskPayload = ({ taskId, payload, env = process.env, iv = crypto.randomBytes(IV_BYTES) }) => {
  const key = resolvePayloadKey(env);
  const plaintext = serializePayload(payload);
  if (!Buffer.isBuffer(iv) || iv.length !== IV_BYTES) {
    throw new ApiError(500, 'INVALID_TASK_PAYLOAD_IV');
  }
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(payloadAad(taskId));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    algorithm: ALGORITHM,
    keyVersion: 'v1',
    iv,
    authTag: cipher.getAuthTag(),
    ciphertext
  };
};

const decryptTaskPayload = ({ taskId, record, env = process.env }) => {
  if (!record || String(record.algorithm || '') !== ALGORITHM) {
    throw new ApiError(500, 'TASK_PAYLOAD_DECRYPT_FAILED');
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      resolvePayloadKey(env),
      Buffer.from(record.iv),
      { authTagLength: TAG_BYTES }
    );
    decipher.setAAD(payloadAad(taskId));
    decipher.setAuthTag(Buffer.from(record.auth_tag || record.authTag));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext)),
      decipher.final()
    ]);
    const parsed = JSON.parse(plaintext.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid payload');
    return parsed;
  } catch (error) {
    if (error?.code === 'TASK_PAYLOAD_KEY_MISSING') throw error;
    throw new ApiError(500, 'TASK_PAYLOAD_DECRYPT_FAILED', { retryable: false });
  }
};

const insertTaskPayload = async ({
  client,
  taskId,
  payload,
  expiresAt,
  ttlMinutes = DEFAULT_TTL_MINUTES,
  env = process.env
}) => {
  if (!client || typeof client.query !== 'function') throw new ApiError(500, 'DATABASE_NOT_CONFIGURED');
  const encrypted = encryptTaskPayload({ taskId, payload, env });
  const boundedTtlMinutes = Math.max(5, Math.min(24 * 60, Number(ttlMinutes) || DEFAULT_TTL_MINUTES));
  const expiry = expiresAt || new Date(Date.now() + boundedTtlMinutes * 60 * 1000);
  await client.query(
    `INSERT INTO tool_task_payloads
      (task_id, algorithm, key_version, iv, auth_tag, ciphertext, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      taskId,
      encrypted.algorithm,
      encrypted.keyVersion,
      encrypted.iv,
      encrypted.authTag,
      encrypted.ciphertext,
      expiry
    ]
  );
  return { taskId, expiresAt: expiry };
};

const readTaskPayload = async ({ client, taskId, env = process.env }) => {
  if (!client || typeof client.query !== 'function') throw new ApiError(500, 'DATABASE_NOT_CONFIGURED');
  const result = await client.query(
    `SELECT algorithm, key_version, iv, auth_tag, ciphertext, expires_at
       FROM tool_task_payloads
      WHERE task_id=$1 AND expires_at > now()`,
    [taskId]
  );
  if (!result.rowCount) throw new ApiError(410, 'TASK_PAYLOAD_EXPIRED', { retryable: false });
  return decryptTaskPayload({ taskId, record: result.rows[0], env });
};

const deleteTaskPayload = async ({ client, taskId }) => {
  if (!client || typeof client.query !== 'function') return false;
  const deleted = await client.query('DELETE FROM tool_task_payloads WHERE task_id=$1', [taskId]);
  return deleted.rowCount > 0;
};

const sweepExpiredTaskPayloads = async ({ pool, limit = 500 } = {}) => {
  if (!pool || typeof pool.query !== 'function') return 0;
  const boundedLimit = Math.max(1, Math.min(5000, Number(limit) || 500));
  const deleted = await pool.query(
    `WITH expired AS (
       SELECT task_id FROM tool_task_payloads
        WHERE expires_at <= now()
        ORDER BY expires_at
        LIMIT $1
     )
     DELETE FROM tool_task_payloads payload
      USING expired
      WHERE payload.task_id=expired.task_id
     RETURNING payload.task_id`,
    [boundedLimit]
  );
  return deleted.rowCount;
};

module.exports = {
  ALGORITHM,
  DEFAULT_TTL_MINUTES,
  IV_BYTES,
  KEY_BYTES,
  MAX_PLAINTEXT_BYTES,
  TAG_BYTES,
  decodeConfiguredKey,
  decryptTaskPayload,
  deleteTaskPayload,
  encryptTaskPayload,
  hasPayloadKey,
  insertTaskPayload,
  payloadAad,
  readTaskPayload,
  resolvePayloadKey,
  serializePayload,
  sweepExpiredTaskPayloads
};
