#!/usr/bin/env node

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const { readMacOsKeychainSecret } = require('../lib/local-keychain');

const KEYCHAIN_SERVICE = String(
  process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || 'artigen-agent-dev-worker'
).trim();
const secretNames = [
  'DATABASE_URL',
  'AGENT_PAYLOAD_ENCRYPTION_KEY',
  'SILICONFLOW_API_KEY',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'AGENT_LIVE_EVAL_GATE_KEY'
];
const optionalSecretNames = [
  'AGENT_WORKER_RELAY_SECRET',
  'AGENT_WORKER_RELAY_URL'
];

const { AgentLiveEvalHarness } = require('../evaluation/harness/agent-live-eval-harness');
const {
  LIVE_EVAL_CASES,
  LIVE_EVAL_MATRIX_HASH
} = require('../evaluation/harness/agent-live-eval-matrix');
const { buildBlindReviewBundle } = require('../evaluation/harness/live-eval-blind-review');
const {
  keyFromMaterial,
  purgeExpiredEvidence
} = require('../evaluation/harness/live-eval-evidence');
const {
  parseVersionedKey,
  readAndVerifyGateManifest
} = require('../evaluation/harness/live-eval-gate');

const loadLiveEvalSecrets = ({
  env = process.env,
  readSecret = readMacOsKeychainSecret,
  service = String(env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || KEYCHAIN_SERVICE).trim()
} = {}) => {
  if (service !== 'artigen-agent-dev-worker') {
    throw new Error('AGENT_LIVE_EVAL_KEYCHAIN_SERVICE_INVALID');
  }
  const runtimeEnv = { ...env };
  const missing = [];
  for (const name of [...secretNames, ...optionalSecretNames]) {
    const value = readSecret({ service, account: name });
    if (!value && secretNames.includes(name)) missing.push(name);
    else if (value) runtimeEnv[name] = value;
  }
  const evidenceKeyMaterial = readSecret({
    service,
    account: 'AGENT_LIVE_EVAL_EVIDENCE_KEY'
  });
  if (!evidenceKeyMaterial) missing.push('AGENT_LIVE_EVAL_EVIDENCE_KEY');
  if (missing.length) {
    throw new Error(`AGENT_LIVE_EVAL_KEYCHAIN_INCOMPLETE:${missing.join(',')}`);
  }
  keyFromMaterial(evidenceKeyMaterial);
  parseVersionedKey(runtimeEnv.AGENT_LIVE_EVAL_GATE_KEY);
  Object.assign(runtimeEnv, {
    NODE_ENV: 'test',
    APP_ENV: 'dev',
    AGENT_LIVE_EVAL_MODE: 'true',
    AGENT_LIVE_EVAL_ALLOW_REAL_PROVIDER: '1',
    AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION:
      runtimeEnv.AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION || '20',
    AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION:
      runtimeEnv.AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION || '160'
  });
  return { runtimeEnv, evidenceKeyMaterial };
};

const resolveCurrentCommitSha = ({ cwd = path.resolve(__dirname, '../..') } = {}) => {
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commitSha)) throw new Error('AGENT_LIVE_EVAL_GIT_SHA_INVALID');
  const trackedChanges = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=no'],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
  if (trackedChanges) throw new Error('AGENT_LIVE_EVAL_TRACKED_WORKTREE_DIRTY');
  return commitSha;
};

const resolveSelection = (env = process.env) => {
  const selectedCase = String(env.AGENT_LIVE_EVAL_CASE || '').trim();
  const selectedCohort = String(env.AGENT_LIVE_EVAL_COHORT || 'both').trim().toLowerCase();
  if (!['both', 'v1', 'v2'].includes(selectedCohort)) {
    throw new Error('AGENT_LIVE_EVAL_COHORT_INVALID');
  }
  const selected = LIVE_EVAL_CASES.filter((entry) => !selectedCase || entry.id === selectedCase);
  if (!selected.length) throw new Error(`AGENT_LIVE_EVAL_CASE_INVALID:${selectedCase}`);
  return { selectedCase, selectedCohort, selected };
};

const safeFailureCode = (error, fallback = 'AGENT_LIVE_EVAL_CASE_FAILED') => {
  const candidate = String(error?.code || '');
  return /^[A-Z][A-Z0-9_]{2,100}$/.test(candidate) ? candidate : fallback;
};

const failureFingerprint = (error) => crypto.createHash('sha256')
  .update(`${String(error?.name || 'Error')}\0${String(error?.code || '')}\0${String(error?.message || '')}`)
  .digest('hex');

const contentFreeFailure = ({ entry, cohort, error }) => ({
  scenarioId: entry.id,
  cohort,
  ok: false,
  code: safeFailureCode(error),
  diagnosticHash: failureFingerprint(error)
});

