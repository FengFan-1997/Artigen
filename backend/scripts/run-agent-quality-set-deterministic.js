const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { AgentRuntimeHarness } = require('../evaluation/harness/agent-runtime-harness');
const { buildQualityScenario } = require('../evaluation/harness/quality-case-scenario');
const {
  compileQualityCase,
  validateCompiledQualityCase
} = require('../services/agent-quality-evaluation');
const { checkDatabase } = require('../services/readiness-service');

const datasetPath = path.resolve(__dirname, '../evaluation/agent-quality-set.json');
const manifest = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const group = String(process.env.AGENT_QUALITY_GROUP || 'all').trim();
const caseId = String(process.env.AGENT_QUALITY_CASE || '').trim();
const concurrency = Math.max(1, Math.min(4, Number(process.env.AGENT_QUALITY_CONCURRENCY || 2)));
const reportDir = path.resolve(
  process.env.AGENT_HARNESS_REPORT_DIR || path.join(__dirname, '../../.artifacts/agent-harness-v3')
);

const extensionForMime = (mimeType) => ({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'text/plain': '.txt',
  'text/markdown': '.md'
}[mimeType] || '.bin');

const mimeForFixture = (filename) => {
  if (/\.png$/i.test(filename)) return 'image/png';
  if (/\.md$/i.test(filename)) return 'text/markdown';
  return 'text/plain';
};

const contentFreeFailure = (entry, error) => ({
  id: entry.id,
  deliverable: entry.deliverable,
  ok: false,
  code: String(error?.code || error?.message || 'AGENT_HARNESS_CASE_FAILED').slice(0, 160),
  detail: String(error?.message || '').startsWith('AGENT_HARNESS_')
    ? String(error.message).slice(0, 500)
    : undefined,
  databaseState: error?.harnessDatabaseState || undefined,
  trace: error?.harnessTrace || undefined
});

const validateResult = ({ entry, terminal, harness, elapsedMs, expectedErrorCode }) => {
  const snapshot = terminal.snapshot.persistent;
  const run = snapshot.run;
  const errors = [];
  const eventTypes = snapshot.events.map((event) => event.event_type);
  const toolNames = harness.trace.snapshot()
    .filter((item) => item.type === 'tool.call')
    .map((item) => item.toolName);
  if (run.status !== entry.expectedTerminalStatus) {
    errors.push(`terminal:${run.status}`);
  }
  if (expectedErrorCode && run.error_code !== expectedErrorCode) {
    errors.push(`error_code:${run.error_code || 'missing'}`);
  }
  for (const event of entry.requiredEvents) {
    if (!eventTypes.includes(event)) errors.push(`event_missing:${event}`);
  }
  for (const event of entry.forbiddenEvents) {
    if (eventTypes.includes(event)) errors.push(`event_forbidden:${event}`);
  }
  for (const tool of entry.expectedTools) {
    if (!toolNames.includes(tool) && entry.expectedTerminalStatus === 'succeeded') {
      errors.push(`tool_missing:${tool}`);
    }
  }
  for (const tool of entry.forbiddenTools) {
    if (toolNames.includes(tool)) errors.push(`tool_forbidden:${tool}`);
  }
  if (harness.transport.requests.length > entry.maxModelTurns) {
    errors.push(`model_turns:${harness.transport.requests.length}`);
  }
  if (elapsedMs > entry.maxDurationMs) errors.push(`duration_ms:${elapsedMs}`);
  if (Number(run.charged_credits || 0) > entry.maxCredits) {
    errors.push(`charged_credits:${run.charged_credits}`);
  }
  if (Number(run.replan_count || 0) > entry.maxReplans) {
    errors.push(`replans:${run.replan_count}`);
  }
  if (entry.expectedTerminalStatus === 'succeeded') {
    if (!snapshot.artifacts.length) errors.push('artifacts:missing');
    if (snapshot.artifacts.some((artifact) => artifact.verification_status !== 'passed')) {
      errors.push('artifacts:unverified');
    }
    if (run.semantic_verification?.passed !== true) errors.push('verifier:not_passed');
  } else {
    if (harness.kolors.calls.length !== 0) errors.push('invalid_input_generated_image');
    if (snapshot.holds.some((hold) => hold.status === 'settled')) errors.push('failed_hold_settled');
  }
  if (errors.length) {
    const error = new Error(`AGENT_HARNESS_CASE_INVARIANT:${errors.join(',')}`);
    error.code = 'AGENT_HARNESS_CASE_INVARIANT';
    throw error;
  }
  return {
    id: entry.id,
    deliverable: entry.deliverable,
    ok: true,
    status: run.status,
    modelTurns: harness.transport.requests.length,
    toolCalls: toolNames.length,
    artifacts: snapshot.artifacts.length,
    chargedCredits: Number(run.charged_credits || 0),
    durationMs: elapsedMs,
    traceSha256: harness.trace.digest()
  };
};

