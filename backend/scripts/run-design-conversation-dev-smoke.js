#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { readMacOsKeychainSecret } = require('../lib/local-keychain');

const KEYCHAIN_SERVICE = String(
  process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || 'artigen-agent-dev-worker'
).trim();
if (KEYCHAIN_SERVICE !== 'artigen-agent-dev-worker') {
  console.error('DESIGN_CONVERSATION_DEV_SMOKE_KEYCHAIN_SERVICE_INVALID');
  process.exit(64);
}

const secretNames = [
  'DATABASE_URL',
  'AGENT_PAYLOAD_ENCRYPTION_KEY',
  'TASK_PAYLOAD_ENCRYPTION_KEY',
  'SILICONFLOW_API_KEY',
  'AGENT_WORKER_RELAY_SECRET',
  'AGENT_WORKER_RELAY_URL',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY'
];
const missing = [];
for (const name of secretNames) {
  const value = readMacOsKeychainSecret({ service: KEYCHAIN_SERVICE, account: name });
  if (!value) missing.push(name);
  else process.env[name] = value;
}
if (missing.length) {
  console.error(`DESIGN_CONVERSATION_DEV_SMOKE_KEYCHAIN_INCOMPLETE:${missing.join(',')}`);
  process.exit(78);
}

Object.assign(process.env, {
  NODE_ENV: 'production',
  APP_ENV: 'dev',
  DESIGN_CONVERSATION_ENABLED: 'true',
  DESIGN_CONVERSATION_WORKER_ENABLED: 'true',
  DESIGN_CONVERSATION_AUTO_CREDIT_CAP: '50',
  DESIGN_CONVERSATION_RETENTION_DAYS: '30',
  DESIGN_CONVERSATION_AUTH_IDLE_MINUTES: '30',
  PAID_FEATURES_ENABLED: 'true',
  AI_DESIGN_TASK_V2_ENABLED: 'true',
  AI_DESIGN_TASK_V2_ROLLOUT_PERCENT: '100',
  AI_OUTPUT_ALLOWED_HOSTS: 's3.siliconflow.cn',
  AGENT_FEATURE_ENABLED: 'true',
  AGENT_WORKER_ENABLED: '1',
  AGENT_BETA_MODE: 'authenticated-v1',
  AGENT_RUNTIME_DRIVER: 'live',
  AGENT_MODEL_PROVIDER: 'siliconflow',
  AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
  AGENT_SILICONFLOW_BASE_URL: 'https://api.siliconflow.cn/v1',
  AGENT_SILICONFLOW_ENABLE_THINKING: 'false',
  AGENT_SANDBOX_PROVIDER: 'cua',
  AGENT_SANDBOX_MODE: 'local',
  AGENT_CUA_IMAGE_REF: 'artigen/cua-xfce:0.1.15-tools-v2',
  AGENT_CUA_IMAGE_HAS_TOOLCHAIN: 'true',
  AGENT_SANDBOX_EGRESS_POLICY: 'restricted-v1',
  AGENT_BROWSER_MODE: 'full-approval-v1',
  AGENT_WORKER_ID: 'artigen-design-conversation-dev-smoke-publisher',
  AGENT_PUBLIC_CAPABILITIES: 'files,shell,browser,generate_images',
  AGENT_MAX_MINUTES: '45',
  AGENT_MAX_STEPS: '120',
  ASSET_STORAGE_DRIVER: 's3',
  S3_FORCE_PATH_STYLE: '1'
});

const { getPool } = require('../db/pool');
const {
  callSiliconFlowChat,
  callSiliconFlowImageGenerate
} = require('../lib/ai-providers');
const {
  createDesignConversationService,
  TEXT_MODEL,
  IMAGE_MODEL
} = require('../services/design-conversation-service');
const {
  createAgentRunService,
  TERMINAL_STATUSES
} = require('../services/agent-run-service');
const { AgentQueuePublisher } = require('../services/agent-queue-service');
const {
  createAiDesignExecutor,
  validateAiDesignTask
} = require('../services/ai-design-service');
const { createConfiguredGenerationProvider } = require('../services/generation-provider');
const {
  GENERATION_IMAGE_MODEL,
  STANDARD_PROFILE_ID
} = require('../services/generation-profiles');
const billing = require('../services/billing-service');
const assets = require('../services/asset-storage');
const {
  TaskLeaseQueue,
  markProviderDispatched
} = require('../services/task-queue-service');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const outputRoot = path.join(
  PROJECT_ROOT,
  '.artifacts',
  `design-conversation-dev-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`
);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const log = (event) => console.log(JSON.stringify(event));
let currentStage = 'bootstrap';
const stage = (name) => {
  currentStage = name;
  log({ event: 'smoke.stage', stage: name });
};

