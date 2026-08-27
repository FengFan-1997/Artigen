const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const { HeadObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const {
  AgentRuntimeHarness
} = require('../evaluation/harness/agent-runtime-harness');
const {
  RuntimeHarnessCrash,
  RuntimeTestController
} = require('../evaluation/harness/runtime-test-controller');
const {
  minimalWebsiteZip
} = require('../evaluation/harness/artifact-fixtures');
const {
  harnessWriteCommand
} = require('../evaluation/harness/harness-sandbox-provider');
const {
  CAMPAIGN_CHECK_KIND,
  DISPATCH_CHECK_KIND,
  LiveEvalCampaignGuard
} = require('../evaluation/harness/live-eval-campaign-guard');
const { functionToolCall } = require('../evaluation/harness/scripted-siliconflow-transport');
const { checkDatabase } = require('../services/readiness-service');

const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const s3Enabled = enabled && Boolean(String(process.env.MINIO_TEST_ENDPOINT || '').trim());

const verifiedTextScript = () => [
  { content: '建议保留一个清晰主目标，并用单一主动作完成本次设计决策。' },
  {
    content: JSON.stringify({
      passed: true,
      score: 100,
      issues: [],
      repairInstructions: [],
      unsupportedVisualJudgment: false,
      criteria: []
    })
  }
];

const imageDeliveryScript = () => [
  {
    toolCalls: [functionToolCall({
      id: 'image-generate-1',
      name: 'generate_image',
      arguments: {
        prompt: 'A restrained editorial fragrance hero image',
        aspectRatio: '1:1',
        filename: 'harness-hero.png'
      }
    })]
  },
  {
    toolCalls: [functionToolCall({
      id: 'image-declare-1',
      name: 'declare_artifact',
      arguments: {
        path: '/tmp/artigen-workspace/harness-hero.png',
        role: 'image',
        filename: 'harness-hero.png',
        mimeType: 'image/png',
        sources: []
      }
    })]
  },
  {
    content: JSON.stringify({
      passed: true,
      score: 100,
      issues: [],
      repairInstructions: [],
      unsupportedVisualJudgment: true,
      criteria: []
    })
  },
  { content: '已生成并验证 harness-hero.png；视觉审美仍需人工选择。' }
];

const waitForChildMessage = (child, event, timeoutMs = 10_000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    cleanup();
    reject(new Error(`AGENT_CROSS_WORKER_MESSAGE_TIMEOUT:${event}`));
  }, timeoutMs);
  timer.unref?.();
  const onMessage = (message) => {
    if (message?.event !== event) return;
    cleanup();
    resolve(message);
  };
  const onExit = (code) => {
    cleanup();
    reject(new Error(`AGENT_CROSS_WORKER_EARLY_EXIT:${code}`));
  };
  const cleanup = () => {
    clearTimeout(timer);
    child.off('message', onMessage);
    child.off('exit', onExit);
  };
  child.on('message', onMessage);
  child.on('exit', onExit);
});

const waitForChildExit = (child, timeoutMs = 10_000) => new Promise((resolve, reject) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    resolve({ code: child.exitCode, signal: child.signalCode });
    return;
  }
  const timer = setTimeout(() => {
    cleanup();
    reject(new Error('AGENT_CROSS_PROCESS_EXIT_TIMEOUT'));
  }, timeoutMs);
  timer.unref?.();
  const onExit = (code, signal) => {
    cleanup();
    resolve({ code, signal });
  };
  const cleanup = () => {
    clearTimeout(timer);
    child.off('exit', onExit);
  };
  child.on('exit', onExit);
});

test('Live Harness V3.1 persists physical provider caps across restart and rejects concurrent runners', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const campaignId = crypto.randomUUID();
  const campaignHash = crypto.createHash('sha256').update(campaignId).digest('hex');
  const profile = {
    pool,
    campaignId,
    commitSha: 'ab'.repeat(20),
    matrixHash: 'cd'.repeat(32),
    maxQwenCalls: 2,
    maxKolorsCalls: 1,
    maxWallClockMs: 60_000
  };
  let first = null;
  let second = null;
  try {
    first = new LiveEvalCampaignGuard(profile);
    await first.initialize();
    second = new LiveEvalCampaignGuard(profile);
    await assert.rejects(second.initialize(), /CAMPAIGN_ALREADY_RUNNING/);
    const firstDispatch = await first.reserveDispatch('qwen', {
      runId: crypto.randomUUID(),
      slotId: 'restart-metrics:v1',
      runtimeVersion: 1,
      phase: 'actor'
    });
    assert.equal(firstDispatch.sequence, 1);
    await first.recordDispatchResult(firstDispatch, {
      status: 'succeeded',
      inputTokens: 11,
      outputTokens: 7,
      latencyMs: 23
    });
    const secondDispatch = await first.reserveDispatch('qwen', {
      slotId: 'restart-metrics:v1',
      runtimeVersion: 1,
      phase: 'actor'
    });
    await first.recordDispatchResult(secondDispatch, {
      status: 'failed',
      latencyMs: 31,
      errorCode: 'AGENT_PROVIDER_DISPATCH_FAILED'
    });
    await assert.rejects(first.reserveDispatch('qwen'), /QWEN_CALL_LIMIT/);
    const imageDispatch = await first.reserveDispatch('kolors', {
      slotId: 'restart-metrics:v1',
      runtimeVersion: 1,
      phase: 'production'
    });
    await first.recordDispatchResult(imageDispatch, {
      status: 'succeeded',
      latencyMs: 47
    });
    await assert.rejects(first.reserveDispatch('kolors'), /KOLORS_CALL_LIMIT/);
    await first.close();
    first = null;

    second = new LiveEvalCampaignGuard(profile);
    await second.initialize();
    assert.deepEqual(await second.counts(), { qwen: 2, kolors: 1 });
    const durableMetrics = await second.dispatchMetrics({ slotId: 'restart-metrics:v1' });
    assert.equal(durableMetrics.qwenCalls, 2);
    assert.equal(durableMetrics.kolorsCalls, 1);
    assert.equal(durableMetrics.inputTokens, 11);
    assert.equal(durableMetrics.outputTokens, 7);
    assert.equal(durableMetrics.latencyMs, 101);
    assert.equal(durableMetrics.incomplete, 0);
    assert.equal(
      durableMetrics.calls.find((call) => call.kind === 'qwen' && call.sequence === 1)?.status,
      'succeeded'
    );
    assert.equal(
      durableMetrics.calls.find((call) => call.kind === 'qwen' && call.sequence === 2)?.status,
      'failed'
    );
    assert.equal(
      durableMetrics.calls.find((call) => call.kind === 'kolors' && call.sequence === 1)?.status,
      'succeeded'
    );
    await assert.rejects(second.reserveDispatch('qwen'), /QWEN_CALL_LIMIT/);
    const stored = await pool.query(
      `SELECT run_id,metrics FROM agent_quality_checks
        WHERE check_kind=$1 AND metrics->>'campaignHash'=$2
        ORDER BY id`,
      [DISPATCH_CHECK_KIND, campaignHash]
    );
    assert.equal(stored.rows.length, 3);
    assert.equal(stored.rows.every((row) => row.run_id === null), true);
    assert.match(String(stored.rows[0].metrics.runIdHash || ''), /^[a-f0-9]{64}$/);
  } finally {
    await first?.close().catch(() => {});
    await second?.close().catch(() => {});
    await pool.query(
      `DELETE FROM agent_quality_checks
        WHERE check_kind IN ($1,$2) AND metrics->>'campaignHash'=$3`,
      [CAMPAIGN_CHECK_KIND, DISPATCH_CHECK_KIND, campaignHash]
    ).catch(() => {});
    await pool.end();
  }
});

test('Live Harness V3.1 serializes concurrent physical dispatch reservations at the hard cap', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const campaignId = crypto.randomUUID();
  const campaignHash = crypto.createHash('sha256').update(campaignId).digest('hex');
  const guard = new LiveEvalCampaignGuard({
    pool,
    campaignId,
    commitSha: 'ef'.repeat(20),
    matrixHash: 'ab'.repeat(32),
    maxQwenCalls: 7,
    maxKolorsCalls: 1,
    maxWallClockMs: 60_000
  });
  try {
    await guard.initialize();
    const attempts = await Promise.all(Array.from({ length: 20 }, async () => {
      try {
        return { ok: true, value: await guard.reserveDispatch('qwen') };
      } catch (error) {
        return { ok: false, code: error.message };
      }
    }));
    const accepted = attempts.filter((entry) => entry.ok).map((entry) => entry.value);
    const rejected = attempts.filter((entry) => !entry.ok);
    assert.equal(accepted.length, 7);
    assert.equal(rejected.length, 13);
    assert.equal(rejected.every((entry) => entry.code === 'AGENT_LIVE_EVAL_QWEN_CALL_LIMIT'), true);
    assert.deepEqual(
      accepted.map((entry) => entry.sequence).sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6, 7]
    );
    const stored = await pool.query(
      `SELECT count(*)::integer AS total,
              count(DISTINCT (metrics->>'sequence')::integer)::integer AS unique_sequences,
              min((metrics->>'sequence')::integer)::integer AS minimum,
              max((metrics->>'sequence')::integer)::integer AS maximum
         FROM agent_quality_checks
        WHERE check_kind=$1 AND metrics->>'campaignHash'=$2
          AND metrics->>'kind'='qwen'`,
      [DISPATCH_CHECK_KIND, campaignHash]
    );
    assert.deepEqual(stored.rows[0], {
      total: 7,
      unique_sequences: 7,
      minimum: 1,
      maximum: 7
    });
  } finally {
    await guard.close().catch(() => {});
    await pool.query(
      `DELETE FROM agent_quality_checks
        WHERE check_kind IN ($1,$2) AND metrics->>'campaignHash'=$3`,
      [CAMPAIGN_CHECK_KIND, DISPATCH_CHECK_KIND, campaignHash]
    ).catch(() => {});
    await pool.end();
  }
});

