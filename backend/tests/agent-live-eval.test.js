const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
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
  liveEvalEnv,
  waitForConversationExecution
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
  assertOwnerCanaryPreflight,
  createSignedOwnerCanaryPlan,
  verifySignedOwnerCanaryPlan
} = require('../evaluation/harness/live-eval-owner-canary');
const { LiveModelAuditor } = require('../evaluation/harness/live-model-auditor');
const {
  LiveEvalCampaignGuard,
  sha256
} = require('../evaluation/harness/live-eval-campaign-guard');
const {
  PINNED_MINIO_DIGEST,
  createSignedGateManifest,
  verifySignedGateManifest
} = require('../evaluation/harness/live-eval-gate');
const { RuntimeTestController } = require('../evaluation/harness/runtime-test-controller');
const { RuntimeTraceSink } = require('../evaluation/harness/runtime-trace-sink');
const {
  assertLiveEvalDatabaseReadiness,
  resolveLiveEvalPostgresMajor
} = require('../evaluation/harness/live-eval-database-readiness');
const { requestPromptHash } = require('../evaluation/harness/scripted-siliconflow-transport');
const { callSiliconFlowChat } = require('../lib/ai-providers');
const { createAgentModelProvider } = require('../services/agent-model-provider');
const {
  assertGateAttestationProvenance
} = require('../scripts/create-agent-live-eval-gate');
const {
  attachCleanupEvidence,
  buildTerminalFailureReport,
  closeLiveEvalResources,
  createSlotJournal,
  failUnfinishedJournalSlots,
  findCampaignJournal,
  findInterruptedJournal,
  journalResults,
  loadLiveEvalSecrets,
  liveEvalPoolOptions,
  disposeLiveEvalPoolErrorHandlerAfterCleanup,
  installLiveEvalSignalHandlers,
  installLiveEvalPoolErrorHandler,
  isLiveEvalDatabaseConnectionError,
  markInterruptedJournal,
  recoverInterruptedCampaign,
  resolveSelection,
  summarize
} = require('../scripts/run-agent-live-eval');