const readBody = async (body, maximumBytes) => {
  const chunks = [];
  let byteSize = 0;
  for await (const rawChunk of assets.toReadable(body)) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    byteSize += chunk.length;
    if (byteSize > maximumBytes) throw new Error('DESIGN_CONVERSATION_SMOKE_ARTIFACT_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const createSmokeUsers = async (pool) => {
  const definitions = [
    ['image', 'conversation-image-smoke@dev.artigen.invalid', 'Conversation Image DEV Smoke'],
    ['agentA', 'conversation-agent-a@dev.artigen.invalid', 'Conversation Agent A DEV Smoke'],
    ['agentB', 'conversation-agent-b@dev.artigen.invalid', 'Conversation Agent B DEV Smoke']
  ];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const users = {};
    for (const [key, email, displayName] of definitions) {
      const inserted = await client.query(
        `INSERT INTO users (email,display_name,status)
         VALUES ($1,$2,'active')
         ON CONFLICT (email) DO UPDATE
           SET status='active',display_name=EXCLUDED.display_name,updated_at=now()
         RETURNING id`,
        [email, displayName]
      );
      const userId = inserted.rows[0].id;
      const activeRuns = await client.query(
        `SELECT 1 FROM agent_runs
          WHERE user_id=$1
            AND status IN ('draft','queued','provisioning','running','waiting_user','paused','verifying')
          LIMIT 1`,
        [userId]
      );
      const activeTasks = await client.query(
        `SELECT 1 FROM tool_tasks task
          JOIN credit_holds hold ON hold.task_id=task.id
         WHERE task.user_id=$1 AND task.status IN ('queued','running') AND hold.status='held'
         LIMIT 1`,
        [userId]
      );
      if (activeRuns.rowCount || activeTasks.rowCount) {
        throw new Error(`DESIGN_CONVERSATION_SMOKE_USER_BUSY:${key}`);
      }
      await client.query(
        `INSERT INTO wallets (user_id,available_credits,frozen_credits)
         VALUES ($1,200,0)
         ON CONFLICT (user_id) DO UPDATE
           SET available_credits=GREATEST(wallets.available_credits,200),updated_at=now()`,
        [userId]
      );
      users[key] = userId;
    }
    await client.query('COMMIT');
    return users;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const waitForExecution = async ({ service, userId, conversationId, timeoutMs = 120_000 }) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await service.processNextJob();
    const conversation = await service.getConversation({ userId, conversationId });
    if (conversation.executions.length) return conversation.executions.at(-1);
    await sleep(500);
  }
  throw new Error(`DESIGN_CONVERSATION_SMOKE_PLANNING_TIMEOUT:${conversationId}`);
};

const activateAndClaimPreparedTask = async ({ pool, taskId, leaseOwner }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `UPDATE tool_tasks task SET
         inputs_ready=true,
         status='running',
         lease_owner=$2,
         lease_expires_at=clock_timestamp()+interval '90 seconds',
         heartbeat_at=clock_timestamp(),
         attempt_count=task.attempt_count+1,
         started_at=COALESCE(task.started_at,now()),
         updated_at=now()
       WHERE task.id=$1
         AND task.status='queued'
         AND task.inputs_ready=false
         AND task.cancel_requested_at IS NULL
         AND task.provider_dispatched_at IS NULL
         AND EXISTS (
           SELECT 1 FROM credit_holds hold
            WHERE hold.task_id=task.id
              AND hold.status='held'
              AND hold.expires_at>clock_timestamp()
         )
       RETURNING task.*`,
      [taskId, leaseOwner]
    );
    if (!claimed.rowCount) {
      throw new Error(`DESIGN_CONVERSATION_SMOKE_TASK_CLAIM_FAILED:${taskId}`);
    }
    await client.query('COMMIT');
    return claimed.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const planConversation = async ({ service, userId, message, expectedRoute }) => {
  const conversation = await service.createConversation({ userId });
  await service.addMessage({
    userId,
    conversationId: conversation.conversationId,
    message,
    attachments: []
  });
  const execution = await waitForExecution({
    service,
    userId,
    conversationId: conversation.conversationId
  });
  if (execution.routeKind !== expectedRoute || execution.status !== 'queued') {
    throw new Error(
      `DESIGN_CONVERSATION_SMOKE_ROUTE_INVALID:${expectedRoute}:${execution.routeKind}:${execution.status}`
    );
  }
  log({
    event: 'conversation.planned',
    conversationId: conversation.conversationId,
    executionId: execution.executionId,
    routeKind: execution.routeKind,
    executor: execution.plan?.executor || null
  });
  return { conversation, execution };
};

