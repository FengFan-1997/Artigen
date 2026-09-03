#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const { readMacOsKeychainSecret } = require('../lib/local-keychain');
const { resolvePoolSsl } = require('../db/pool');
const {
  EXPECTED_POSTGRES_MAJOR,
  assertLiveEvalDatabaseReadiness
} = require('../evaluation/harness/live-eval-database-readiness');
const {
  LIVE_EVAL_MATRIX_HASH
} = require('../evaluation/harness/agent-live-eval-matrix');
const {
  createSignedGateManifest,
  REQUIRED_CHECKS
} = require('../evaluation/harness/live-eval-gate');
const { resolveCurrentCommitSha } = require('./run-agent-live-eval');

const assertGateAttestationProvenance = ({
  attestation,
  commitSha,
  commitTimestampMs,
  statSync = fs.statSync
} = {}) => {
  if (!/^[a-f0-9]{40}$/i.test(String(commitSha || '')) || !Number.isFinite(commitTimestampMs)) {
    throw new TypeError('AGENT_LIVE_EVAL_GATE_PROVENANCE_PROFILE_INVALID');
  }
  for (const name of REQUIRED_CHECKS) {
    const check = attestation?.checks?.[name];
    if (String(check?.sourceCommitSha || '').toLowerCase() !== String(commitSha).toLowerCase()) {
      throw new Error(`AGENT_LIVE_EVAL_GATE_EVIDENCE_SHA_MISMATCH:${name}`);
    }
    const reportPath = String(check?.reportPath || '').trim();
    if (!reportPath) throw new Error(`AGENT_LIVE_EVAL_GATE_REPORT_PATH_REQUIRED:${name}`);
    const stat = statSync(path.resolve(reportPath));
    if (!stat.isFile() || stat.size < 1 || stat.size > 64 * 1024 * 1024) {
      throw new Error(`AGENT_LIVE_EVAL_GATE_REPORT_INVALID:${name}`);
    }
    // Git commit timestamps have second precision. Allow one second of clock
    // granularity, but reject evidence produced before the immutable commit.
    if (Number(stat.mtimeMs) + 1000 < commitTimestampMs) {
      throw new Error(`AGENT_LIVE_EVAL_GATE_REPORT_PREDATES_COMMIT:${name}`);
    }
  }
  return true;
};

const main = async () => {
  const service = String(
    process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || 'artigen-agent-dev-worker'
  ).trim();
  if (service !== 'artigen-agent-dev-worker') {
    throw new Error('AGENT_LIVE_EVAL_KEYCHAIN_SERVICE_INVALID');
  }
  const attestationPath = path.resolve(String(
    process.env.AGENT_LIVE_EVAL_GATE_ATTESTATION || ''
  ));
  if (!String(process.env.AGENT_LIVE_EVAL_GATE_ATTESTATION || '').trim()) {
    throw new Error('AGENT_LIVE_EVAL_GATE_ATTESTATION_REQUIRED');
  }
  const attestation = JSON.parse(await fs.promises.readFile(attestationPath, 'utf8'));
  const keyMaterial = readMacOsKeychainSecret({
    service,
    account: 'AGENT_LIVE_EVAL_GATE_KEY'
  });
  const repositoryRoot = path.resolve(__dirname, '../..');
  const commitSha = resolveCurrentCommitSha({ cwd: repositoryRoot });
  const commitTimestampMs = Number(execFileSync(
    'git',
    ['show', '-s', '--format=%ct', commitSha],
    { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim()) * 1000;
  assertGateAttestationProvenance({ attestation, commitSha, commitTimestampMs });
  const databaseUrl = readMacOsKeychainSecret({ service, account: 'DATABASE_URL' });
  if (!databaseUrl) throw new Error('AGENT_LIVE_EVAL_DATABASE_URL_REQUIRED');
  const caBase64 = readMacOsKeychainSecret({ service, account: 'PG_SSL_CA_BASE64' });
  const databaseEnv = {
    ...process.env,
    PG_SSL_CA: '',
    PG_SSL_CA_BASE64: '',
    PG_SSL_REQUIRED: '1',
    PG_SSL_REJECT_UNAUTHORIZED: '1',
    ...(caBase64 ? { PG_SSL_CA_BASE64: caBase64 } : {})
  };
  const readinessPool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 15_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    application_name: 'artigen-agent-live-eval-gate',
    ssl: resolvePoolSsl(databaseUrl, databaseEnv)
  });
  let databaseReadiness;
  try {
    databaseReadiness = await assertLiveEvalDatabaseReadiness({
      pool: readinessPool,
      expectedPostgresMajor: EXPECTED_POSTGRES_MAJOR
    });
  } finally {
    await readinessPool.end();
  }
  const manifest = createSignedGateManifest({
    campaignId: attestation.campaignId,
    commitSha,
    matrixHash: LIVE_EVAL_MATRIX_HASH,
    checks: attestation.checks,
    keyMaterial
  });
  const artifactRoot = path.resolve(__dirname, '../../.artifacts/agent-live-eval-gates');
  await fs.promises.mkdir(artifactRoot, { recursive: true, mode: 0o700 });
  const outputPath = path.join(artifactRoot, `${manifest.campaignId}.json`);
  await fs.promises.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx'
  });
  process.stdout.write(`${JSON.stringify({
    event: 'agent_live_eval.gate.created',
    campaignId: manifest.campaignId,
    commitSha: manifest.commitSha,
    matrixHash: manifest.matrixHash,
    databaseReadiness,
    outputPath
  })}\n`);
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      event: 'agent_live_eval.gate.failed',
      code: /^[A-Z][A-Z0-9_]{2,100}$/.test(String(error?.code || ''))
        ? error.code
        : 'AGENT_LIVE_EVAL_GATE_FAILED'
    })}\n`);
    process.exitCode = 1;
  });
}

module.exports = { assertGateAttestationProvenance, main };
