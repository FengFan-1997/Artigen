const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  LIVE_EVAL_CASES,
  LIVE_EVAL_MATRIX_HASH
} = require('./agent-live-eval-matrix');
const { canonicalJson, parseVersionedKey } = require('./live-eval-gate');

const FINAL_REPORT_VERSION = 'artigen-agent-live-eval-final-v1';
const MAX_REPORT_BYTES = 16 * 1024 * 1024;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value || ''));
const isCommitSha = (value) => /^[a-f0-9]{40}$/i.test(String(value || ''));

const readJsonEvidence = (filePath, code) => {
  const requested = String(filePath || '').trim();
  if (!requested) throw new TypeError(`${code}_PATH_REQUIRED`);
  const target = path.resolve(requested);
  const stat = fs.statSync(target);
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_REPORT_BYTES) {
    throw new TypeError(`${code}_FILE_INVALID`);
  }
  const buffer = fs.readFileSync(target);
  return {
    target,
    sha256: sha256(buffer),
    value: JSON.parse(buffer.toString('utf8'))
  };
};

const expectedMatrixSlots = () => new Set(LIVE_EVAL_CASES.flatMap((entry) => (
  ['v1', 'v2'].map((cohort) => `${entry.id}:${cohort}`)
)));

const validateAutomatedReport = (report) => {
  if (report?.version !== 'agent-live-eval-v3.1') {
    throw new TypeError('AGENT_LIVE_EVAL_FINAL_AUTOMATED_REPORT_INVALID');
  }
  if (
    !/^[a-f0-9-]{16,80}$/i.test(String(report.campaignId || '')) ||
    !isCommitSha(report.commitSha) ||
    String(report.matrixHash || '').toLowerCase() !== LIVE_EVAL_MATRIX_HASH ||
    !isSha256(report.gateManifestSha256)
  ) {
    throw new TypeError('AGENT_LIVE_EVAL_FINAL_PROFILE_INVALID');
  }
  const expected = expectedMatrixSlots();
  const actual = Array.isArray(report.results)
    ? report.results.map((entry) => `${entry?.scenarioId}:${entry?.cohort}`)
    : [];
  if (
    actual.length !== expected.size ||
    new Set(actual).size !== expected.size ||
    actual.some((slot) => !expected.has(slot)) ||
    report.results.some((entry) => entry.cohort === 'v2' && entry.ok !== true) ||
    report.summary?.fullMatrixComplete !== true ||
    report.summary?.automatedGatePassed !== true ||
    report.summary?.blindReviewPending !== true
  ) {
    throw new Error('AGENT_LIVE_EVAL_FINAL_AUTOMATED_GATE_FAILED');
  }
  if (
    report.modelLocks?.text !== 'Qwen/Qwen3-8B' ||
    report.modelLocks?.image !== 'Kwai-Kolors/Kolors' ||
    Number(report.limits?.perRunCredits) !== 50 ||
    Number(report.limits?.qwenCalls) !== 200 ||
    Number(report.limits?.kolorsCalls) !== 16 ||
    Number(report.limits?.wallClockHours) !== 8 ||
    !isSha256(report.blindReview?.definitionSha256)
  ) {
    throw new Error('AGENT_LIVE_EVAL_FINAL_CONTRACT_INVALID');
  }
  return report;
};

const validateBlindScore = (score, definitionSha256) => {
  if (
    score?.version !== 'agent-live-eval-blind-score-v1' ||
    score?.passed !== true ||
    score?.definitionSha256 !== definitionSha256 ||
    Number(score?.cases) !== 2 ||
    Number(score?.criteriaPerCase) !== 5 ||
    Number(score?.candidateAverageScore) < 4 ||
    Number(score?.candidateHardConstraintPassRate) !== 1 ||
    Number(score?.candidateAverageScore) < Number(score?.baselineAverageScore) ||
    Number(score?.candidateWins) < Number(score?.baselineWins)
  ) {
    throw new Error('AGENT_LIVE_EVAL_FINAL_BLIND_GATE_FAILED');
  }
  return score;
};