const verifyStoredAsset = async ({ pool, userId, assetId, expectedSha256, expectedBytes, filename }) => {
  const opened = await assets.openAsset({ assetId, ownerUserId: userId, pool });
  if (opened.record.storage_driver !== 's3') {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_STORAGE_NOT_SHARED:${assetId}`);
  }
  const buffer = await readBody(opened.body, 80 * 1024 * 1024);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  if (expectedSha256 && sha256 !== expectedSha256) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_DIGEST_MISMATCH:${assetId}`);
  }
  if (expectedBytes && buffer.length !== Number(expectedBytes)) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_SIZE_MISMATCH:${assetId}`);
  }
  const safeFilename = String(filename || `${assetId}.bin`).replace(/[^A-Za-z0-9._-]/g, '_');
  const localPath = path.join(outputRoot, safeFilename);
  await fs.promises.mkdir(outputRoot, { recursive: true });
  await fs.promises.writeFile(localPath, buffer, { mode: 0o600 });
  return {
    assetId,
    mimeType: opened.record.mime_type,
    byteSize: buffer.length,
    sha256,
    width: Number(opened.record.width || 0),
    height: Number(opened.record.height || 0),
    storageDriver: opened.record.storage_driver,
    localPath
  };
};

const runToolImageExecution = async ({
  pool,
  conversationService,
  userId,
  planned,
  imageCalls
}) => {
  const options = validateAiDesignTask({
    operation: planned.execution.operation,
    options: planned.execution.plan.options,
    inputCount: 0,
    env: process.env
  });
  if (options.profileId !== STANDARD_PROFILE_ID) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_IMAGE_PROFILE_INVALID:${options.profileId}`);
  }
  const quote = await billing.createQuote({ userId, sku: 'ai-design.generate.v1' });
  if (quote.credits > 50) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_IMAGE_BUDGET_EXCEEDED:${quote.credits}`);
  }
  await conversationService.recordToolQuote({
    userId,
    conversationId: planned.conversation.conversationId,
    executionId: planned.execution.executionId,
    quoteId: quote.quoteId
  });
  const task = await billing.createTaskWithHold({
    userId,
    toolId: 'ai-design',
    operation: 'generate',
    options,
    storedOptions: {
      profileId: options.profileId,
      aspectRatio: options.aspectRatio,
      ...(Number.isInteger(options.seed) ? { seed: options.seed } : {})
    },
    taskPayload: { options },
    payloadTtlMinutes: 30,
    inputAssetIds: [],
    inputRetentionHours: 30 * 24,
    deferInputAssets: true,
    quoteId: quote.quoteId,
    sku: quote.sku,
    idempotencyKey: `design-conversation-image-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
  });
  await conversationService.attachExecutionTarget({
    userId,
    conversationId: planned.conversation.conversationId,
    executionId: planned.execution.executionId,
    toolTaskId: task.taskId
  });

  const tracedImageGenerate = async (input) => {
    const trace = {
      requestedModel: String(input?.model || ''),
      referenceCount: Array.isArray(input?.images) ? input.images.length : 0
    };
    imageCalls.push(trace);
    try {
      const response = await callSiliconFlowImageGenerate(input);
      trace.modelUsed = response?.modelUsed || null;
      return response;
    } catch (error) {
      trace.error = {
        code: String(error?.code || error?.message || 'PROVIDER_FAILED').slice(0, 120),
        status: Number(error?.status || 0) || null,
        modelTried: String(error?.modelTried || input?.model || '').slice(0, 120),
        message: String(error?.bodyPreview || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 300)
      };
      log({ event: 'conversation.image.provider_failed', ...trace.error });
      throw error;
    }
  };
  const provider = createConfiguredGenerationProvider({
    imageGenerate: tracedImageGenerate,
    chatGenerate: callSiliconFlowChat,
    env: process.env
  });
  const executor = createAiDesignExecutor({
    provider,
    markRunning: billing.markTaskRunning,
    markProviderDispatched: (input) => markProviderDispatched({ ...input, pool }),
    settleTask: billing.settleTask,
    releaseTask: billing.releaseTask,
    getTask: billing.getTask,
    deleteOutputAsset: assets.deleteOwnedAssetNow,
    env: process.env
  });
  const queue = new TaskLeaseQueue({
    pool,
    maxConcurrency: 1,
    releaseTask: billing.releaseTask,
    requestTaskCancellation: billing.requestTaskCancellation,
    cancelTask: billing.cancelTask,
    env: process.env
  });
  queue.register('ai-design', 'generate', executor, { payloadRequired: true });
  const claimedTask = await activateAndClaimPreparedTask({
    pool,
    taskId: task.taskId,
    leaseOwner: queue.leaseOwner
  });
  await queue.executeClaimedTask(claimedTask);

  const finished = await billing.getTask({ userId, taskId: task.taskId });
  if (finished.status !== 'success') {
    throw new Error([
      'DESIGN_CONVERSATION_SMOKE_IMAGE_TASK_FAILED',
      finished.error?.code || finished.status,
      imageCalls[0]?.error?.code || 'NO_PROVIDER_TRACE'
    ].join(':'));
  }
  if (
    imageCalls.length !== 1 ||
    imageCalls[0].requestedModel !== GENERATION_IMAGE_MODEL ||
    imageCalls[0].modelUsed !== GENERATION_IMAGE_MODEL ||
    imageCalls[0].referenceCount !== 0
  ) {
    throw new Error('DESIGN_CONVERSATION_SMOKE_IMAGE_MODEL_INVALID');
  }
  const resultAssets = finished.result?.assets || [];
  if (resultAssets.length !== 1 || !resultAssets[0].assetId) {
    throw new Error('DESIGN_CONVERSATION_SMOKE_IMAGE_OUTPUT_INVALID');
  }
  const stored = await verifyStoredAsset({
    pool,
    userId,
    assetId: resultAssets[0].assetId,
    expectedBytes: resultAssets[0].byteSize,
    filename: 'conversation-fast-kolors.png'
  });
  if (!stored.width || !stored.height || stored.width !== stored.height) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_IMAGE_RATIO_INVALID:${stored.width}x${stored.height}`);
  }
  const settlement = await pool.query(
    `SELECT hold.status,hold.credits,task.charged_credits,
       (SELECT count(*)::int FROM wallet_ledger ledger
         WHERE ledger.reference_type='tool_task' AND ledger.reference_id=task.id::text
           AND ledger.entry_type='charge') AS charge_count
       FROM tool_tasks task JOIN credit_holds hold ON hold.task_id=task.id
      WHERE task.id=$1`,
    [task.taskId]
  );
  const row = settlement.rows[0] || {};
  if (
    row.status !== 'settled' ||
    Number(row.charged_credits) !== Number(quote.credits) ||
    Number(row.charge_count) !== 1
  ) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_IMAGE_SETTLEMENT_INVALID:${task.taskId}`);
  }
  const execution = await conversationService.getExecution({
    userId,
    conversationId: planned.conversation.conversationId,
    executionId: planned.execution.executionId
  });
  if (execution.status !== 'succeeded' || execution.toolTaskId !== task.taskId) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_IMAGE_EXECUTION_INVALID:${execution.status}`);
  }
  const evidence = {
    conversationId: planned.conversation.conversationId,
    executionId: planned.execution.executionId,
    taskId: task.taskId,
    routeKind: execution.routeKind,
    profileId: options.profileId,
    imageModel: imageCalls[0].modelUsed,
    quotedCredits: quote.credits,
    chargedCredits: Number(row.charged_credits),
    chargeCount: Number(row.charge_count),
    artifact: stored
  };
  log({ event: 'conversation.image.succeeded', ...evidence });
  return evidence;
};

const startAgentExecution = async ({ runService, conversationService, userId, planned, label }) => {
  const plan = planned.execution.plan || {};
  const quote = await runService.quote({
    userId,
    objective: plan.objective,
    capabilities: plan.capabilities,
    browserConfig: plan.browserConfig,
    deliverables: plan.deliverables,
    maxCredits: planned.execution.maxCredits
  });
  if (!quote.canStart || quote.maximumCredits > 50) {
    throw new Error(
      `DESIGN_CONVERSATION_SMOKE_AGENT_QUOTE_BLOCKED:${label}:${quote.maximumCredits}:${quote.canStart}`
    );
  }
  const run = await runService.createRun({
    userId,
    objective: plan.objective,
    assetIds: [],
    maxCredits: quote.maximumCredits,
    capabilities: plan.capabilities,
    browserConfig: plan.browserConfig,
    deliverables: plan.deliverables,
    idempotencyKey: `design-conversation-${label}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
  });
  await conversationService.attachExecutionTarget({
    userId,
    conversationId: planned.conversation.conversationId,
    executionId: planned.execution.executionId,
    agentRunId: run.runId
  });
  log({
    event: 'conversation.agent.created',
    label,
    conversationId: planned.conversation.conversationId,
    executionId: planned.execution.executionId,
    runId: run.runId,
    maximumCredits: quote.maximumCredits
  });
  return { label, userId, planned, quote, runId: run.runId };
};

