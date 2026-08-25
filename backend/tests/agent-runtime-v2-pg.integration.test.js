const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const {
  createModelCallService,
  createProviderScheduler
} = require('../services/agent-model-runtime-service');
const { createAgentRunService } = require('../services/agent-run-service');
const { checkDatabase } = require('../services/readiness-service');

const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);

test('PostgreSQL Runtime V2 scheduler prioritizes interactive work and exposes content-free metrics', {
  skip: !enabled
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const providerKey = `runtime-v2-test:${crypto.randomUUID()}`;
  try {
    const readiness = await checkDatabase(pool);
    assert.equal(readiness.ok, true);
    assert.equal(readiness.migration, '025_agent_runtime_v2_1_durability');

    const modelCalls = createModelCallService({ pool, retentionDays: 1 });
    const call = await modelCalls.start({
      provider: 'siliconflow',
      modelName: 'Qwen/Qwen3-8B',
      phase: 'evaluation',
      promptProfile: 'integration-v2',
      promptHash: 'ab'.repeat(32),
      skillIds: ['report'],
      thinkingEnabled: false,
      estimatedInputTokens: 100
    });
    await modelCalls.finish(call, {
      outcome: 'succeeded',
      inputTokens: 96,
      outputTokens: 24,
      queueWaitMs: 3,
      selectedTool: 'sandbox_shell'
    });
    await modelCalls.recordQualityCheck({
      checkKind: 'integration-deterministic',
      status: 'passed',
      score: 100,
      codes: [],
      metrics: { validators: 3 }
    });
    const summary = await modelCalls.summary({ days: 1 });
    assert.ok(summary.calls.some((entry) => entry.phase === 'evaluation'));
    assert.ok(summary.quality.some((entry) => entry.checkKind === 'integration-deterministic'));
    assert.equal(JSON.stringify(summary).includes('integration-deterministic'), true);
    assert.equal(JSON.stringify(summary).includes('prompt'), false);

    const scheduler = createProviderScheduler({
      pool,
      providerKey,
      env: {
        AGENT_PROVIDER_SCHEDULER_ENABLED: '1',
        AGENT_SILICONFLOW_MIN_INTERVAL_MS: '0',
        AGENT_SILICONFLOW_REQUESTS_PER_MINUTE: '600',
        AGENT_PROVIDER_REQUEST_TTL_MS: '30000'
      }
    });
    await pool.query(
      `INSERT INTO agent_provider_scheduler (provider_key,next_available_at)
       VALUES ($1,clock_timestamp()+interval '300 milliseconds')`,
      [providerKey]
    );
    const order = [];
    const background = scheduler.acquire({ priority: 'subagent' }).then(() => order.push('subagent'));
    await new Promise((resolve) => setTimeout(resolve, 25));
    const interactive = scheduler.acquire({ priority: 'router' }).then(() => order.push('router'));
    await Promise.all([background, interactive]);
    assert.deepEqual(order, ['router', 'subagent']);

    await pool.query(
      `UPDATE agent_provider_scheduler
          SET next_available_at=clock_timestamp()+interval '1 second'
        WHERE provider_key=$1`,
      [providerKey]
    );
    const controller = new AbortController();
    const cancelled = scheduler.acquire({ priority: 'evaluation', signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(cancelled, { code: 'AGENT_MODEL_REQUEST_CANCELLED' });
    const cancelledRows = await pool.query(
      `SELECT count(*)::integer AS count FROM agent_provider_requests
        WHERE provider_key=$1 AND status='cancelled'`,
      [providerKey]
    );
    assert.equal(Number(cancelledRows.rows[0].count), 1);

    await pool.query(
      `UPDATE agent_provider_scheduler
          SET next_available_at=clock_timestamp()
        WHERE provider_key=$1`,
      [providerKey]
    );
    assert.equal(await scheduler.defer(250), 250);
    const deferred = await pool.query(
      `SELECT next_available_at>clock_timestamp()+interval '100 milliseconds' AS deferred
         FROM agent_provider_scheduler WHERE provider_key=$1`,
      [providerKey]
    );
    assert.equal(deferred.rows[0].deferred, true);
  } finally {
    await pool.query('DELETE FROM agent_provider_scheduler WHERE provider_key=$1', [providerKey]).catch(() => {});
    await pool.query(
      `DELETE FROM agent_quality_checks
        WHERE check_kind='integration-deterministic' AND run_id IS NULL`
    ).catch(() => {});
    await pool.query(
      `DELETE FROM agent_model_calls
        WHERE prompt_profile='integration-v2' AND run_id IS NULL AND conversation_id IS NULL`
    ).catch(() => {});
    await pool.end();
  }
});

test('PostgreSQL persists server-owned V1/V2 canary assignment across idempotent replay', {
  skip: !enabled
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = crypto.randomUUID();
  const inserted = await pool.query(
    `INSERT INTO users (email,display_name,status)
     VALUES ($1,'Runtime V1 control','active'),($2,'Runtime V2 canary','active')
     RETURNING id,email::text`,
    [`runtime-control-${suffix}@example.invalid`, `runtime-canary-${suffix}@example.invalid`]
  );
  const controlUser = inserted.rows.find((row) => row.email.startsWith('runtime-control-')).id;
  const canaryUser = inserted.rows.find((row) => row.email.startsWith('runtime-canary-')).id;
  await pool.query(
    `INSERT INTO wallets (user_id,available_credits,frozen_credits)
     VALUES ($1,100,0),($2,100,0)`,
    [controlUser, canaryUser]
  );
  const baseEnv = {
    NODE_ENV: 'test',
    APP_ENV: 'test',
    AGENT_FEATURE_ENABLED: 'true',
    AGENT_RUNTIME_DRIVER: 'fixture',
    AGENT_MODEL_PROVIDER: 'siliconflow',
    AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
    SILICONFLOW_API_KEY: 'canary-assignment-test',
    AGENT_RUNTIME_V2_ENABLED: 'true',
    AGENT_RUNTIME_V2_ROLLOUT_PERCENT: '0',
    AGENT_RUNTIME_V2_CANARY_USER_IDS: canaryUser,
    AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION: '20',
    AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION: '160',
    AGENT_MODEL_CONTEXT_TOKENS: '16384',
    AGENT_SANDBOX_PROVIDER: 'fixture',
    AGENT_PUBLIC_CAPABILITIES: 'files,shell',
    AGENT_BETA_MODE: 'authenticated-v1',
    AGENT_DEFAULT_MAX_CREDITS: '10',
    AGENT_HARD_MAX_CREDITS: '50',
    AGENT_TRIAL_CREDITS: '0',
    AGENT_DAILY_FREE_CREDITS: '0',
    AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'91'.repeat(32)}`
  };
  const published = [];
  const createService = (env) => createAgentRunService({
    pool,
    env,
    queuePublisher: { publish: async (runId) => published.push(runId) }
  });
  const request = (userId, key) => ({
    userId,
    objective: '仅用文字给出三条设计建议，不创建文件。',
    assetIds: [],
    maxCredits: 10,
    capabilities: { files: true, shell: true },
    browserConfig: {},
    deliverables: [],
    idempotencyKey: key
  });
  let controlRun = null;
  let canaryRun = null;
  try {
    const service = createService(baseEnv);
    controlRun = await service.createRun(request(controlUser, `runtime-control:${suffix}`));
    canaryRun = await service.createRun(request(canaryUser, `runtime-canary:${suffix}`));
    assert.equal(controlRun.runtime.version, 1);
    assert.equal(canaryRun.runtime.version, 2);
    const stored = await pool.query(
      `SELECT id,runtime_version,prompt_profile,prompt_hash
         FROM agent_runs WHERE id=ANY($1::uuid[]) ORDER BY runtime_version`,
      [[controlRun.runId, canaryRun.runId]]
    );
    assert.deepEqual(stored.rows.map((row) => Number(row.runtime_version)), [1, 2]);
    assert.equal(stored.rows[0].prompt_profile, null);
    assert.equal(stored.rows[0].prompt_hash, null);
    assert.ok(stored.rows[1].prompt_profile);
    assert.equal(stored.rows[1].prompt_hash.length, 32);

    const changedRollout = createService({
      ...baseEnv,
      AGENT_RUNTIME_V2_ROLLOUT_PERCENT: '100',
      AGENT_RUNTIME_V2_CANARY_USER_IDS: ''
    });
    const replayed = await changedRollout.createRun(request(controlUser, `runtime-control:${suffix}`));
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.runtime.version, 1);
    assert.equal(replayed.runId, controlRun.runId);

    await service.cancelRun({ userId: controlUser, runId: controlRun.runId });
    await service.cancelRun({ userId: canaryUser, runId: canaryRun.runId });
    const holds = await pool.query(
      `SELECT run_id,status FROM agent_budget_holds
        WHERE run_id=ANY($1::uuid[]) ORDER BY run_id`,
      [[controlRun.runId, canaryRun.runId]]
    );
    assert.equal(holds.rows.length, 2);
    assert.ok(holds.rows.every((row) => row.status !== 'held'));
    assert.equal(published.length, 2);
  } finally {
    await pool.query(
      `UPDATE users SET status='disabled',email=NULL,display_name='Retired runtime canary test'
        WHERE id=ANY($1::uuid[])`,
      [[controlUser, canaryUser]]
    ).catch(() => {});
    await pool.end();
  }
});
