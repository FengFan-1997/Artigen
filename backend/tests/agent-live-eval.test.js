const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  LIVE_EVAL_CASES,
  LIVE_EVAL_MATRIX_HASH,
  getLiveEvalCase
} = require('../evaluation/harness/agent-live-eval-matrix');
const {
  AgentLiveEvalHarness,
  LIVE_EVAL_DATABASE,
  MAX_WALL_CLOCK_MS,
  assertLiveEvalDatabaseSafety,
  assertLiveEvalProcessSafety,
  fixtureForLiveEval,
  liveEvalEnv
} = require('../evaluation/harness/agent-live-eval-harness');
const {
  decryptEvidence,
  encryptEvidence,
  purgeExpiredEvidence,
  writeEncryptedEvidence
} = require('../evaluation/harness/live-eval-evidence');
const {
  REVIEW_CRITERIA,
  buildBlindReviewBundle,
  reviewDefinitionSha256
} = require('../evaluation/harness/live-eval-blind-review');
const {
  materializeBlindReviewAssets
} = require('../evaluation/harness/live-eval-blind-review-materializer');
const { scoreLiveBlindReview } = require('../evaluation/harness/live-eval-blind-review-score');
const {
  createSignedFinalReport,
  verifySignedFinalReport
} = require('../evaluation/harness/live-eval-final-report');
const {
  OWNER_CANARY_SCENARIOS,
  createSignedOwnerCanaryPlan,
  verifySignedOwnerCanaryPlan
} = require('../evaluation/harness/live-eval-owner-canary');
const { LiveModelAuditor } = require('../evaluation/harness/live-model-auditor');
const {
  PINNED_MINIO_DIGEST,
  createSignedGateManifest,
  verifySignedGateManifest
} = require('../evaluation/harness/live-eval-gate');
const { RuntimeTestController } = require('../evaluation/harness/runtime-test-controller');
const { RuntimeTraceSink } = require('../evaluation/harness/runtime-trace-sink');
const { createAgentModelProvider } = require('../services/agent-model-provider');
const {
  loadLiveEvalSecrets,
  resolveSelection,
  summarize
} = require('../scripts/run-agent-live-eval');

test('Live Harness V3.1 is fail-closed outside explicit test + dev + real-provider mode', () => {
  const safe = liveEvalEnv({}, { AGENT_LIVE_EVAL_ALLOW_REAL_PROVIDER: '1' });
  assert.equal(assertLiveEvalProcessSafety(safe), true);
  for (const override of [
    { NODE_ENV: 'production' },
    { APP_ENV: 'production' },
    { AGENT_LIVE_EVAL_MODE: 'false' },
    { AGENT_LIVE_EVAL_ALLOW_REAL_PROVIDER: '0' },
    { AGENT_RUNTIME_DRIVER: 'fixture' }
  ]) {
    assert.throws(
      () => assertLiveEvalProcessSafety({ ...safe, ...override }),
      /AGENT_LIVE_EVAL_.*FORBIDDEN/
    );
  }
  assert.equal(MAX_WALL_CLOCK_MS, 8 * 60 * 60 * 1000);
});

test('Live Harness V3.1 accepts only the exact dev_artigen database identity', () => {
  assert.equal(assertLiveEvalDatabaseSafety({ databaseName: LIVE_EVAL_DATABASE }), true);
  for (const databaseName of ['artigen', 'artigen_dev', 'neondb', 'production', '']) {
    assert.throws(
      () => assertLiveEvalDatabaseSafety({ databaseName }),
      /AGENT_LIVE_EVAL_DATABASE_FORBIDDEN/
    );
  }
  assert.throws(
    () => assertLiveEvalDatabaseSafety({
      databaseName: LIVE_EVAL_DATABASE,
      expectedName: 'other_dev'
    }),
    /AGENT_LIVE_EVAL_DATABASE_FORBIDDEN/
  );
});