const createSignedFinalReport = ({
  automatedReport,
  automatedReportSha256,
  blindScore,
  blindScoreSha256,
  keyMaterial,
  createdAt = new Date()
} = {}) => {
  const automated = validateAutomatedReport(automatedReport);
  const score = validateBlindScore(blindScore, automated.blindReview.definitionSha256);
  if (!isSha256(automatedReportSha256) || !isSha256(blindScoreSha256)) {
    throw new TypeError('AGENT_LIVE_EVAL_FINAL_EVIDENCE_DIGEST_INVALID');
  }
  const created = new Date(createdAt);
  if (!Number.isFinite(created.getTime())) {
    throw new TypeError('AGENT_LIVE_EVAL_FINAL_CREATED_AT_INVALID');
  }
  const payload = {
    version: FINAL_REPORT_VERSION,
    campaignId: automated.campaignId,
    commitSha: automated.commitSha,
    matrixHash: automated.matrixHash,
    gateManifestSha256: automated.gateManifestSha256,
    automatedReportSha256: String(automatedReportSha256).toLowerCase(),
    blindScoreSha256: String(blindScoreSha256).toLowerCase(),
    blindDefinitionSha256: automated.blindReview.definitionSha256,
    createdAt: created.toISOString(),
    eligibleForOwnerCanary: true,
    automated: {
      routeAccuracy: automated.summary.routeAccuracy,
      schemaFirstValidRate: automated.summary.schemaFirstValidRate,
      v1CompletionRate: automated.summary.v1?.completionRate,
      v2CompletionRate: automated.summary.v2?.completionRate,
      modelCallReduction: automated.summary.comparison?.modelCallReduction,
      tokenReduction: automated.summary.comparison?.tokenReduction,
      elapsedRegression: automated.summary.comparison?.elapsedRegression
    },
    blind: {
      candidateAverageScore: score.candidateAverageScore,
      baselineAverageScore: score.baselineAverageScore,
      candidateHardConstraintPassRate: score.candidateHardConstraintPassRate,
      candidateWins: score.candidateWins,
      baselineWins: score.baselineWins,
      ties: score.ties
    }
  };
  const key = parseVersionedKey(keyMaterial, 'AGENT_LIVE_EVAL_REPORT_KEY_INVALID');
  const signature = crypto.createHmac('sha256', key).update(canonicalJson(payload)).digest('hex');
  return Object.freeze({
    ...payload,
    signature: Object.freeze({ algorithm: 'hmac-sha256', value: signature })
  });
};

const verifySignedFinalReport = ({
  report,
  keyMaterial,
  expectedCommitSha,
  expectedMatrixHash = LIVE_EVAL_MATRIX_HASH
} = {}) => {
  if (
    !report ||
    report.version !== FINAL_REPORT_VERSION ||
    report.eligibleForOwnerCanary !== true ||
    String(report.commitSha || '').toLowerCase() !== String(expectedCommitSha || '').toLowerCase() ||
    String(report.matrixHash || '').toLowerCase() !== String(expectedMatrixHash || '').toLowerCase()
  ) {
    throw new Error('AGENT_LIVE_EVAL_FINAL_REPORT_MISMATCH');
  }
  const { signature, ...payload } = report;
  const key = parseVersionedKey(keyMaterial, 'AGENT_LIVE_EVAL_REPORT_KEY_INVALID');
  const expected = crypto.createHmac('sha256', key).update(canonicalJson(payload)).digest();
  const actual = Buffer.from(String(signature?.value || ''), 'hex');
  if (
    signature?.algorithm !== 'hmac-sha256' ||
    actual.length !== expected.length ||
    !crypto.timingSafeEqual(actual, expected)
  ) {
    throw new Error('AGENT_LIVE_EVAL_FINAL_SIGNATURE_INVALID');
  }
  return Object.freeze({
    campaignId: report.campaignId,
    commitSha: report.commitSha,
    matrixHash: report.matrixHash,
    reportSha256: sha256(Buffer.from(canonicalJson(report), 'utf8')),
    createdAt: report.createdAt
  });
};

const readAndVerifyFinalReport = ({ reportPath, ...options } = {}) => {
  const evidence = readJsonEvidence(reportPath, 'AGENT_LIVE_EVAL_FINAL_REPORT');
  return {
    ...verifySignedFinalReport({ report: evidence.value, ...options }),
    fileSha256: evidence.sha256
  };
};

module.exports = {
  FINAL_REPORT_VERSION,
  createSignedFinalReport,
  readAndVerifyFinalReport,
  readJsonEvidence,
  validateAutomatedReport,
  validateBlindScore,
  verifySignedFinalReport
};