const waitForAgentRuns = async ({ pool, runService, entries }) => {
  const deadline = Date.now() + 55 * 60 * 1000;
  const lastStatus = new Map();
  let observedQueuedBehindActive = false;
  let maxQueueDepth = 0;
  while (Date.now() < deadline) {
    const runs = await Promise.all(entries.map((entry) => runService.getRun({
      userId: entry.userId,
      runId: entry.runId
    })));
    for (const [index, run] of runs.entries()) {
      if (lastStatus.get(entries[index].runId) !== run.status) {
        lastStatus.set(entries[index].runId, run.status);
        log({
          event: 'conversation.agent.status',
          label: entries[index].label,
          runId: entries[index].runId,
          status: run.status
        });
      }
      if (run.status === 'waiting_user') {
        throw new Error(`DESIGN_CONVERSATION_SMOKE_UNEXPECTED_APPROVAL:${entries[index].runId}`);
      }
    }
    const statuses = runs.map((run) => run.status);
    const activeCount = statuses.filter((status) =>
      ['provisioning', 'running', 'verifying'].includes(status)
    ).length;
    const queuedCount = statuses.filter((status) => status === 'queued').length;
    if (activeCount === 1 && queuedCount === 1) observedQueuedBehindActive = true;
    const serviceStatus = await runService.getServiceStatus();
    maxQueueDepth = Math.max(maxQueueDepth, Number(serviceStatus.queueDepth || 0));
    if (runs.every((run) => TERMINAL_STATUSES.has(run.status))) {
      if (!observedQueuedBehindActive) {
        const history = await pool.query(
          `SELECT run_id,event_type,phase FROM agent_events
            WHERE run_id=ANY($1::uuid[]) AND event_type IN ('run.queued','run.started')`,
          [entries.map((entry) => entry.runId)]
        );
        const queuedEvents = new Set(
          history.rows.filter((row) => row.event_type === 'run.queued').map((row) => row.run_id)
        );
        observedQueuedBehindActive = queuedEvents.size === entries.length && maxQueueDepth >= 1;
      }
      return { runs, observedQueuedBehindActive, maxQueueDepth };
    }
    await sleep(2000);
  }
  throw new Error('DESIGN_CONVERSATION_SMOKE_AGENT_TIMEOUT');
};

