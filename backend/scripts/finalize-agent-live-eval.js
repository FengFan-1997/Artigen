#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { readMacOsKeychainSecret } = require('../lib/local-keychain');
const {
  createSignedFinalReport,
  readJsonEvidence
} = require('../evaluation/harness/live-eval-final-report');
const { resolveCurrentCommitSha } = require('./run-agent-live-eval');

const readFlag = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const main = () => {
  const automatedPath = readFlag('--report');
  const scorePath = readFlag('--score');
  if (!automatedPath || !scorePath) {
    throw new Error('AGENT_LIVE_EVAL_FINAL_INPUTS_REQUIRED');
  }
  const automated = readJsonEvidence(automatedPath, 'AGENT_LIVE_EVAL_FINAL_AUTOMATED');
  const score = readJsonEvidence(scorePath, 'AGENT_LIVE_EVAL_FINAL_BLIND_SCORE');
  const currentCommitSha = resolveCurrentCommitSha();
  if (automated.value.commitSha !== currentCommitSha) {
    throw new Error('AGENT_LIVE_EVAL_FINAL_CURRENT_SHA_MISMATCH');
  }
  const service = String(
    process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || 'artigen-agent-dev-worker'
  ).trim();
  if (service !== 'artigen-agent-dev-worker') {
    throw new Error('AGENT_LIVE_EVAL_KEYCHAIN_SERVICE_INVALID');
  }
  const keyMaterial = readMacOsKeychainSecret({
    service,
    account: 'AGENT_LIVE_EVAL_REPORT_KEY'
  });
  if (!keyMaterial) throw new Error('AGENT_LIVE_EVAL_REPORT_KEY_MISSING');
  const finalReport = createSignedFinalReport({
    automatedReport: automated.value,
    automatedReportSha256: automated.sha256,
    blindScore: score.value,
    blindScoreSha256: score.sha256,
    keyMaterial
  });
  const outputPath = path.resolve(
    readFlag('--out') || path.join(path.dirname(automated.target), 'final-report.signed.json')
  );
  if (path.dirname(outputPath) !== path.dirname(automated.target)) {
    throw new Error('AGENT_LIVE_EVAL_FINAL_OUTPUT_DIR_INVALID');
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(finalReport, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600
  });
  process.stdout.write(`${JSON.stringify({
    event: 'live_eval.finalized',
    commitSha: finalReport.commitSha,
    campaignId: finalReport.campaignId,
    outputPath
  })}\n`);
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(String(error?.code || error?.message || 'AGENT_LIVE_EVAL_FINALIZE_FAILED'));
    process.exitCode = 1;
  }
}

module.exports = { main };