test('Runtime V2 profile is complete at creation and immutable across Worker leases', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({ pool });
    const created = await harness.createRun({
      objective: '验证创建时固化的 Runtime Profile 不能由后续 Worker 改写。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const before = await pool.query(
      `SELECT prompt_profile,prompt_hash,skill_versions,runtime_profile_hash,runtime_profile_summary
         FROM agent_runs WHERE id=$1`,
      [created.runId]
    );
    assert.equal(before.rows[0].runtime_profile_hash.length, 32);
    assert.match(before.rows[0].prompt_hash.toString('hex'), /^[a-f0-9]{64}$/);
    assert.notDeepEqual(before.rows[0].runtime_profile_summary, {});

    const workerId = `profile-test-${crypto.randomUUID()}`;
    const claimed = await harness.runService.claimRun({ runId: created.runId, workerId });
    await harness.runService.transitionRun({
      runId: created.runId,
      workerId,
      leaseEpoch: Number(claimed.lease_epoch),
      toStatus: 'running',
      eventType: 'run.started',
      summary: 'Runtime Profile immutable probe'
    });
    const frozenProfile = {
      runtimeVersion: 2,
      promptProfile: before.rows[0].prompt_profile,
      promptHash: before.rows[0].prompt_hash.toString('hex'),
      runtimeProfileHash: before.rows[0].runtime_profile_hash.toString('hex'),
      runtimeProfileSummary: before.rows[0].runtime_profile_summary,
      skills: Object.entries(before.rows[0].skill_versions || {}).map(([id, version]) => ({ id, version }))
    };
    await harness.runService.pinRuntimeProfile({
      runId: created.runId,
      workerId,
      leaseEpoch: Number(claimed.lease_epoch),
      profile: frozenProfile
    });
    await assert.rejects(
      harness.runService.pinRuntimeProfile({
        runId: created.runId,
        workerId,
        leaseEpoch: Number(claimed.lease_epoch),
        profile: { ...frozenProfile, runtimeProfileHash: '00'.repeat(32) }
      }),
      (error) => error?.code === 'AGENT_RUNTIME_PROFILE_MISMATCH'
    );
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Runtime V2 pins Planner-selected skills only after compiling the final TaskSpec', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      providerScript: [
        {
          content: JSON.stringify({
            complexity: 'medium',
            confidence: 0.95,
            constraints: ['不得增加未请求的交付物'],
            assumptions: [],
            acceptanceCriteria: ['报告必须通过验证'],
            skillIds: ['report'],
            plan: [
              { id: 'produce-report', label: '制作报告', phase: 'production', status: 'in_progress' },
              { id: 'verify-report', label: '验证报告', phase: 'verification', status: 'pending' }
            ]
          })
        },
        { content: '无法在本轮合成场景中创建报告。' },
        { content: '本轮仍然无法创建必需报告。' },
        { content: '已确认无法交付必需报告。' }
      ]
    });
    const created = await harness.createRun({
      objective: '制作一份经过验证的报告。',
      deliverables: ['report'],
      capabilities: { files: true, shell: true },
      planWithModel: true
    });
    const before = await pool.query(
      `SELECT runtime_profile_hash,skill_versions FROM agent_runs WHERE id=$1`,
      [created.runId]
    );
    assert.equal(before.rows[0].runtime_profile_hash, null);
    assert.deepEqual(before.rows[0].skill_versions, {});

    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'failed');
    const after = await pool.query(
      `SELECT runtime_profile_hash,skill_versions FROM agent_runs WHERE id=$1`,
      [created.runId]
    );
    assert.equal(after.rows[0].runtime_profile_hash.length, 32);
    assert.equal(after.rows[0].skill_versions.report, 1);
    assert.equal(
      terminal.snapshot.persistent.events.some((event) => (
        event.data?.code === 'AGENT_RUNTIME_SKILL_NOT_FROZEN'
      )),
      false
    );
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Runtime V2 records every Provider retry against an immutable per-attempt reservation', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      providerScript: [
        {
          status: 500,
          body: {
            error: { code: 'synthetic_retryable' },
            usage: { prompt_tokens: 0, completion_tokens: 0 }
          }
        },
        ...verifiedTextScript()
      ]
    });
    const created = await harness.createRun({
      objective: '验证一次 500 后成功的模型调用不会覆盖第一次尝试的预算关系。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    const actorCalls = terminal.snapshot.persistent.modelCalls
      .filter((call) => call.phase === 'actor')
      .sort((left, right) => Number(left.attempt) - Number(right.attempt));
    assert.deepEqual(actorCalls.map((call) => Number(call.attempt)), [1, 2]);
    const actorReservations = terminal.snapshot.persistent.reservations
      .filter((reservation) => reservation.component === 'actor');
    assert.equal(actorReservations.length, 2);
    assert.equal(new Set(actorReservations.map((entry) => entry.reservation_key)).size, 2);
    assert.equal(new Set(actorReservations.map((entry) => entry.model_call_id)).size, 2);
    assert.equal(actorReservations.every((entry) => entry.state === 'consumed'), true);
    assert.deepEqual(
      new Set(actorReservations.map((entry) => entry.model_call_id)),
      new Set(actorCalls.map((entry) => entry.id))
    );
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 drives a zero-file text run through the real PostgreSQL runtime exactly once', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    const readiness = await checkDatabase(pool);
    assert.equal(readiness.ok, true);
    assert.equal(readiness.migration, '025_agent_runtime_v2_1_durability');
    harness = await AgentRuntimeHarness.create({
      pool,
      providerScript: [
        { content: '建议先明确核心受众，再以一个主视觉焦点和一项主要行动完成首屏。' },
        {
          content: JSON.stringify({
            passed: true,
            score: 100,
            issues: [],
            repairInstructions: [],
            unsupportedVisualJudgment: false,
            criteria: []
          })
        }
      ]
    });
    const created = await harness.createRun({
      objective: '给出一条简洁且可验证的设计建议，不创建任何文件。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const serviceStatus = await harness.runService.getServiceStatus();
    assert.equal(serviceStatus.durability.toolReceiptsReady, true);
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    assert.equal(terminal.snapshot.persistent.artifacts.length, 0);
    assert.match(
      terminal.snapshot.persistent.run.final_text_sha256.toString('hex'),
      /^[a-f0-9]{64}$/
    );
    assert.equal(terminal.snapshot.persistent.run.semantic_verification.passed, true);
    const hold = terminal.snapshot.persistent.holds[0];
    assert.equal(hold.status, 'settled');
    assert.ok(Number(hold.charged_credits) <= 50);
    assert.equal(
      terminal.snapshot.persistent.events.filter((event) => event.event_type === 'run.succeeded').length,
      1
    );
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 reaches the Runtime V1 text baseline without touching V2 reservations', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      envOverrides: {
        AGENT_RUNTIME_V2_ENABLED: 'false',
        AGENT_RUNTIME_V2_ROLLOUT_PERCENT: '0'
      },
      providerScript: [{ content: '已完成 Runtime V1 的纯文字答复。' }]
    });
    const created = await harness.createRun({
      objective: '只返回一段文字，不创建文件。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(Number(terminal.snapshot.persistent.run.runtime_version), 1);
    assert.equal(terminal.snapshot.persistent.run.status, 'failed');
    assert.equal(terminal.snapshot.persistent.run.error_code, 'AGENT_VERIFICATION_INCOMPLETE');
    assert.equal(terminal.snapshot.persistent.reservations.length, 0);
    assert.equal(terminal.snapshot.persistent.holds.length, 1);
    assert.equal(terminal.snapshot.persistent.holds[0].status, 'released');
    assert.equal(
      terminal.snapshot.persistent.events.filter((event) => event.event_type === 'run.failed').length,
      1
    );
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 cleanup releases an unresolved hold before deleting runtime fixtures', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({ pool });
    const created = await harness.createRun({
      objective: '创建后立即清理，用于验证测试账本不会遗留冻结余额。',
      deliverables: []
    });
    const before = await pool.query(
      `SELECT w.frozen_credits, h.status
         FROM wallets w
         JOIN agent_budget_holds h ON h.user_id=w.user_id
        WHERE w.user_id=$1 AND h.run_id=$2`,
      [harness.userId, created.runId]
    );
    assert.equal(before.rows[0].status, 'held');
    assert.equal(Number(before.rows[0].frozen_credits), 50);

    const harnessUserId = harness.userId;
    await harness.cleanup();
    harness = null;

    const after = await pool.query(
      `SELECT w.available_credits,w.frozen_credits,
              (SELECT count(*)::int FROM agent_budget_holds WHERE user_id=w.user_id AND status='held') AS held
         FROM wallets w WHERE w.user_id=$1`,
      [harnessUserId]
    );
    assert.equal(Number(after.rows[0].available_credits), 500);
    assert.equal(Number(after.rows[0].frozen_credits), 0);
    assert.equal(after.rows[0].held, 0);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 cleanup deletes exact MinIO objects instead of only deleting database rows', {
  skip: !s3Enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  let verifier = null;
  try {
    harness = await AgentRuntimeHarness.create({ pool });
    const asset = await harness.addInputAsset({
      buffer: minimalWebsiteZip(),
      mimeType: 'application/zip',
      metadata: { cleanupProbe: true }
    });
    const stored = await pool.query('SELECT uri FROM assets WHERE id=$1', [asset.assetId]);
    const uri = stored.rows[0].uri;
    const bucket = harness.assetAdapter.bucket;
    const key = harness.assetAdapter.keyFromUri(uri);
    verifier = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.MINIO_TEST_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ROOT_USER || 'artigen-minio',
        secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'artigen-minio-secret'
      }
    });
    await verifier.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

    await harness.cleanup();
    await harness.cleanup();
    harness = null;

    await assert.rejects(
      verifier.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
      (error) => ['NotFound', 'NoSuchKey'].includes(error?.name) ||
        Number(error?.$metadata?.httpStatusCode) === 404
    );
    const record = await pool.query('SELECT 1 FROM assets WHERE id=$1', [asset.assetId]);
    assert.equal(record.rowCount, 0);
  } finally {
    await harness?.cleanup();
    verifier?.destroy();
    await pool.end();
  }
});