const verifyAgentRun = async ({ pool, runService, entry, run }) => {
  if (run.status !== 'succeeded') {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_AGENT_FAILED:${entry.runId}:${run.error?.code || run.status}`);
  }
  if (run.model?.name !== TEXT_MODEL) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_AGENT_MODEL_INVALID:${run.model?.name || 'none'}`);
  }
  if (!Array.isArray(run.artifacts) || run.artifacts.length < 2) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_AGENT_ARTIFACT_COUNT:${entry.runId}`);
  }
  if (run.artifacts.some((artifact) => artifact.verificationStatus !== 'passed' || !artifact.assetId)) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_AGENT_ARTIFACT_UNVERIFIED:${entry.runId}`);
  }
  const roles = new Set(run.artifacts.map((artifact) => artifact.role));
  if (!roles.has('source') || !roles.has('pdf')) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_AGENT_DELIVERABLES_INVALID:${entry.runId}`);
  }
  const verifiedArtifacts = [];
  for (const artifact of run.artifacts) {
    verifiedArtifacts.push(await verifyStoredAsset({
      pool,
      userId: entry.userId,
      assetId: artifact.assetId,
      expectedSha256: artifact.sha256,
      expectedBytes: artifact.byteSize,
      filename: `${entry.label}-${artifact.filename}`
    }));
  }
  const hold = await pool.query(
    `SELECT hold.status,hold.max_credits,hold.charged_credits,
       (SELECT count(*)::int FROM agent_budget_holds settlement
         WHERE settlement.run_id=hold.run_id) AS settlement_record_count,
       (SELECT count(*)::int FROM wallet_ledger ledger
         WHERE ledger.reference_type='agent_run' AND ledger.reference_id=hold.run_id::text
           AND ledger.entry_type='hold') AS hold_count,
       (SELECT count(*)::int FROM wallet_ledger ledger
         WHERE ledger.reference_type='agent_run' AND ledger.reference_id=hold.run_id::text
           AND ledger.entry_type='charge') AS charge_count,
       (SELECT count(*)::int FROM wallet_ledger ledger
         WHERE ledger.reference_type='agent_run' AND ledger.reference_id=hold.run_id::text
           AND ledger.entry_type='release') AS release_count
       FROM agent_budget_holds hold WHERE hold.run_id=$1`,
    [entry.runId]
  );
  const row = hold.rows[0] || {};
  if (
    row.status !== 'settled' ||
    Number(row.charged_credits) < 0 ||
    Number(row.charged_credits) > 50 ||
    Number(row.settlement_record_count) !== 1 ||
    Number(row.hold_count) !== 1 ||
    Number(row.charge_count) > 1 ||
    Number(row.release_count) > 1
  ) {
    throw new Error(`DESIGN_CONVERSATION_SMOKE_AGENT_SETTLEMENT_INVALID:${entry.runId}`);
  }
  return {
    label: entry.label,
    conversationId: entry.planned.conversation.conversationId,
    executionId: entry.planned.execution.executionId,
    runId: entry.runId,
    status: run.status,
    model: run.model.name,
    maximumCredits: entry.quote.maximumCredits,
    chargedCredits: Number(row.charged_credits),
    settlementRecordCount: Number(row.settlement_record_count),
    ledgerEvents: {
      hold: Number(row.hold_count),
      charge: Number(row.charge_count),
      release: Number(row.release_count)
    },
    artifacts: verifiedArtifacts
  };
};

const main = async () => {
  const pool = getPool();
  const queuePublisher = new AgentQueuePublisher({ env: process.env });
  const plannerCalls = [];
  const imageCalls = [];
  const tracedPlanner = async (input) => {
    if (input?.model !== TEXT_MODEL) {
      throw new Error(`DESIGN_CONVERSATION_SMOKE_PLANNER_MODEL_REQUEST_INVALID:${input?.model}`);
    }
    const startedAt = Date.now();
    const response = await callSiliconFlowChat(input);
    plannerCalls.push({
      requestedModel: input.model,
      modelUsed: response?.model || null,
      elapsedMs: Date.now() - startedAt
    });
    if (response?.model !== TEXT_MODEL) {
      throw new Error(`DESIGN_CONVERSATION_SMOKE_PLANNER_MODEL_RESPONSE_INVALID:${response?.model}`);
    }
    return response;
  };
  const conversationService = createDesignConversationService({
    pool,
    env: process.env,
    chatGenerate: tracedPlanner,
    workerId: `design-conversation-dev-smoke:${process.pid}`
  });
  const runService = createAgentRunService({ pool, env: process.env, queuePublisher });
  const activeAgentEntries = [];
  try {
    stage('readiness');
    const migration = await pool.query('SELECT COALESCE(max(name),\'\') AS name FROM pgmigrations');
    const migrationName = String(migration.rows[0]?.name || '');
    if (!migrationName.startsWith('021_')) {
      throw new Error(`DESIGN_CONVERSATION_SMOKE_MIGRATION_NOT_READY:${migrationName || 'none'}`);
    }
    const worker = await runService.getServiceStatus();
    if (
      !worker.enabled ||
      !worker.workerOnline ||
      !worker.browserReady ||
      !worker.egressVerified ||
      !worker.desktopRelayReady ||
      worker.accessMode !== 'authenticated-v1' ||
      worker.modelFamily !== TEXT_MODEL
    ) {
      throw new Error(`DESIGN_CONVERSATION_SMOKE_RUNTIME_NOT_READY:${JSON.stringify(worker)}`);
    }
    if (IMAGE_MODEL !== GENERATION_IMAGE_MODEL) {
      throw new Error('DESIGN_CONVERSATION_SMOKE_IMAGE_MODEL_CONSTANT_DRIFT');
    }
    stage('users');
    const users = await createSmokeUsers(pool);
    stage('plan-image');
    const imagePlanned = await planConversation({
      service: conversationService,
      userId: users.image,
      expectedRoute: 'tool_task',
      message: [
        '请直接生成一张 1:1 的 Artigen 设计 Agent 品牌主视觉稿：',
        '深墨色背景、酸性绿轨迹、克制的编辑设计感、清晰焦点和大面积留白，',
        '不要文字、水印或界面截图。信息已经充分，不要追问，按推荐直接执行。'
      ].join('')
    });
    if (imagePlanned.execution.toolId !== 'ai-design' || imagePlanned.execution.operation !== 'generate') {
      throw new Error('DESIGN_CONVERSATION_SMOKE_IMAGE_TOOL_INVALID');
    }
    stage('execute-image');
    const imageEvidence = await runToolImageExecution({
      pool,
      conversationService,
      userId: users.image,
      planned: imagePlanned,
      imageCalls
    });

    const agentMessages = [
      {
        userId: users.agentA,
        label: 'agent-a',
        message: [
          '访问并只读查看 https://example.com/ 的页面标题和正文。',
          '在 /tmp/artigen-workspace 创建 conversation-agent-a.md，写一份简短中文页面体验报告；',
          '然后必须运行 artigen-report-pdf，把该 Markdown 转成 ',
          '/tmp/artigen-workspace/conversation-agent-a.pdf。',
          '检查两个文件后，将 Markdown 以 source/text/markdown 声明，将 PDF 以 pdf/application/pdf 声明，',
          '两个交付物的 sources 都填写 Example Domain 和 https://example.com/。',
          '不要登录、不要填写表单、不要改变外部状态；信息充分，按推荐直接执行。'
        ].join('')
      },
      {
        userId: users.agentB,
        label: 'agent-b',
        message: [
          '访问并只读查看 https://example.com/ 的页面标题和正文。',
          '在 /tmp/artigen-workspace 创建 conversation-agent-b.md，写一份简短中文内容层级报告；',
          '然后必须运行 artigen-report-pdf，把该 Markdown 转成 ',
          '/tmp/artigen-workspace/conversation-agent-b.pdf。',
          '检查两个文件后，将 Markdown 以 source/text/markdown 声明，将 PDF 以 pdf/application/pdf 声明，',
          '两个交付物的 sources 都填写 Example Domain 和 https://example.com/。',
          '不要登录、不要填写表单、不要改变外部状态；信息充分，按推荐直接执行。'
        ].join('')
      }
    ];
    stage('plan-agents');
    const plannedAgents = [];
    for (const request of agentMessages) {
      plannedAgents.push({
        ...request,
        planned: await planConversation({
          service: conversationService,
          userId: request.userId,
          message: request.message,
          expectedRoute: 'agent_run'
        })
      });
    }
    stage('start-agents');
    const startedAgents = await Promise.all(plannedAgents.map((entry) => startAgentExecution({
      runService,
      conversationService,
      userId: entry.userId,
      planned: entry.planned,
      label: entry.label
    })));
    activeAgentEntries.push(...startedAgents);
    stage('wait-agents');
    const completed = await waitForAgentRuns({ pool, runService, entries: startedAgents });
    if (worker.concurrency === 1 && !completed.observedQueuedBehindActive) {
      throw new Error('DESIGN_CONVERSATION_SMOKE_QUEUE_FALLBACK_NOT_OBSERVED');
    }
    stage('verify-agents');
    const agentEvidence = [];
    for (const [index, entry] of startedAgents.entries()) {
      const evidence = await verifyAgentRun({
        pool,
        runService,
        entry,
        run: completed.runs[index]
      });
      const execution = await conversationService.getExecution({
        userId: entry.userId,
        conversationId: entry.planned.conversation.conversationId,
        executionId: entry.planned.execution.executionId
      });
      if (execution.status !== 'succeeded' || execution.agentRunId !== entry.runId) {
        throw new Error(`DESIGN_CONVERSATION_SMOKE_AGENT_EXECUTION_INVALID:${entry.runId}`);
      }
      agentEvidence.push(evidence);
    }
    const finalStatus = await runService.getServiceStatus();
    if (!finalStatus.workerOnline || finalStatus.queueDepth !== 0) {
      throw new Error('DESIGN_CONVERSATION_SMOKE_WORKER_NOT_IDLE');
    }
    // Render DEV and this smoke process intentionally consume the same durable
    // planner queue. Either worker may claim a message, so local call tracing
    // is only a subset; the database is the source of truth for all jobs.
    const planningJobsResult = await pool.query(
      `SELECT conversation_id,status,attempt_count,COALESCE(error_code,'') AS error_code
         FROM design_planning_jobs
        WHERE conversation_id=ANY($1::uuid[])
        ORDER BY conversation_id`,
      [[
        imagePlanned.conversation.conversationId,
        ...plannedAgents.map((entry) => entry.planned.conversation.conversationId)
      ]]
    );
    const planningJobs = planningJobsResult.rows.map((row) => ({
      conversationId: row.conversation_id,
      status: row.status,
      attemptCount: Number(row.attempt_count || 0),
      errorCode: row.error_code || null
    }));
    if (
      planningJobs.length !== 3 ||
      planningJobs.some((job) => job.status !== 'succeeded' || job.attemptCount < 1 || job.attemptCount > 2)
    ) {
      throw new Error(`DESIGN_CONVERSATION_SMOKE_PLANNER_JOB_INVALID:${JSON.stringify(planningJobs)}`);
    }
    if (plannerCalls.length > 6 || plannerCalls.some((call) =>
      call.requestedModel !== TEXT_MODEL || call.modelUsed !== TEXT_MODEL
    )) {
      throw new Error(
        `DESIGN_CONVERSATION_SMOKE_PLANNER_TRACE_INVALID:${plannerCalls.length}`
      );
    }
    const summary = {
      event: 'smoke.succeeded',
      migration: migrationName,
      outputRoot,
      models: { planner: TEXT_MODEL, image: IMAGE_MODEL },
      plannerCalls,
      planningJobs,
      worker: {
        accessMode: finalStatus.accessMode,
        concurrency: finalStatus.concurrency,
        workerOnline: finalStatus.workerOnline,
        queueDepth: finalStatus.queueDepth,
        maxObservedQueueDepth: completed.maxQueueDepth,
        observedQueuedBehindActive: completed.observedQueuedBehindActive
      },
      image: imageEvidence,
      agents: agentEvidence
    };
    await fs.promises.mkdir(outputRoot, { recursive: true });
    await fs.promises.writeFile(
      path.join(outputRoot, 'evidence.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
      { mode: 0o600 }
    );
    log(summary);
  } catch (error) {
    for (const entry of activeAgentEntries) {
      try {
        const run = await runService.getRun({ userId: entry.userId, runId: entry.runId });
        if (!TERMINAL_STATUSES.has(run.status)) {
          await runService.cancelRun({ userId: entry.userId, runId: entry.runId });
        }
      } catch {}
    }
    throw error;
  } finally {
    conversationService.stopWorker();
    await queuePublisher.stop().catch(() => {});
    await pool.end().catch(() => {});
  }
};

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'smoke.failed',
    stage: currentStage,
    code: String(error?.code || error?.message || 'DESIGN_CONVERSATION_DEV_SMOKE_FAILED'),
    ...(process.env.ARTIGEN_SMOKE_DEBUG === '1'
      ? { stack: String(error?.stack || '').split('\n').slice(0, 8).join('\n') }
      : {})
  }));
  process.exitCode = 1;
});
