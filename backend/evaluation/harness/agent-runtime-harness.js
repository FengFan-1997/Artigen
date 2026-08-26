const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CreateBucketCommand, DeleteBucketCommand } = require('@aws-sdk/client-s3');

const { settleAgentBudget } = require('../../services/agent-billing-service');
const { createAgentModelProvider } = require('../../services/agent-model-provider');
const {
  createModelCallService
} = require('../../services/agent-model-runtime-service');
const { createAgentRunService } = require('../../services/agent-run-service');
const { createAgentWorkerService } = require('../../services/agent-worker-service');
const {
  FileAssetAdapter,
  S3AssetAdapter,
  openAsset,
  storeAsset
} = require('../../services/asset-storage');
const { AgentReplayOracle } = require('./agent-replay-oracle');
const { PNG_1X1 } = require('./artifact-fixtures');
const { HarnessSandboxProvider } = require('./harness-sandbox-provider');
const { RuntimeTestController } = require('./runtime-test-controller');
const {
  ScriptedSiliconFlowTransport
} = require('./scripted-siliconflow-transport');
const { RuntimeTraceSink } = require('./runtime-trace-sink');

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'waiting_user', 'paused']);

const isPrivateHarnessAddress = (value) => {
  const address = String(value || '').toLowerCase().replace(/\/\d+$/, '');
  if (!address) return true;
  if (['127.0.0.1', '::1'].includes(address)) return true;
  if (/^10\./.test(address) || /^192\.168\./.test(address)) return true;
  const private172 = address.match(/^172\.(\d{1,2})\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  return /^(?:fc|fd)[0-9a-f]{2}:/.test(address);
};

const isHarnessDatabaseSafe = ({
  databaseName = '',
  serverAddress = '',
  allowLocalDatabase = false,
  allowRemoteTestDatabase = false
} = {}) => {
  const database = String(databaseName || '').toLowerCase();
  const testScoped = /(?:^|_)(?:test|ci)(?:_|$)/.test(database);
  if (testScoped) {
    return isPrivateHarnessAddress(serverAddress) || allowRemoteTestDatabase === true;
  }
  const normalizedAddress = String(serverAddress || '');
  const loopback = !normalizedAddress ||
    /^(?:127\.0\.0\.1|::1)(?:\/\d+)?$/i.test(normalizedAddress);
  return allowLocalDatabase === true && loopback;
};

const harnessEnv = (base = {}, overrides = {}) => ({
  ...base,
  NODE_ENV: 'test',
  APP_ENV: 'test',
  AGENT_FEATURE_ENABLED: 'true',
  AGENT_WORKER_ENABLED: 'true',
  AGENT_RUNTIME_DRIVER: 'live',
  AGENT_RUNTIME_V2_ENABLED: 'true',
  AGENT_RUNTIME_V2_ROLLOUT_PERCENT: '100',
  DESIGN_PLANNER_V2_ENABLED: 'false',
  AGENT_ADAPTIVE_REASONING_ENABLED: 'true',
  AGENT_PROJECT_MEMORY_ENABLED: 'false',
  AGENT_PROVIDER_SCHEDULER_ENABLED: 'false',
  AGENT_MODEL_PROVIDER: 'siliconflow',
  AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
  AGENT_SILICONFLOW_BASE_URL: 'https://api.siliconflow.cn/v1',
  SILICONFLOW_API_KEY: 'harness-v3-scripted-provider',
  AGENT_SILICONFLOW_MIN_INTERVAL_MS: '0',
  AGENT_SILICONFLOW_REQUESTS_PER_MINUTE: '60',
  AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION: '20',
  AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION: '160',
  AGENT_MODEL_CONTEXT_TOKENS: '16384',
  AGENT_SANDBOX_PROVIDER: 'fixture',
  AGENT_SANDBOX_MODE: 'local',
  AGENT_SANDBOX_EGRESS_POLICY: 'restricted-v1',
  AGENT_BROWSER_MODE: 'full-approval-v1',
  AGENT_PUBLIC_CAPABILITIES: 'research,browser,files,shell,generate_images,subagents',
  AGENT_SUBAGENTS_ENABLED: 'true',
  AGENT_BETA_MODE: 'authenticated-v1',
  AGENT_DEFAULT_MAX_CREDITS: '50',
  AGENT_HARD_MAX_CREDITS: '50',
  AGENT_TRIAL_CREDITS: '0',
  AGENT_DAILY_FREE_CREDITS: '0',
  AGENT_SANDBOX_CREDITS_PER_MINUTE: '0',
  AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'c3'.repeat(32)}`,
  AGENT_WORKER_ID: `harness-worker-${crypto.randomUUID()}`,
  ...overrides
});

class ScriptedKolorsProvider {
  constructor({ trace = null, script = [] } = {}) {
    this.trace = trace;
    this.script = [...script];
    this.calls = [];
  }

  push(...entries) {
    this.script.push(...entries);
    return this;
  }

  async generate(request = {}) {
    const next = this.script.length ? this.script.shift() : {};
    const referenceCount = Array.isArray(request.references) ? request.references.length : 0;
    const call = {
      model: 'Kwai-Kolors/Kolors',
      filename: request.filename || next.filename || 'harness-image.png',
      referenceCount,
      ok: !next.throwCode
    };
    this.calls.push(call);
    if (next.throwCode) {
      const error = new Error(next.throwCode);
      error.code = next.throwCode;
      if (next.throwStatus) error.status = Number(next.throwStatus);
      throw error;
    }
    const output = {
      buffer: next.buffer || PNG_1X1,
      filename: call.filename,
      mimeType: next.mimeType || 'image/png',
      model: call.model,
      costCredits: next.costCredits ?? (referenceCount ? 12 : 8)
    };
    this.trace?.record('image.generated', {
      model: output.model,
      ok: true,
      credits: output.costCredits
    });
    return output;
  }
}

class AgentRuntimeHarness {
  static async create({
    pool,
    env = process.env,
    envOverrides = {},
    providerScript = [],
    kolorsScript = [],
    controller = null,
    trace = null,
    assetAdapter = null
  } = {}) {
    if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
      throw new TypeError('AGENT_RUNTIME_HARNESS_POOL_REQUIRED');
    }
    const configuredEnv = harnessEnv(env, envOverrides);
    const databaseIdentity = await pool.query(
      'SELECT current_database() AS database_name,inet_server_addr()::text AS server_address'
    );
    if (!isHarnessDatabaseSafe({
      databaseName: databaseIdentity.rows[0]?.database_name,
      serverAddress: databaseIdentity.rows[0]?.server_address,
      allowLocalDatabase: configuredEnv.AGENT_HARNESS_ALLOW_LOCAL_DATABASE === '1',
      allowRemoteTestDatabase: configuredEnv.AGENT_HARNESS_ALLOW_REMOTE_TEST_DATABASE === '1'
    })) {
      throw new Error('AGENT_RUNTIME_HARNESS_DATABASE_FORBIDDEN');
    }
    const instance = new AgentRuntimeHarness();
    instance.pool = pool;
    instance.trace = trace || new RuntimeTraceSink();
    instance.controller = controller || new RuntimeTestController({ trace: instance.trace });
    if (!instance.controller.trace) instance.controller.trace = instance.trace;
    instance.env = configuredEnv;
    instance.queue = [];
    instance.runIds = new Set();
    instance.conversationIds = new Set();
    instance.assetIds = new Set();
    instance.tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-runtime-harness-'));
    instance.sandbox = new HarnessSandboxProvider({
      rootDir: path.join(instance.tempRoot, 'sandboxes'),
      trace: instance.trace,
      controller: instance.controller
    });
    await fs.promises.mkdir(instance.sandbox.rootDir, { recursive: true });
    instance.transport = new ScriptedSiliconFlowTransport({
      script: providerScript,
      trace: instance.trace,
      controller: instance.controller,
      traceRequestObservations: false
    });
    instance.kolors = new ScriptedKolorsProvider({ trace: instance.trace, script: kolorsScript });
    instance.ownsAssetAdapter = !assetAdapter;
    instance.ownsAssetBucket = false;
    instance.assetBucketDeleted = false;
    instance.assetClientDestroyed = false;
    instance.assetAdapter = assetAdapter || await instance.createAssetAdapter();
    instance.assetStorage = {
      storeAsset: async (input) => {
        const stored = await storeAsset({
          ...input,
          pool: instance.pool,
          adapter: instance.assetAdapter
        });
        instance.assetIds.add(stored.assetId);
        return stored;
      },
      openAsset: (input) => openAsset({
        ...input,
        pool: instance.pool,
        adapter: instance.assetAdapter
      })
    };
    instance.modelCallService = createModelCallService({
      pool,
      env: instance.env,
      testController: instance.controller
    });
    instance.runService = createAgentRunService({
      pool,
      env: instance.env,
      testController: instance.controller,
      queuePublisher: {
        publish: async (runId) => {
          instance.queue.push(runId);
          instance.trace.record('queue.published', { runId, status: 'queued' });
        }
      }
    });
    instance.model = createAgentModelProvider({
      env: instance.env,
      fetchImpl: instance.transport.fetch,
      modelCallService: instance.modelCallService
    });
    instance.worker = instance.createWorker(instance.env.AGENT_WORKER_ID);
    instance.oracle = new AgentReplayOracle({ pool, runService: instance.runService });
    await instance.createUser();
    return instance;
  }

  createWorker(workerId) {
    const env = { ...this.env, AGENT_WORKER_ID: workerId };
    return createAgentWorkerService({
      pool: this.pool,
      runService: this.runService,
      env,
      sandbox: this.sandbox,
      model: this.model,
      modelCallService: this.modelCallService,
      integrationService: {},
      imageService: this.kolors,
      assetStorage: this.assetStorage,
      testController: this.controller
    });
  }

  async createAssetAdapter() {
    const minio = String(this.env.MINIO_TEST_ENDPOINT || '').trim();
    if (!minio) return new FileAssetAdapter(path.join(this.tempRoot, 'assets'));
    const configuredBucket = String(this.env.MINIO_TEST_BUCKET || '').trim();
    const adapter = new S3AssetAdapter({
      S3_ENDPOINT: minio,
      S3_BUCKET: configuredBucket || `artigen-harness-${crypto.randomUUID()}`,
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: this.env.MINIO_ROOT_USER || 'artigen-minio',
      S3_SECRET_ACCESS_KEY: this.env.MINIO_ROOT_PASSWORD || 'artigen-minio-secret',
      S3_FORCE_PATH_STYLE: '1'
    });
    await adapter.client.send(new CreateBucketCommand({ Bucket: adapter.bucket })).catch((error) => {
      if (!['BucketAlreadyExists', 'BucketAlreadyOwnedByYou'].includes(error?.name)) throw error;
    });
    this.ownsAssetBucket = !configuredBucket;
    return adapter;
  }

  async createUser() {
    const suffix = crypto.randomUUID();
    const inserted = await this.pool.query(
      `INSERT INTO users (legacy_user_id,email,display_name,status)
       VALUES ($1,$2,$3,'active') RETURNING id`,
      [`agent-harness-${suffix}`, `agent-harness-${suffix}@example.invalid`, 'Agent Harness V3']
    );
    this.userId = inserted.rows[0].id;
    await this.pool.query(
      `INSERT INTO wallets (user_id,available_credits,frozen_credits)
       VALUES ($1,500,0) ON CONFLICT (user_id) DO UPDATE SET available_credits=500,frozen_credits=0`,
      [this.userId]
    );
  }

  async createRun({
    objective = '给出一个简洁、可验证的设计建议，不创建文件。',
    deliverables = [],
    capabilities = { files: true, shell: true },
    browserConfig = {},
    maxCredits = 50,
    taskSpec = null,
    planWithModel = false,
    assetIds = []
  } = {}) {
    const conversation = await this.pool.query(
      `INSERT INTO design_conversations (user_id,title,auto_credit_cap)
       VALUES ($1,$2,$3) RETURNING id`,
      [this.userId, 'Harness V3 deterministic run', maxCredits]
    );
    const conversationId = conversation.rows[0].id;
    this.conversationIds.add(conversationId);
    const normalizedTaskSpec = planWithModel ? null : taskSpec || {
      version: 2,
      goal: objective,
      complexity: deliverables.length > 1 ? 'high' : 'medium',
      confidence: 1,
      constraints: [],
      assumptions: [],
      deliverables,
      allowedOrigins: browserConfig.allowedOrigins || [],
      acceptanceCriteria: [],
      skillIds: [],
      plan: [
        { id: 'produce', label: '完成目标', phase: 'production', status: 'in_progress' },
        { id: 'verify', label: '独立验证结果', phase: 'verification', status: 'pending' }
      ],
      budget: { maxCredits }
    };
    const created = await this.runService.createRun({
      userId: this.userId,
      objective,
      assetIds,
      maxCredits,
      capabilities,
      browserConfig,
      deliverables,
      taskSpec: normalizedTaskSpec,
      idempotencyKey: `harness-v3:${crypto.randomUUID()}`
    });
    this.runIds.add(created.runId);
    await this.pool.query(
      `INSERT INTO design_executions
        (conversation_id,route_kind,status,agent_run_id,max_credits,plan)
       VALUES ($1,'agent_run','queued',$2,$3,$4)`,
      [conversationId, created.runId, maxCredits, JSON.stringify(normalizedTaskSpec?.plan || [])]
    );
    return { ...created, conversationId };
  }

  async addInputAsset({ buffer, mimeType, metadata = {} } = {}) {
    return this.assetStorage.storeAsset({
      ownerUserId: this.userId,
      buffer: Buffer.from(buffer || ''),
      declaredMime: mimeType,
      allowedMimeTypes: [mimeType],
      retentionClass: 'temporary-input',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      metadata: { source: 'agent-harness-v3', ...metadata }
    });
  }

  async runToTerminal(runId, { maxPasses = 5 } = {}) {
    let result = null;
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const row = await this.pool.query('SELECT status FROM agent_runs WHERE id=$1', [runId]);
      if (!row.rowCount) throw new Error(`AGENT_RUNTIME_HARNESS_RUN_NOT_FOUND:${runId}`);
      if (TERMINAL.has(row.rows[0].status)) {
        await this.syncConversationExecution(runId, row.rows[0].status);
        return { result, snapshot: await this.snapshot(runId) };
      }
      try {
        result = await this.worker.processRun(runId);
      } catch (error) {
        // Production workers surface the original runtime error after atomically
        // recording a failed terminal state. A real harness must inspect that
        // terminal state instead of treating an expected safety rejection as a
        // harness infrastructure failure. Synthetic process crashes remain
        // observable so resume tests can take over explicitly.
        if (error?.name === 'RuntimeHarnessCrash') throw error;
        const failed = await this.pool.query(
          'SELECT status FROM agent_runs WHERE id=$1',
          [runId]
        );
        if (!failed.rowCount || !TERMINAL.has(failed.rows[0].status)) throw error;
        result = { claimed: true, status: failed.rows[0].status, error };
      }
    }
    throw new Error(`AGENT_RUNTIME_HARNESS_TERMINAL_TIMEOUT:${runId}`);
  }

  async resumeFromCrash(runId, { workerId = `harness-worker-${crypto.randomUUID()}` } = {}) {
    const current = await this.pool.query('SELECT status FROM agent_runs WHERE id=$1', [runId]);
    if (!current.rowCount) throw new Error(`AGENT_RUNTIME_HARNESS_RUN_NOT_FOUND:${runId}`);
    if (TERMINAL.has(current.rows[0].status)) {
      await this.syncConversationExecution(runId, current.rows[0].status);
      return { result: null, snapshot: await this.snapshot(runId) };
    }
    await this.pool.query(
      `UPDATE agent_runs SET lease_expires_at=clock_timestamp()-interval '1 second'
        WHERE id=$1 AND status IN ('provisioning','running','verifying')`,
      [runId]
    );
    await this.runService.expireStaleRuns({ limit: 100 });
    this.worker = this.createWorker(workerId);
    return this.runToTerminal(runId);
  }

  async takeOverLease(runId, options = {}) {
    return this.resumeFromCrash(runId, options);
  }

  async syncConversationExecution(runId, status) {
    const mapped = status === 'succeeded'
      ? 'succeeded'
      : status === 'cancelled'
        ? 'cancelled'
        : status === 'failed'
          ? 'failed'
          : status === 'waiting_user'
            ? 'waiting_authorization'
            : 'running';
    await this.pool.query(
      `UPDATE design_executions
          SET status=$2,updated_at=clock_timestamp(),
              finished_at=CASE
                WHEN $2 IN ('succeeded','failed','cancelled') THEN clock_timestamp()
                ELSE NULL
              END
        WHERE agent_run_id=$1`,
      [runId, mapped]
    );
  }

  async cancel(runId) {
    return this.runService.cancelRun({ userId: this.userId, runId });
  }

  async snapshot(runId) {
    return this.oracle.snapshot(runId);
  }

  async assertInvariants(runId) {
    this.controller.assertDrained();
    const current = await this.snapshot(runId);
    if (!['waiting_user', 'paused', 'cancelled'].includes(current.persistent.run.status)) {
      this.transport.assertDrained();
    }
    this.trace.assertProtocolInvariants({
      allowIncompleteToolCalls: ['waiting_user', 'paused', 'cancelled'].includes(
        current.persistent.run.status
      )
    });
    return this.oracle.assertInvariants(runId);
  }

  async cleanup() {
    const runIds = [...this.runIds];
    if (runIds.length) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        // PostgreSQL fires the append-only trigger for cascade deletes. Harness data is
        // isolated by exact UUIDs, so disable user triggers only inside this cleanup
        // transaction and always restore them before releasing the connection.
        await client.query('ALTER TABLE agent_events DISABLE TRIGGER USER');
        const unresolvedHolds = await client.query(
          `SELECT run_id FROM agent_budget_holds
            WHERE run_id=ANY($1::uuid[]) AND status='held'
            ORDER BY created_at ASC`,
          [runIds]
        );
        for (const hold of unresolvedHolds.rows) {
          await settleAgentBudget({
            client,
            runId: hold.run_id,
            actualCredits: 0,
            refundable: true,
            reason: 'harness_cleanup'
          });
        }
        await client.query('DELETE FROM agent_budget_holds WHERE run_id=ANY($1::uuid[])', [runIds]);
        await client.query('DELETE FROM agent_runs WHERE id=ANY($1::uuid[])', [runIds]);
        await client.query('ALTER TABLE agent_events ENABLE TRIGGER USER');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        await client.query('ALTER TABLE agent_events ENABLE TRIGGER USER').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    if (this.conversationIds.size) {
      await this.pool.query(
        'DELETE FROM design_conversations WHERE id=ANY($1::uuid[])',
        [[...this.conversationIds]]
      );
    }
    if (this.userId) {
      const ownedAssets = await this.pool.query(
        'SELECT uri FROM assets WHERE owner_user_id=$1 ORDER BY created_at,id',
        [this.userId]
      );
      for (const uri of new Set(ownedAssets.rows.map((row) => String(row.uri || '')).filter(Boolean))) {
        await this.assetAdapter.delete(uri);
      }
      await this.pool.query('DELETE FROM assets WHERE owner_user_id=$1', [this.userId]);
      // Financial audit rows intentionally retain their user foreign key. CI uses an
      // ephemeral database; on a developer database, anonymize and disable the exact
      // harness account instead of weakening append-only ledger guarantees.
      await this.pool.query(
        `UPDATE users SET email=NULL,display_name='Retired Agent Harness',status='disabled'
          WHERE id=$1`,
        [this.userId]
      );
      const wallet = await this.pool.query(
        'SELECT frozen_credits FROM wallets WHERE user_id=$1',
        [this.userId]
      );
      if (Number(wallet.rows[0]?.frozen_credits || 0) !== 0) {
        throw new Error('HARNESS_CLEANUP_LEFT_FROZEN_CREDITS');
      }
    }
    await this.sandbox.cleanup();
    await fs.promises.rm(this.tempRoot, { recursive: true, force: true });
    if (
      this.ownsAssetBucket &&
      !this.assetBucketDeleted &&
      this.assetAdapter?.client &&
      this.assetAdapter?.bucket
    ) {
      await this.assetAdapter.client.send(new DeleteBucketCommand({
        Bucket: this.assetAdapter.bucket
      })).catch((error) => {
        if (!['NoSuchBucket', 'NotFound'].includes(error?.name)) throw error;
      });
      this.assetBucketDeleted = true;
    }
    if (
      this.ownsAssetAdapter &&
      !this.assetClientDestroyed &&
      typeof this.assetAdapter?.client?.destroy === 'function'
    ) {
      this.assetAdapter.client.destroy();
      this.assetClientDestroyed = true;
    }
  }
}

module.exports = {
  AgentRuntimeHarness,
  ScriptedKolorsProvider,
  harnessEnv,
  isHarnessDatabaseSafe
};