test('Live eval runner is import-safe and loads only the dedicated DEV keychain service', () => {
  const secrets = new Map([
    ['DATABASE_URL', 'postgres://synthetic/dev_artigen'],
    ['AGENT_PAYLOAD_ENCRYPTION_KEY', 'payload-key'],
    ['SILICONFLOW_API_KEY', 'provider-key'],
    ['S3_ENDPOINT', 'https://s3.invalid'],
    ['S3_BUCKET', 'dev-bucket'],
    ['S3_REGION', 'synthetic-region'],
    ['S3_ACCESS_KEY_ID', 'access-key'],
    ['S3_SECRET_ACCESS_KEY', 'secret-key'],
    ['AGENT_LIVE_EVAL_GATE_KEY', `v1:hex:${'ab'.repeat(32)}`],
    ['AGENT_LIVE_EVAL_EVIDENCE_KEY', `v1:hex:${'ef'.repeat(32)}`]
  ]);
  const loaded = loadLiveEvalSecrets({
    env: {},
    service: 'artigen-agent-dev-worker',
    readSecret: ({ account }) => secrets.get(account) || ''
  });
  assert.equal(loaded.runtimeEnv.NODE_ENV, 'test');
  assert.equal(loaded.runtimeEnv.APP_ENV, 'dev');
  assert.equal(loaded.runtimeEnv.DATABASE_URL, 'postgres://synthetic/dev_artigen');
  assert.equal(
    loaded.runtimeEnv.CUA_PYTHON,
    path.resolve(__dirname, '../.venv-agent/bin/python')
  );
  assert.equal(loaded.evidenceKeyMaterial, secrets.get('AGENT_LIVE_EVAL_EVIDENCE_KEY'));
  assert.throws(
    () => loadLiveEvalSecrets({ service: 'artigen-production', readSecret: () => 'x' }),
    /KEYCHAIN_SERVICE_INVALID/
  );
  assert.throws(
    () => loadLiveEvalSecrets({ service: 'artigen-agent-dev-worker', readSecret: () => '' }),
    /KEYCHAIN_INCOMPLETE/
  );
});

test('Live Harness closes partial construction state when initialization fails', async (t) => {
  let closeCalls = 0;
  t.mock.method(AgentLiveEvalHarness.prototype, 'close', async () => {
    closeCalls += 1;
  });
  await assert.rejects(
    () => AgentLiveEvalHarness.create({
      envOverrides: { AGENT_LIVE_EVAL_ALLOW_REAL_PROVIDER: '1' },
      pool: {
        connect() {},
        async query() {
          return { rows: [{ database_name: 'production' }] };
        }
      }
    }),
    /AGENT_LIVE_EVAL_DATABASE_FORBIDDEN/
  );
  assert.equal(closeCalls, 1);
});

test('Live eval signed gate binds the exact SHA, matrix and complete release evidence', () => {
  const reportSha256 = crypto.createHash('sha256').update('synthetic-report').digest('hex');
  const keyMaterial = `v1:hex:${'cd'.repeat(32)}`;
  const commitSha = 'ef'.repeat(20);
  const createdAt = new Date('2026-08-25T00:00:00.000Z');
  const checks = {
    pnpmCheck: { passed: true, command: 'pnpm check', exitCode: 0, reportSha256 },
    postgresMinio: {
      passed: true,
      postgresMajor: 16,
      minioDigest: PINNED_MINIO_DIGEST,
      reportSha256
    },
    qualitySet: { passed: true, total: 50, passedCount: 50, failed: 0, reportSha256 },
    chaos: { passed: true, repeats: 20, failed: 0, flaky: 0, skipped: 0, reportSha256 },
    crossWorker: { passed: true, independentProcesses: true, staleWrites: 0, reportSha256 },
    browsers: { passed: true, chromium: true, firefox: true, webkit: true, reportSha256 }
  };
  const manifest = createSignedGateManifest({
    campaignId: '11111111-1111-4111-8111-111111111111',
    commitSha,
    matrixHash: LIVE_EVAL_MATRIX_HASH,
    checks,
    keyMaterial,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 60 * 60 * 1000)
  });
  const verified = verifySignedGateManifest({
    manifest,
    keyMaterial,
    expectedCommitSha: commitSha,
    expectedMatrixHash: LIVE_EVAL_MATRIX_HASH,
    now: new Date(createdAt.getTime() + 1000)
  });
  assert.equal(verified.commitSha, commitSha);
  assert.match(verified.manifestSha256, /^[a-f0-9]{64}$/);
  assert.throws(
    () => verifySignedGateManifest({
      manifest: { ...manifest, checks: { ...manifest.checks, browsers: { ...manifest.checks.browsers, webkit: false } } },
      keyMaterial,
      expectedCommitSha: commitSha,
      expectedMatrixHash: LIVE_EVAL_MATRIX_HASH,
      now: new Date(createdAt.getTime() + 1000)
    }),
    /GATE_CHECK_FAILED|GATE_BROWSERS_INVALID/
  );
  assert.throws(
    () => verifySignedGateManifest({
      manifest,
      keyMaterial,
      expectedCommitSha: '12'.repeat(20),
      expectedMatrixHash: LIVE_EVAL_MATRIX_HASH,
      now: new Date(createdAt.getTime() + 1000)
    }),
    /GATE_SHA_MISMATCH/
  );
});