test('Harness V3 preserves a long Chinese goal, tail constraint and acceptance text exactly', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  const tailConstraint = '尾部禁止项：不得公开发布、不得填写第三方表单，也不得删除本条约束。';
  const acceptanceText = '验收条件：最终建议必须明确复述预算边界与尾部禁止项。';
  const objective = `请分析一个复杂设计任务。${'完整保留中文上下文与细节。'.repeat(300)}${tailConstraint}`;
  const taskSpec = {
    version: 2,
    goal: objective,
    complexity: 'high',
    confidence: 1,
    constraints: [{
      id: 'constraint-tail', text: tailConstraint, source: 'user', criticality: 'critical'
    }],
    assumptions: [],
    deliverables: [],
    allowedOrigins: [],
    acceptanceCriteria: [{
      id: 'acceptance-tail', text: acceptanceText, source: 'user', criticality: 'required'
    }],
    skillIds: [],
    plan: [
      { id: 'produce', label: '形成受约束的建议', phase: 'production', status: 'in_progress' },
      { id: 'verify', label: '核对全部禁止项', phase: 'verification', status: 'pending' }
    ],
    budget: { maxCredits: 50 }
  };
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      providerScript: [
        { content: `已在预算内完成，并遵守：${tailConstraint}` },
        {
          content: JSON.stringify({
            passed: true,
            score: 100,
            issues: [],
            repairInstructions: [],
            unsupportedVisualJudgment: false,
            criteria: [{
              requirementId: 'acceptance-tail',
              status: 'passed',
              evidenceRefs: ['deterministic:long-goal'],
              confidence: 1,
              issue: null,
              repairTarget: null
            }]
          })
        }
      ]
    });
    const created = await harness.createRun({
      objective,
      deliverables: [],
      capabilities: { files: true, shell: true },
      taskSpec
    });
    const privateContext = await harness.runService.loadPrivateContext({ runId: created.runId });
    const payload = privateContext.payloads.find((entry) => entry.kind === 'objective')?.value;
    assert.equal(payload.objective, objective);
    assert.equal(payload.taskSpec.goal, objective);
    assert.equal(payload.taskSpec.constraintRequirements.at(-1).text, tailConstraint);
    assert.equal(payload.taskSpec.acceptanceRequirements.at(-1).text, acceptanceText);

    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 runs real image delivery with scripted Kolors, storage verification and one settlement', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      providerScript: imageDeliveryScript()
    });
    const created = await harness.createRun({
      objective: '生成一张克制的方形香氛品牌主视觉设计稿。',
      deliverables: ['image'],
      capabilities: { files: true, shell: true, generate_images: true }
    });
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    assert.equal(harness.kolors.calls.length, 1);
    assert.equal(harness.kolors.calls[0].model, 'Kwai-Kolors/Kolors');
    assert.equal(terminal.snapshot.persistent.artifacts.length, 1);
    assert.deepEqual({
      role: terminal.snapshot.persistent.artifacts[0].role,
      mimeType: terminal.snapshot.persistent.artifacts[0].mime_type,
      verification: terminal.snapshot.persistent.artifacts[0].verification_status
    }, {
      role: 'image',
      mimeType: 'image/png',
      verification: 'passed'
    });
    assert.equal(
      terminal.snapshot.persistent.events.filter((event) => event.event_type === 'run.succeeded').length,
      1
    );
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 durably stores a Kolors response before sandbox write and resumes without regeneration', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const controller = new RuntimeTestController();
  controller.armCrash('after_image_provider_response');
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      controller,
      providerScript: imageDeliveryScript()
    });
    const created = await harness.createRun({
      objective: '生成一张图片，并验证图片 Provider 返回后的崩溃可以从 S3 回执恢复。',
      deliverables: ['image'],
      capabilities: { files: true, shell: true, generate_images: true }
    });
    await assert.rejects(
      harness.worker.processRun(created.runId),
      (error) => error instanceof RuntimeHarnessCrash &&
        error.point === 'after_image_provider_response'
    );
    const imageBeforeResume = await pool.query(
      `SELECT id,sha256,byte_size,gc_state FROM assets
        WHERE metadata->>'source'='agent-kolors-receipt'
          AND metadata->>'runId'=$1`,
      [created.runId]
    );
    assert.equal(imageBeforeResume.rowCount, 1);
    assert.equal(imageBeforeResume.rows[0].gc_state, 'active');
    assert.equal(imageBeforeResume.rows[0].sha256.length, 32);
    assert.ok(Number(imageBeforeResume.rows[0].byte_size) > 0);
    await harness.resumeFromCrash(created.runId);
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    // The image flow still needs four distinct Qwen stages after the recovered
    // tool result: generate, declare, verify, and summarize. Recovery must not
    // add an untracked Provider request, so the physical request count must
    // match the durable model-call ledger exactly.
    assert.equal(harness.transport.requests.length, 4);
    assert.equal(
      harness.transport.requests.length,
      terminal.snapshot.persistent.modelCalls.length
    );
    assert.equal(harness.kolors.calls.length, 1);
    assert.equal(
      terminal.snapshot.persistent.events.filter((event) => (
        event.event_type === 'image.call.ambiguous'
      )).length,
      0
    );
    assert.deepEqual(
      terminal.snapshot.persistent.reservations
        .filter((reservation) => reservation.component === 'kolors')
        .map((reservation) => reservation.state),
      ['consumed']
    );
    const receipt = terminal.snapshot.persistent.toolReceipts.find((entry) => entry.kind === 'kolors');
    assert.equal(receipt.state, 'consumed');
    const durableImage = await pool.query(
      `SELECT asset.id,asset.sha256,asset.byte_size,asset.gc_state
         FROM agent_artifacts artifact
         JOIN assets asset ON asset.id=artifact.asset_id
        WHERE artifact.run_id=$1`,
      [created.runId]
    );
    assert.equal(durableImage.rowCount, 1);
    assert.equal(durableImage.rows[0].id, imageBeforeResume.rows[0].id);
    assert.equal(durableImage.rows[0].gc_state, 'active');
    assert.equal(durableImage.rows[0].sha256.length, 32);
    assert.ok(Number(durableImage.rows[0].byte_size) > 0);
    await harness.assertInvariants(created.runId);
    assert.equal(
      terminal.snapshot.persistent.reservations.filter((reservation) => (
        reservation.component === 'kolors' &&
        reservation.state === 'consumed' &&
        Number(reservation.actual_credits) === 8
      )).length,
      1
    );
    assert.equal(terminal.snapshot.persistent.holds[0].status, 'settled');
    assert.ok(Number(terminal.snapshot.persistent.holds[0].charged_credits) >= 8);
    assert.ok(Number(terminal.snapshot.persistent.run.estimated_credits_used) >= 8);
    assert.equal(
      terminal.snapshot.persistent.events.filter((event) => event.event_type === 'run.lease_recovered').length,
      1
    );
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 reuses a persisted Kolors tool receipt after a crash without regenerating', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const controller = new RuntimeTestController();
  controller.armCrash('after_tool_receipt');
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      controller,
      providerScript: imageDeliveryScript()
    });
    const created = await harness.createRun({
      objective: '生成一张图片，并验证已持久化的图片工具回执不会再次调用 Kolors。',
      deliverables: ['image'],
      capabilities: { files: true, shell: true, generate_images: true }
    });
    await assert.rejects(
      harness.worker.processRun(created.runId),
      (error) => error instanceof RuntimeHarnessCrash && error.point === 'after_tool_receipt'
    );
    assert.equal(harness.kolors.calls.length, 1);

    const terminal = await harness.resumeFromCrash(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    assert.equal(harness.kolors.calls.length, 1);
    assert.equal(
      terminal.snapshot.persistent.reservations.filter((reservation) => (
        reservation.component === 'kolors' &&
        reservation.state === 'consumed' &&
        Number(reservation.actual_credits) === 8
      )).length,
      1
    );
    assert.equal(terminal.snapshot.persistent.holds[0].status, 'settled');
    assert.ok(Number(terminal.snapshot.persistent.holds[0].charged_credits) >= 8);
    assert.ok(Number(terminal.snapshot.persistent.run.estimated_credits_used) >= 8);
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 cancellation after a Kolors receipt settles the known image cost once', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const controller = new RuntimeTestController();
  controller.setBarrier('after_tool_receipt', {
    participants: 1,
    timeoutMs: 5_000,
    manualRelease: true
  });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      controller,
      providerScript: imageDeliveryScript()
    });
    const created = await harness.createRun({
      objective: '验证图片回执落库后取消会结算已知 Kolors 成本且不重复生成。',
      deliverables: ['image'],
      capabilities: { files: true, shell: true, generate_images: true }
    });
    const attempt = harness.worker.processRun(created.runId);
    await controller.waitForArrivals('after_tool_receipt', { arrivals: 1, timeoutMs: 5_000 });
    const beforeCancel = await harness.snapshot(created.runId);
    assert.equal(harness.kolors.calls.length, 1);
    assert.deepEqual(
      beforeCancel.persistent.toolReceipts.map((receipt) => receipt.state),
      ['consumed']
    );
    assert.equal(
      beforeCancel.persistent.reservations.find((entry) => entry.component === 'kolors')?.state,
      'reserved'
    );
    const cancelled = await harness.cancel(created.runId);
    assert.equal(cancelled.status, 'cancelled');
    controller.releaseBarrier('after_tool_receipt');
    const workerResult = await attempt;
    assert.equal(workerResult.status, 'lease_lost');
    const terminal = await harness.snapshot(created.runId);
    const imageReservation = terminal.persistent.reservations.find(
      (entry) => entry.component === 'kolors'
    );
    assert.equal(harness.kolors.calls.length, 1);
    assert.equal(imageReservation.state, 'consumed');
    assert.equal(Number(imageReservation.actual_credits), 8);
    assert.equal(Number(terminal.persistent.run.charged_credits), 9);
    assert.equal(terminal.persistent.holds[0].status, 'settled');
    assert.equal(
      terminal.persistent.reservations.some((reservation) => reservation.state === 'reserved'),
      false
    );
    await harness.assertInvariants(created.runId);
  } finally {
    try {
      controller.releaseBarrier('after_tool_receipt');
    } catch {}
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 treats an explicit Kolors 4xx rejection as a normal failed tool action', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      providerScript: [imageDeliveryScript()[0]],
      kolorsScript: [{
        throwCode: 'KOLORS_INPUT_REJECTED',
        throwStatus: 400
      }]
    });
    const created = await harness.createRun({
      objective: '验证图片服务明确拒绝输入时不进入模糊调用恢复流程。',
      deliverables: ['image'],
      capabilities: { files: true, shell: true, generate_images: true }
    });
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'failed');
    assert.equal(harness.kolors.calls.length, 1);
    assert.equal(harness.kolors.calls[0].ok, false);
    assert.equal(
      terminal.snapshot.persistent.events.filter((event) => (
        event.event_type === 'image.call.ambiguous'
      )).length,
      0
    );
    assert.deepEqual(
      terminal.snapshot.persistent.reservations
        .filter((reservation) => reservation.component === 'kolors')
        .map((reservation) => reservation.state),
      ['released']
    );
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 treats an exhausted explicit Kolors 429 as a determined rejection', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      providerScript: [imageDeliveryScript()[0]],
      kolorsScript: [{
        throwCode: 'KOLORS_RATE_LIMITED',
        throwStatus: 429
      }]
    });
    const created = await harness.createRun({
      objective: '验证图片服务明确限流且内部重试耗尽后不会进入模糊恢复。',
      deliverables: ['image'],
      capabilities: { files: true, shell: true, generate_images: true }
    });
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'failed');
    assert.equal(harness.kolors.calls.length, 1);
    assert.equal(harness.kolors.calls[0].ok, false);
    assert.equal(
      terminal.snapshot.persistent.events.filter((event) => (
        event.event_type === 'image.call.ambiguous'
      )).length,
      0
    );
    assert.deepEqual(
      terminal.snapshot.persistent.reservations
        .filter((reservation) => reservation.component === 'kolors')
        .map((reservation) => reservation.state),
      ['released']
    );
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