test('Live Harness V3.1 is fail-closed outside explicit test + dev + real-provider mode', () => {
  const safe = liveEvalEnv({}, { AGENT_LIVE_EVAL_ALLOW_REAL_PROVIDER: '1' });
  assert.equal(assertLiveEvalProcessSafety(safe), true);
  const cloudflare = liveEvalEnv({
    AGENT_MODEL_PROVIDER: 'cloudflare',
    AGENT_MODEL_NAME: '@cf/openai/gpt-oss-120b'
  }, { AGENT_LIVE_EVAL_ALLOW_REAL_PROVIDER: '1' });
  assert.equal(cloudflare.AGENT_MODEL_PROVIDER, 'cloudflare');
  assert.equal(cloudflare.AGENT_MODEL_NAME, '@cf/openai/gpt-oss-120b');
  assert.throws(
    () => assertLiveEvalProcessSafety({
      ...safe,
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B'
    }),
    /AGENT_LIVE_EVAL_TEXT_MODEL_PROVIDER_FORBIDDEN/
  );
  assert.throws(() => liveEvalEnv({
    AGENT_MODEL_PROVIDER: 'cloudflare',
    AGENT_MODEL_NAME: 'Qwen/Qwen3-8B'
  }), /AGENT_LIVE_EVAL_MODEL_LOCK_INVALID/);
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

test('Live eval database pool verifies TLS and stays within the free-tier cap', () => {
  const certificate = '-----BEGIN CERTIFICATE-----\nZml4dHVyZQ==\n-----END CERTIFICATE-----';
  const ca = Buffer.from(certificate).toString('base64');
  const options = liveEvalPoolOptions({
    connectionString: 'postgres://synthetic.invalid/dev_artigen',
    env: {
      AGENT_LIVE_EVAL_PG_POOL_MAX: '3',
      PG_SSL_CA_BASE64: ca,
      PG_SSL_REQUIRED: '1'
    }
  });
  assert.equal(
    options.connectionString,
    'postgres://synthetic.invalid/dev_artigen'
  );
  assert.equal(options.max, 3);
  assert.deepEqual(options.ssl, { rejectUnauthorized: true, ca: certificate });
  assert.equal(options.allowExitOnIdle, true);
  assert.equal(options.connectionTimeoutMillis, 15_000);
  assert.equal(options.query_timeout, 30_000);
  assert.equal(options.statement_timeout, 30_000);
  assert.equal(options.application_name, 'artigen-agent-live-eval');
  assert.throws(
    () => liveEvalPoolOptions({
      connectionString: 'postgres://synthetic.invalid/dev_artigen',
      env: { AGENT_LIVE_EVAL_PG_POOL_MAX: '4' }
    }),
    /AGENT_LIVE_EVAL_PG_POOL_MAX_INVALID/
  );
  for (const connectionString of [
    'postgres://synthetic.invalid/dev_artigen?sslmode=disable',
    'postgres://synthetic.invalid/dev_artigen?sslmode=verify-full'
  ]) {
    assert.throws(
      () => liveEvalPoolOptions({ connectionString, env: { PG_SSL_REQUIRED: '1' } }),
      /POSTGRES_TLS_URL_OVERRIDE_FORBIDDEN/
    );
  }
  assert.throws(
    () => liveEvalPoolOptions({
      connectionString: 'postgres://synthetic.invalid/dev_artigen',
      env: { PG_SSL_REQUIRED: '1', PG_SSL_REJECT_UNAUTHORIZED: '0' }
    }),
    /POSTGRES_VERIFIED_TLS_REQUIRED/
  );
});

test('Live eval database readiness requires explicit PG18, dev_artigen and four free connections', async () => {
  const makePool = (row) => ({
    async query(input) {
      assert.match(String(input.text), /artigen_live_eval_client_connection_count_aggregate\(\)/);
      assert.doesNotMatch(String(input.text), /FROM pg_stat_activity/);
      assert.doesNotMatch(String(input.text), /FROM pg_stat_database/);
      assert.equal(input.query_timeout, 10_000);
      return { rows: [row] };
    }
  });
  const ready = await assertLiveEvalDatabaseReadiness({
    expectedPostgresMajor: 18,
    pool: makePool({
      database_name: 'dev_artigen',
      server_version_num: 180001,
      max_connections: 20,
      superuser_reserved_connections: 3,
      reserved_connections: 0,
      used_connections: 13
    })
  });
  assert.deepEqual(ready, {
    databaseName: 'dev_artigen',
    postgresMajor: 18,
    maxConnections: 20,
    superuserReservedConnections: 3,
    reservedConnections: 0,
    effectiveMaxConnections: 17,
    usedConnections: 13,
    availableConnections: 4,
    requiredAvailableConnections: 4
  });
  await assert.rejects(
    assertLiveEvalDatabaseReadiness({
      expectedPostgresMajor: 18,
      pool: makePool({
        database_name: 'dev_artigen',
        server_version_num: 180001,
        max_connections: 20,
        superuser_reserved_connections: 3,
        reserved_connections: 0,
        used_connections: 14
      })
    }),
    /AGENT_LIVE_EVAL_DATABASE_HEADROOM_INSUFFICIENT/
  );
  await assert.rejects(
    assertLiveEvalDatabaseReadiness({
      expectedPostgresMajor: 18,
      pool: makePool({
        database_name: 'neondb',
        server_version_num: 180001,
        max_connections: 20,
        superuser_reserved_connections: 3,
        reserved_connections: 0,
        used_connections: 1
      })
    }),
    /AGENT_LIVE_EVAL_DATABASE_FORBIDDEN/
  );
  await assert.rejects(
    assertLiveEvalDatabaseReadiness({
      expectedPostgresMajor: 18,
      pool: makePool({
        database_name: 'dev_artigen',
        server_version_num: 160010,
        max_connections: 20,
        superuser_reserved_connections: 3,
        reserved_connections: 0,
        used_connections: 1
      })
    }),
    /AGENT_LIVE_EVAL_POSTGRES_VERSION_NOT_READY/
  );
  assert.equal(resolveLiveEvalPostgresMajor({ DEV_DATABASE_EXPECTED_MAJOR: '18' }), 18);
  for (const value of ['', '16', '17', '19', '18.0']) {
    assert.throws(
      () => resolveLiveEvalPostgresMajor({ DEV_DATABASE_EXPECTED_MAJOR: value }),
      /AGENT_LIVE_EVAL_POSTGRES_MAJOR_PROFILE_INVALID/
    );
  }
  await assert.rejects(
    assertLiveEvalDatabaseReadiness({
      pool: makePool({
        database_name: 'dev_artigen',
        server_version_num: 180001,
        max_connections: 20,
        superuser_reserved_connections: 3,
        reserved_connections: 0,
        used_connections: 1
      })
    }),
    /AGENT_LIVE_EVAL_POSTGRES_MAJOR_PROFILE_INVALID/
  );
});

test('Live Harness V3.1 claims a signed campaign once in durable PostgreSQL state', async () => {
  let claimed = false;
  const releases = [];
  const queries = [];
  const createClient = () => ({
    release: (destroy) => releases.push(Boolean(destroy)),
    query: async (input) => {
      const statement = typeof input === 'string' ? input : String(input?.text || '');
      queries.push(statement);
      if (statement.includes('SELECT id,metrics,created_at')) {
        return claimed
          ? { rowCount: 1, rows: [{ id: 41, metrics: {} }] }
          : { rowCount: 0, rows: [] };
      }
      if (statement.includes('INSERT INTO agent_quality_checks')) {
        claimed = true;
        return {
          rowCount: 1,
          rows: [{
            id: 41,
            metrics: { deadlineAt: new Date(Date.now() + 60_000).toISOString() }
          }]
        };
      }
      if (statement.includes('clock_timestamp() AS now')) {
        return { rowCount: 1, rows: [{ now: new Date() }] };
      }
      return { rowCount: 1, rows: [{}] };
    }
  });
  const pool = { connect: async () => createClient() };
  const profile = {
    pool,
    campaignId: '11111111-2222-4333-8444-555555555555',
    commitSha: 'ab'.repeat(20),
    matrixHash: 'cd'.repeat(32),
    maxQwenCalls: 2,
    maxKolorsCalls: 1,
    maxWallClockMs: 60_000
  };
  const first = new LiveEvalCampaignGuard(profile);
  await first.initialize();
  assert.equal(first.snapshot().claimMode, 'durable-once-v1');
  assert.equal(first.snapshot().campaignCheckId, 41);
  first.assertActive();
  await first.close();

  const second = new LiveEvalCampaignGuard(profile);
  await assert.rejects(second.initialize(), /AGENT_LIVE_EVAL_CAMPAIGN_ALREADY_CLAIMED/);
  assert.equal(queries.some((statement) => statement.includes('pg_advisory_xact_lock')), true);
  assert.equal(queries.some((statement) => statement.includes('campaign_keepalive')), false);
  assert.deepEqual(releases, [false, true]);
});

test('Live Harness rechecks database headroom before every physical Provider dispatch', async () => {
  const statements = [];
  let released = false;
  let checks = 0;
  const client = {
    async query(input) {
      const statement = typeof input === 'string' ? input : String(input?.text || '');
      statements.push(statement);
      return { rowCount: 1, rows: [{}] };
    },
    release() { released = true; }
  };
  const guard = new LiveEvalCampaignGuard({
    pool: { connect: async () => client },
    campaignId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    commitSha: 'ab'.repeat(20),
    matrixHash: 'cd'.repeat(32),
    beforeDispatch: async ({ pool, kind }) => {
      checks += 1;
      assert.equal(pool, client);
      assert.equal(kind, 'qwen');
      throw Object.assign(new Error('AGENT_LIVE_EVAL_DATABASE_HEADROOM_INSUFFICIENT'), {
        code: 'AGENT_LIVE_EVAL_DATABASE_HEADROOM_INSUFFICIENT'
      });
    }
  });
  guard.deadlineController = new AbortController();
  guard.claimed = true;
  guard.campaignCheckId = 1;
  guard.deadlineAt = new Date(Date.now() + 60_000).toISOString();
  await assert.rejects(
    guard.reserveDispatch('qwen'),
    /AGENT_LIVE_EVAL_DATABASE_HEADROOM_INSUFFICIENT/
  );
  assert.equal(checks, 1);
  assert.equal(statements.some((statement) => statement.includes('INSERT INTO')), false);
  assert.equal(statements.some((statement) => statement === 'ROLLBACK'), true);
  assert.equal(released, true);
});

test('Live eval runner replaces an evicted idle connection and fails closed only when the boundary probe fails', async () => {
  const pool = new EventEmitter();
  const probes = [];
  let probeFailure = null;
  pool.query = async (query) => {
    probes.push(query);
    if (probeFailure) throw probeFailure;
    return { rowCount: 1, rows: [{ live_eval_database_health: 1 }] };
  };
  let abortReason = null;
  const state = installLiveEvalPoolErrorHandler({
    pool,
    abort: (error) => { abortReason = error; }
  });

  pool.emit('error', new Error('synthetic database host and credentials'));

  assert.equal(state.idleDisconnectCount, 1);
  assert.equal(state.error, null);
  assert.equal(abortReason, null);
  assert.equal(await state.assertHealthy(), true);
  assert.equal(probes[0]?.query_timeout, 10_000);
  assert.deepEqual(state.snapshot(), {
    idleDisconnectsRecovered: 1,
    fatalConnectionLoss: false
  });

  probeFailure = new Error('synthetic database host and credentials');
  await assert.rejects(
    state.assertHealthy(),
    /AGENT_LIVE_EVAL_DATABASE_CONNECTION_LOST/
  );
  assert.equal(state.error?.code, 'AGENT_LIVE_EVAL_DATABASE_CONNECTION_LOST');
  assert.equal(abortReason, state.error);
  assert.equal(state.error.message.includes('synthetic'), false);
  assert.deepEqual(state.snapshot(), {
    idleDisconnectsRecovered: 1,
    fatalConnectionLoss: true
  });
  state.dispose();
  assert.equal(pool.listenerCount('error'), 0);
});

test('Live eval runner consumes checked-out client errors and aborts the campaign fail-closed', async () => {
  const pool = new EventEmitter();
  const client = new EventEmitter();
  let releaseCount = 0;
  client.release = () => { releaseCount += 1; };
  const originalConnect = async () => client;
  pool.connect = originalConnect;
  pool.query = async () => ({ rowCount: 1, rows: [{ live_eval_database_health: 1 }] });
  let abortReason = null;
  const state = installLiveEvalPoolErrorHandler({
    pool,
    abort: (error) => { abortReason = error; }
  });

  const checkedOut = await pool.connect();
  assert.notEqual(pool.connect, originalConnect);
  assert.equal(client.listenerCount('error'), 1);
  assert.doesNotThrow(() => {
    checkedOut.emit('error', new Error('synthetic connection detail must stay private'));
  });
  assert.equal(state.error?.code, 'AGENT_LIVE_EVAL_DATABASE_CONNECTION_LOST');
  assert.equal(abortReason, state.error);
  assert.equal(state.error.message.includes('synthetic'), false);

  checkedOut.release();
  assert.equal(releaseCount, 1);
  assert.equal(client.listenerCount('error'), 0);
  state.dispose();
  assert.equal(pool.connect, originalConnect);
  assert.equal(pool.listenerCount('error'), 0);
});

test('Live eval checked-out client guard preserves the callback connect contract', async () => {
  const pool = new EventEmitter();
  const client = new EventEmitter();
  let releaseCount = 0;
  client.release = () => { releaseCount += 1; };
  const originalConnect = (callback) => callback(null, client, client.release);
  pool.connect = originalConnect;
  pool.query = async () => ({ rowCount: 1, rows: [{ live_eval_database_health: 1 }] });
  const state = installLiveEvalPoolErrorHandler({ pool });

  await new Promise((resolve, reject) => {
    pool.connect((error, checkedOut, release) => {
      if (error) return reject(error);
      try {
        assert.equal(checkedOut, client);
        assert.equal(release, checkedOut.release);
        assert.equal(client.listenerCount('error'), 1);
        release();
        assert.equal(releaseCount, 1);
        assert.equal(client.listenerCount('error'), 0);
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });
  });

  state.dispose();
  assert.equal(pool.connect, originalConnect);
});

test('Live eval runner recognizes only content-free PostgreSQL connection codes as fatal infrastructure loss', () => {
  for (const code of ['ECONNRESET', 'ETIMEDOUT', '08006', '57P01']) {
    assert.equal(isLiveEvalDatabaseConnectionError({ code }), true);
  }
  assert.equal(isLiveEvalDatabaseConnectionError({ cause: { code: 'EPIPE' } }), true);
  assert.equal(isLiveEvalDatabaseConnectionError({ code: '23505' }), false);
  assert.equal(isLiveEvalDatabaseConnectionError(new Error('connection wording is not trusted')), false);
});

test('Live eval runner keeps the pool error listener after cleanup timeout for late socket errors', async () => {
  const pool = new EventEmitter();
  pool.end = () => new Promise(() => {});
  pool.query = async () => ({ rowCount: 1, rows: [{ live_eval_database_health: 1 }] });
  let abortReason = null;
  const state = installLiveEvalPoolErrorHandler({
    pool,
    abort: (error) => { abortReason = error; }
  });
  const cleanup = await closeLiveEvalResources({ pool, timeoutMs: 20 });

  assert.equal(cleanup.ok, false);
  assert.equal(cleanup.results[0].label, 'postgres');
  assert.equal(cleanup.results[0].code, 'AGENT_LIVE_EVAL_CLEANUP_TIMEOUT');
  assert.equal(disposeLiveEvalPoolErrorHandlerAfterCleanup({ poolState: state, cleanup }), false);
  assert.equal(pool.listenerCount('error'), 1);
  assert.doesNotThrow(() => pool.emit('error', new Error('late socket detail')));
  assert.equal(state.idleDisconnectCount, 1);
  assert.equal(state.error, null);
  assert.equal(abortReason, null);
  state.dispose();
});

test('Live eval runner is import-safe and loads only the dedicated DEV keychain service', () => {
  const secrets = new Map([
    ['DATABASE_URL', 'postgres://synthetic/dev_artigen'],
    ['AGENT_PAYLOAD_ENCRYPTION_KEY', 'payload-key'],
    ['SILICONFLOW_API_KEY', 'provider-key'],
    ['CLOUDFLARE_ACCOUNT_ID', 'f'.repeat(32)],
    ['CLOUDFLARE_API_TOKEN', 'cloudflare-provider-key'],
    ['AGENT_CLOUDFLARE_FREE_ACCOUNT_ID', 'f'.repeat(32)],
    ['AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED', 'true'],
    ['S3_ENDPOINT', 'https://s3.invalid'],
    ['S3_BUCKET', 'dev-bucket'],
    ['S3_REGION', 'synthetic-region'],
    ['S3_ACCESS_KEY_ID', 'access-key'],
    ['S3_SECRET_ACCESS_KEY', 'secret-key'],
    ['AGENT_LIVE_EVAL_GATE_KEY', `v1:hex:${'ab'.repeat(32)}`],
    ['AGENT_LIVE_EVAL_EVIDENCE_KEY', `v1:hex:${'ef'.repeat(32)}`],
    ['PG_SSL_CA_BASE64', Buffer.from(
      '-----BEGIN CERTIFICATE-----\nZml4dHVyZQ==\n-----END CERTIFICATE-----'
    ).toString('base64')]
  ]);
  const loaded = loadLiveEvalSecrets({
    env: { NODE_ENV: 'test', AGENT_MODEL_PROVIDER: 'cloudflare' },
    service: 'artigen-agent-dev-worker',
    readSecret: ({ account }) => secrets.get(account) || ''
  });
  assert.equal(loaded.runtimeEnv.NODE_ENV, 'test');
  assert.equal(loaded.runtimeEnv.APP_ENV, 'dev');
  assert.equal(loaded.runtimeEnv.DEV_DATABASE_EXPECTED_MAJOR, '18');
  assert.equal(loaded.runtimeEnv.DATABASE_URL, 'postgres://synthetic/dev_artigen');
  assert.equal(
    loaded.runtimeEnv.CUA_PYTHON,
    path.resolve(__dirname, '../.venv-agent/bin/python')
  );
  assert.equal(loaded.runtimeEnv.AGENT_CLOUDFLARE_INPUT_CREDITS_PER_MILLION, '0.35');
  assert.equal(loaded.runtimeEnv.AGENT_CLOUDFLARE_OUTPUT_CREDITS_PER_MILLION, '0.75');
  assert.equal(loaded.runtimeEnv.S3_FORCE_PATH_STYLE, '1');
  assert.equal(loaded.runtimeEnv.AGENT_LIVE_EVAL_PG_POOL_MAX, '3');
  assert.equal(loaded.runtimeEnv.PG_POOL_MAX, '3');
  assert.equal(loaded.runtimeEnv.PGBOSS_POOL_MAX, '2');
  assert.equal(loaded.runtimeEnv.AGENT_PGBOSS_POOL_MAX, '2');
  assert.equal(loaded.runtimeEnv.PG_SSL_REQUIRED, '1');
  assert.equal(loaded.runtimeEnv.PG_SSL_REJECT_UNAUTHORIZED, '1');
  assert.equal(loaded.runtimeEnv.PG_SSL_CA_BASE64, secrets.get('PG_SSL_CA_BASE64'));
  assert.equal(loaded.evidenceKeyMaterial, secrets.get('AGENT_LIVE_EVAL_EVIDENCE_KEY'));
  const cloudflareAccountId = 'f'.repeat(32);
  const cloudflareSecrets = new Map([
    ...secrets,
    ['CLOUDFLARE_ACCOUNT_ID', cloudflareAccountId],
    ['CLOUDFLARE_API_TOKEN', 'cloudflare-provider-key'],
    ['AGENT_CLOUDFLARE_FREE_ACCOUNT_ID', cloudflareAccountId],
    ['AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED', 'true']
  ]);
  const cloudflare = loadLiveEvalSecrets({
    env: {
      AGENT_MODEL_PROVIDER: 'cloudflare',
      AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED: 'true',
      AGENT_CLOUDFLARE_FREE_ACCOUNT_ID: cloudflareAccountId
    },
    service: 'artigen-agent-dev-worker',
    readSecret: ({ account }) => cloudflareSecrets.get(account) || ''
  });
  assert.equal(cloudflare.runtimeEnv.AGENT_MODEL_PROVIDER, 'cloudflare');
  assert.equal(cloudflare.runtimeEnv.AGENT_MODEL_NAME, '@cf/openai/gpt-oss-120b');
  assert.equal(cloudflare.runtimeEnv.CLOUDFLARE_ACCOUNT_ID, cloudflareAccountId);
  assert.throws(
    () => loadLiveEvalSecrets({ service: 'artigen-production', readSecret: () => 'x' }),
    /KEYCHAIN_SERVICE_INVALID/
  );
  assert.throws(
    () => loadLiveEvalSecrets({ service: 'artigen-agent-dev-worker', readSecret: () => '' }),
    /KEYCHAIN_INCOMPLETE/
  );
});

test('Live eval runner rejects explicit zero or malformed pricing', () => {
  const secrets = new Map([
    ['DATABASE_URL', 'postgres://synthetic/dev_artigen'],
    ['AGENT_PAYLOAD_ENCRYPTION_KEY', 'payload-key'],
    ['SILICONFLOW_API_KEY', 'provider-key'],
    ['CLOUDFLARE_ACCOUNT_ID', 'f'.repeat(32)],
    ['CLOUDFLARE_API_TOKEN', 'cloudflare-provider-key'],
    ['AGENT_CLOUDFLARE_FREE_ACCOUNT_ID', 'f'.repeat(32)],
    ['AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED', 'true'],
    ['S3_ENDPOINT', 'https://s3.invalid'],
    ['S3_BUCKET', 'dev-bucket'],
    ['S3_REGION', 'synthetic-region'],
    ['S3_ACCESS_KEY_ID', 'access-key'],
    ['S3_SECRET_ACCESS_KEY', 'secret-key'],
    ['AGENT_LIVE_EVAL_GATE_KEY', `v1:hex:${'ab'.repeat(32)}`],
    ['AGENT_LIVE_EVAL_EVIDENCE_KEY', `v1:hex:${'ef'.repeat(32)}`]
  ]);
  const readSecret = ({ account }) => secrets.get(account) || '';
  assert.throws(
    () => loadLiveEvalSecrets({
      env: {
        NODE_ENV: 'test',
        AGENT_MODEL_PROVIDER: 'cloudflare',
        AGENT_CLOUDFLARE_INPUT_CREDITS_PER_MILLION: '0',
        AGENT_CLOUDFLARE_OUTPUT_CREDITS_PER_MILLION: '0',
        PG_SSL_CA: 'ambient-ca-must-not-survive',
        PG_SSL_CA_BASE64: 'ambient-base64-must-not-survive'
      },
      service: 'artigen-agent-dev-worker',
      readSecret
    }),
    /AGENT_CLOUDFLARE_INPUT_CREDITS_PER_MILLION_INVALID/
  );
  assert.throws(
    () => loadLiveEvalSecrets({
      env: {
        NODE_ENV: 'test',
        AGENT_MODEL_PROVIDER: 'cloudflare',
        AGENT_CLOUDFLARE_INPUT_CREDITS_PER_MILLION: 'not-a-number'
      },
      service: 'artigen-agent-dev-worker',
      readSecret
    }),
    /AGENT_CLOUDFLARE_INPUT_CREDITS_PER_MILLION_INVALID/
  );
  assert.throws(
    () => loadLiveEvalSecrets({
      env: {
        NODE_ENV: 'test',
        AGENT_MODEL_PROVIDER: 'cloudflare',
        AGENT_CLOUDFLARE_OUTPUT_CREDITS_PER_MILLION: '-1'
      },
      service: 'artigen-agent-dev-worker',
      readSecret
    }),
    /AGENT_CLOUDFLARE_OUTPUT_CREDITS_PER_MILLION_INVALID/
  );
});

test('Live eval loader rejects the legacy SiliconFlow text profile even in test mode', () => {
  assert.throws(
    () => loadLiveEvalSecrets({
      env: { NODE_ENV: 'test', AGENT_MODEL_PROVIDER: 'siliconflow' },
      service: 'artigen-agent-dev-worker',
      readSecret: () => 'synthetic'
    }),
    /AGENT_LIVE_EVAL_TEXT_MODEL_PROVIDER_FORBIDDEN/
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

test('Live Harness waits through the addMessage planner race before reading a reply', async () => {
  let reads = 0;
  let plannerCalls = 0;
  const execution = { routeKind: 'reply', status: 'succeeded' };
  const result = await waitForConversationExecution({
    service: {
      async getConversation() {
        reads += 1;
        return { executions: reads < 3 ? [] : [execution] };
      },
      async processNextJob() {
        plannerCalls += 1;
        return null;
      }
    },
    userId: 'synthetic-user',
    conversationId: 'synthetic-conversation',
    timeoutMs: 2_000,
    waitImpl: async () => {}
  });
  assert.equal(result.execution, execution);
  assert.equal(reads, 3);
  assert.equal(plannerCalls, 2);
});

test('Live Harness records a safe V1 terminal failure as baseline evidence', async () => {
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.campaignGuard = {
    dispatchMetrics: async () => ({
      qwenCalls: 0,
      kolorsCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      incomplete: 0
    })
  };
  harness.oracle = {
    async assertInvariants() {
      return {
        persistent: {
          run: {
            runtime_version: 1,
            status: 'failed',
            error_code: 'AGENT_VERIFICATION_INCOMPLETE',
            max_credits: 20,
            charged_credits: 0
          },
          holds: [{ status: 'released' }],
          artifacts: [],
          subagents: [],
          steps: [],
          modelCalls: []
        },
        reconstructed: { digest: 'ab'.repeat(32) }
      };
    }
  };
  harness.pool = {
    async query() {
      return {
        rows: [
          { entry_type: 'hold', count: 1 },
          { entry_type: 'release', count: 1 }
        ]
      };
    }
  };
  const result = await harness.assertInvariants({
    entry: { id: 'text-only-agent', expectedStatus: 'succeeded' },
    cohort: 'v1',
    runId: 'synthetic-run'
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.baselineFailure, {
    code: 'AGENT_VERIFICATION_INCOMPLETE',
    status: 'failed',
    invariantCodes: ['terminal:failed']
  });
});

test('Live Harness never downgrades an unverified V1 artifact to baseline evidence', async () => {
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.campaignGuard = {
    dispatchMetrics: async () => ({
      qwenCalls: 0,
      kolorsCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      incomplete: 0
    })
  };
  harness.oracle = {
    async assertInvariants() {
      return {
        persistent: {
          run: {
            runtime_version: 1,
            status: 'failed',
            error_code: 'AGENT_VERIFICATION_INCOMPLETE',
            max_credits: 20,
            charged_credits: 0
          },
          holds: [{ status: 'released' }],
          artifacts: [{ verification_status: 'pending' }],
          subagents: [],
          steps: [],
          modelCalls: []
        },
        reconstructed: { digest: 'ab'.repeat(32) }
      };
    }
  };
  harness.pool = {
    async query() {
      return {
        rows: [
          { entry_type: 'hold', count: 1 },
          { entry_type: 'release', count: 1 }
        ]
      };
    }
  };
  await assert.rejects(
    harness.assertInvariants({
      entry: { id: 'text-only-agent', expectedStatus: 'succeeded' },
      cohort: 'v1',
      runId: 'synthetic-run'
    }),
    /artifact_verification/
  );
});

test('Live Harness rejects V2 model receipts that lack matching physical dispatch evidence', async () => {
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.campaignGuard = {
    dispatchMetrics: async () => ({
      qwenCalls: 1,
      kolorsCalls: 0,
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 25,
      incomplete: 0
    })
  };
  harness.oracle = {
    async assertInvariants() {
      return {
        persistent: {
          run: {
            runtime_version: 2,
            status: 'succeeded',
            max_credits: 20,
            charged_credits: 2
          },
          holds: [{ status: 'settled' }],
          artifacts: [],
          subagents: [],
          steps: [],
          modelCalls: [{ phase: 'actor', turn: 0 }, { phase: 'verifier', turn: 0 }]
        },
        reconstructed: { digest: 'ab'.repeat(32) }
      };
    }
  };
  harness.pool = {
    query: async () => ({
      rows: [{ entry_type: 'hold', count: 1 }, { entry_type: 'charge', count: 1 }]
    })
  };

  await assert.rejects(
    harness.assertInvariants({
      entry: { id: 'text-only-agent', expectedStatus: 'succeeded' },
      cohort: 'v2',
      runId: '11111111-1111-4111-8111-111111111111'
    }),
    /provider_dispatch_crosscheck/
  );
});

test('Live Harness accepts V2 physical evidence with bounded Kolors retries', async () => {
  const runId = '11111111-1111-4111-8111-111111111111';
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.campaignGuard = {
    dispatchMetrics: async () => ({
      calls: [
        { kind: 'qwen', runIdHash: sha256(runId), slotHash: sha256('text-only-agent:v2'), runtimeVersion: 2, status: 'succeeded' },
        { kind: 'kolors', runIdHash: sha256(runId), slotHash: sha256('text-only-agent:v2'), runtimeVersion: 2, status: 'failed' },
        { kind: 'kolors', runIdHash: sha256(runId), slotHash: sha256('text-only-agent:v2'), runtimeVersion: 2, status: 'succeeded' }
      ],
      qwenCalls: 1,
      kolorsCalls: 2,
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 25,
      incomplete: 0
    })
  };
  harness.oracle = {
    async assertInvariants() {
      return {
        persistent: {
          run: {
            runtime_version: 2,
            status: 'succeeded',
            max_credits: 20,
            charged_credits: 2
          },
          holds: [{ status: 'settled' }],
          artifacts: [],
          subagents: [],
          steps: [],
          modelCalls: [{ phase: 'actor', turn: 0 }],
          toolReceipts: [{ kind: 'kolors', state: 'consumed' }]
        },
        reconstructed: { digest: 'ab'.repeat(32) }
      };
    }
  };
  harness.pool = {
    query: async () => ({
      rows: [{ entry_type: 'hold', count: 1 }, { entry_type: 'charge', count: 1 }]
    })
  };
  const result = await harness.assertInvariants({
    entry: { id: 'text-only-agent', expectedStatus: 'succeeded' },
    cohort: 'v2',
    runId
  });
  assert.equal(result.ok, true);
  assert.equal(result.qwenCalls, 1);
  assert.equal(result.kolorsCalls, 2);
});

test('Live Harness never accepts an incomplete physical dispatch as V1 baseline evidence', async () => {
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.campaignGuard = {
    dispatchMetrics: async () => ({
      qwenCalls: 1,
      kolorsCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      incomplete: 1
    })
  };
  harness.oracle = {
    async assertInvariants() {
      return {
        persistent: {
          run: {
            runtime_version: 1,
            status: 'failed',
            error_code: 'AGENT_PROVIDER_FAILED',
            max_credits: 20,
            charged_credits: 0
          },
          holds: [{ status: 'released' }],
          artifacts: [],
          subagents: [],
          steps: [],
          modelCalls: []
        },
        reconstructed: { digest: 'ab'.repeat(32) }
      };
    }
  };
  harness.pool = {
    query: async () => ({
      rows: [{ entry_type: 'hold', count: 1 }, { entry_type: 'release', count: 1 }]
    })
  };

  await assert.rejects(
    harness.assertInvariants({
      entry: { id: 'report', expectedStatus: 'succeeded' },
      cohort: 'v1',
      runId: '11111111-1111-4111-8111-111111111111'
    }),
    /provider_dispatch_incomplete/
  );
});

test('Live Harness closes the campaign before infrastructure and does so once', async () => {
  const order = [];
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.baselineUserId = '11111111-1111-4111-8111-111111111111';
  harness.candidateUserId = '22222222-2222-4222-8222-222222222222';
  harness.campaignGuard = { close: async () => order.push('campaign') };
  harness.worker = {
    cleanupTerminalState: async ({ userIds }) => {
      assert.deepEqual(userIds, [harness.baselineUserId, harness.candidateUserId]);
      order.push('terminal');
      return {
        receiptCleanup: { runsReconciled: 1, receiptsResolved: 1 },
        sandboxCleanup: { destroyed: 1, failed: 0 }
      };
    },
    stopInfrastructure: async () => order.push('worker')
  };
  harness.assetAdapter = { client: { destroy: () => order.push('s3') } };
  await Promise.all([harness.close(), harness.close()]);
  assert.deepEqual(order, ['campaign', 'terminal', 'worker', 's3']);
});

test('Live Harness close cancels both active synthetic cohorts before terminal cleanup', async () => {
  const order = [];
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.baselineUserId = '11111111-1111-4111-8111-111111111111';
  harness.candidateUserId = '22222222-2222-4222-8222-222222222222';
  harness.campaignGuard = { close: async () => order.push('campaign') };
  harness.pool = {
    query: async (_statement, [userId]) => ({
      rows: [{ id: userId === harness.baselineUserId ? 'run-v1' : 'run-v2' }],
      rowCount: 1
    })
  };
  harness.runService = {
    cancelRun: async ({ userId, runId }) => order.push(`cancel:${userId}:${runId}`)
  };
  harness.worker = {
    cleanupTerminalState: async () => {
      order.push('terminal');
      return { sandboxCleanup: { destroyed: 0, failed: 0 } };
    },
    stopInfrastructure: async () => order.push('worker')
  };
  harness.assetAdapter = { client: { destroy: () => order.push('s3') } };

  await harness.close();

  assert.deepEqual(order, [
    'campaign',
    `cancel:${harness.baselineUserId}:run-v1`,
    `cancel:${harness.candidateUserId}:run-v2`,
    'terminal',
    'worker',
    's3'
  ]);
});

test('Live Harness cleanup fails closed when an active synthetic run cannot be cancelled', async () => {
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.baselineUserId = '11111111-1111-4111-8111-111111111111';
  harness.candidateUserId = '22222222-2222-4222-8222-222222222222';
  harness.campaignGuard = { close: async () => {} };
  harness.pool = {
    query: async (_statement, [userId]) => ({
      rows: userId === harness.baselineUserId ? [{ id: 'run-v1' }] : [],
      rowCount: userId === harness.baselineUserId ? 1 : 0
    })
  };
  harness.runService = {
    cancelRun: async () => { throw new Error('synthetic cancellation failure'); }
  };
  harness.worker = {
    cleanupTerminalState: async () => ({ sandboxCleanup: { destroyed: 0, failed: 0 } }),
    stopInfrastructure: async () => {}
  };
  harness.assetAdapter = { client: { destroy: () => {} } };

  await assert.rejects(harness.close(), /AGENT_LIVE_EVAL_CLOSE_FAILED/);
});

test('Live Harness reports terminal cleanup failure but still stops infrastructure', async () => {
  const order = [];
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.baselineUserId = '11111111-1111-4111-8111-111111111111';
  harness.candidateUserId = '22222222-2222-4222-8222-222222222222';
  harness.campaignGuard = { close: async () => order.push('campaign') };
  harness.worker = {
    cleanupTerminalState: async () => {
      order.push('terminal');
      return {
        receiptCleanup: { runsReconciled: 0, receiptsResolved: 0 },
        sandboxCleanup: { destroyed: 0, failed: 1 }
      };
    },
    stopInfrastructure: async () => order.push('worker')
  };
  harness.assetAdapter = { client: { destroy: () => order.push('s3') } };
  await assert.rejects(harness.close(), /AGENT_LIVE_EVAL_CLOSE_FAILED/);
  assert.deepEqual(order, ['campaign', 'terminal', 'worker', 's3']);
});

test('Live Harness drain check keeps ambiguous receipts as audit evidence but rejects active receipt states', async () => {
  const statements = [];
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.runIds = ['11111111-1111-4111-8111-111111111111'];
  harness.baselineUserId = '22222222-2222-4222-8222-222222222222';
  harness.candidateUserId = '33333333-3333-4333-8333-333333333333';
  harness.queue = [];
  harness.providerScheduler = { providerKey: 'siliconflow:Qwen/Qwen3-8B' };
  harness.imageProviderScheduler = { providerKey: 'siliconflow:Kwai-Kolors/Kolors' };
  harness.pool = {
    async query(statement, parameters) {
      statements.push(String(statement));
      assert.deepEqual(parameters, [
        harness.runIds,
        [harness.baselineUserId, harness.candidateUserId],
        [
          harness.providerScheduler.providerKey,
          harness.imageProviderScheduler.providerKey
        ]
      ]);
      return { rows: [{
        active_runs: 0,
        frozen_credits: 0,
        active_holds: 0,
        active_model_receipts: 0,
        active_reservations: 0,
        active_tool_receipts: 0,
        queued_provider_requests: 0,
        queued_provider_requests_by_key: {}
      }] };
    }
  };
  assert.equal(await harness.assertBatchDrained(), true);
  assert.equal(statements.length, 1);
  const [modelReceiptQuery] = statements;
  const [toolReceiptQuery] = statements;
  assert.match(modelReceiptQuery, /queued.*dispatched.*received/s);
  assert.doesNotMatch(modelReceiptQuery, /ambiguous/);
  assert.match(toolReceiptQuery, /state='dispatched'/);
  assert.doesNotMatch(toolReceiptQuery, /ambiguous/);
});

test('Live Harness drain check includes a queued Kolors scheduler request', async () => {
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.runIds = [];
  harness.baselineUserId = '22222222-2222-4222-8222-222222222222';
  harness.candidateUserId = '33333333-3333-4333-8333-333333333333';
  harness.queue = [];
  harness.providerScheduler = { providerKey: 'cloudflare:@cf/openai/gpt-oss-120b' };
  harness.imageProviderScheduler = { providerKey: 'siliconflow:Kwai-Kolors/Kolors' };
  harness.pool = {
    query: async (_statement, parameters) => {
      assert.deepEqual(parameters, [
        [],
        [harness.baselineUserId, harness.candidateUserId],
        [harness.providerScheduler.providerKey, harness.imageProviderScheduler.providerKey]
      ]);
      return { rows: [{
        active_runs: 0,
        frozen_credits: 0,
        active_holds: 0,
        active_model_receipts: 0,
        active_reservations: 0,
        active_tool_receipts: 0,
        queued_provider_requests: 1,
        queued_provider_requests_by_key: {
          'siliconflow:Kwai-Kolors/Kolors': 1
        }
      }] };
    }
  };
  await assert.rejects(harness.assertBatchDrained(), /AGENT_LIVE_EVAL_BATCH_NOT_DRAINED/);
  assert.equal(
    harness.lastDrainSnapshot.queued_provider_requests_by_key['siliconflow:Kwai-Kolors/Kolors'],
    1
  );
});

test('Live Harness drain check rejects an active subagent even when the parent run is terminal', async () => {
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.runIds = ['11111111-1111-4111-8111-111111111111'];
  harness.baselineUserId = '22222222-2222-4222-8222-222222222222';
  harness.candidateUserId = '33333333-3333-4333-8333-333333333333';
  harness.queue = [];
  harness.providerScheduler = { providerKey: 'siliconflow:Qwen/Qwen3-8B' };
  harness.imageProviderScheduler = { providerKey: 'siliconflow:Kwai-Kolors/Kolors' };
  harness.pool = {
    query: async () => ({ rows: [{
      active_runs: 0,
      frozen_credits: 0,
      active_holds: 0,
      active_model_receipts: 0,
      active_reservations: 0,
      active_tool_receipts: 0,
      active_subagents: 1,
      queued_provider_requests: 0,
      queued_provider_requests_by_key: {}
    }] })
  };
  await assert.rejects(harness.assertBatchDrained(), /AGENT_LIVE_EVAL_BATCH_NOT_DRAINED/);
  assert.equal(harness.lastDrainSnapshot.active_subagents, 1);
});

test('Live Harness direct recovery processing consumes the synthetic queue entry', async () => {
  const runId = '11111111-1111-4111-8111-111111111111';
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.queue = [runId, '22222222-2222-4222-8222-222222222222', runId];
  harness.worker = {
    processRun: async (receivedRunId) => {
      assert.equal(receivedRunId, runId);
      assert.deepEqual(harness.queue, ['22222222-2222-4222-8222-222222222222']);
      return { claimed: true, status: 'running' };
    }
  };

  assert.deepEqual(await harness.processRun(runId), { claimed: true, status: 'running' });
  assert.deepEqual(harness.queue, ['22222222-2222-4222-8222-222222222222']);
});

test('Live Harness captures sanitized terminal evidence when a real case throws', async () => {
  const runId = '11111111-1111-4111-8111-111111111111';
  const harness = Object.create(AgentLiveEvalHarness.prototype);
  harness.sessionId = 'synthetic-session';
  harness.auditor = { qwenCalls: 7, kolorsCalls: 2 };
  harness.campaignGuard = {
    dispatchMetrics: async ({ slotId }) => {
      assert.equal(slotId, 'spreadsheet:v2');
      return {
        qwenCalls: 4,
        kolorsCalls: 1,
        inputTokens: 1200,
        outputTokens: 300,
        latencyMs: 9000,
        incomplete: 0
      };
    }
  };
  harness.userForCohort = () => '22222222-2222-4222-8222-222222222222';
  harness.pool = {
    async query(statement, values) {
      const sql = String(statement);
      if (sql.includes('FROM agent_runs')) {
        assert.equal(values[1], 'live-eval:synthetic-session:spreadsheet:v2');
        return { rows: [{
          id: runId,
          status: 'cancelled',
          runtime_version: 2,
          error_code: 'AGENT_CANCELLED',
          charged_credits: 4,
          step_count: 2,
          lease_epoch: 1,
          final_text_sha256: null
        }] };
      }
      if (sql.includes('FROM agent_artifacts')) return { rows: [{ count: 0 }] };
      if (sql.includes('FROM agent_subagents')) return { rows: [{ count: 0 }] };
      if (sql.includes('FROM agent_model_calls')) return { rows: [{
        count: 3,
        input_tokens: 1200,
        output_tokens: 300,
        latency_ms: 9000,
        queue_wait_ms: 400,
        schema_checks: 1,
        schema_first_valid: 0
      }] };
      throw new Error(`unexpected query: ${sql}`);
    }
  };

  const captured = await harness.captureCaseFailure({
    entry: { id: 'spreadsheet' },
    cohort: 'v2',
    qwenBefore: 3,
    kolorsBefore: 1
  });
  assert.deepEqual(captured, {
    scenarioId: 'spreadsheet',
    cohort: 'v2',
    runId,
    runtimeVersion: 2,
    status: 'cancelled',
    errorCode: 'AGENT_CANCELLED',
    chargedCredits: 4,
    steps: 2,
    artifactCount: 0,
    subagentCount: 0,
    modelCalls: 4,
    inputTokens: 1200,
    outputTokens: 300,
    modelLatencyMs: 9000,
    queueWaitMs: 400,
    schemaChecks: 1,
    schemaFirstValid: 0,
    leaseEpoch: 1,
    finalTextSha256Present: false,
    artifacts: [],
    qwenCalls: 4,
    kolorsCalls: 1,
    incompleteDispatches: 0,
    durableModelCalls: 3
  });
});

test('Live eval cleanup is bounded and still attempts PostgreSQL shutdown', async () => {
  let poolEnds = 0;
  const cleanup = await closeLiveEvalResources({
    harness: { close: () => new Promise(() => {}) },
    pool: { end: async () => { poolEnds += 1; } },
    timeoutMs: 20
  });
  assert.equal(cleanup.ok, false);
  assert.equal(cleanup.results[0].code, 'AGENT_LIVE_EVAL_CLEANUP_TIMEOUT');
  assert.equal(cleanup.results[1].ok, true);
  assert.equal(poolEnds, 1);
});

test('Live eval cleanup failure is persisted and revokes report eligibility', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-live-cleanup-'));
  const reportPath = path.join(root, 'report.json');
  try {
    await fs.promises.writeFile(reportPath, JSON.stringify({
      version: 'agent-live-eval-v3.1',
      summary: { automatedGatePassed: true, productionCanaryEligible: true }
    }));
    const updated = await attachCleanupEvidence({
      reportPath,
      cleanup: {
        ok: false,
        results: [{ ok: false, label: 'postgres', code: 'AGENT_LIVE_EVAL_CLEANUP_TIMEOUT' }]
      }
    });
    assert.equal(updated.summary.automatedGatePassed, false);
    assert.equal(updated.summary.productionCanaryEligible, false);
    assert.equal(JSON.parse(await fs.promises.readFile(reportPath, 'utf8')).cleanup.ok, false);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('Live eval restart detects an interrupted slot journal, records every unfinished slot, and never resumes silently', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-live-journal-'));
  const reportDir = path.join(root, 'agent-live-eval-interrupted');
  const journalPath = path.join(reportDir, 'slot-journal.json');
  const gate = {
    campaignId: 'campaign-interrupted-1',
    commitSha: 'ab'.repeat(20),
    matrixHash: 'cd'.repeat(32)
  };
  try {
    await fs.promises.mkdir(reportDir, { recursive: true });
    const journal = createSlotJournal({
      gate,
      selectedCase: 'spreadsheet',
      selectedCohort: 'both',
      selected: [{ id: 'spreadsheet' }]
    });
    journal.slots['spreadsheet:v1'].status = 'succeeded';
    journal.slots['spreadsheet:v1'].result = {
      scenarioId: 'spreadsheet', cohort: 'v1', ok: true
    };
    journal.slots['spreadsheet:v2'].status = 'running';
    await fs.promises.writeFile(journalPath, JSON.stringify(journal));

    const found = await findInterruptedJournal({ artifactRoot: root, gate });
    assert.equal(found.journalPath, journalPath);
    const recovered = await markInterruptedJournal({ found, signal: 'SIGKILL' });
    assert.equal(recovered.journal.status, 'interrupted');
    assert.equal(recovered.journal.slots['spreadsheet:v1'].status, 'succeeded');
    assert.equal(recovered.journal.slots['spreadsheet:v2'].status, 'failed');
    assert.equal(
      recovered.journal.slots['spreadsheet:v2'].code,
      'AGENT_LIVE_EVAL_PROCESS_INTERRUPTED'
    );
    assert.equal(journalResults(recovered.journal).length, 2);
    const report = JSON.parse(await fs.promises.readFile(recovered.reportPath, 'utf8'));
    assert.equal(report.ok, false);
    assert.equal(report.code, 'AGENT_LIVE_EVAL_RESIDUAL_CAMPAIGN');
    assert.equal(report.results.filter((entry) => entry.ok === false).length, 1);
    assert.equal(
      await findInterruptedJournal({ artifactRoot: root, gate }),
      null
    );
    const terminalJournal = await findCampaignJournal({ artifactRoot: root, gate });
    assert.equal(terminalJournal.journal.status, 'interrupted');
    assert.equal(terminalJournal.reportPath, recovered.reportPath);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('Live eval residual recovery cancels only synthetic runs and cleans their resources', async () => {
  const calls = [];
  const userRows = [
    { id: '00000000-0000-4000-8000-000000000001', email: 'agent-live-v1@dev.artigen.invalid' },
    { id: '00000000-0000-4000-8000-000000000002', email: 'agent-live-v2@dev.artigen.invalid' }
  ];
  const activeRows = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      user_id: userRows[0].id,
      idempotency_key: 'live-eval:stale:report:v1',
      sandbox_ref: 'sandbox-stale'
    }
  ];
  const pool = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes('SELECT id,email::text')) return { rows: userRows, rowCount: userRows.length };
      if (sql.includes('SELECT id,user_id,idempotency_key')) return { rows: activeRows, rowCount: activeRows.length };
      return { rowCount: 0, rows: [] };
    }
  };
  const cancelled = [];
  const destroyed = [];
  const runService = {
    cancelRun: async ({ userId, runId }) => {
      cancelled.push({ userId, runId });
      return { status: 'cancelled' };
    },
    reconcileTerminalReceipts: async () => ({ runsReconciled: 1, receiptsResolved: 1 }),
    listTerminalSandboxes: async () => [{ runId: activeRows[0].id, sandboxRef: activeRows[0].sandbox_ref }],
    markSandboxDestroyed: async () => true
  };
  const result = await recoverInterruptedCampaign({
    pool,
    journal: { updatedAt: new Date().toISOString() },
    env: {
      NODE_ENV: 'test', APP_ENV: 'dev', AGENT_LIVE_EVAL_MODE: 'true',
      AGENT_LIVE_EVAL_ALLOW_REAL_PROVIDER: '1', AGENT_RUNTIME_DRIVER: 'live'
    },
    runServiceFactory: () => runService,
    sandboxFactory: () => ({
      destroy: async (ref) => destroyed.push(ref),
      referenceForRun: () => 'sandbox-stale'
    })
  });
  assert.equal(result.ok, true);
  assert.deepEqual(cancelled, [{ userId: activeRows[0].user_id, runId: activeRows[0].id }]);
  assert.deepEqual(destroyed, ['sandbox-stale']);
  assert.equal(result.cancelledProviderRequests, 0);
  assert.equal(calls.some((sql) => sql.includes('agent_provider_requests')), false);
});

test('Live eval residual recovery fails closed for unrelated active synthetic-user work', async () => {
  const pool = {
    query: async (sql) => {
      if (sql.includes('SELECT id,email::text')) {
        return {
          rowCount: 1,
          rows: [{ id: '00000000-0000-4000-8000-000000000001', email: 'agent-live-v1@dev.artigen.invalid' }]
        };
      }
      if (sql.includes('SELECT id,user_id,idempotency_key')) {
        return {
          rowCount: 1,
          rows: [{
            id: '10000000-0000-4000-8000-000000000001',
            user_id: '00000000-0000-4000-8000-000000000001',
            idempotency_key: 'user-created-run',
            sandbox_ref: null
          }]
        };
      }
      return { rowCount: 0, rows: [] };
    }
  };
  await assert.rejects(
    recoverInterruptedCampaign({
      pool,
      journal: { updatedAt: new Date().toISOString() },
      env: {
        NODE_ENV: 'test', APP_ENV: 'dev', AGENT_LIVE_EVAL_MODE: 'true',
        AGENT_LIVE_EVAL_ALLOW_REAL_PROVIDER: '1', AGENT_RUNTIME_DRIVER: 'live'
      },
      runServiceFactory: () => ({})
    }),
    /AGENT_LIVE_EVAL_RESIDUAL_USER_BUSY/
  );
});

test('Live eval treats failed and completed campaign journals as single-use terminal evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-live-single-use-'));
  const gate = {
    campaignId: 'campaign-single-use-1',
    commitSha: '56'.repeat(20),
    matrixHash: '78'.repeat(32)
  };
  try {
    for (const [name, status] of [['failed', 'failed'], ['completed', 'completed']]) {
      const reportDir = path.join(root, `agent-live-eval-${name}`);
      await fs.promises.mkdir(reportDir, { recursive: true });
      const journal = createSlotJournal({
        gate,
        selectedCase: 'spreadsheet',
        selectedCohort: 'v2',
        selected: [{ id: 'spreadsheet' }]
      });
      journal.status = status;
      journal.updatedAt = new Date(Date.now() + (status === 'completed' ? 1000 : 0)).toISOString();
      await fs.promises.writeFile(
        path.join(reportDir, 'slot-journal.json'),
        JSON.stringify(journal)
      );
    }
    const found = await findCampaignJournal({ artifactRoot: root, gate });
    assert.equal(found.journal.status, 'completed');
    assert.equal(await findInterruptedJournal({ artifactRoot: root, gate }), null);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('Live eval terminal failures record every pending slot instead of losing the remaining matrix', () => {
  const gate = {
    campaignId: 'campaign-terminal-failure',
    commitSha: '12'.repeat(20),
    matrixHash: '34'.repeat(32)
  };
  const journal = createSlotJournal({
    gate,
    selectedCase: '',
    selectedCohort: 'both',
    selected: [{ id: 'consultation-route' }, { id: 'spreadsheet' }]
  });
  journal.slots['consultation-route:v1'].status = 'succeeded';
  journal.slots['consultation-route:v1'].result = {
    scenarioId: 'consultation-route', cohort: 'v1', ok: true
  };
  failUnfinishedJournalSlots(journal, { code: 'AGENT_LIVE_EVAL_HARNESS_INIT_FAILED' });
  assert.equal(journalResults(journal).length, 4);
  assert.equal(journal.slots['consultation-route:v1'].status, 'succeeded');
  for (const key of ['consultation-route:v2', 'spreadsheet:v1', 'spreadsheet:v2']) {
    assert.equal(journal.slots[key].status, 'failed');
    assert.equal(journal.slots[key].code, 'AGENT_LIVE_EVAL_HARNESS_INIT_FAILED');
  }
});

test('Live eval runner survives duplicate process-group SIGTERM while persisting interruption', {
  timeout: 10_000
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-live-signal-'));
  const journalPath = path.join(root, 'slot-journal.json');
  const probePath = path.join(
    __dirname,
    '../evaluation/harness/live-eval-signal-probe.js'
  );
  let child = null;
  try {
    child = fork(probePath, [], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        AGENT_LIVE_EVAL_SIGNAL_JOURNAL: journalPath
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('AGENT_SIGNAL_PROBE_READY_TIMEOUT')), 5_000);
      timer.unref?.();
      child.once('message', (message) => {
        clearTimeout(timer);
        if (message?.event === 'ready') resolve();
        else reject(new Error(String(message?.code || 'AGENT_SIGNAL_PROBE_FAILED')));
      });
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        reject(new Error(`AGENT_SIGNAL_PROBE_EARLY_EXIT:${code}:${signal}`));
      });
    });
    child.kill('SIGTERM');
    child.kill('SIGTERM');
    const exited = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('AGENT_SIGNAL_PROBE_EXIT_TIMEOUT')), 5_000);
      timer.unref?.();
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    assert.deepEqual(exited, { code: 0, signal: null });
    const journal = JSON.parse(await fs.promises.readFile(journalPath, 'utf8'));
    assert.equal(journal.status, 'interrupted');
    assert.equal(journal.interruption.signal, 'SIGTERM');
    assert.equal(journal.slots['signal-probe:v2'].status, 'failed');
    assert.equal(
      journal.slots['signal-probe:v2'].code,
      'AGENT_LIVE_EVAL_PROCESS_INTERRUPTED'
    );
    assert.deepEqual(journal.slots['signal-probe:v2'].result, {
      scenarioId: 'signal-probe',
      cohort: 'v2',
      ok: false,
      code: 'AGENT_LIVE_EVAL_PROCESS_INTERRUPTED'
    });
  } finally {
    if (child?.connected) child.disconnect();
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('Live eval signal handling persists before and after active-run cancellation', async () => {
  const processTarget = new EventEmitter();
  const journal = {
    status: 'running',
    slots: {
      'signal:v1': { scenarioId: 'signal', cohort: 'v1', status: 'running' }
    }
  };
  const order = [];
  const state = installLiveEvalSignalHandlers({
    journal,
    processTarget,
    abort: () => order.push('abort'),
    persist: async () => order.push('persist'),
    onInterrupt: async ({ signal }) => order.push(`cancel:${signal}`)
  });

  processTarget.emit('SIGTERM');
  processTarget.emit('SIGTERM');
  await state.interrupted;

  assert.deepEqual(order, ['abort', 'persist', 'cancel:SIGTERM', 'persist']);
  assert.equal(journal.status, 'interrupted');
  assert.equal(journal.slots['signal:v1'].status, 'failed');
  assert.equal(processTarget.listenerCount('SIGTERM'), 1);
  state.dispose();
  assert.equal(processTarget.listenerCount('SIGTERM'), 0);
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

test('Live eval gate evidence must name the exact commit and postdate it', () => {
  const commitSha = 'ef'.repeat(20);
  const checks = Object.fromEntries([
    'pnpmCheck',
    'postgresMinio',
    'qualitySet',
    'chaos',
    'crossWorker',
    'browsers'
  ].map((name) => [name, {
    sourceCommitSha: commitSha,
    reportPath: `/synthetic/${name}.json`
  }]));
  const attestation = { checks };
  const currentStat = () => ({
    isFile: () => true,
    size: 100,
    mtimeMs: 2_000
  });
  assert.equal(assertGateAttestationProvenance({
    attestation,
    commitSha,
    commitTimestampMs: 2_000,
    statSync: currentStat
  }), true);
  assert.throws(() => assertGateAttestationProvenance({
    attestation: {
      checks: {
        ...checks,
        chaos: { ...checks.chaos, sourceCommitSha: 'ab'.repeat(20) }
      }
    },
    commitSha,
    commitTimestampMs: 2_000,
    statSync: currentStat
  }), /EVIDENCE_SHA_MISMATCH:chaos/);
  assert.throws(() => assertGateAttestationProvenance({
    attestation,
    commitSha,
    commitTimestampMs: 4_001,
    statSync: currentStat
  }), /REPORT_PREDATES_COMMIT:pnpmCheck/);
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
    modelLocks: { text: '@cf/openai/gpt-oss-120b', image: 'Kwai-Kolors/Kolors' },
    limits: { perRunCredits: 50, qwenCalls: 200, kolorsCalls: 16, wallClockHours: 8 },
    cleanup: { ok: true, results: [{ ok: true, label: 'harness' }, { ok: true, label: 'postgres' }] },
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
  assert.deepEqual(verified.modelLocks, automatedReport.modelLocks);
  assert.match(verified.reportSha256, /^[a-f0-9]{64}$/);
  const cloudflareReport = createSignedFinalReport({
    automatedReport: {
      ...automatedReport,
      modelLocks: {
        text: '@cf/openai/gpt-oss-120b',
        image: 'Kwai-Kolors/Kolors'
      }
    },
    automatedReportSha256: crypto.createHash('sha256').update('cloudflare-automated').digest('hex'),
    blindScore,
    blindScoreSha256: crypto.createHash('sha256').update('cloudflare-blind').digest('hex'),
    keyMaterial
  });
  const verifiedCloudflare = verifySignedFinalReport({
    report: cloudflareReport,
    keyMaterial,
    expectedCommitSha: automatedReport.commitSha,
    expectedMatrixHash: LIVE_EVAL_MATRIX_HASH
  });
  assert.equal(verifiedCloudflare.campaignId, automatedReport.campaignId);
  assert.deepEqual(verifiedCloudflare.modelLocks, {
    text: '@cf/openai/gpt-oss-120b',
    image: 'Kwai-Kolors/Kolors'
  });
  assert.throws(
    () => verifySignedFinalReport({
      report: {
        ...cloudflareReport,
        modelLocks: { ...cloudflareReport.modelLocks, text: 'Qwen/Qwen3-8B' }
      },
      keyMaterial,
      expectedCommitSha: automatedReport.commitSha,
      expectedMatrixHash: LIVE_EVAL_MATRIX_HASH
    }),
    /FINAL_REPORT_MISMATCH|FINAL_SIGNATURE_INVALID/
  );
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
  const { cleanup: _cleanup, ...withoutCleanup } = automatedReport;
  assert.throws(
    () => createSignedFinalReport({
      automatedReport: withoutCleanup,
      automatedReportSha256: crypto.createHash('sha256').update('automated').digest('hex'),
      blindScore,
      blindScoreSha256: crypto.createHash('sha256').update('blind-score').digest('hex'),
      keyMaterial
    }),
    /AUTOMATED_GATE_FAILED/
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
      modelLocks: { text: '@cf/openai/gpt-oss-120b', image: 'Kwai-Kolors/Kolors' },
      limits: { perRunCredits: 50, qwenCalls: 200, kolorsCalls: 16, wallClockHours: 8 },
      cleanup: { ok: true, results: [{ ok: true, label: 'harness' }, { ok: true, label: 'postgres' }] },
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
    textModel: '@cf/openai/gpt-oss-120b',
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
        runtimeProfile: { model: '@cf/openai/gpt-oss-120b', checkpointVersion: 4 }
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
    () => assertOwnerCanaryPreflight({
      signedFinalReport,
      reportKeyMaterial: keyMaterial,
      ownerUserId,
      runtime: {
        ...runtime,
        textModel: 'Qwen/Qwen3-8B'
      },
      deployments,
      probes: {
        ...probes,
        agentStatus: {
          ...probes.agentStatus,
          status: {
            ...probes.agentStatus.status,
            runtimeProfile: {
              ...probes.agentStatus.status.runtimeProfile,
              model: 'Qwen/Qwen3-8B'
            }
          }
        }
      }
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

  const interrupted = summarize(LIVE_EVAL_CASES.flatMap((entry) => ['v1', 'v2'].map((cohort) => ({
    ok: false,
    scenarioId: entry.id,
    cohort,
    code: 'AGENT_LIVE_EVAL_CAMPAIGN_CONNECTION_LOST'
  }))));
  assert.equal(interrupted.v1.cases, 11);
  assert.equal(interrupted.v2.cases, 11);
  assert.equal(interrupted.fullMatrixComplete, false);
  assert.equal(interrupted.automatedGatePassed, false);
});

test('Live eval terminal failures preserve the partial matrix, limits and request totals', () => {
  const error = Object.assign(new Error('synthetic drain failure'), {
    code: 'AGENT_LIVE_EVAL_BATCH_NOT_DRAINED'
  });
  const report = buildTerminalFailureReport({
    gate: {
      campaignId: 'campaign-1',
      manifestSha256: 'aa'.repeat(32),
      commitSha: 'bb'.repeat(20),
      matrixHash: 'cc'.repeat(32)
    },
    selectedCase: '',
    selectedCohort: 'both',
    results: [{
      ok: false,
      scenarioId: 'spreadsheet',
      cohort: 'v2',
      runId: '11111111-1111-4111-8111-111111111111',
      status: 'cancelled',
      errorCode: 'AGENT_CANCELLED',
      qwenCalls: 3,
      kolorsCalls: 0
    }],
    error,
    harness: {
      trace: { digest: () => 'dd'.repeat(32) },
      auditor: { qwenCalls: 17, kolorsCalls: 2 }
    }
  });
  assert.equal(report.ok, false);
  assert.equal(report.code, 'AGENT_LIVE_EVAL_BATCH_NOT_DRAINED');
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].runId, '11111111-1111-4111-8111-111111111111');
  assert.equal(report.summary.automatedGatePassed, false);
  assert.equal(report.summary.productionCanaryEligible, false);
  assert.deepEqual(report.requestTotals, { qwenCalls: 17, kolorsCalls: 2 });
  assert.deepEqual(report.modelLocks, {
    text: '@cf/openai/gpt-oss-120b',
    image: 'Kwai-Kolors/Kolors'
  });
  assert.deepEqual(report.limits, {
    perRunCredits: 50,
    qwenCalls: 200,
    kolorsCalls: 16,
    wallClockHours: 8
  });
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
  await assert.rejects(
    auditor.inspectQwenRequest(actor, {
      runId: '11111111-1111-4111-8111-111111111111',
      phase: 'actor',
      promptHash: 'ab'.repeat(32)
    }),
    /AGENT_LIVE_EVAL_PROMPT_HASH_MISMATCH:actor/
  );
  const inspected = await auditor.inspectQwenRequest(actor, {
    runId: '11111111-1111-4111-8111-111111111111',
    phase: 'actor',
    promptHash: requestPromptHash(actor)
  });
  assert.equal(auditor.qwenCalls, 0);
  assert.equal(auditor.logicalQwenCalls, 2);
  assert.match(trace.snapshot()[0].promptHash, /^[a-f0-9]{64}$/);
  const wrappedFetch = auditor.wrapQwenFetch(async () => ({ ok: true }));
  await auditor.requestContext.run(inspected, () => wrappedFetch(
    'https://api.siliconflow.cn/v1/chat/completions',
    {
      method: 'POST',
      body: JSON.stringify({ model: 'Qwen/Qwen3-8B', messages: [] })
    }
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
      promptHash: requestPromptHash({
        ...actor,
        max_tokens: 1200,
        tools: [{ type: 'function', function: { name: 'generate_image', parameters: {} } }]
      })
    }),
    /AGENT_LIVE_EVAL_SUBAGENT_TOOL_FORBIDDEN/
  );
  await auditor.inspectKolorsRequest({ references: [] });
  await assert.rejects(auditor.inspectKolorsRequest({ references: [] }), /KOLORS_CALL_LIMIT/);
  await assert.rejects(
    auditor.inspectKolorsResponse({ model: 'Qwen/Qwen-Image-Edit-2509' }),
    /IMAGE_MODEL_INVALID/
  );
});

test('SiliconFlow chat transport can be audited for design-workflow Qwen calls', async () => {
  const trace = new RuntimeTraceSink();
  const auditor = new LiveModelAuditor({
    trace,
    maxQwenCalls: 2,
    textModel: 'Qwen/Qwen3-8B'
  });
  const payload = {
    model: 'Qwen/Qwen3-8B',
    messages: [{ role: 'user', content: 'generate four visual directions' }],
    stream: false,
    enable_thinking: false,
    max_tokens: 1800,
    response_format: { type: 'json_object' }
  };
  const inspected = await auditor.inspectQwenRequest(payload, {
    phase: 'actor',
    promptHash: requestPromptHash(payload),
    runtimeVersion: 1
  });
  let forwardedTransport = null;
  const transportResponse = new Response(JSON.stringify({
    choices: [{ message: { content: '{"directions":[]}' } }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const baseFetch = async () => transportResponse.clone();
  const auditedFetch = auditor.wrapQwenFetch(baseFetch);
  const fetcher = async (url, options, timeoutMs, signal, fetchImpl) => {
    forwardedTransport = fetchImpl;
    return fetchImpl(url, { ...options, signal });
  };
  await auditor.requestContext.run(inspected, () => callSiliconFlowChat({
    messages: payload.messages,
    model: payload.model,
    maxTokens: payload.max_tokens,
    enableThinking: false,
    responseFormat: 'json_object',
    timeoutMs: 1000,
    credential: 'synthetic-key',
    fetcher,
    fetchImpl: auditedFetch,
    skipRateGate: true
  }));
  assert.equal(forwardedTransport, auditedFetch);
  assert.equal(auditor.qwenCalls, 1);
  assert.equal(auditor.requests.at(-1).model, 'Qwen/Qwen3-8B');
});

test('Live model auditor accepts the reviewed Cloudflare GPT-OSS V2 contract', async () => {
  const auditor = new LiveModelAuditor({
    textModel: '@cf/openai/gpt-oss-120b',
    pool: { query: async () => ({ rows: [{ runtime_version: 2 }] }) }
  });
  const payload = {
    model: '@cf/openai/gpt-oss-120b',
    messages: [{ role: 'user', content: 'synthetic' }],
    tools: [{ type: 'function', function: { name: 'sandbox_shell', parameters: {} } }],
    stream: false,
    max_tokens: 1024,
    parallel_tool_calls: false,
    temperature: 0.2,
    top_p: 0.7
  };
  const request = await auditor.inspectQwenRequest(payload, {
    runId: '11111111-1111-4111-8111-111111111111',
    phase: 'actor',
    promptHash: requestPromptHash(payload)
  });
  assert.equal(request.model, '@cf/openai/gpt-oss-120b');
  assert.equal(request.thinkingEnabled, false);
});

test('Live model auditor durably closes every Kolors physical dispatch', async () => {
  const reserved = [];
  const recorded = [];
  const campaignGuard = {
    async reserveDispatch(kind, metadata) {
      reserved.push({ kind, metadata });
      return { dispatchId: reserved.length, sequence: reserved.length };
    },
    async recordDispatchResult(dispatch, result) {
      recorded.push({ dispatch, result });
    }
  };
  const auditor = new LiveModelAuditor({ campaignGuard, maxKolorsCalls: 3 });

  await assert.rejects(
    auditor.inspectKolorsRequest({ references: [{}, {}] }),
    /REFERENCE_LIMIT/
  );
  assert.equal(reserved.length, 0);

  const success = await auditor.runSlot('text-to-image:v2', async () => {
    const dispatch = await auditor.inspectKolorsRequest({
      runId: '11111111-1111-4111-8111-111111111111',
      runtimeVersion: 2,
      references: []
    });
    await auditor.inspectKolorsResponse({ model: 'Kwai-Kolors/Kolors' }, {}, dispatch);
    return dispatch;
  });
  assert.equal(reserved[0].metadata.slotId, 'text-to-image:v2');
  assert.equal(recorded[0].result.status, 'succeeded');

  const failure = await auditor.inspectKolorsRequest({ references: [] });
  const providerError = Object.assign(new Error('synthetic provider failure'), {
    code: 'AGENT_IMAGE_PROVIDER_FAILED'
  });
  await auditor.inspectKolorsFailure(providerError, {}, failure);
  assert.equal(recorded[1].result.status, 'failed');
  assert.equal(recorded[1].result.errorCode, 'AGENT_IMAGE_PROVIDER_FAILED');

  const invalid = await auditor.inspectKolorsRequest({ references: [] });
  await assert.rejects(
    auditor.inspectKolorsResponse({ model: 'Qwen/Qwen-Image-Edit-2509' }, {}, invalid),
    /IMAGE_MODEL_INVALID/
  );
  assert.equal(recorded[2].result.status, 'failed');
  assert.equal(recorded[2].result.errorCode, 'AGENT_LIVE_EVAL_IMAGE_MODEL_INVALID');
  assert.equal(success.sequence, 1);
});

test('Live model auditor records one campaign row for every physical Kolors HTTP attempt', async () => {
  const reserved = [];
  const recorded = [];
  const campaignGuard = {
    async reserveDispatch(kind, metadata) {
      reserved.push({ kind, metadata });
      return { dispatchId: reserved.length, sequence: reserved.length };
    },
    combinedSignal(signal) {
      return signal || new AbortController().signal;
    },
    async recordDispatchResult(dispatch, result) {
      recorded.push({ dispatch, result });
    }
  };
  const auditor = new LiveModelAuditor({ campaignGuard, maxKolorsCalls: 2 });
  const responses = [
    new Response('rate limited', { status: 429 }),
    new Response('{"images":[]}', { status: 200 })
  ];
  const wrapped = auditor.wrapKolorsFetcher(async () => responses.shift(), {
    runId: '11111111-1111-4111-8111-111111111111'
  });
  await wrapped('https://api.siliconflow.cn/v1/images/generations', {
    method: 'POST',
    body: JSON.stringify({ model: 'Kwai-Kolors/Kolors', prompt: 'first' })
  });
  await wrapped('https://api.siliconflow.cn/v1/images/generations', {
    method: 'POST',
    body: JSON.stringify({ model: 'Kwai-Kolors/Kolors', prompt: 'retry' })
  });
  assert.equal(auditor.kolorsCalls, 2);
  assert.deepEqual(reserved.map((entry) => entry.kind), ['kolors', 'kolors']);
  assert.deepEqual(recorded.map((entry) => entry.result.status), ['failed', 'failed']);
  assert.deepEqual(recorded.map((entry) => entry.result.errorCode), ['HTTP_429', 'AGENT_IMAGE_OUTPUT_INVALID']);
  assert.equal(reserved[0].metadata.runId, '11111111-1111-4111-8111-111111111111');
  await assert.rejects(
    wrapped('https://api.siliconflow.cn/v1/images/generations', {
      method: 'POST',
      body: JSON.stringify({ model: 'Qwen/Qwen3-8B', prompt: 'wrong model' })
    }),
    /IMAGE_MODEL_INVALID/
  );
  assert.equal(reserved.length, 2);
});

test('Live model auditor rejects a local Qwen over-limit before reserving another dispatch', async () => {
  const reserved = [];
  const recorded = [];
  const campaignGuard = {
    async reserveDispatch(kind, metadata) {
      reserved.push({ kind, metadata });
      return { dispatchId: reserved.length, sequence: reserved.length };
    },
    combinedSignal(signal) {
      return signal || new AbortController().signal;
    },
    async recordDispatchResult(dispatch, result) {
      recorded.push({ dispatch, result });
    }
  };
  const auditor = new LiveModelAuditor({ campaignGuard, maxQwenCalls: 1 });
  const wrapped = auditor.wrapQwenFetch(async () => new Response(JSON.stringify({
    choices: [],
    usage: { prompt_tokens: 7, completion_tokens: 3 }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  }));

  await wrapped('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'Qwen/Qwen3-8B', messages: [] })
  });
  await assert.rejects(
    wrapped('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'Qwen/Qwen3-8B', messages: [] })
    }),
    /QWEN_CALL_LIMIT/
  );
  assert.equal(reserved.length, 1);
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0].result.inputTokens, 7);
  assert.deepEqual(recorded[0].result.outputTokens, 3);
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
  await assert.rejects(
    auditor.inspectQwenRequest(router, {
      phase: 'router',
      runtimeVersion: 2,
      promptHash: 'ab'.repeat(32)
    }),
    /AGENT_LIVE_EVAL_PROMPT_HASH_MISMATCH:router/
  );
  const inspected = await auditor.inspectQwenRequest(router, {
    phase: 'router',
    runtimeVersion: 2,
    promptHash: requestPromptHash(router)
  });
  assert.equal(inspected.runtimeVersion, 2);
  await assert.rejects(
    auditor.inspectQwenRequest({ ...router, max_tokens: 1199 }, {
      phase: 'router',
      runtimeVersion: 2,
      promptHash: requestPromptHash({ ...router, max_tokens: 1199 })
    }),
    /AGENT_LIVE_EVAL_STAGE_TOKEN_LIMIT:router/
  );
});

test('Live model auditor requires the exact structured request prompt hash', async () => {
  const auditor = new LiveModelAuditor({ maxQwenCalls: 2 });
  const planner = {
    model: 'Qwen/Qwen3-8B',
    messages: [{ role: 'user', content: 'synthetic planner request' }],
    stream: false,
    enable_thinking: true,
    max_tokens: 2048,
    parallel_tool_calls: false,
    response_format: { type: 'json_object' },
    temperature: 0.6,
    top_p: 0.95,
    top_k: 20,
    min_p: 0
  };
  await assert.rejects(
    auditor.inspectQwenRequest(planner, {
      phase: 'planner',
      runtimeVersion: 2,
      promptHash: 'ab'.repeat(32)
    }),
    /AGENT_LIVE_EVAL_PROMPT_HASH_MISMATCH:planner/
  );
  const inspected = await auditor.inspectQwenRequest(planner, {
    phase: 'planner',
    runtimeVersion: 2,
    promptHash: requestPromptHash(planner)
  });
  assert.equal(inspected.promptHash, requestPromptHash(planner));
});

test('Live model auditor treats the bounded final summary as its own non-thinking phase', async () => {
  const auditor = new LiveModelAuditor({ maxQwenCalls: 2 });
  const finalSummary = {
    model: 'Qwen/Qwen3-8B',
    messages: [{ role: 'user', content: 'synthetic final summary request' }],
    stream: false,
    enable_thinking: false,
    max_tokens: 800,
    parallel_tool_calls: false,
    temperature: 0.2,
    top_p: 0.7
  };
  const inspected = await auditor.inspectQwenRequest(finalSummary, {
    phase: 'actor',
    runtimeStage: 'final_summary',
    runtimeVersion: 2,
    promptHash: requestPromptHash(finalSummary)
  });
  assert.equal(inspected.phase, 'final_summary');
  await assert.rejects(
    auditor.inspectQwenRequest({ ...finalSummary, max_tokens: 1024 }, {
      phase: 'actor',
      runtimeStage: 'final_summary',
      runtimeVersion: 2,
      promptHash: requestPromptHash({ ...finalSummary, max_tokens: 1024 })
    }),
    /AGENT_LIVE_EVAL_STAGE_TOKEN_LIMIT:final_summary/
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