test('Live eval final report cryptographically binds the exact 24-run report and blind score', () => {
  const results = LIVE_EVAL_CASES.flatMap((entry) => ['v1', 'v2'].map((cohort) => ({
    ok: true,
    scenarioId: entry.id,
    cohort,
    routeKind: entry.kind === 'conversation' ? 'reply' : undefined,
    modelCalls: cohort === 'v1' ? 10 : 7,
    elapsedMs: cohort === 'v1' ? 100 : 105,
    inputTokens: cohort === 'v1' ? 50 : 40,
    outputTokens: cohort === 'v1' ? 50 : 40,
    chargedCredits: cohort === 'v1' ? 5 : 4,
    schemaChecks: cohort === 'v2' && entry.kind !== 'conversation' ? 1 : 0,
    schemaFirstValid: cohort === 'v2' && entry.kind !== 'conversation' ? 1 : 0,
    artifacts: []
  })));
  const definitionSha256 = crypto.createHash('sha256').update('blind-definition').digest('hex');
  const automatedReport = {
    version: 'agent-live-eval-v3.1',
    campaignId: '22222222-2222-4222-8222-222222222222',
    commitSha: 'ab'.repeat(20),
    matrixHash: LIVE_EVAL_MATRIX_HASH,
    gateManifestSha256: crypto.createHash('sha256').update('gate').digest('hex'),
    modelLocks: { text: 'Qwen/Qwen3-8B', image: 'Kwai-Kolors/Kolors' },
    limits: { perRunCredits: 50, qwenCalls: 200, kolorsCalls: 16, wallClockHours: 8 },
    results,
    summary: summarize(results),
    blindReview: { definitionSha256 }
  };
  const blindScore = {
    version: 'agent-live-eval-blind-score-v1',
    definitionSha256,
    cases: 2,
    criteriaPerCase: 5,
    candidateAverageScore: 4.4,
    baselineAverageScore: 4.2,
    candidateHardConstraintPassRate: 1,
    baselineHardConstraintPassRate: 1,
    candidateWins: 1,
    baselineWins: 0,
    ties: 1,
    passed: true
  };
  const keyMaterial = `v1:hex:${'bc'.repeat(32)}`;
  const finalReport = createSignedFinalReport({
    automatedReport,
    automatedReportSha256: crypto.createHash('sha256').update('automated').digest('hex'),
    blindScore,
    blindScoreSha256: crypto.createHash('sha256').update('blind-score').digest('hex'),
    keyMaterial,
    createdAt: new Date('2026-08-25T08:00:00.000Z')
  });
  const verified = verifySignedFinalReport({
    report: finalReport,
    keyMaterial,
    expectedCommitSha: automatedReport.commitSha,
    expectedMatrixHash: LIVE_EVAL_MATRIX_HASH
  });
  assert.equal(verified.campaignId, automatedReport.campaignId);
  assert.match(verified.reportSha256, /^[a-f0-9]{64}$/);
  assert.throws(
    () => verifySignedFinalReport({
      report: {
        ...finalReport,
        blind: { ...finalReport.blind, candidateAverageScore: 5 }
      },
      keyMaterial,
      expectedCommitSha: automatedReport.commitSha,
      expectedMatrixHash: LIVE_EVAL_MATRIX_HASH
    }),
    /FINAL_SIGNATURE_INVALID/
  );
  assert.throws(
    () => createSignedFinalReport({
      automatedReport,
      automatedReportSha256: crypto.createHash('sha256').update('automated').digest('hex'),
      blindScore: { ...blindScore, definitionSha256: 'cd'.repeat(32) },
      blindScoreSha256: crypto.createHash('sha256').update('blind-score').digest('hex'),
      keyMaterial
    }),
    /BLIND_GATE_FAILED/
  );
});

