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
    assert.equal(readiness.migration, '024_agent_runtime_v2_observability');

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
