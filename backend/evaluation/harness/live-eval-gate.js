const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { LIVE_EVAL_MATRIX_HASH } = require('./agent-live-eval-matrix');

const GATE_VERSION = 'artigen-agent-live-eval-gate-v1';
const PINNED_MINIO_DIGEST = 'sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e';
const REQUIRED_CHECKS = Object.freeze([
  'pnpmCheck',
  'postgresMinio',
  'qualitySet',
  'chaos',
  'crossWorker',
  'browsers'
]);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value || ''));
const isCommitSha = (value) => /^[a-f0-9]{40}$/i.test(String(value || ''));

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

const canonicalJson = (value) => JSON.stringify(canonicalize(value));

const parseVersionedKey = (value, code = 'AGENT_LIVE_EVAL_GATE_KEY_INVALID') => {
  const input = String(value || '').trim();
  let key;
  if (/^v1:hex:[a-f0-9]{64}$/i.test(input)) {
    key = Buffer.from(input.slice('v1:hex:'.length), 'hex');
  } else if (/^v1:base64:[A-Za-z0-9+/]{43}=$/.test(input)) {
    key = Buffer.from(input.slice('v1:base64:'.length), 'base64');
  } else {
    throw new TypeError(code);
  }
  if (key.length !== 32) throw new TypeError(code);
  return key;
};

const reportDigest = (reportPath) => {
  const target = path.resolve(String(reportPath || ''));
  if (!String(reportPath || '').trim()) throw new TypeError('AGENT_LIVE_EVAL_GATE_REPORT_REQUIRED');
  const stat = fs.statSync(target);
  if (!stat.isFile() || stat.size < 1 || stat.size > 64 * 1024 * 1024) {
    throw new TypeError('AGENT_LIVE_EVAL_GATE_REPORT_INVALID');
  }
  return sha256(fs.readFileSync(target));
};

const normalizeCheck = (name, input = {}) => {
  if (input.passed !== true) throw new Error(`AGENT_LIVE_EVAL_GATE_CHECK_FAILED:${name}`);
  const reportSha256 = input.reportPath
    ? reportDigest(input.reportPath)
    : String(input.reportSha256 || '').toLowerCase();
  if (!isSha256(reportSha256)) {
    throw new TypeError(`AGENT_LIVE_EVAL_GATE_REPORT_DIGEST_INVALID:${name}`);
  }
  const common = { passed: true, reportSha256 };
  if (name === 'pnpmCheck') {
    if (input.command !== 'pnpm check' || input.exitCode !== 0) {
      throw new Error('AGENT_LIVE_EVAL_GATE_PNPM_INVALID');
    }
    return { ...common, command: 'pnpm check', exitCode: 0 };
  }
  if (name === 'postgresMinio') {
    if (Number(input.postgresMajor) !== 16 || input.minioDigest !== PINNED_MINIO_DIGEST) {
      throw new Error('AGENT_LIVE_EVAL_GATE_INFRA_INVALID');
    }
    return { ...common, postgresMajor: 16, minioDigest: PINNED_MINIO_DIGEST };
  }
  if (name === 'qualitySet') {
    if (Number(input.total) !== 50 || Number(input.passedCount) !== 50 || Number(input.failed) !== 0) {
      throw new Error('AGENT_LIVE_EVAL_GATE_QUALITY_INVALID');
    }
    return { ...common, total: 50, passedCount: 50, failed: 0 };
  }
  if (name === 'chaos') {
    if (
      Number(input.repeats) !== 20 ||
      Number(input.failed) !== 0 ||
      Number(input.flaky) !== 0 ||
      Number(input.skipped) !== 0
    ) {
      throw new Error('AGENT_LIVE_EVAL_GATE_CHAOS_INVALID');
    }
    return { ...common, repeats: 20, failed: 0, flaky: 0, skipped: 0 };
  }
  if (name === 'crossWorker') {
    if (input.independentProcesses !== true || Number(input.staleWrites) !== 0) {
      throw new Error('AGENT_LIVE_EVAL_GATE_CROSS_WORKER_INVALID');
    }
    return { ...common, independentProcesses: true, staleWrites: 0 };
  }
  if (name === 'browsers') {
    if (input.chromium !== true || input.firefox !== true || input.webkit !== true) {
      throw new Error('AGENT_LIVE_EVAL_GATE_BROWSERS_INVALID');
    }
    return { ...common, chromium: true, firefox: true, webkit: true };
  }
  throw new TypeError(`AGENT_LIVE_EVAL_GATE_CHECK_UNKNOWN:${name}`);
};