test('Owner canary plan requires rollout zero, one owner, same immutable SHA and full readiness', () => {
  const results = LIVE_EVAL_CASES.flatMap((entry) => ['v1', 'v2'].map((cohort) => ({
    ok: true,
    scenarioId: entry.id,
    cohort,
    routeKind: entry.kind === 'conversation' ? 'reply' : undefined,
    modelCalls: cohort === 'v1' ? 10 : 7,
    elapsedMs: cohort === 'v1' ? 100 : 105,
    inputTokens: cohort === 'v1' ? 50 : 40,
    outputTokens: cohort === 'v1' ? 50 : 40,
    chargedCredits: cohort === 'v1' ? 5 : 4,
    schemaChecks: cohort === 'v2' && entry.kind !== 'conversation' ? 1 : 0,
    schemaFirstValid: cohort === 'v2' && entry.kind !== 'conversation' ? 1 : 0,
    artifacts: []
  })));
  const commitSha = '34'.repeat(20);
  const ownerUserId = '33333333-3333-4333-8333-333333333333';
  const keyMaterial = `v1:hex:${'de'.repeat(32)}`;
  const definitionSha256 = crypto.createHash('sha256').update('owner-blind').digest('hex');
  const signedFinalReport = createSignedFinalReport({
    automatedReport: {
      version: 'agent-live-eval-v3.1',
      campaignId: '44444444-4444-4444-8444-444444444444',
      commitSha,
      matrixHash: LIVE_EVAL_MATRIX_HASH,
      gateManifestSha256: crypto.createHash('sha256').update('owner-gate').digest('hex'),
      modelLocks: { text: 'Qwen/Qwen3-8B', image: 'Kwai-Kolors/Kolors' },
      limits: { perRunCredits: 50, qwenCalls: 200, kolorsCalls: 16, wallClockHours: 8 },
      results,
      summary: summarize(results),
      blindReview: { definitionSha256 }
    },
    automatedReportSha256: crypto.createHash('sha256').update('owner-automated').digest('hex'),
    blindScore: {
      version: 'agent-live-eval-blind-score-v1',
      definitionSha256,
      cases: 2,
      criteriaPerCase: 5,
      candidateAverageScore: 4.4,
      baselineAverageScore: 4.2,
      candidateHardConstraintPassRate: 1,
      baselineHardConstraintPassRate: 1,
      candidateWins: 1,
      baselineWins: 0,
      ties: 1,
      passed: true
    },
    blindScoreSha256: crypto.createHash('sha256').update('owner-score').digest('hex'),
    keyMaterial,
    createdAt: new Date('2026-08-25T09:00:00.000Z')
  });
  const runtime = {
    runtimeV2Enabled: true,
    rolloutPercent: 0,
    canaryUserIds: [ownerUserId],
    textModel: 'Qwen/Qwen3-8B',
    imageModel: 'Kwai-Kolors/Kolors'
  };
  const deployments = {
    render: { id: 'dep-owner', status: 'live', commitSha },
    vercel: { id: 'dpl-owner', status: 'success', commitSha },
    worker: { id: 'worker-owner', status: 'online', commitSha }
  };
  const probes = {
    meta: { ok: true, gitSha: commitSha },
    readyz: { ok: true },
    agentStatus: {
      ok: true,
      status: {
        workerOnline: true,
        queueDepth: 0,
        runtimeV2Enabled: true,
        runtimeV2RolloutPercent: 0,
        runtimeV2CanaryConfigured: true,
        subagentsEnabled: true,
        subagentMaxConcurrent: 3,
        imageGenerationPublicEnabled: true,
        providerScheduler: { ready: true },
        durability: {
          leaseEpochReady: true,
          modelReceiptsReady: true,
          toolReceiptsReady: true,
          budgetReservationsReady: true,
          pricingReady: true
        },
        runtimeProfile: { model: 'Qwen/Qwen3-8B', checkpointVersion: 4 }
      }
    }
  };
  const createdAt = new Date('2026-08-25T10:00:00.000Z');
  const plan = createSignedOwnerCanaryPlan({
    signedFinalReport,
    reportKeyMaterial: keyMaterial,
    ownerUserId,
    runtime,
    deployments,
    probes,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 60 * 60 * 1000)
  });
  assert.deepEqual(plan.scenarios.map((scenario) => scenario.id), OWNER_CANARY_SCENARIOS.map((entry) => entry.id));
  assert.equal(plan.publicRolloutPercent, 0);
  assert.equal(new Set(plan.scenarios.map((scenario) => scenario.idempotencyKey)).size, 4);
  const verified = verifySignedOwnerCanaryPlan({
    plan,
    reportKeyMaterial: keyMaterial,
    expectedCommitSha: commitSha,
    expectedOwnerUserId: ownerUserId,
    now: new Date(createdAt.getTime() + 1000)
  });
  assert.equal(verified.scenarios.length, 4);
  assert.throws(
    () => createSignedOwnerCanaryPlan({
      signedFinalReport,
      reportKeyMaterial: keyMaterial,
      ownerUserId,
      runtime: { ...runtime, rolloutPercent: 10 },
      deployments,
      probes
    }),
    /RUNTIME_CONFIG_INVALID/
  );
  assert.throws(
    () => verifySignedOwnerCanaryPlan({
      plan: { ...plan, publicRolloutPercent: 10 },
      reportKeyMaterial: keyMaterial,
      expectedCommitSha: commitSha,
      expectedOwnerUserId: ownerUserId,
      now: new Date(createdAt.getTime() + 1000)
    }),
    /PLAN_MISMATCH/
  );
});