const runCase = async (pool, entry) => {
  let harness = null;
  let runId = null;
  const startedAt = Date.now();
  try {
    harness = await AgentRuntimeHarness.create({ pool, providerScript: [] });
    const assetIds = [];
    const inputPaths = [];
    for (const fixture of entry.fixedInputs) {
      const buffer = fs.readFileSync(fixture.absolutePath);
      const mimeType = mimeForFixture(fixture.absolutePath);
      const stored = await harness.addInputAsset({
        buffer,
        mimeType,
        metadata: { fixture: true }
      });
      assetIds.push(stored.assetId);
      inputPaths.push(
        `/tmp/artigen-workspace/inputs/${stored.assetId}${extensionForMime(stored.mimeType)}`
      );
    }
    const scenario = buildQualityScenario(entry, { inputPaths });
    harness.transport.push(...scenario.providerScript);
    const capabilities = Object.fromEntries(entry.capabilities.map((capability) => [capability, true]));
    const created = await harness.createRun({
      objective: entry.objective,
      deliverables: [entry.deliverable],
      capabilities,
      browserConfig: {
        allowedOrigins: scenario.taskSpec.allowedOrigins
      },
      maxCredits: entry.maxCredits,
      taskSpec: scenario.taskSpec,
      assetIds
    });
    runId = created.runId;
    const terminal = await harness.runToTerminal(created.runId);
    await harness.assertInvariants(created.runId);
    return validateResult({
      entry,
      terminal,
      harness,
      elapsedMs: Date.now() - startedAt,
      expectedErrorCode: scenario.expectedErrorCode
    });
  } catch (error) {
    // RuntimeTraceSink is deliberately content-free. Persist only bounded state
    // counts and hashes so CI failures are diagnosable without exporting prompts,
    // tool bodies, credentials, user text, or reasoning.
    if (harness) {
      error.harnessTrace = harness.trace.snapshot();
      if (runId) {
        const state = await harness.snapshot(runId).catch(() => null);
        if (state) {
          error.harnessDatabaseState = {
            status: state.persistent.run.status,
            phase: state.reconstructed.phaseFromEvents,
            eventCount: state.reconstructed.eventCount,
            stepCount: state.reconstructed.stepCount,
            modelReceipts: state.reconstructed.modelReceipts,
            budget: state.reconstructed.budget,
            artifactCount: state.reconstructed.artifacts.length,
            subagentCount: state.reconstructed.subagents.length,
            replayDigest: state.reconstructed.digest
          };
        }
      }
    }
    throw error;
  } finally {
    await harness?.cleanup();
  }
};

const parallelMap = async (items, limit, callback) => {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await callback(items[index]);
      } catch (error) {
        results[index] = contentFreeFailure(items[index], error);
      }
    }
  });
  await Promise.all(workers);
  return results;
};

const main = async () => {
  if (process.env.RUN_POSTGRES_INTEGRATION !== '1') {
    throw new Error('RUN_POSTGRES_INTEGRATION=1 is required; Harness V3 never silently skips');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const selected = manifest.cases
    .filter((task) => group === 'all' || task.deliverable === group)
    .filter((task) => !caseId || task.id === caseId)
    .map((task) => compileQualityCase({
      manifest,
      task,
      evaluationDir: path.dirname(datasetPath)
    }));
  if (!selected.length) throw new Error(`AGENT_QUALITY_GROUP_INVALID:${group}`);
  for (const entry of selected) {
    const errors = validateCompiledQualityCase(entry);
    if (errors.length) throw new Error(`${entry.id}:${errors.join(',')}`);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: concurrency * 4 + 2 });
  try {
    const readiness = await checkDatabase(pool);
    if (!readiness.ok || readiness.migration !== '027_agent_live_eval_capacity_aggregate') {
      throw new Error(`AGENT_HARNESS_DATABASE_NOT_READY:${readiness.migration || 'unknown'}`);
    }
    const results = await parallelMap(selected, concurrency, (entry) => runCase(pool, entry));
    const report = {
      ok: results.every((result) => result.ok),
      runtime: manifest.runtime,
      group,
      cases: results.length,
      passed: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      results
    };
    await fs.promises.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `deterministic-${group}.json`);
    await fs.promises.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    code: String(error?.code || error?.message || 'AGENT_HARNESS_FAILED').slice(0, 200)
  }, null, 2));
  process.exitCode = 1;
});