for (const failpoint of [
  'before_intent',
  'after_intent',
  'after_receipt',
  'after_budget_consume',
  'after_verifier',
  'after_ready_to_finalize_event',
  'before_finish_commit',
  'after_finish_commit'
]) {
  test(`Harness V3 resumes ${failpoint} without repeating a provider response or settlement`, {
    skip: !enabled,
    timeout: 30_000
  }, async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const controller = new RuntimeTestController();
    controller.armCrash(failpoint);
    let harness = null;
    try {
      harness = await AgentRuntimeHarness.create({
        pool,
        controller,
        providerScript: verifiedTextScript()
      });
      const created = await harness.createRun({
        objective: `验证 ${failpoint} 崩溃恢复，不创建文件。`,
        deliverables: [],
        capabilities: { files: true, shell: true }
      });
      await assert.rejects(
        harness.worker.processRun(created.runId),
        (error) => error instanceof RuntimeHarnessCrash && error.point === failpoint
      );
      const terminal = await harness.resumeFromCrash(created.runId);
      assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
      assert.equal(harness.transport.requests.length, 2);
      assert.equal(
        terminal.snapshot.persistent.events.filter((event) => event.event_type === 'run.succeeded').length,
        1
      );
      if (failpoint === 'after_ready_to_finalize_event') {
        assert.equal(
          terminal.snapshot.persistent.events.filter((event) => (
            event.event_type === 'run.ready_to_finalize'
          )).length,
          1
        );
      }
      assert.equal(
        terminal.snapshot.persistent.holds.filter((hold) => hold.status === 'settled').length,
        1
      );
      await harness.assertInvariants(created.runId);
    } finally {
      await harness?.cleanup();
      await pool.end();
    }
  });
}

for (const failpoint of ['after_dispatch', 'after_provider_response']) {
  test(`Harness V3 makes ${failpoint} ambiguous and never automatically resends it`, {
    skip: !enabled,
    timeout: 30_000
  }, async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const controller = new RuntimeTestController();
    controller.armCrash(failpoint);
    let harness = null;
    try {
      harness = await AgentRuntimeHarness.create({
        pool,
        controller,
        providerScript: verifiedTextScript()
      });
      const created = await harness.createRun({
        objective: `验证 ${failpoint} 模糊调用不自动重发。`,
        deliverables: [],
        capabilities: { files: true, shell: true }
      });
      await assert.rejects(
        harness.worker.processRun(created.runId),
        (error) => error instanceof RuntimeHarnessCrash && error.point === failpoint
      );
      // Reproduce a real evaluator interruption that outlives both the Worker
      // lease and the original billing hold. Recovery must not transition to
      // waiting_user and then fail it in the later hold-expiry sweep.
      await pool.query(
        `UPDATE agent_budget_holds
            SET expires_at=clock_timestamp()-interval '1 second'
          WHERE run_id=$1 AND status='held'`,
        [created.runId]
      );
      const resumed = await harness.resumeFromCrash(created.runId);
      assert.equal(resumed.snapshot.persistent.run.status, 'waiting_user');
      assert.equal(harness.transport.requests.length, 1);
      assert.equal(Number(resumed.snapshot.persistent.run.charged_credits || 0), 0);
      assert.equal(
        resumed.snapshot.persistent.events.filter((event) => event.event_type === 'run.retry_required').length,
        1
      );
      assert.equal(
        resumed.snapshot.persistent.receipts.filter((receipt) => receipt.state === 'ambiguous').length,
        1
      );
      assert.equal(
        resumed.snapshot.persistent.reservations.some((reservation) => (
          reservation.state === 'reserved'
        )),
        false
      );
      assert.equal(resumed.snapshot.persistent.holds[0].status, 'held');
      assert.ok(
        new Date(resumed.snapshot.persistent.holds[0].expires_at).getTime() > Date.now()
      );
      const walletBeforeCancel = await pool.query(
        'SELECT frozen_credits FROM wallets WHERE user_id=$1',
        [harness.userId]
      );
      assert.ok(Number(walletBeforeCancel.rows[0].frozen_credits) > 0);
      controller.assertDrained();
      harness.trace.assertProtocolInvariants();
      await harness.oracle.assertInvariants(created.runId);
      const cancelled = await harness.cancel(created.runId);
      assert.equal(cancelled.status, 'cancelled');
      const afterCancel = await harness.snapshot(created.runId);
      assert.equal(afterCancel.persistent.holds[0].status, 'released');
      assert.equal(harness.transport.requests.length, 1);
      const walletAfterCancel = await pool.query(
        'SELECT frozen_credits FROM wallets WHERE user_id=$1',
        [harness.userId]
      );
      assert.equal(Number(walletAfterCancel.rows[0].frozen_credits), 0);
      await harness.assertInvariants(created.runId);
    } finally {
      await harness?.cleanup();
      await pool.end();
    }
  });
}