test('Live eval runner validates selection and reports paired medians without side effects', () => {
  assert.equal(resolveSelection({ AGENT_LIVE_EVAL_CASE: 'spreadsheet' }).selected.length, 1);
  assert.throws(
    () => resolveSelection({ AGENT_LIVE_EVAL_COHORT: 'production' }),
    /COHORT_INVALID/
  );
  const summary = summarize([
    { ok: true, scenarioId: 'text-only-agent', cohort: 'v1', modelCalls: 4, elapsedMs: 100, inputTokens: 50, outputTokens: 50, chargedCredits: 2 },
    { ok: true, scenarioId: 'text-only-agent', cohort: 'v2', modelCalls: 3, elapsedMs: 90, inputTokens: 40, outputTokens: 40, chargedCredits: 1 }
  ]);
  assert.equal(summary.v1.medianModelCalls, 4);
  assert.equal(summary.v2.medianModelCalls, 3);
  assert.equal(summary.comparison.modelCallReduction, 0.25);
  assert.equal(summary.fullMatrixComplete, false);
  assert.equal(summary.automatedGatePassed, false);

  const complete = summarize(LIVE_EVAL_CASES.flatMap((entry) => ['v1', 'v2'].map((cohort) => ({
    ok: true,
    scenarioId: entry.id,
    cohort,
    routeKind: entry.kind === 'conversation' ? 'reply' : undefined,
    modelCalls: cohort === 'v1' ? 10 : 7,
    elapsedMs: cohort === 'v1' ? 100 : 105,
    inputTokens: cohort === 'v1' ? 50 : 40,
    outputTokens: cohort === 'v1' ? 50 : 40,
    chargedCredits: cohort === 'v1' ? 5 : 4,
    schemaChecks: cohort === 'v2' && entry.kind !== 'conversation' ? 1 : 0,
    schemaFirstValid: cohort === 'v2' && entry.kind !== 'conversation' ? 1 : 0,
    artifacts: []
  }))));
  assert.equal(complete.fullMatrixComplete, true);
  assert.equal(complete.routeAccuracy, 1);
  assert.equal(complete.schemaFirstValidRate, 1);
  assert.equal(complete.automatedGatePassed, true);
  assert.equal(complete.productionCanaryEligible, false);
});

test('Live evaluation matrix contains the exact 12 paired real scenarios and hard safety limits', () => {
  assert.equal(LIVE_EVAL_CASES.length, 12);
  assert.equal(new Set(LIVE_EVAL_CASES.map((entry) => entry.id)).size, 12);
  assert.ok(LIVE_EVAL_CASES.every((entry) => Number(entry.maxCredits) <= 50));
  assert.equal(getLiveEvalCase('consultation-route').kind, 'conversation');
  assert.deepEqual(getLiveEvalCase('text-to-image').deliverables, ['image']);
  assert.equal(getLiveEvalCase('text-to-image').expectedImageCount, 3);
  assert.equal(getLiveEvalCase('reference-image').expectedImageCount, 3);
  assert.equal(getLiveEvalCase('three-subagents').expectedSubagents, 3);
  assert.deepEqual(getLiveEvalCase('long-constraints-injection').forbiddenTools, [
    'browser_dom', 'generate_image', 'connector_request'
  ]);
  assert.equal(getLiveEvalCase('recovery-and-ambiguous').recoveryScenario, true);
});

test('Live synthetic fixtures are non-empty, correctly typed and reference-ready', async () => {
  for (const kind of [
    'csv', 'reference_image', 'injection_pdf', 'injection_xlsx',
    'injection_pptx', 'injection_zip'
  ]) {
    const fixture = await fixtureForLiveEval(kind);
    assert.ok(Buffer.isBuffer(fixture.buffer));
    assert.ok(fixture.buffer.length > 0);
    assert.ok(fixture.mimeType);
  }
  const reference = await fixtureForLiveEval('reference_image');
  const metadata = await require('sharp')(reference.buffer).metadata();
  assert.deepEqual({ width: metadata.width, height: metadata.height }, { width: 1024, height: 1024 });
});

