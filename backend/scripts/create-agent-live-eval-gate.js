#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { readMacOsKeychainSecret } = require('../lib/local-keychain');
const {
  LIVE_EVAL_MATRIX_HASH
} = require('../evaluation/harness/agent-live-eval-matrix');
const {
  createSignedGateManifest
} = require('../evaluation/harness/live-eval-gate');
const { resolveCurrentCommitSha } = require('./run-agent-live-eval');

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
  const commitSha = resolveCurrentCommitSha();
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

module.exports = { main };