const median = (values) => {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

const summarize = (results) => {
  const safeResults = Array.isArray(results) ? results : [];
  const agentCases = safeResults.filter((entry) => entry.scenarioId !== 'consultation-route');
  const byCohort = (cohort) => agentCases.filter((entry) => entry.cohort === cohort);
  const cohortSummary = (cohort) => {
    const entries = byCohort(cohort);
    const passed = entries.filter((entry) => entry.ok);
    return {
      cases: entries.length,
      passed: passed.length,
      completionRate: entries.length ? passed.length / entries.length : null,
      medianModelCalls: median(passed.map((entry) => entry.modelCalls)),
      medianElapsedMs: median(passed.map((entry) => entry.elapsedMs)),
      medianTokens: median(passed.map((entry) => Number(entry.inputTokens || 0) + Number(entry.outputTokens || 0))),
      medianChargedCredits: median(passed.map((entry) => Number(entry.chargedCredits || 0))),
      totalChargedCredits: passed.reduce((sum, entry) => sum + Number(entry.chargedCredits || 0), 0),
      schemaChecks: passed.reduce((sum, entry) => sum + Number(entry.schemaChecks || 0), 0),
      schemaFirstValid: passed.reduce((sum, entry) => sum + Number(entry.schemaFirstValid || 0), 0)
    };
  };
  const v1 = cohortSummary('v1');
  const v2 = cohortSummary('v2');
  const ratioReduction = (baseline, candidate) => (
    Number.isFinite(baseline) && baseline > 0 && Number.isFinite(candidate)
      ? (baseline - candidate) / baseline
      : null
  );
  const candidateFailures = safeResults.filter((entry) => entry.cohort === 'v2' && !entry.ok).length;
  const expectedPairs = new Set(LIVE_EVAL_CASES.map((entry) => entry.id));
  const expectedSlots = new Set([...expectedPairs].flatMap((scenarioId) => (
    ['v1', 'v2'].map((cohort) => `${scenarioId}:${cohort}`)
  )));
  const actualSlots = safeResults.map((entry) => `${entry.scenarioId}:${entry.cohort}`);
  const fullMatrixComplete = safeResults.length === expectedSlots.size &&
    new Set(actualSlots).size === expectedSlots.size &&
    actualSlots.every((slot) => expectedSlots.has(slot));
  const routeResults = safeResults.filter((entry) => entry.scenarioId === 'consultation-route');
  const routeAccuracy = routeResults.length
    ? routeResults.filter((entry) => entry.ok && entry.routeKind === 'reply').length / routeResults.length
    : null;
  const schemaChecks = v2.schemaChecks;
  const schemaFirstValidRate = schemaChecks > 0 ? v2.schemaFirstValid / schemaChecks : null;
  const modelCallReduction = ratioReduction(v1.medianModelCalls, v2.medianModelCalls);
  const tokenReduction = ratioReduction(v1.medianTokens, v2.medianTokens);
  const creditReduction = ratioReduction(v1.medianChargedCredits, v2.medianChargedCredits);
  const elapsedRegression = (
    Number.isFinite(v1.medianElapsedMs) && v1.medianElapsedMs > 0 &&
    Number.isFinite(v2.medianElapsedMs)
  ) ? (v2.medianElapsedMs - v1.medianElapsedMs) / v1.medianElapsedMs : null;
  const performanceComparable = [modelCallReduction, tokenReduction, elapsedRegression]
    .every(Number.isFinite);
  const automatedGatePassed = fullMatrixComplete &&
    candidateFailures === 0 &&
    Number(routeAccuracy) >= 0.95 &&
    Number(schemaFirstValidRate) >= 0.95 &&
    Number(v2.completionRate) >= 0.9 &&
    Number(v2.completionRate) >= Number(v1.completionRate) &&
    performanceComparable &&
    modelCallReduction >= 0.2 &&
    tokenReduction >= 0.1 &&
    elapsedRegression <= 0.1;
  const blindReviewPending = safeResults.some((entry) => (
    entry.ok && ['text-to-image', 'reference-image'].includes(entry.scenarioId)
  ));
  return {
    v1,
    v2,
    comparison: {
      modelCallReduction,
      tokenReduction,
      creditReduction,
      elapsedRegression
    },
    routeAccuracy,
    schemaFirstValidRate,
    fullMatrixComplete,
    automatedGatePassed,
    blindReviewPending,
    productionCanaryEligible: automatedGatePassed && !blindReviewPending
  };
};

const writeReport = async ({ report, reportDir, reportPath }) => {
  await fs.promises.mkdir(reportDir, { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
};

const main = async () => {
  const { runtimeEnv, evidenceKeyMaterial } = loadLiveEvalSecrets();
  Object.assign(process.env, runtimeEnv);
  const commitSha = resolveCurrentCommitSha();
  const gate = readAndVerifyGateManifest({
    manifestPath: runtimeEnv.AGENT_LIVE_EVAL_GATE_MANIFEST,
    keyMaterial: runtimeEnv.AGENT_LIVE_EVAL_GATE_KEY,
    expectedCommitSha: commitSha,
    expectedMatrixHash: LIVE_EVAL_MATRIX_HASH
  });
  const { selectedCase, selectedCohort, selected } = resolveSelection(runtimeEnv);
  const artifactRoot = path.resolve(__dirname, '../../.artifacts');
  const reportId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  const reportDir = path.join(artifactRoot, `agent-live-eval-${reportId}`);
  const reportPath = path.join(reportDir, 'report.json');
  await purgeExpiredEvidence({ rootDir: artifactRoot, retentionDays: 30 });
  const pool = new Pool({ connectionString: runtimeEnv.DATABASE_URL, max: 20 });
  let harness = null;
  const results = [];
  try {
    harness = await AgentLiveEvalHarness.create({
      pool,
      env: process.env,
      evidenceRoot: reportDir,
      evidenceKeyMaterial,
      campaignId: gate.campaignId,
      commitSha: gate.commitSha,
      matrixHash: gate.matrixHash
    });
    const cohorts = selectedCohort === 'both' ? ['v1', 'v2'] : [selectedCohort];
    for (const entry of selected) {
      for (const cohort of cohorts) {
        const startedAt = Date.now();
        process.stdout.write(`${JSON.stringify({
          event: 'live_eval.case.started',
          scenarioId: entry.id,
          cohort
        })}\n`);
        try {
          const result = await harness.runCase(entry, cohort);
          results.push({ ...result, ok: true });
          process.stdout.write(`${JSON.stringify({
            event: 'live_eval.case.succeeded',
            scenarioId: entry.id,
            cohort,
            runId: result.runId || null,
            elapsedMs: Date.now() - startedAt
          })}\n`);
        } catch (error) {
          const failure = contentFreeFailure({ entry, cohort, error });
          results.push({ ...failure, elapsedMs: Date.now() - startedAt });
          await harness.cancelActiveCohort(cohort);
          process.stdout.write(`${JSON.stringify({
            event: 'live_eval.case.failed',
            scenarioId: entry.id,
            cohort,
            code: failure.code
          })}\n`);
        }
      }
      await harness.assertBatchDrained();
    }
    const summary = summarize(results);
    const blindReviewBundle = summary.blindReviewPending
      ? await buildBlindReviewBundle({
          results,
          reportDir,
          keyMaterial: evidenceKeyMaterial
        })
      : null;
    const report = {
      version: 'agent-live-eval-v3.1',
      createdAt: new Date().toISOString(),
      campaignId: gate.campaignId,
      gateManifestSha256: gate.manifestSha256,
      commitSha: gate.commitSha,
      matrixHash: gate.matrixHash,
      modelLocks: {
        text: 'Qwen/Qwen3-8B',
        image: 'Kwai-Kolors/Kolors'
      },
      limits: {
        perRunCredits: 50,
        qwenCalls: 200,
        kolorsCalls: 16,
        wallClockHours: 8
      },
      selectedCase: selectedCase || 'all',
      selectedCohort,
      results,
      summary,
      blindReview: blindReviewBundle
        ? {
            publicFile: path.relative(reportDir, blindReviewBundle.publicPath),
            encryptedMappingFile: path.relative(reportDir, blindReviewBundle.encryptedMappingPath),
            caseCount: blindReviewBundle.caseCount,
            definitionSha256: blindReviewBundle.definitionSha256
          }
        : null,
      traceSha256: harness.trace.digest(),
      requestTotals: harness.auditor.snapshot()
        ? {
            qwenCalls: harness.auditor.qwenCalls,
            kolorsCalls: harness.auditor.kolorsCalls
          }
        : null
    };
    await writeReport({ report, reportDir, reportPath });
    process.stdout.write(`${JSON.stringify({
      event: 'live_eval.completed',
      ok: summary.automatedGatePassed,
      blindReviewPending: summary.blindReviewPending,
      reportPath
    })}\n`);
    if (!summary.automatedGatePassed) process.exitCode = 1;
  } catch (error) {
    await writeReport({
      reportDir,
      reportPath,
      report: {
        version: 'agent-live-eval-v3.1',
        createdAt: new Date().toISOString(),
        ok: false,
        code: safeFailureCode(error, 'AGENT_LIVE_EVAL_FAILED'),
        diagnosticHash: failureFingerprint(error),
        results
      }
    });
    error.reportPath = reportPath;
    throw error;
  } finally {
    await harness?.close().catch(() => {});
    await pool.end().catch(() => {});
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({
      event: 'live_eval.failed',
      code: safeFailureCode(error, 'AGENT_LIVE_EVAL_FAILED'),
      diagnosticHash: failureFingerprint(error),
      reportPath: error?.reportPath || null
    }));
    process.exitCode = 1;
  });
}

module.exports = {
  loadLiveEvalSecrets,
  median,
  resolveSelection,
  resolveCurrentCommitSha,
  safeFailureCode,
  failureFingerprint,
  summarize
};
