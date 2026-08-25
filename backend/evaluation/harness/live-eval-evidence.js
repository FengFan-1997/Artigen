const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EVIDENCE_ALGORITHM = 'aes-256-gcm';
const EVIDENCE_VERSION = 1;
const MAX_PRIVATE_BYTES = 120 * 1024 * 1024;

const keyFromMaterial = (value) => {
  const material = String(value || '').trim();
  let key;
  if (/^v1:hex:[a-f0-9]{64}$/i.test(material)) {
    key = Buffer.from(material.slice('v1:hex:'.length), 'hex');
  } else if (/^v1:base64:[A-Za-z0-9+/]{43}=$/.test(material)) {
    key = Buffer.from(material.slice('v1:base64:'.length), 'base64');
  } else {
    throw new TypeError('AGENT_LIVE_EVAL_EVIDENCE_KEY_INVALID');
  }
  if (key.length !== 32) throw new TypeError('AGENT_LIVE_EVAL_EVIDENCE_KEY_INVALID');
  return key;
};

const safeSegment = (value, fallback = 'evidence') => {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return normalized || fallback;
};

const encryptEvidence = ({ buffer, keyMaterial, associatedData = {} } = {}) => {
  const plaintext = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  if (!plaintext.length || plaintext.length > MAX_PRIVATE_BYTES) {
    throw new TypeError('AGENT_LIVE_EVAL_EVIDENCE_SIZE_INVALID');
  }
  const iv = crypto.randomBytes(12);
  const aad = Buffer.from(JSON.stringify(associatedData), 'utf8');
  const cipher = crypto.createCipheriv(EVIDENCE_ALGORITHM, keyFromMaterial(keyMaterial), iv, {
    authTagLength: 16
  });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Object.freeze({
    version: EVIDENCE_VERSION,
    algorithm: EVIDENCE_ALGORITHM,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    aad: aad.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    plaintextSha256: crypto.createHash('sha256').update(plaintext).digest('hex'),
    byteSize: plaintext.length
  });
};

const decryptEvidence = ({ envelope, keyMaterial } = {}) => {
  if (
    Number(envelope?.version) !== EVIDENCE_VERSION ||
    envelope?.algorithm !== EVIDENCE_ALGORITHM
  ) {
    throw new TypeError('AGENT_LIVE_EVAL_EVIDENCE_FORMAT_INVALID');
  }
  const decipher = crypto.createDecipheriv(
    EVIDENCE_ALGORITHM,
    keyFromMaterial(keyMaterial),
    Buffer.from(envelope.iv, 'base64'),
    { authTagLength: 16 }
  );
  const aad = Buffer.from(envelope.aad, 'base64');
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final()
  ]);
  const digest = crypto.createHash('sha256').update(plaintext).digest('hex');
  if (digest !== envelope.plaintextSha256 || plaintext.length !== Number(envelope.byteSize)) {
    throw new Error('AGENT_LIVE_EVAL_EVIDENCE_DIGEST_MISMATCH');
  }
  return plaintext;
};

const writeEncryptedEvidence = async ({
  privateDir,
  filename,
  buffer,
  keyMaterial,
  associatedData = {}
} = {}) => {
  const directory = path.resolve(String(privateDir || ''));
  const target = path.join(directory, `${safeSegment(filename)}.enc.json`);
  if (path.dirname(target) !== directory) {
    throw new TypeError('AGENT_LIVE_EVAL_EVIDENCE_PATH_INVALID');
  }
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  const envelope = encryptEvidence({ buffer, keyMaterial, associatedData });
  await fs.promises.writeFile(target, `${JSON.stringify(envelope)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx'
  });
  return {
    path: target,
    plaintextSha256: envelope.plaintextSha256,
    byteSize: envelope.byteSize
  };
};

const purgeExpiredEvidence = async ({ rootDir, retentionDays = 30, now = Date.now() } = {}) => {
  const root = path.resolve(String(rootDir || ''));
  const cutoff = Number(now) - Math.max(1, Math.min(30, Number(retentionDays) || 30)) * 86_400_000;
  const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []);
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('agent-live-eval-')) continue;
    const target = path.join(root, entry.name);
    const stat = await fs.promises.stat(target).catch(() => null);
    if (!stat || stat.mtimeMs > cutoff) continue;
    await fs.promises.rm(target, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
};

module.exports = {
  EVIDENCE_ALGORITHM,
  EVIDENCE_VERSION,
  MAX_PRIVATE_BYTES,
  decryptEvidence,
  encryptEvidence,
  keyFromMaterial,
  purgeExpiredEvidence,
  safeSegment,
  writeEncryptedEvidence
};