test('Harness V3 recovers a completed sandbox Shell receipt without repeating the effect', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const controller = new RuntimeTestController();
  controller.armCrash('after_tool_effect');
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      controller,
      providerScript: [
        {
          toolCalls: [functionToolCall({
            id: 'website-write-1',
            name: 'sandbox_shell',
            arguments: {
              script: harnessWriteCommand([{
                path: '/tmp/artigen-workspace/harness-site.zip',
                buffer: minimalWebsiteZip()
              }]),
              purpose: 'Create the deterministic offline website package'
            }
          })]
        },
        {
          toolCalls: [functionToolCall({
            id: 'website-declare-1',
            name: 'declare_artifact',
            arguments: {
              path: '/tmp/artigen-workspace/harness-site.zip',
              role: 'website',
              filename: 'harness-site.zip',
              mimeType: 'application/zip',
              sources: []
            }
          })]
        },
        {
          content: JSON.stringify({
            passed: true,
            score: 100,
            issues: [],
            repairInstructions: [],
            unsupportedVisualJudgment: false,
            criteria: []
          })
        },
        { content: '已生成并验证 harness-site.zip。' }
      ]
    });
    const created = await harness.createRun({
      objective: '创建并交付一个可离线打开的静态网站 ZIP。',
      deliverables: ['website'],
      capabilities: { files: true, shell: true }
    });
    await assert.rejects(
      harness.worker.processRun(created.runId),
      (error) => error instanceof RuntimeHarnessCrash && error.point === 'after_tool_effect'
    );
    assert.equal(harness.transport.requests.length, 1);
    const terminal = await harness.resumeFromCrash(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    assert.equal(harness.transport.requests.length, 4);
    assert.equal(terminal.snapshot.persistent.artifacts.length, 1);
    assert.equal(terminal.snapshot.persistent.artifacts[0].verification_status, 'passed');
    assert.equal(
      harness.trace.snapshot().filter((entry) => (
        entry.type === 'failpoint.hit' && entry.point === 'after_tool_effect'
      )).length,
      1
    );
    assert.deepEqual(
      terminal.snapshot.persistent.toolReceipts.map((receipt) => receipt.state),
      ['consumed']
    );
    assert.equal(
      terminal.snapshot.persistent.events.some((event) => (
        event.event_type === 'tool.call.ambiguous'
      )),
      false
    );
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 keeps an unresolved subagent Shell receipt on the conservative user-confirmation path', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      providerScript: verifiedTextScript()
    });
    const created = await harness.createRun({
      objective: '验证子 Agent 未决 Shell 操作不会被误判为可自动恢复。',
      deliverables: [],
      capabilities: { files: true, shell: true, subagents: true }
    });
    const workerId = `subagent-receipt-${crypto.randomUUID()}`;
    const claimed = await harness.runService.claimRun({ runId: created.runId, workerId });
    const lease = {
      runId: created.runId,
      workerId,
      leaseEpoch: Number(claimed.lease_epoch)
    };
    await harness.runService.transitionRun({
      ...lease,
      toStatus: 'running',
      eventType: 'run.started',
      summary: 'Subagent Shell receipt recovery probe'
    });
    const [subagent] = await harness.runService.createSubagents({
      ...lease,
      tasks: [{
        role: 'analyst',
        label: 'Receipt probe',
        objective: 'Create one isolated analysis note.',
        expectedOutput: 'analysis.md',
        inputPaths: []
      }],
      allowedInputPaths: []
    });
    const receiptKey = `subagent:${subagent.subagentId}:shell:probe:attempt:0`;
    const reservationKey = `sandbox:${receiptKey}`;
    await harness.runService.reserveRuntimeBudget({
      ...lease,
      subagentId: subagent.subagentId,
      component: 'sandbox',
      reservationKey,
      maximumCredits: 2
    });
    await harness.runService.persistToolReceipt({
      ...lease,
      subagentId: subagent.subagentId,
      receiptKey,
      kind: 'sandbox_shell',
      state: 'dispatched',
      reservationKey,
      requestSha256: crypto.createHash('sha256').update('subagent-shell-probe').digest('hex')
    });
    await pool.query(
      `UPDATE agent_runs SET lease_expires_at=clock_timestamp()-interval '1 second'
        WHERE id=$1`,
      [created.runId]
    );
    assert.equal(await harness.runService.expireStaleRuns({ limit: 10 }), 1);
    const snapshot = await harness.snapshot(created.runId);
    assert.equal(snapshot.persistent.run.status, 'waiting_user');
    assert.deepEqual(snapshot.persistent.toolReceipts.map((receipt) => receipt.state), ['ambiguous']);
    assert.equal(snapshot.persistent.events.some((event) => (
      event.event_type === 'tool.call.recovery_probe_queued'
    )), false);
    assert.equal(snapshot.persistent.events.some((event) => (
      event.event_type === 'tool.call.ambiguous'
    )), true);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 reuses an encrypted Shell receipt after a crash without repeating the effect', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const controller = new RuntimeTestController();
  controller.armCrash('after_tool_receipt');
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      controller,
      providerScript: [
        {
          toolCalls: [functionToolCall({
            id: 'website-write-receipt-1',
            name: 'sandbox_shell',
            arguments: {
              script: harnessWriteCommand([{
                path: '/tmp/artigen-workspace/harness-site.zip',
                buffer: minimalWebsiteZip()
              }]),
              purpose: 'Create one deterministic website package'
            }
          })]
        },
        {
          toolCalls: [functionToolCall({
            id: 'website-declare-receipt-1',
            name: 'declare_artifact',
            arguments: {
              path: '/tmp/artigen-workspace/harness-site.zip',
              role: 'website',
              filename: 'harness-site.zip',
              mimeType: 'application/zip',
              sources: []
            }
          })]
        },
        {
          content: JSON.stringify({
            passed: true,
            score: 100,
            issues: [],
            repairInstructions: [],
            unsupportedVisualJudgment: false,
            criteria: []
          })
        },
        { content: '已生成并验证 harness-site.zip。' }
      ]
    });
    const created = await harness.createRun({
      objective: '创建并交付一个只执行一次写入的静态网站 ZIP。',
      deliverables: ['website'],
      capabilities: { files: true, shell: true }
    });
    await assert.rejects(
      harness.worker.processRun(created.runId),
      (error) => error instanceof RuntimeHarnessCrash && error.point === 'after_tool_receipt'
    );
    const terminal = await harness.resumeFromCrash(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    assert.equal(
      harness.trace.snapshot().filter((entry) => (
        entry.type === 'failpoint.hit' && entry.point === 'after_tool_effect'
      )).length,
      1
    );
    assert.deepEqual(
      terminal.snapshot.persistent.toolReceipts.map((receipt) => receipt.state),
      ['consumed']
    );
    assert.equal(terminal.snapshot.persistent.run.checkpoint.toolReceipts, undefined);
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 rejects raw Python before creating a Shell receipt or sandbox reservation', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      providerScript: [
        {
          toolCalls: [functionToolCall({
            id: 'raw-python-shell-1',
            name: 'sandbox_shell',
            arguments: {
              script: 'import pandas as pd\ndf = pd.DataFrame({"a": [1]})',
              purpose: 'Create a synthetic analysis file'
            }
          })]
        },
        {
          toolCalls: [functionToolCall({
            id: 'wrapped-python-shell-1',
            name: 'sandbox_shell',
            arguments: {
              script: harnessWriteCommand([{
                path: '/tmp/artigen-workspace/analysis.txt',
                buffer: Buffer.from('verified synthetic analysis', 'utf8')
              }]),
              purpose: 'Create the synthetic analysis file with Bash'
            }
          })]
        },
        ...verifiedTextScript()
      ]
    });
    const created = await harness.createRun({
      objective: '创建一个离线分析文件并返回简短说明。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    const shellReceipts = terminal.snapshot.persistent.toolReceipts.filter((receipt) => (
      receipt.kind === 'sandbox_shell'
    ));
    assert.equal(shellReceipts.length, 1);
    assert.equal(shellReceipts[0].state, 'consumed');
    const sandboxReservations = terminal.snapshot.persistent.reservations.filter((reservation) => (
      reservation.component === 'sandbox'
    ));
    assert.equal(sandboxReservations.length, 1);
    assert.equal(sandboxReservations[0].state, 'consumed');
    assert.equal(harness.transport.requests.length, 4);
    assert.ok(harness.transport.requests[1].messages.some((message) => (
      message.role === 'tool' &&
      message.content.includes('AGENT_SHELL_SCRIPT_TYPE_INVALID') &&
      message.content.includes("python3 <<'PY'")
    )));
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 retains more than sixteen encrypted tool receipts without checkpoint plaintext', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({ pool, providerScript: [] });
    const created = await harness.createRun({
      objective: '验证长任务的工具回执不会因固定长度缓存被淘汰。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const workerId = `harness-ledger-${crypto.randomUUID()}`;
    const claimed = await harness.runService.claimRun({ runId: created.runId, workerId });
    const lease = {
      runId: created.runId,
      workerId,
      leaseEpoch: Number(claimed.lease_epoch)
    };
    await harness.runService.transitionRun({
      ...lease,
      toStatus: 'running',
      eventType: 'run.started',
      summary: '开始长回执账本测试'
    });
    for (let index = 0; index < 20; index += 1) {
      const receiptKey = `parent:shell:ledger${String(index).padStart(3, '0')}:attempt:0`;
      const reservationKey = `sandbox:${receiptKey}`;
      const requestSha256 = crypto.createHash('sha256').update(`request-${index}`).digest('hex');
      await harness.runService.reserveRuntimeBudget({
        ...lease,
        component: 'sandbox',
        reservationKey,
        maximumCredits: 0
      });
      await harness.runService.persistToolReceipt({
        ...lease,
        receiptKey,
        kind: 'sandbox_shell',
        state: 'dispatched',
        reservationKey,
        requestSha256
      });
      await harness.runService.persistToolReceipt({
        ...lease,
        receiptKey,
        kind: 'sandbox_shell',
        state: 'consumed',
        reservationKey,
        requestSha256,
        actualCredits: 0,
        result: {
          success: true,
          returnCode: 0,
          stdout: `private-ledger-output-${index}`,
          stderr: ''
        }
      });
      await harness.runService.consumeRuntimeBudget({
        ...lease,
        reservationKey,
        actualCredits: 0
      });
    }
    const receipts = await harness.runService.listToolReceipts(lease);
    assert.equal(receipts.length, 20);
    assert.equal(receipts[0].result.stdout, 'private-ledger-output-0');
    assert.equal(receipts[19].result.stdout, 'private-ledger-output-19');
    const storage = await pool.query(
      `SELECT run.checkpoint::text AS checkpoint,
              count(receipt.*)::integer AS receipt_count,
              bool_and(receipt.result_ciphertext IS NOT NULL) AS encrypted
         FROM agent_runs run
         LEFT JOIN agent_tool_call_receipts receipt ON receipt.run_id=run.id
        WHERE run.id=$1
        GROUP BY run.id`,
      [created.runId]
    );
    assert.equal(storage.rows[0].receipt_count, 20);
    assert.equal(storage.rows[0].encrypted, true);
    assert.equal(storage.rows[0].checkpoint.includes('private-ledger-output'), false);
    const cancelled = await harness.cancel(created.runId);
    assert.equal(cancelled.status, 'cancelled');
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 migrates a legacy checkpoint receipt before replaying its tool call', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    const legacyCallId = 'legacy-shell-replay-1';
    const legacyReceiptKey = `parent:shell:${legacyCallId}`;
    const legacyReservationKey = `sandbox:${legacyReceiptKey}`;
    harness = await AgentRuntimeHarness.create({
      pool,
      providerScript: [
        {
          toolCalls: [functionToolCall({
            id: legacyCallId,
            name: 'sandbox_shell',
            arguments: {
              script: harnessWriteCommand([{
                path: '/tmp/artigen-workspace/legacy-must-not-repeat.txt',
                buffer: Buffer.from('already written before the old checkpoint', 'utf8')
              }]),
              purpose: 'Recover the old receipt without repeating this write'
            }
          })]
        },
        { content: '旧回执已安全恢复，没有重复执行工具。' },
        {
          content: JSON.stringify({
            passed: true,
            score: 100,
            issues: [],
            repairInstructions: [],
            unsupportedVisualJudgment: false,
            criteria: []
          })
        }
      ]
    });
    const created = await harness.createRun({
      objective: '验证旧版 checkpoint 工具回执升级后仍保持 exactly-once。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const oldWorkerId = `legacy-worker-${crypto.randomUUID()}`;
    const claimed = await harness.runService.claimRun({ runId: created.runId, workerId: oldWorkerId });
    const oldLease = {
      runId: created.runId,
      workerId: oldWorkerId,
      leaseEpoch: Number(claimed.lease_epoch)
    };
    await harness.runService.transitionRun({
      ...oldLease,
      toStatus: 'running',
      eventType: 'run.started',
      summary: '创建旧版回执恢复夹具'
    });
    await harness.runService.reserveRuntimeBudget({
      ...oldLease,
      component: 'sandbox',
      reservationKey: legacyReservationKey,
      maximumCredits: 0
    });
    await harness.runService.consumeRuntimeBudget({
      ...oldLease,
      reservationKey: legacyReservationKey,
      actualCredits: 0
    });
    await harness.runService.saveCheckpoint({
      ...oldLease,
      checkpoint: {
        toolReceipts: {
          [legacyReceiptKey]: {
            kind: 'sandbox_shell',
            reservationKey: legacyReservationKey,
            actualCredits: 0,
            result: {
              success: true,
              returnCode: 0,
              stdout: 'legacy-private-output',
              stderr: ''
            }
          }
        }
      }
    });
    await pool.query(
      `UPDATE agent_runs SET lease_expires_at=clock_timestamp()-interval '1 second'
        WHERE id=$1`,
      [created.runId]
    );
    assert.equal(await harness.runService.expireStaleRuns({ limit: 10 }), 1);
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    assert.equal(
      harness.trace.snapshot().filter((entry) => (
        entry.type === 'failpoint.hit' && entry.point === 'after_tool_effect'
      )).length,
      0
    );
    assert.equal(terminal.snapshot.persistent.run.checkpoint.toolReceipts, undefined);
    assert.deepEqual(
      terminal.snapshot.persistent.toolReceipts.map((receipt) => ({
        state: receipt.state,
        key: receipt.receipt_key
      })),
      [{ state: 'consumed', key: legacyReceiptKey }]
    );
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 cancellation fences a dispatched Shell before the effect and releases its budget', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const controller = new RuntimeTestController();
  controller.setBarrier('after_tool_dispatch', {
    participants: 1,
    timeoutMs: 5_000,
    manualRelease: true
  });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      controller,
      providerScript: [{
        toolCalls: [functionToolCall({
          id: 'cancel-before-shell-effect-1',
          name: 'sandbox_shell',
          arguments: {
            script: harnessWriteCommand([{
              path: '/tmp/artigen-workspace/should-not-exist.txt',
              buffer: Buffer.from('must not be written', 'utf8')
            }]),
            purpose: 'This effect must be fenced by cancellation'
          }
        })]
      }]
    });
    const created = await harness.createRun({
      objective: '验证取消和 Shell 派发竞态不会产生取消后的写入。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const attempt = harness.worker.processRun(created.runId);
    await controller.waitForArrivals('after_tool_dispatch', { arrivals: 1, timeoutMs: 5_000 });
    const beforeCancel = await harness.snapshot(created.runId);
    assert.deepEqual(beforeCancel.persistent.toolReceipts.map((receipt) => receipt.state), ['dispatched']);
    assert.deepEqual(
      beforeCancel.persistent.reservations
        .filter((reservation) => reservation.component === 'sandbox')
        .map((reservation) => reservation.state),
      ['reserved']
    );
    const cancelled = await harness.cancel(created.runId);
    assert.equal(cancelled.status, 'cancelled');
    controller.releaseBarrier('after_tool_dispatch');
    const workerResult = await attempt;
    assert.equal(workerResult.status, 'lease_lost');
    const terminal = await harness.snapshot(created.runId);
    assert.deepEqual(terminal.persistent.toolReceipts.map((receipt) => receipt.state), ['ambiguous']);
    assert.deepEqual(
      terminal.persistent.reservations
        .filter((reservation) => reservation.component === 'sandbox')
        .map((reservation) => reservation.state),
      ['released']
    );
    assert.equal(
      harness.trace.snapshot().filter((entry) => (
        entry.type === 'failpoint.hit' && entry.point === 'after_tool_effect'
      )).length,
      0
    );
    assert.equal(
      terminal.persistent.events.filter((event) => event.event_type === 'tool.call.ambiguous').length,
      1
    );
    await harness.assertInvariants(created.runId);
  } finally {
    try {
      controller.releaseBarrier('after_tool_dispatch');
    } catch {}
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 cancellation after a model receipt leaves no running call or reserved budget', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const controller = new RuntimeTestController();
  controller.setBarrier('after_receipt', {
    participants: 1,
    timeoutMs: 5_000,
    manualRelease: true
  });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      controller,
      providerScript: [verifiedTextScript()[0]]
    });
    const created = await harness.createRun({
      objective: '验证模型回执落库后的取消不会留下 running 调用或冻结预算。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const attempt = harness.worker.processRun(created.runId);
    await controller.waitForArrivals('after_receipt', { arrivals: 1, timeoutMs: 5_000 });
    const beforeCancel = await harness.snapshot(created.runId);
    assert.deepEqual(beforeCancel.persistent.receipts.map((receipt) => receipt.state), ['received']);
    const cancelled = await harness.cancel(created.runId);
    assert.equal(cancelled.status, 'cancelled');
    controller.releaseBarrier('after_receipt');
    const workerResult = await attempt;
    assert.equal(workerResult.status, 'lease_lost');
    const terminal = await harness.snapshot(created.runId);
    assert.deepEqual(terminal.persistent.receipts.map((receipt) => receipt.state), ['consumed']);
    assert.deepEqual(terminal.persistent.modelCalls.map((call) => call.outcome), ['cancelled']);
    assert.equal(Number(terminal.persistent.run.charged_credits), 1);
    assert.equal(Number(terminal.persistent.reservations[0].actual_credits) > 0, true);
    assert.equal(terminal.persistent.reservations[0].state, 'consumed');
    assert.equal(
      terminal.persistent.reservations.some((reservation) => reservation.state === 'reserved'),
      false
    );
    assert.equal(terminal.persistent.holds[0].status, 'settled');
    await harness.assertInvariants(created.runId);
  } finally {
    try {
      controller.releaseBarrier('after_receipt');
    } catch {}
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 restores a released reservation only from a durable received model receipt', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const controller = new RuntimeTestController();
  controller.setBarrier('after_receipt', {
    participants: 1,
    timeoutMs: 5_000,
    manualRelease: true
  });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      controller,
      providerScript: verifiedTextScript()
    });
    const created = await harness.createRun({
      objective: '验证已收到模型回执后的预算释放竞态可以安全恢复。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const attempt = harness.worker.processRun(created.runId);
    await controller.waitForArrivals('after_receipt', { arrivals: 1, timeoutMs: 5_000 });
    const released = await pool.query(
      `UPDATE agent_budget_reservations reservation
          SET state='released',released_at=clock_timestamp(),updated_at=clock_timestamp()
         FROM agent_model_call_receipts receipt
        WHERE reservation.run_id=$1 AND reservation.model_call_id=receipt.id
          AND receipt.state='received' AND reservation.state='reserved'
        RETURNING reservation.reservation_key`,
      [created.runId]
    );
    assert.equal(released.rowCount, 1);
    controller.releaseBarrier('after_receipt');
    const result = await attempt;
    assert.equal(result.status, 'succeeded');
    const terminal = await harness.snapshot(created.runId);
    assert.equal(terminal.persistent.run.status, 'succeeded');
    assert.equal(
      terminal.persistent.reservations.some((entry) => entry.state !== 'consumed'),
      false
    );
    assert.equal(
      terminal.persistent.receipts.every((entry) => entry.state === 'consumed'),
      true
    );
    await harness.assertInvariants(created.runId);
  } finally {
    try {
      controller.releaseBarrier('after_receipt');
    } catch {}
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 refuses to revive a released reservation without a determined receipt', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({ pool });
    const created = await harness.createRun({
      objective: '验证没有确定回执时不能恢复已释放预算。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const workerId = `released-budget-${crypto.randomUUID()}`;
    const claimed = await harness.runService.claimRun({ runId: created.runId, workerId });
    const lease = {
      runId: created.runId,
      workerId,
      leaseEpoch: Number(claimed.lease_epoch)
    };
    await harness.runService.transitionRun({
      ...lease,
      toStatus: 'running',
      eventType: 'run.started',
      summary: 'Released budget negative probe'
    });
    await harness.runService.reserveRuntimeBudget({
      ...lease,
      component: 'actor',
      reservationKey: 'released-without-receipt',
      maximumCredits: 1
    });
    await harness.runService.releaseRuntimeBudget({
      ...lease,
      reservationKey: 'released-without-receipt'
    });
    await assert.rejects(
      harness.runService.consumeRuntimeBudget({
        ...lease,
        reservationKey: 'released-without-receipt',
        actualCredits: 0.5
      }),
      (error) => error?.code === 'AGENT_BUDGET_RESERVATION_RELEASED'
    );
    const snapshot = await harness.snapshot(created.runId);
    assert.equal(snapshot.persistent.reservations[0].state, 'released');
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 failed terminal transaction consumes a readable receipt without charging a refundable failure', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const controller = new RuntimeTestController();
  controller.setBarrier('after_receipt', {
    participants: 1,
    timeoutMs: 5_000,
    manualRelease: true
  });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      controller,
      providerScript: [verifiedTextScript()[0]]
    });
    const created = await harness.createRun({
      objective: '验证失败终态消费已确定模型回执，同时保持可退款失败不向用户扣费。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const attempt = harness.worker.processRun(created.runId);
    await controller.waitForArrivals('after_receipt', { arrivals: 1, timeoutMs: 5_000 });
    const beforeFailure = await harness.snapshot(created.runId);
    assert.deepEqual(beforeFailure.persistent.receipts.map((receipt) => receipt.state), ['received']);
    const failed = await harness.runService.failRun({
      runId: created.runId,
      errorCode: 'AGENT_TEST_REFUNDABLE_FAILURE',
      refundable: true
    });
    assert.equal(failed.status, 'failed');
    controller.releaseBarrier('after_receipt');
    const workerResult = await attempt;
    assert.equal(workerResult.status, 'lease_lost');
    const terminal = await harness.snapshot(created.runId);
    assert.deepEqual(terminal.persistent.receipts.map((receipt) => receipt.state), ['consumed']);
    assert.deepEqual(terminal.persistent.modelCalls.map((call) => call.outcome), ['failed']);
    assert.equal(Number(terminal.persistent.run.charged_credits), 0);
    assert.equal(Number(terminal.persistent.reservations[0].actual_credits) > 0, true);
    assert.equal(terminal.persistent.reservations[0].state, 'consumed');
    assert.equal(terminal.persistent.holds[0].status, 'released');
    await harness.assertInvariants(created.runId);

    await pool.query(
      `UPDATE agent_model_call_receipts
          SET state='received',consumed_at=NULL,updated_at=clock_timestamp()
        WHERE run_id=$1`,
      [created.runId]
    );
    await pool.query(
      `UPDATE agent_budget_reservations
          SET state='released',actual_credits=NULL,consumed_at=NULL,
              released_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE run_id=$1`,
      [created.runId]
    );
    const reconciled = await harness.runService.reconcileTerminalReceipts({
      limit: 10,
      userIds: [harness.userId]
    });
    assert.deepEqual(reconciled, { runsReconciled: 1, receiptsResolved: 1 });
    const afterReconcile = await harness.snapshot(created.runId);
    assert.deepEqual(afterReconcile.persistent.receipts.map((receipt) => receipt.state), ['consumed']);
    assert.deepEqual(afterReconcile.persistent.reservations.map((entry) => entry.state), ['consumed']);
    assert.equal(Number(afterReconcile.persistent.reservations[0].actual_credits) > 0, true);
    assert.equal(Number(afterReconcile.persistent.run.charged_credits), 0);
  } finally {
    try {
      controller.releaseBarrier('after_receipt');
    } catch {}
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 cancellation survives an unreadable model receipt without charging unknown usage', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const controller = new RuntimeTestController();
  controller.setBarrier('after_receipt', {
    participants: 1,
    timeoutMs: 5_000,
    manualRelease: true
  });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      controller,
      providerScript: [verifiedTextScript()[0]]
    });
    const created = await harness.createRun({
      objective: '验证损坏的加密模型回执不能阻止用户取消任务。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const attempt = harness.worker.processRun(created.runId);
    await controller.waitForArrivals('after_receipt', { arrivals: 1, timeoutMs: 5_000 });
    await pool.query(
      `UPDATE agent_model_call_receipts
          SET response_ciphertext=set_byte(
            response_ciphertext,0,255-get_byte(response_ciphertext,0)
          )
        WHERE run_id=$1 AND state='received'`,
      [created.runId]
    );
    const cancelled = await harness.cancel(created.runId);
    assert.equal(cancelled.status, 'cancelled');
    controller.releaseBarrier('after_receipt');
    const workerResult = await attempt;
    assert.equal(workerResult.status, 'lease_lost');
    const terminal = await harness.snapshot(created.runId);
    assert.equal(Number(terminal.persistent.run.charged_credits), 0);
    assert.deepEqual(terminal.persistent.receipts.map((receipt) => receipt.state), ['consumed']);
    assert.deepEqual(terminal.persistent.modelCalls.map((call) => call.outcome), ['cancelled']);
    assert.deepEqual(terminal.persistent.reservations.map((entry) => entry.state), ['consumed']);
    assert.deepEqual(terminal.persistent.reservations.map((entry) => Number(entry.actual_credits)), [0]);
    assert.equal(terminal.persistent.holds[0].status, 'released');
    assert.equal(
      terminal.persistent.events.filter((event) => (
        event.event_type === 'model.call.receipt_unreadable'
      )).length,
      1
    );
    await harness.assertInvariants(created.runId);
  } finally {
    try {
      controller.releaseBarrier('after_receipt');
    } catch {}
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 hides runs, events, artifacts, receipts and budget state from another user', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  let otherUserId = null;
  try {
    harness = await AgentRuntimeHarness.create({ pool, providerScript: imageDeliveryScript() });
    const created = await harness.createRun({
      objective: 'Create a populated ownership-isolation fixture with one verified image.',
      deliverables: ['image'],
      capabilities: { files: true, shell: true, generate_images: true }
    });
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    const suffix = crypto.randomUUID();
    const other = await pool.query(
      `INSERT INTO users (legacy_user_id,email,display_name,status)
       VALUES ($1,$2,'Harness adversary','active') RETURNING id`,
      [`agent-harness-other-${suffix}`, `agent-harness-other-${suffix}@example.invalid`]
    );
    otherUserId = other.rows[0].id;

    for (const operation of [
      () => harness.runService.getRun({ userId: otherUserId, runId: created.runId }),
      () => harness.runService.listEvents({ userId: otherUserId, runId: created.runId }),
      () => harness.runService.listArtifacts({ userId: otherUserId, runId: created.runId }),
      () => harness.runService.cancelRun({ userId: otherUserId, runId: created.runId })
    ]) {
      await assert.rejects(operation, { code: 'AGENT_RUN_NOT_FOUND' });
    }

    const ownerView = await harness.runService.getRun({
      userId: harness.userId,
      runId: created.runId
    });
    assert.equal(Object.hasOwn(ownerView, 'modelCallReceipts'), false);
    assert.equal(Object.hasOwn(ownerView, 'toolCallReceipts'), false);
    assert.equal(Object.hasOwn(ownerView, 'budgetReservations'), false);
    const persistentCounts = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM agent_model_call_receipts WHERE run_id=$1) AS receipts,
         (SELECT count(*)::int FROM agent_tool_call_receipts WHERE run_id=$1) AS tool_receipts,
         (SELECT count(*)::int FROM agent_budget_reservations WHERE run_id=$1) AS reservations`,
      [created.runId]
    );
    assert.ok(persistentCounts.rows[0].receipts > 0);
    assert.ok(persistentCounts.rows[0].tool_receipts > 0);
    assert.ok(persistentCounts.rows[0].reservations > 0);

    const snapshot = await harness.snapshot(created.runId);
    assert.equal(snapshot.persistent.run.status, 'succeeded');
    assert.equal(snapshot.persistent.holds[0].status, 'settled');
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    if (otherUserId) await pool.query('DELETE FROM users WHERE id=$1', [otherUserId]).catch(() => {});
    await pool.end();
  }
});

test('Harness V3 fences stale writes across two independent Worker processes', {
  skip: !enabled,
  timeout: 45_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  let first = null;
  let second = null;
  try {
    harness = await AgentRuntimeHarness.create({ pool });
    const created = await harness.createRun({
      objective: '验证两个独立 OS 进程之间的租约 fencing。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const probePath = path.join(
      __dirname,
      '../evaluation/harness/cross-worker-lease-probe.js'
    );
    const spawnProbe = (workerId) => fork(probePath, [], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        ...harness.env,
        DATABASE_URL: process.env.DATABASE_URL,
        AGENT_CROSS_WORKER_RUN_ID: created.runId,
        AGENT_CROSS_WORKER_ID: workerId
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });

    first = spawnProbe(`cross-process-a-${crypto.randomUUID()}`);
    const firstClaim = await waitForChildMessage(first, 'claimed');
    assert.equal(firstClaim.leaseEpoch, 1);
    await pool.query(
      `UPDATE agent_runs SET lease_expires_at=clock_timestamp()-interval '1 second'
        WHERE id=$1`,
      [created.runId]
    );
    assert.equal(await harness.runService.expireStaleRuns({ limit: 10 }), 1);

    second = spawnProbe(`cross-process-b-${crypto.randomUUID()}`);
    const secondClaim = await waitForChildMessage(second, 'claimed');
    assert.equal(secondClaim.leaseEpoch, 2);
    const firstAppendPromise = waitForChildMessage(first, 'append');
    const secondAppendPromise = waitForChildMessage(second, 'append');
    first.send({ command: 'append' });
    second.send({ command: 'append' });
    const [firstAppend, secondAppend] = await Promise.all([
      firstAppendPromise,
      secondAppendPromise
    ]);
    assert.deepEqual({ ok: firstAppend.ok, code: firstAppend.code }, {
      ok: false,
      code: 'AGENT_LEASE_LOST'
    });
    assert.equal(secondAppend.ok, true);
    const events = await pool.query(
      `SELECT summary FROM agent_events
        WHERE run_id=$1 AND event_type='harness.cross_worker_probe'`,
      [created.runId]
    );
    assert.equal(events.rowCount, 1);
  } finally {
    for (const child of [first, second]) {
      if (child?.connected) child.disconnect();
      if (child && child.exitCode === null) child.kill('SIGTERM');
    }
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 recovers a real SIGKILLed process without Provider replay or premature hold expiry', {
  skip: !enabled,
  timeout: 45_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let harness = null;
  let child = null;
  try {
    harness = await AgentRuntimeHarness.create({ pool, providerScript: [] });
    const created = await harness.createRun({
      objective: '验证真实子进程死亡后的显式恢复，不调用 Provider。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const probePath = path.join(
      __dirname,
      '../evaluation/harness/cross-process-recovery-probe.js'
    );
    child = fork(probePath, [], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        ...harness.env,
        DATABASE_URL: process.env.DATABASE_URL,
        AGENT_CROSS_PROCESS_RUN_ID: created.runId,
        AGENT_CROSS_PROCESS_WORKER_ID: `cross-process-recovery-${crypto.randomUUID()}`
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });
    const dispatched = await waitForChildMessage(child, 'dispatched');
    child.kill('SIGKILL');
    const exited = await waitForChildExit(child);
    assert.equal(exited.signal, 'SIGKILL');
    await pool.query(
      `UPDATE agent_runs SET lease_expires_at=clock_timestamp()-interval '1 second'
        WHERE id=$1`,
      [created.runId]
    );
    await pool.query(
      `UPDATE agent_budget_holds
          SET expires_at=clock_timestamp()-interval '1 second'
        WHERE run_id=$1 AND status='held'`,
      [created.runId]
    );
    assert.equal(await harness.runService.recoverExpiredRun({ runId: created.runId }), 1);
    const recovered = await harness.snapshot(created.runId);
    assert.equal(recovered.persistent.run.status, 'waiting_user');
    assert.deepEqual(
      recovered.persistent.receipts.map((receipt) => ({ id: receipt.id, state: receipt.state })),
      [{ id: dispatched.callId, state: 'ambiguous' }]
    );
    assert.equal(
      recovered.persistent.reservations.some((reservation) => reservation.state === 'reserved'),
      false
    );
    assert.equal(recovered.persistent.holds[0].status, 'held');
    assert.ok(new Date(recovered.persistent.holds[0].expires_at).getTime() > Date.now());
    assert.equal(harness.transport.requests.length, 0);
    const cancelled = await harness.cancel(created.runId);
    assert.equal(cancelled.status, 'cancelled');
    const terminal = await harness.snapshot(created.runId);
    assert.equal(terminal.persistent.holds[0].status, 'released');
    const wallet = await pool.query(
      'SELECT frozen_credits FROM wallets WHERE user_id=$1',
      [harness.userId]
    );
    assert.equal(Number(wallet.rows[0].frozen_credits), 0);
    await harness.assertInvariants(created.runId);
  } finally {
    if (child?.connected) child.disconnect();
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 lease takeover fences the old Worker before any provider dispatch or write', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const controller = new RuntimeTestController();
  controller.setBarrier('after_intent', {
    participants: 1,
    timeoutMs: 5_000,
    manualRelease: true
  });
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      controller,
      providerScript: verifiedTextScript()
    });
    const created = await harness.createRun({
      objective: '验证两个 Worker 切换租约后旧 Worker 完全失去写入权。',
      deliverables: [],
      capabilities: { files: true, shell: true }
    });
    const oldWorker = harness.worker;
    const oldAttempt = oldWorker.processRun(created.runId);
    await controller.waitForArrivals('after_intent', { arrivals: 1, timeoutMs: 5_000 });
    const oldLease = await pool.query(
      'SELECT worker_id,lease_epoch,status FROM agent_runs WHERE id=$1',
      [created.runId]
    );
    assert.equal(Number(oldLease.rows[0].lease_epoch), 1);
    assert.equal(oldLease.rows[0].status, 'running');

    await pool.query(
      `UPDATE agent_runs SET lease_expires_at=clock_timestamp()-interval '1 second'
        WHERE id=$1`,
      [created.runId]
    );
    assert.equal(await harness.runService.expireStaleRuns({ limit: 10 }), 1);
    controller.releaseBarrier('after_intent');
    const oldResult = await oldAttempt;
    assert.equal(oldResult.status, 'lease_lost');
    assert.equal(harness.transport.requests.length, 0);

    harness.worker = harness.createWorker(`harness-takeover-${crypto.randomUUID()}`);
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    assert.equal(Number(terminal.snapshot.persistent.run.lease_epoch), 2);
    assert.equal(harness.transport.requests.length, 2);
    assert.equal(
      terminal.snapshot.persistent.events.filter((event) => event.event_type === 'run.lease_recovered').length,
      1
    );
    assert.equal(
      terminal.snapshot.persistent.receipts.every((receipt) => Number(receipt.lease_epoch) === 2),
      true
    );
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});

test('Harness V3 runs three real subagents against one monotonic parent budget and settlement', {
  skip: !enabled,
  timeout: 30_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const joinedMessages = (body) => JSON.stringify(body.messages || []);
  const hasToolResult = (body, name) => (body.messages || []).some((message) => (
    message.role === 'tool' && message.name === name
  ));
  const childScript = (filename, label) => [
    {
      role: 'subagent',
      matchRequest: (body) => (
        joinedMessages(body).includes(filename) && !hasToolResult(body, 'sandbox_shell')
      ),
      toolCalls: [functionToolCall({
        id: `${filename}-write`,
        name: 'sandbox_shell',
        arguments: {
          script: `echo '# ${label}' > /workspace/${filename}`,
          purpose: `Write and verify ${filename}`
        }
      })]
    },
    {
      role: 'subagent',
      matchRequest: (body) => (
        joinedMessages(body).includes(filename) && hasToolResult(body, 'sandbox_shell')
      ),
      toolCalls: [functionToolCall({
        id: `${filename}-plan`,
        name: 'update_plan',
        arguments: {
          explanation: `${label} completed and verified.`,
          steps: [
            { id: 'produce', label: '完成委派输出', status: 'completed' },
            { id: 'verify', label: '离线验证输出文件', status: 'completed' }
          ]
        }
      })]
    }
  ];
  let harness = null;
  try {
    harness = await AgentRuntimeHarness.create({
      pool,
      providerScript: [
        {
          matchRequest: (body) => body.tool_choice?.function?.name === 'delegate_tasks',
          toolCalls: [functionToolCall({
            id: 'delegate-three-1',
            name: 'delegate_tasks',
            arguments: {
              tasks: [
                {
                  role: 'researcher',
                  label: 'Research',
                  objective: 'Prepare a concise evidence note.',
                  expectedOutput: 'research.md',
                  inputPaths: []
                },
                {
                  role: 'analyst',
                  label: 'Analysis',
                  objective: 'Prepare an independent analysis note.',
                  expectedOutput: 'analysis.md',
                  inputPaths: []
                },
                {
                  role: 'writer',
                  label: 'Draft',
                  objective: 'Prepare a concise draft note.',
                  expectedOutput: 'draft.md',
                  inputPaths: []
                }
              ]
            }
          })]
        },
        ...childScript('research.md', 'Research'),
        ...childScript('analysis.md', 'Analysis'),
        ...childScript('draft.md', 'Draft'),
        {
          matchRequest: (body) => hasToolResult(body, 'delegate_tasks'),
          content: '三个隔离子 Agent 均已完成，父 Agent 已核对其文件摘要。'
        },
        {
          matchRequest: (body) => body.response_format?.type === 'json_object',
          content: JSON.stringify({
            passed: true,
            score: 100,
            issues: [],
            repairInstructions: [],
            unsupportedVisualJudgment: false,
            criteria: []
          })
        }
      ]
    });
    const created = await harness.createRun({
      objective: '请使用三个真实子 Agent 分别调研、分析和起草，再由父 Agent 汇总结论。',
      deliverables: [],
      capabilities: { files: true, shell: true, subagents: true }
    });
    const terminal = await harness.runToTerminal(created.runId);
    assert.equal(terminal.snapshot.persistent.run.status, 'succeeded');
    assert.equal(terminal.snapshot.persistent.subagents.length, 3);
    assert.equal(
      terminal.snapshot.persistent.subagents.every((subagent) => subagent.status === 'succeeded'),
      true
    );
    assert.equal(new Set(
      terminal.snapshot.persistent.reservations
        .map((reservation) => reservation.subagent_id)
        .filter(Boolean)
    ).size, 3);
    const consumed = terminal.snapshot.persistent.reservations
      .filter((reservation) => reservation.state === 'consumed')
      .map((reservation) => Number(reservation.actual_credits || 0));
    const cumulative = consumed.reduce((values, credits) => (
      [...values, Number((Number(values.at(-1) || 0) + credits).toFixed(8))]
    ), []);
    assert.equal(cumulative.every((value, index) => index === 0 || value >= cumulative[index - 1]), true);
    assert.ok(Number(cumulative.at(-1) || 0) <= 50);
    assert.equal(terminal.snapshot.persistent.holds.length, 1);
    assert.equal(terminal.snapshot.persistent.holds[0].status, 'settled');
    assert.equal(
      terminal.snapshot.persistent.events.filter((event) => event.event_type === 'run.succeeded').length,
      1
    );
    await harness.assertInvariants(created.runId);
  } finally {
    await harness?.cleanup();
    await pool.end();
  }
});
