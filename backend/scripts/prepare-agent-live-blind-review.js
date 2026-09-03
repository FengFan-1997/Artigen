#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { readMacOsKeychainSecret } = require('../lib/local-keychain');
const { decryptEvidence } = require('../evaluation/harness/live-eval-evidence');
const {
  materializeBlindReviewAssets
} = require('../evaluation/harness/live-eval-blind-review-materializer');

const readFlag = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const main = async () => {
  const reviewFlag = readFlag('--review');
  const mappingFlag = readFlag('--mapping');
  const privateDirFlag = readFlag('--private-dir');
  if (!reviewFlag || !mappingFlag || !privateDirFlag) {
    throw new Error('AGENT_LIVE_EVAL_BLIND_PREPARE_FLAGS_REQUIRED');
  }
  const service = String(
    process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || 'artigen-agent-dev-worker'
  ).trim();
  if (service !== 'artigen-agent-dev-worker') {
    throw new Error('AGENT_LIVE_EVAL_KEYCHAIN_SERVICE_INVALID');
  }
  const keyMaterial = readMacOsKeychainSecret({
    service,
    account: 'AGENT_LIVE_EVAL_EVIDENCE_KEY'
  });
  if (!keyMaterial) throw new Error('AGENT_LIVE_EVAL_EVIDENCE_KEY_MISSING');

  const review = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), reviewFlag), 'utf8'));
  const envelope = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), mappingFlag), 'utf8'));
  const mapping = JSON.parse(decryptEvidence({ envelope, keyMaterial }).toString('utf8'));
  const result = await materializeBlindReviewAssets({
    review,
    mapping,
    privateDir: path.resolve(process.cwd(), privateDirFlag),
    keyMaterial
  });
  process.stdout.write(`${JSON.stringify({
    reviewPath: result.reviewPath,
    assetCount: result.assetCount
  }, null, 2)}\n`);
};

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.code || error?.message || 'AGENT_LIVE_EVAL_BLIND_PREPARE_FAILED'));
    process.exitCode = 1;
  });
}

module.exports = { main };