const createSignedGateManifest = ({
  campaignId,
  commitSha,
  matrixHash = LIVE_EVAL_MATRIX_HASH,
  checks,
  keyMaterial,
  createdAt = new Date(),
  expiresAt = new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000)
} = {}) => {
  if (!/^[a-f0-9-]{16,80}$/i.test(String(campaignId || ''))) {
    throw new TypeError('AGENT_LIVE_EVAL_GATE_CAMPAIGN_INVALID');
  }
  if (!isCommitSha(commitSha) || !isSha256(matrixHash)) {
    throw new TypeError('AGENT_LIVE_EVAL_GATE_PROFILE_INVALID');
  }
  const created = new Date(createdAt);
  const expires = new Date(expiresAt);
  if (
    !Number.isFinite(created.getTime()) ||
    !Number.isFinite(expires.getTime()) ||
    expires <= created ||
    expires.getTime() - created.getTime() > 24 * 60 * 60 * 1000
  ) {
    throw new TypeError('AGENT_LIVE_EVAL_GATE_EXPIRY_INVALID');
  }
  const normalizedChecks = Object.fromEntries(REQUIRED_CHECKS.map((name) => [
    name,
    normalizeCheck(name, checks?.[name])
  ]));
  const payload = {
    version: GATE_VERSION,
    campaignId: String(campaignId),
    commitSha: String(commitSha).toLowerCase(),
    matrixHash: String(matrixHash).toLowerCase(),
    createdAt: created.toISOString(),
    expiresAt: expires.toISOString(),
    checks: normalizedChecks
  };
  const key = parseVersionedKey(keyMaterial);
  const signature = crypto.createHmac('sha256', key).update(canonicalJson(payload)).digest('hex');
  return Object.freeze({
    ...payload,
    signature: Object.freeze({ algorithm: 'hmac-sha256', value: signature })
  });
};

const verifySignedGateManifest = ({
  manifest,
  keyMaterial,
  expectedCommitSha,
  expectedMatrixHash = LIVE_EVAL_MATRIX_HASH,
  now = new Date()
} = {}) => {
  if (!manifest || manifest.version !== GATE_VERSION) {
    throw new TypeError('AGENT_LIVE_EVAL_GATE_FORMAT_INVALID');
  }
  if (
    String(manifest.commitSha || '').toLowerCase() !== String(expectedCommitSha || '').toLowerCase() ||
    String(manifest.matrixHash || '').toLowerCase() !== String(expectedMatrixHash || '').toLowerCase()
  ) {
    throw new Error('AGENT_LIVE_EVAL_GATE_SHA_MISMATCH');
  }
  const normalized = createSignedGateManifest({
    campaignId: manifest.campaignId,
    commitSha: manifest.commitSha,
    matrixHash: manifest.matrixHash,
    checks: manifest.checks,
    keyMaterial,
    createdAt: manifest.createdAt,
    expiresAt: manifest.expiresAt
  });
  const actual = Buffer.from(String(manifest.signature?.value || ''), 'hex');
  const expected = Buffer.from(normalized.signature.value, 'hex');
  if (
    manifest.signature?.algorithm !== 'hmac-sha256' ||
    actual.length !== expected.length ||
    !crypto.timingSafeEqual(actual, expected)
  ) {
    throw new Error('AGENT_LIVE_EVAL_GATE_SIGNATURE_INVALID');
  }
  const current = new Date(now).getTime();
  if (
    !Number.isFinite(current) ||
    current < new Date(manifest.createdAt).getTime() ||
    current >= new Date(manifest.expiresAt).getTime()
  ) {
    throw new Error('AGENT_LIVE_EVAL_GATE_EXPIRED');
  }
  return Object.freeze({
    campaignId: manifest.campaignId,
    commitSha: manifest.commitSha,
    matrixHash: manifest.matrixHash,
    manifestSha256: sha256(Buffer.from(canonicalJson(manifest), 'utf8')),
    expiresAt: manifest.expiresAt
  });
};

const readAndVerifyGateManifest = ({ manifestPath, ...options } = {}) => {
  const target = path.resolve(String(manifestPath || ''));
  if (!String(manifestPath || '').trim()) throw new TypeError('AGENT_LIVE_EVAL_GATE_PATH_REQUIRED');
  const manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
  return verifySignedGateManifest({ manifest, ...options });
};

module.exports = {
  GATE_VERSION,
  PINNED_MINIO_DIGEST,
  REQUIRED_CHECKS,
  canonicalJson,
  createSignedGateManifest,
  parseVersionedKey,
  readAndVerifyGateManifest,
  verifySignedGateManifest
};