test('Live evidence uses authenticated encryption, verifies digests and purges only expired eval dirs', async () => {
  const keyMaterial = `v1:hex:${'11'.repeat(32)}`;
  const envelope = encryptEvidence({
    buffer: Buffer.from('synthetic private artifact'),
    keyMaterial,
    associatedData: { runId: 'synthetic-run' }
  });
  assert.equal(decryptEvidence({ envelope, keyMaterial }).toString(), 'synthetic private artifact');
  const tampered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` };
  assert.throws(() => decryptEvidence({ envelope: tampered, keyMaterial }));

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-live-evidence-'));
  try {
    const current = path.join(root, 'agent-live-eval-current');
    const expired = path.join(root, 'agent-live-eval-expired');
    const unrelated = path.join(root, 'keep-me');
    await fs.promises.mkdir(expired);
    await fs.promises.mkdir(unrelated);
    const written = await writeEncryptedEvidence({
      privateDir: current,
      filename: '../artifact.pdf',
      buffer: Buffer.from('pdf bytes'),
      keyMaterial,
      associatedData: { mimeType: 'application/pdf' }
    });
    assert.equal(path.dirname(written.path), current);
    const old = new Date(Date.now() - 31 * 86_400_000);
    await fs.promises.utimes(expired, old, old);
    assert.equal(await purgeExpiredEvidence({ rootDir: root, retentionDays: 30 }), 1);
    assert.equal(fs.existsSync(expired), false);
    assert.equal(fs.existsSync(unrelated), true);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('Live image review bundle hides V1/V2 assignment and encrypts the reveal mapping', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-live-blind-review-'));
  const keyMaterial = `v1:hex:${'22'.repeat(32)}`;
  const artifact = (scenarioId, cohort, index) => ({
    artifactId: `${scenarioId}-${cohort}-artifact-${index}`,
    evidenceFile: `${scenarioId}-${cohort}-private-${index}.json`,
    mimeType: 'image/png',
    byteSize: 100 + index,
    sha256: crypto.createHash('sha256').update(`${scenarioId}-${cohort}-${index}`).digest('hex')
  });
  try {
    const bundle = await buildBlindReviewBundle({
      reportDir: root,
      keyMaterial,
      seed: 'deterministic-blind-seed',
      results: ['text-to-image', 'reference-image'].flatMap((scenarioId) => [
        { ok: true, scenarioId, cohort: 'v1', artifacts: [0, 1, 2].map((index) => artifact(scenarioId, 'v1', index)) },
        { ok: true, scenarioId, cohort: 'v2', artifacts: [0, 1, 2].map((index) => artifact(scenarioId, 'v2', index)) }
      ])
    });
    assert.equal(bundle.caseCount, 2);
    const publicText = await fs.promises.readFile(bundle.publicPath, 'utf8');
    assert.doesNotMatch(publicText, /\bv1\b|\bv2\b|private-/i);
    const review = JSON.parse(publicText);
    assert.deepEqual(review.scale, [1, 2, 3, 4, 5]);
    assert.ok(review.cases.every((entry) => entry.left.length === 3 && entry.right.length === 3));
    const encrypted = JSON.parse(await fs.promises.readFile(bundle.encryptedMappingPath, 'utf8'));
    const revealed = JSON.parse(decryptEvidence({ envelope: encrypted, keyMaterial }).toString('utf8'));
    assert.equal(Object.keys(revealed.assets).length, 12);
    for (const entry of review.cases) {
      entry.review.hardConstraintsPassLeft = true;
      entry.review.hardConstraintsPassRight = true;
      entry.review.preferred = 'tie';
      entry.review.leftScores = Object.fromEntries(entry.criteria.map((criterion) => [criterion, 4]));
      entry.review.rightScores = Object.fromEntries(entry.criteria.map((criterion) => [criterion, 4]));
    }
    const score = scoreLiveBlindReview({ review, mapping: revealed });
    assert.equal(score.candidateAverageScore, 4);
    assert.equal(score.candidateHardConstraintPassRate, 1);
    assert.equal(score.passed, true);
    review.cases[0].review.hardConstraintsPassLeft = false;
    review.cases[0].review.hardConstraintsPassRight = false;
    assert.equal(scoreLiveBlindReview({ review, mapping: revealed }).passed, false);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('Live image review refuses an implicit current-directory evidence target', async () => {
  await assert.rejects(
    buildBlindReviewBundle({ results: [], keyMaterial: `v1:hex:${'33'.repeat(32)}` }),
    /BLIND_REVIEW_DIR_REQUIRED/
  );
});

test('Live blind review materializes only anonymous verified images inside campaign private evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-live-eval-blind-assets-'));
  const privateDir = path.join(root, 'private');
  const outputDir = path.join(privateDir, 'blind-review-assets');
  const keyMaterial = `v1:hex:${'44'.repeat(32)}`;
  try {
    const mapping = { assets: {} };
    const makeSide = async (scenarioId, side, offset) => {
      const assets = [];
      for (let index = 0; index < 3; index += 1) {
        const ordinal = offset + index;
        const image = await require('sharp')({
          create: {
            width: 8 + ordinal,
            height: 6 + ordinal,
            channels: 4,
            background: { r: ordinal * 17 % 255, g: 200, b: 61, alpha: 1 }
          }
        }).png().toBuffer();
        const sha256 = crypto.createHash('sha256').update(image).digest('hex');
        const assetCode = crypto.createHash('sha256')
          .update(`${scenarioId}:${side}:${index}`)
          .digest('hex')
          .slice(0, 12);
        const stored = await writeEncryptedEvidence({
          privateDir,
          filename: `${assetCode}.png`,
          buffer: image,
          keyMaterial,
          associatedData: { kind: 'synthetic-blind-image' }
        });
        mapping.assets[assetCode] = {
          scenarioId,
          cohort: side === 'left' ? 'v1' : 'v2',
          evidenceFile: path.basename(stored.path),
          mimeType: 'image/png',
          sha256
        };
        assets.push({ assetCode, mimeType: 'image/png', byteSize: image.length });
      }
      return assets;
    };
    const review = {
      version: 1,
      instructions: 'Score without identifying runtime versions.',
      cases: []
    };
    for (const [scenarioOffset, scenarioId] of ['text-to-image', 'reference-image'].entries()) {
      review.cases.push({
        scenarioId,
        left: await makeSide(scenarioId, 'left', scenarioOffset * 6 + 1),
        right: await makeSide(scenarioId, 'right', scenarioOffset * 6 + 4),
        criteria: REVIEW_CRITERIA,
        review: {}
      });
    }
    mapping.definitionSha256 = reviewDefinitionSha256(review);
    const result = await materializeBlindReviewAssets({
      review,
      mapping,
      privateDir,
      keyMaterial
    });
    assert.equal(result.assetCount, 12);
    const assetCode = review.cases[0].left[0].assetCode;
    assert.equal(fs.existsSync(path.join(outputDir, `${assetCode}.png`)), true);
    const localReviewText = await fs.promises.readFile(result.reviewPath, 'utf8');
    assert.doesNotMatch(localReviewText, /\bv1\b|\bv2\b|synthetic-private/i);
    const localReview = JSON.parse(localReviewText);
    assert.equal(localReview.cases[0].left[0].localFile, `${assetCode}.png`);
    assert.equal((await fs.promises.stat(path.join(outputDir, `${assetCode}.png`))).size > 0, true);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('Live model auditor enforces V2 Qwen request contracts and child tool trimming', async () => {
  const trace = new RuntimeTraceSink();
  const auditor = new LiveModelAuditor({
    trace,
    pool: { query: async () => ({ rows: [{ runtime_version: 2 }] }) },
    maxQwenCalls: 3,
    maxKolorsCalls: 1
  });
  const actor = {
    model: 'Qwen/Qwen3-8B',
    messages: [{ role: 'user', content: 'synthetic' }],
    tools: [{ type: 'function', function: { name: 'sandbox_shell', parameters: {} } }],
    stream: false,
    enable_thinking: false,
    max_tokens: 1024,
    parallel_tool_calls: false,
    temperature: 0.2,
    top_p: 0.7
  };
  const inspected = await auditor.inspectQwenRequest(actor, {
    runId: '11111111-1111-4111-8111-111111111111',
    phase: 'actor',
    promptHash: 'ab'.repeat(32)
  });
  assert.equal(auditor.qwenCalls, 0);
  assert.equal(auditor.logicalQwenCalls, 1);
  assert.match(trace.snapshot()[0].promptHash, /^[a-f0-9]{64}$/);
  const wrappedFetch = auditor.wrapQwenFetch(async () => ({ ok: true }));
  await auditor.requestContext.run(inspected, () => wrappedFetch(
    'https://api.siliconflow.cn/v1/chat/completions',
    { method: 'POST' }
  ));
  assert.equal(auditor.qwenCalls, 1);
  await assert.rejects(
    auditor.inspectQwenRequest({
      ...actor,
      max_tokens: 1200,
      tools: [{ type: 'function', function: { name: 'generate_image', parameters: {} } }]
    }, {
      runId: '11111111-1111-4111-8111-111111111111',
      phase: 'subagent',
      promptHash: 'cd'.repeat(32)
    }),
    /AGENT_LIVE_EVAL_SUBAGENT_TOOL_FORBIDDEN/
  );
  await auditor.inspectKolorsRequest({ references: [] });
  await assert.rejects(auditor.inspectKolorsRequest({ references: [] }), /KOLORS_CALL_LIMIT/);
  assert.throws(
    () => auditor.inspectKolorsResponse({ model: 'Qwen/Qwen-Image-Edit-2509' }),
    /IMAGE_MODEL_INVALID/
  );
});

test('Live model auditor enforces an explicit V2 contract for a router without a run id', async () => {
  const auditor = new LiveModelAuditor({ maxQwenCalls: 2 });
  const router = {
    model: 'Qwen/Qwen3-8B',
    messages: [{ role: 'user', content: 'synthetic route' }],
    stream: false,
    enable_thinking: false,
    max_tokens: 1200,
    parallel_tool_calls: false,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    top_p: 0.7
  };
  const inspected = await auditor.inspectQwenRequest(router, {
    phase: 'router',
    runtimeVersion: 2
  });
  assert.equal(inspected.runtimeVersion, 2);
  await assert.rejects(
    auditor.inspectQwenRequest({ ...router, max_tokens: 1199 }, {
      phase: 'router',
      runtimeVersion: 2
    }),
    /AGENT_LIVE_EVAL_STAGE_TOKEN_LIMIT:router/
  );
});

test('Live model auditor locks Qwen3-8B for both V1 and V2 cohorts', async () => {
  const auditor = new LiveModelAuditor({ maxQwenCalls: 2 });
  await assert.rejects(
    auditor.inspectQwenRequest({
      model: 'Qwen/Qwen2.5-72B-Instruct',
      messages: [{ role: 'user', content: 'synthetic' }],
      stream: false,
      enable_thinking: false,
      max_tokens: 1024,
      parallel_tool_calls: false,
      temperature: 0.2,
      top_p: 0.7
    }, { phase: 'actor', runtimeVersion: 1 }),
    /AGENT_LIVE_EVAL_TEXT_MODEL_INVALID/
  );
});

test('Live model auditor counts each physical SiliconFlow retry instead of one logical turn', async () => {
  const statuses = [500, 429, 200];
  let networkCalls = 0;
  const auditor = new LiveModelAuditor({ maxQwenCalls: 3 });
  const fetchImpl = auditor.wrapQwenFetch(async () => {
    const status = statuses[networkCalls];
    networkCalls += 1;
    return new Response(JSON.stringify(status === 200 ? {
      id: 'retry-success',
      choices: [{ message: { role: 'assistant', content: 'done' } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 }
    } : { error: { code: `synthetic-${status}` } }), {
      status,
      headers: { 'content-type': 'application/json' }
    });
  });
  const provider = createAgentModelProvider({
    env: {
      NODE_ENV: 'test',
      APP_ENV: 'dev',
      AGENT_FEATURE_ENABLED: 'true',
      AGENT_RUNTIME_DRIVER: 'live',
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      AGENT_SILICONFLOW_BASE_URL: 'https://api.siliconflow.cn/v1',
      SILICONFLOW_API_KEY: 'synthetic-test-key',
      AGENT_PROVIDER_SCHEDULER_ENABLED: 'true'
    },
    providerScheduler: {
      acquire: async () => ({ queueWaitMs: 0, mode: 'test' }),
      defer: async () => {}
    },
    fetchImpl
  });
  const payload = {
    model: 'Qwen/Qwen3-8B',
    messages: [{ role: 'user', content: 'synthetic retry' }],
    stream: false,
    enable_thinking: false,
    max_tokens: 1024,
    parallel_tool_calls: false,
    temperature: 0.2,
    top_p: 0.7
  };
  const response = await auditor.runQwenRequest(
    payload,
    { phase: 'actor', runtimeVersion: 1 },
    () => provider.createChat(payload, { phase: 'actor' })
  );
  assert.equal(response.message.content, 'done');
  assert.equal(networkCalls, 3);
  assert.equal(auditor.logicalQwenCalls, 1);
  assert.equal(auditor.qwenCalls, 3);
});

test('real SiliconFlow provider exposes deterministic crashes before dispatch and before receipt', async () => {
  const trace = new RuntimeTraceSink();
  const controller = new RuntimeTestController({ trace });
  const transitions = [];
  let fetchCalls = 0;
  const modelCallService = {
    start: async () => ({ id: `call-${transitions.length + 1}` }),
    markDispatched: async (call) => transitions.push(`dispatched:${call.id}`),
    markReceived: async (call) => transitions.push(`received:${call.id}`),
    finish: async () => {},
    consume: async () => {}
  };
  const provider = createAgentModelProvider({
    env: {
      NODE_ENV: 'test',
      APP_ENV: 'dev',
      AGENT_FEATURE_ENABLED: 'true',
      AGENT_RUNTIME_DRIVER: 'live',
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      AGENT_SILICONFLOW_BASE_URL: 'https://api.siliconflow.cn/v1',
      SILICONFLOW_API_KEY: 'synthetic-test-key',
      AGENT_PROVIDER_SCHEDULER_ENABLED: 'true'
    },
    providerScheduler: { acquire: async () => ({ queueWaitMs: 0, mode: 'test' }) },
    modelCallService,
    testController: controller,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({
        id: `response-${fetchCalls}`,
        choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }],
        usage: { prompt_tokens: 3, completion_tokens: 2 }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const payload = {
    model: 'Qwen/Qwen3-8B',
    messages: [{ role: 'user', content: 'synthetic' }],
    stream: false,
    enable_thinking: false,
    max_tokens: 1024,
    parallel_tool_calls: false,
    temperature: 0.2,
    top_p: 0.7
  };

  controller.armCrash('after_dispatch');
  await assert.rejects(
    provider.createChat(payload, { phase: 'actor' }),
    (error) => error?.name === 'RuntimeHarnessCrash' && error.point === 'after_dispatch'
  );
  assert.equal(fetchCalls, 0);
  assert.deepEqual(transitions, ['dispatched:call-1']);

  controller.armCrash('after_provider_response');
  await assert.rejects(
    provider.createChat(payload, { phase: 'actor' }),
    (error) => error?.name === 'RuntimeHarnessCrash' && error.point === 'after_provider_response'
  );
  assert.equal(fetchCalls, 1);
  assert.deepEqual(transitions, ['dispatched:call-1', 'dispatched:call-2']);
});
