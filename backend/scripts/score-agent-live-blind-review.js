#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { readMacOsKeychainSecret } = require('../lib/local-keychain');
const { decryptEvidence } = require('../evaluation/harness/live-eval-evidence');
const { scoreLiveBlindReview } = require('../evaluation/harness/live-eval-blind-review-score');

const readFlag = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const main = () => {
  const reviewPath = path.resolve(process.cwd(), readFlag('--review'));
  const mappingPath = path.resolve(process.cwd(), readFlag('--mapping'));
  const outputFlag = readFlag('--out');
  if (!readFlag('--review') || !readFlag('--mapping')) {
    throw new Error('AGENT_LIVE_EVAL_BLIND_REVIEW_AND_MAPPING_REQUIRED');
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
  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  const envelope = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  const mapping = JSON.parse(decryptEvidence({ envelope, keyMaterial }).toString('utf8'));
  const result = scoreLiveBlindReview({ review, mapping });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (outputFlag) {
    fs.writeFileSync(path.resolve(process.cwd(), outputFlag), output, { flag: 'wx', mode: 0o600 });
  }
  process.stdout.write(output);
  if (!result.passed) process.exitCode = 1;
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(String(error?.code || error?.message || 'AGENT_LIVE_EVAL_BLIND_SCORE_FAILED'));
    process.exitCode = 1;
  }
}

module.exports = { main };
