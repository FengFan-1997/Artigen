const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');
const { readMacOsKeychainSecret } = require('../lib/local-keychain');

const ALGORITHM = 'aes-256-gcm-v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const MAX_PAYLOAD_BYTES = 1024 * 1024;

const decodeKey = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (value.startsWith('base64:')) {
    const key = Buffer.from(value.slice(7), 'base64');
    return key.length === KEY_BYTES ? key : null;
  }
  if (value.startsWith('hex:')) {
    const key = Buffer.from(value.slice(4), 'hex');
    return key.length === KEY_BYTES ? key : null;
  }
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === KEY_BYTES ? decoded : null;
};

const payloadKeyMaterial = (env = process.env) => readMacOsKeychainSecret({
  service: env.AGENT_PAYLOAD_KEYCHAIN_SERVICE || (
    env === process.env && String(env.NODE_ENV || '').trim() !== 'production'
      ? 'artigen-agent-dev-worker'
      : ''
  ),
  account: env.AGENT_PAYLOAD_KEYCHAIN_ACCOUNT || 'AGENT_PAYLOAD_ENCRYPTION_KEY'
}) || env.AGENT_PAYLOAD_ENCRYPTION_KEY;

const resolveKey = (env = process.env) => {
  const key = decodeKey(payloadKeyMaterial(env));
  if (!key) {
    throw new ApiError(503, 'AGENT_PAYLOAD_KEY_MISSING', { retryable: false });
  }
  return key;
};

const hasAgentPayloadKey = (env = process.env) => Boolean(
  decodeKey(payloadKeyMaterial(env))
);

const payloadAad = ({ runId, payloadId, kind }) => Buffer.from(
  `artigen:agent-payload:v1:${runId}:${payloadId}:${kind}`,
  'utf8'
);

const profileAad = ({ userId, profileId, siteOrigin }) => Buffer.from(
  `artigen:agent-browser-profile:v1:${userId}:${profileId}:${siteOrigin}`,
  'utf8'
);

const integrationAad = ({ userId, integrationId, provider }) => Buffer.from(
  `artigen:agent-integration:v1:${userId}:${integrationId}:${provider}`,
  'utf8'
);

const designMessageAad = ({ conversationId, messageId, role }) => Buffer.from(
  `artigen:design-message:v1:${conversationId}:${messageId}:${role}`,
  'utf8'
);

const serialize = (value, maxBytes = MAX_PAYLOAD_BYTES) => {
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  if (!plaintext.length || plaintext.length > maxBytes) {
    throw new ApiError(413, 'AGENT_PAYLOAD_TOO_LARGE');
  }
  return plaintext;
};

const seal = ({ plaintext, aad, env = process.env, iv = crypto.randomBytes(IV_BYTES) }) => {
  const cipher = crypto.createCipheriv('aes-256-gcm', resolveKey(env), iv, {
    authTagLength: TAG_BYTES
  });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    algorithm: ALGORITHM,
    keyVersion: 1,
    iv,
    authTag: cipher.getAuthTag(),
    ciphertext
  };
};

const open = ({ record, aad, env = process.env }) => {
  if (
    String(record?.algorithm || '') !== ALGORITHM ||
    !Buffer.isBuffer(record?.iv) ||
    !Buffer.isBuffer(record?.auth_tag ?? record?.authTag) ||
    !Buffer.isBuffer(record?.ciphertext)
  ) {
    throw new ApiError(500, 'AGENT_PAYLOAD_INVALID');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', resolveKey(env), record.iv, {
      authTagLength: TAG_BYTES
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(record.auth_tag ?? record.authTag);
    return JSON.parse(Buffer.concat([
      decipher.update(record.ciphertext),
      decipher.final()
    ]).toString('utf8'));
  } catch {
    throw new ApiError(500, 'AGENT_PAYLOAD_DECRYPT_FAILED');
  }
};

const encryptAgentPayload = ({ runId, payloadId, kind, value, env = process.env }) => seal({
  plaintext: serialize(value),
  aad: payloadAad({ runId, payloadId, kind }),
  env
});

const decryptAgentPayload = ({ runId, payloadId, kind, record, env = process.env }) => open({
  record,
  aad: payloadAad({ runId, payloadId, kind }),
  env
});

const encryptBrowserProfile = ({
  userId,
  profileId,
  siteOrigin,
  value,
  env = process.env
}) => seal({
  plaintext: serialize(value, 2 * MAX_PAYLOAD_BYTES),
  aad: profileAad({ userId, profileId, siteOrigin }),
  env
});

const decryptBrowserProfile = ({
  userId,
  profileId,
  siteOrigin,
  record,
  env = process.env
}) => open({
  record,
  aad: profileAad({ userId, profileId, siteOrigin }),
  env
});

const encryptIntegrationSecret = ({
  userId,
  integrationId,
  provider,
  value,
  env = process.env
}) => seal({
  plaintext: serialize(value, 256 * 1024),
  aad: integrationAad({ userId, integrationId, provider }),
  env
});

const decryptIntegrationSecret = ({
  userId,
  integrationId,
  provider,
  record,
  env = process.env
}) => open({
  record,
  aad: integrationAad({ userId, integrationId, provider }),
  env
});

const encryptDesignMessage = ({
  conversationId,
  messageId,
  role,
  value,
  env = process.env
}) => seal({
  plaintext: serialize(value),
  aad: designMessageAad({ conversationId, messageId, role }),
  env
});

const decryptDesignMessage = ({
  conversationId,
  messageId,
  role,
  record,
  env = process.env
}) => open({
  record,
  aad: designMessageAad({ conversationId, messageId, role }),
  env
});

module.exports = {
  ALGORITHM,
  decryptAgentPayload,
  decryptBrowserProfile,
  decryptDesignMessage,
  decryptIntegrationSecret,
  encryptAgentPayload,
  encryptBrowserProfile,
  encryptDesignMessage,
  encryptIntegrationSecret,
  hasAgentPayloadKey,
  resolveKey
};
