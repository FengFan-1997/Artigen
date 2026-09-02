const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');
const { resolveUserId } = require('./billing-service');
const {
  getAgentConfig,
  assertAgentRuntimeReady,
  resolveAgentRuntimeAssignment
} = require('./agent-config');
const {
  decryptBrowserProfile,
  decryptAgentPayload,
  encryptBrowserProfile,
  encryptAgentPayload,
  hasAgentPayloadKey
} = require('./agent-payload-service');
const {
  clampCredits,
  reserveAgentBudget,
  settleAgentBudget
} = require('./agent-billing-service');
const {
  inferRequiredDeliverables,
  requiredDeliverablesSatisfied
} = require('./agent-artifact-service');
const { FUNCTION_TOOLS } = require('./agent-model-provider');
const {
  evaluateAgentTrajectory
} = require('./agent-trajectory-evaluator');
const {
  normalizeActionType,
  sanitizeLogValue,
  sanitizeText
} = require('./agent-policy-service');
const { PHASES, compileAgentPrompt, normalizeTaskSpec } = require('./agent-runtime-v2');

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const SUBAGENT_TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const ACTIVE_STATUSES = new Set([
  'draft',
  'queued',
  'provisioning',
  'running',
  'waiting_user',
  'paused',
  'verifying'
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOOL_RECEIPT_KINDS = new Set(['sandbox_shell', 'kolors']);
const TOOL_RECEIPT_STATES = new Set(['dispatched', 'consumed', 'ambiguous']);

const modelPricingRates = (config, run = {}) => {
  const provider = String(run.model_provider || run.provider || config.modelProvider || '');
  const model = String(run.model_name || config.modelName || '');
  const hasRunIdentity = Boolean(
    run.model_provider || run.provider || run.model_name || run.runtime_profile_summary
  );
  const snapshot = hasRunIdentity
    ? run.runtime_profile_summary?.modelConfig?.pricingSnapshot
    : config.modelPricingSnapshot;
  if (
    snapshot?.provider === provider &&
    snapshot?.model === model &&
    Number(snapshot.inputCreditsPerMillion) > 0 &&
    Number(snapshot.outputCreditsPerMillion) > 0
  ) {
    return {
      input: Number(snapshot.inputCreditsPerMillion),
      output: Number(snapshot.outputCreditsPerMillion)
    };
  }
  throw new ApiError(500, 'AGENT_RUN_PRICING_PROFILE_INVALID', {
    retryable: false,
    provider,
    model
  });
};

const usageCreditsForRun = ({ inputTokens = 0, outputTokens = 0, config, run }) => {
  const rates = modelPricingRates(config, run);
  if (!(rates.input > 0) || !(rates.output > 0)) {
    throw new ApiError(500, 'AGENT_RUNTIME_V2_PRICING_NOT_READY', { retryable: false });
  }
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
};

const assertWorkerLease = (row, { workerId, leaseEpoch }) => {
  if (!workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
  const currentEpoch = Number(row?.lease_epoch || 0);
  const expectedEpoch = Number(leaseEpoch || 0);
  if (
    row?.worker_id !== workerId ||
    !Number.isSafeInteger(expectedEpoch) ||
    expectedEpoch <= 0 ||
    currentEpoch !== expectedEpoch ||
    (row?.lease_expires_at && new Date(row.lease_expires_at).getTime() <= Date.now())
  ) {
    throw new ApiError(409, 'AGENT_LEASE_LOST');
  }
};

const fingerprintsEqual = (left, right) => {
  if (left == null || right == null) return left == null && right == null;
  const leftBuffer = Buffer.isBuffer(left) ? left : Buffer.from(left);
  const rightBuffer = Buffer.isBuffer(right) ? right : Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const nextConsecutiveFailureCount = ({
  currentCount = 0,
  currentStatus,
  currentFingerprint = null,
  previousStatus = null,
  previousFingerprint = null
} = {}) => {
  if (currentStatus === 'succeeded') return 0;
  if (currentStatus !== 'failed') return Number(currentCount || 0);
  const repeated = previousStatus === 'failed' &&
    fingerprintsEqual(previousFingerprint, currentFingerprint);
  return repeated ? Math.min(2, Number(currentCount || 0) + 1) : 1;
};

const ALLOWED_TRANSITIONS = Object.freeze({
  draft: new Set(['queued', 'cancelled']),
  queued: new Set(['provisioning', 'paused', 'cancelled', 'failed']),
  provisioning: new Set(['running', 'paused', 'cancelled', 'failed']),
  running: new Set(['waiting_user', 'paused', 'verifying', 'cancelled', 'failed']),
  waiting_user: new Set(['queued', 'paused', 'cancelled', 'failed']),
  paused: new Set(['queued', 'cancelled', 'failed']),
  verifying: new Set(['running', 'waiting_user', 'succeeded', 'cancelled', 'failed']),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set()
});

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
  );
};

const hashRequest = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(canonicalize(value)), 'utf8')
  .digest();

const secureEqual = (left, right) => (
  Buffer.isBuffer(left) &&
  Buffer.isBuffer(right) &&
  left.length === right.length &&
  crypto.timingSafeEqual(left, right)
);

const requireIdempotencyKey = (value) => {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY', { field: 'Idempotency-Key' });
  }
  return key;
};

const normalizeToolReceiptKey = (value) => {
  const key = String(value || '').trim();
  if (key.length < 1 || key.length > 240 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new ApiError(400, 'AGENT_TOOL_RECEIPT_KEY_INVALID');
  }
  return key;
};

const normalizeSha256 = (value, code = 'AGENT_TOOL_RECEIPT_HASH_INVALID') => {
  const digest = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new ApiError(400, code);
  return digest;
};

const normalizeObjective = (value) => {
  const objective = String(value || '').trim();
  if (objective.length < 3 || objective.length > 20_000) {
    throw new ApiError(400, 'AGENT_OBJECTIVE_INVALID', { field: 'objective' });
  }
  return objective;
};

const normalizeAssetIds = (value) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 40) {
    throw new ApiError(400, 'AGENT_ASSET_IDS_INVALID', { field: 'assetIds' });
  }
  const ids = [...new Set(value.map((entry) => String(entry || '').trim()))];
  if (ids.some((id) => !UUID_RE.test(id))) {
    throw new ApiError(400, 'AGENT_ASSET_IDS_INVALID', { field: 'assetIds' });
  }
  return ids;
};

const normalizeDeliverables = (value) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 5) {
    throw new ApiError(400, 'AGENT_DELIVERABLES_INVALID', { field: 'deliverables' });
  }
  const allowed = new Set(['report', 'spreadsheet', 'presentation', 'website', 'image']);
  const normalized = [...new Set(value.map((entry) => String(entry || '').trim()))];
  if (normalized.some((entry) => !allowed.has(entry))) {
    throw new ApiError(400, 'AGENT_DELIVERABLES_INVALID', { field: 'deliverables' });
  }
  return normalized;
};

const normalizeCapabilities = (value, env = null) => {
  const allowed = new Set([
    'research',
    'browser',
    'files',
    'shell',
    'generate_images',
    'google_drive',
    'github',
    'subagents',
    'upload',
    'move_files'
  ]);
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = Object.fromEntries(
    [...allowed].map((key) => [key, source[key] === true])
  );
  if (env && !['1', 'true', 'yes', 'on'].includes(
    String(env.AGENT_SUBAGENTS_ENABLED || '').trim().toLowerCase()
  )) {
    normalized.subagents = false;
  }
  const policy = String(
    env ? (env.AGENT_PUBLIC_CAPABILITIES || 'files,shell') : ''
  ).trim().toLowerCase();
  if (!policy) return normalized;
  const publicAllowed = new Set(
    policy.split(',').map((entry) => entry.trim()).filter(Boolean)
  );
  if (publicAllowed.has('files')) {
    publicAllowed.add('shell');
  }
  return Object.fromEntries(
    Object.entries(normalized).map(([key, granted]) => [
      key,
      granted && publicAllowed.has(key)
    ])
  );
};

const normalizeBrowserConfig = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const origins = Array.isArray(source.allowedOrigins)
    ? [...new Set(source.allowedOrigins.slice(0, 30).map((entry) => {
        try {
          const parsed = new URL(String(entry || '').trim());
          return parsed.protocol === 'https:' ? parsed.origin : '';
        } catch {
          return '';
        }
      }).filter(Boolean))]
    : [];
  return {
    allowedOrigins: origins,
    profileId: UUID_RE.test(String(source.profileId || '').trim())
      ? String(source.profileId).trim()
      : null,
    persistSession: source.persistSession === true
  };
};

const assertApprovalDecisionAllowed = ({ riskLevel, decision }) => {
  if (riskLevel === 'blocked' && decision === 'approved') {
    throw new ApiError(409, 'AGENT_TAKEOVER_REQUIRED', {
      retryable: false
    });
  }
  return true;
};

const publicRun = (row, extras = {}) => ({
  runId: row.id,
  projectId: row.project_id || null,
  status: row.status,
  runtime: {
    version: Number(row.runtime_version || 1),
    promptProfile: row.prompt_profile || null,
    profileHash: Buffer.isBuffer(row.runtime_profile_hash)
      ? row.runtime_profile_hash.toString('hex')
      : null,
    profileSummary: row.runtime_profile_summary || {},
    checkpointVersion: Number(row.checkpoint?.version || (Number(row.runtime_version || 1) === 2 ? 4 : 1)),
    skills: Object.entries(row.skill_versions || {}).map(([id, version]) => ({ id, version }))
  },
  model: {
    provider: row.model_provider,
    name: row.model_name
  },
  sandbox: {
    provider: row.sandbox_provider,
    version: row.sandbox_version,
    takeoverAvailable: !TERMINAL_STATUSES.has(row.status) &&
      row.status === 'waiting_user' &&
      Boolean(row.sandbox_ref && row.sandbox_worker_id)
  },
  capabilities: row.capabilities || {},
  browserConfig: row.browser_config || {},
  budget: {
    maximum: Number(row.max_credits || 0),
    freeReserved: Number(row.free_credits_reserved || 0),
    used: Number(row.estimated_credits_used || row.charged_credits || 0),
    charged: Number(row.charged_credits || 0),
    refunded: Number(row.refunded_credits || 0),
    frozen: String(extras.holdStatus ?? row.hold_status ?? '') === 'held'
      ? Number(extras.paidCredits ?? row.paid_credits ?? 0)
      : 0,
    released: String(extras.holdStatus ?? row.hold_status ?? '') === 'held'
      ? 0
      : Math.max(
          0,
          Number(extras.paidCredits ?? row.paid_credits ?? 0) -
            Math.max(
              0,
              Number(extras.holdCharged ?? row.hold_charged ?? 0) -
                Number(extras.freeCredits ?? row.hold_free_credits ?? 0)
            )
        )
  },
  progress: {
    stepCount: Number(row.step_count || 0),
    maxSteps: Number(extras.maxSteps || 120),
    replanCount: Number(row.replan_count || 0),
    pauseRequested: row.pause_requested === true,
    cancelRequested: row.cancel_requested === true,
    checklist: row.completion_checklist || {},
    plan: Array.isArray(row.checkpoint?.plan) ? row.checkpoint.plan : [],
    planExplanation: String(row.checkpoint?.planExplanation || ''),
    durableCheckpointSaved: row.checkpoint?.durableToolResume === true,
    retryRequired: row.checkpoint?.retryRequired === true,
    retryReason: row.checkpoint?.retryReason || null,
    clarificationRequired: row.checkpoint?.clarificationRequired === true
  },
  error: row.error_code ? { code: row.error_code } : null,
  finalTextSha256: Buffer.isBuffer(row.final_text_sha256)
    ? row.final_text_sha256.toString('hex')
    : null,
  semanticVerification: row.semantic_verification || {},
  subagents: Array.isArray(extras.subagents) ? extras.subagents : [],
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  queuedAt: row.queued_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  updatedAt: row.updated_at,
  ...extras.publicFields
});

const publicEvent = (row) => ({
  eventId: String(row.id),
  runId: row.run_id,
  subagentId: row.subagent_id || null,
  type: row.event_type,
  phase: row.phase || null,
  summary: row.summary || '',
  data: row.data || {},
  createdAt: row.created_at
});

const publicArtifact = (row) => ({
  artifactId: row.id,
  assetId: row.asset_id || null,
  parentArtifactId: row.parent_artifact_id || null,
  role: row.role,
  filename: row.filename,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size || 0),
  sha256: Buffer.isBuffer(row.sha256) ? row.sha256.toString('hex') : null,
  version: Number(row.version || 1),
  verificationStatus: row.verification_status,
  verification: row.verification || {},
  sources: row.sources || [],
  costCredits: Number(row.cost_credits || 0),
  url: row.asset_id ? `/api/assets/${encodeURIComponent(row.asset_id)}` : null,
  expiresAt: row.expires_at,
  createdAt: row.created_at
});

const publicSubagent = (row) => ({
  subagentId: row.id,
  runId: row.run_id,
  ordinal: Number(row.ordinal || 0),
  role: row.role,
  label: row.label,
  status: row.status,
  progress: {
    stepCount: Number(row.step_count || 0),
    maxSteps: 20,
    cancelRequested: row.cancel_requested === true
  },
  usage: {
    ...(row.usage && typeof row.usage === 'object' ? row.usage : {}),
    credits: Number(row.estimated_credits_used || 0)
  },
  summary: row.summary || '',
  outputFiles: Array.isArray(row.output_files) ? row.output_files : [],
  error: row.error_code ? { code: row.error_code } : null,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  updatedAt: row.updated_at
});

const normalizeDelegatedTasks = (value, { allowedInputPaths = [] } = {}) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new ApiError(400, 'AGENT_SUBAGENT_TASKS_INVALID', { field: 'tasks' });
  }
  const allowed = new Set((Array.isArray(allowedInputPaths) ? allowedInputPaths : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean));
  return value.map((entry, index) => {
    const role = String(entry?.role || '').trim();
    const objective = String(entry?.objective || '').trim();
    const expectedOutput = String(entry?.expectedOutput || '').trim();
    const label = String(entry?.label || role || `子 Agent ${index + 1}`).trim();
    const inputPaths = Array.isArray(entry?.inputPaths)
      ? [...new Set(entry.inputPaths.map((path) => String(path || '').trim()).filter(Boolean))]
      : [];
    if (
      role.length < 1 || role.length > 80 ||
      label.length < 1 || label.length > 160 ||
      objective.length < 3 || objective.length > 12_000 ||
      expectedOutput.length < 1 || expectedOutput.length > 4_000 ||
      inputPaths.length > 40 || inputPaths.some((path) => !allowed.has(path))
    ) {
      throw new ApiError(400, 'AGENT_SUBAGENT_TASK_INVALID', {
        field: `tasks.${index}`
      });
    }
    return { role, label, objective, expectedOutput, inputPaths };
  });
};

const objectivePublicFields = ({ runId, record, env }) => {
  if (!record) return {};
  try {
    const value = decryptAgentPayload({
      runId,
      payloadId: record.id,
      kind: 'objective',
      record,
      env
    });
    const objective = String(value?.objective || '').trim();
    if (!objective) return {};
    return {
      objective,
      objectivePreview: objective.replace(/\s+/g, ' ').slice(0, 180)
    };
  } catch {
    return {};
  }
};

const withTransaction = async (pool, callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
};

const insertEvent = async (client, {
  runId,
  subagentId = null,
  type,
  phase = null,
  summary = '',
  data = {}
}) => {
  const event = await client.query(
    `INSERT INTO agent_events (run_id,event_type,phase,summary,data,subagent_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      runId,
      sanitizeText(type, 100),
      phase ? sanitizeText(phase, 80) : null,
      sanitizeText(summary, 500),
      JSON.stringify(sanitizeLogValue(data)),
      subagentId
    ]
  );
  await client.query(
    `SELECT pg_notify('agent_run_events',$1)`,
    [JSON.stringify({ runId, eventId: String(event.rows[0].id) })]
  );
  return publicEvent(event.rows[0]);
};

const createAgentRunService = ({
  pool,
  env = process.env,
  queuePublisher = null,
  testController = null
} = {}) => {
  if (!pool || typeof pool.connect !== 'function') {
    throw new TypeError('AGENT_RUN_POOL_REQUIRED');
  }
  if (testController && String(env.NODE_ENV || '').trim() !== 'test') {
    throw new TypeError('AGENT_RUNTIME_TEST_CONTROLLER_FORBIDDEN');
  }

  const config = getAgentConfig(env);
  const betaUserIds = new Set(config.betaUserIds);

  const assertBetaAccess = (dbUserId) => {
    if (config.betaMode === 'disabled') return dbUserId;
    if (config.betaMode === 'authenticated-v1') return dbUserId;
    if (config.betaMode === 'owner-only-v1' && betaUserIds.has(String(dbUserId).toLowerCase())) {
      return dbUserId;
    }
    throw new ApiError(403, 'AGENT_BETA_ACCESS_DENIED', {
      retryable: false
    });
  };

  const resolveAgentUserId = async (client, userId) => (
    assertBetaAccess(await resolveUserId(client, userId))
  );

  const revokeDesktopTickets = (client, runId) => client.query(
    `UPDATE agent_desktop_tickets
        SET revoked_at=COALESCE(revoked_at,now()),
            closed_at=COALESCE(closed_at,now())
      WHERE run_id=$1 AND closed_at IS NULL`,
    [runId]
  );

  const resolveOwnedRun = async (client, { userId, runId, lock = false }) => {
    const dbUserId = await resolveAgentUserId(client, userId);
    const result = await client.query(
      `SELECT run.*,hold.paid_credits,hold.free_credits AS hold_free_credits,
              hold.charged_credits AS hold_charged,hold.status AS hold_status
         FROM agent_runs run
         LEFT JOIN agent_budget_holds hold ON hold.run_id=run.id
        WHERE run.id=$1 AND run.user_id=$2
        ${lock ? 'FOR UPDATE OF run' : ''}`,
      [runId, dbUserId]
    );
    if (!result.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    return { dbUserId, row: result.rows[0] };
  };

  const listSubagentsWithClient = async (client, runId) => {
    const result = await client.query(
      'SELECT * FROM agent_subagents WHERE run_id=$1 ORDER BY ordinal',
      [runId]
    );
    return result.rows;
  };

  const cancelAllSubagentsWithClient = async (client, runId, reason = 'PARENT_RUN_STOPPED') => {
    const cancelled = await client.query(
      `UPDATE agent_subagents
          SET status='cancelled',cancel_requested=true,error_code=$2,
              finished_at=COALESCE(finished_at,now()),updated_at=now()
        WHERE run_id=$1 AND status IN ('queued','running')
        RETURNING *`,
      [runId, sanitizeText(reason, 100)]
    );
    for (const row of cancelled.rows) {
      await insertEvent(client, {
        runId,
        subagentId: row.id,
        type: 'subagent.cancelled',
        phase: 'cancelled',
        summary: '父任务已停止，子 Agent 已取消',
        data: { reason }
      });
    }
    return cancelled.rows;
  };

  const createSubagents = async ({
    runId,
    workerId,
    leaseEpoch,
    tasks,
    allowedInputPaths = []
  }) => withTransaction(pool, async (client) => {
    if (!config.publicSubagentsEnabled) {
      throw new ApiError(403, 'AGENT_SUBAGENTS_DISABLED', { retryable: false });
    }
    const normalized = normalizeDelegatedTasks(tasks, { allowedInputPaths });
    if (normalized.length > config.subagentMaxConcurrent) {
      throw new ApiError(409, 'AGENT_SUBAGENT_LIMIT_REACHED');
    }
    const run = await client.query(
      'SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE',
      [runId]
    );
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    if (run.rows[0].status !== 'running') {
      throw new ApiError(409, 'AGENT_STATE_TRANSITION_INVALID');
    }
    if (run.rows[0].capabilities?.subagents !== true) {
      throw new ApiError(403, 'AGENT_CAPABILITY_NOT_GRANTED', { capability: 'subagents' });
    }

    const existing = await listSubagentsWithClient(client, runId);
    if (existing.length) {
      if (
        existing.length !== normalized.length ||
        existing.some((row, index) => !secureEqual(row.request_hash, hashRequest(normalized[index])))
      ) {
        throw new ApiError(409, 'AGENT_SUBAGENT_DELEGATION_CONFLICT', {
          retryable: false
        });
      }
      return existing.map((row, index) => ({
        ...publicSubagent(row),
        task: normalized[index]
      }));
    }

    const created = [];
    for (let index = 0; index < normalized.length; index += 1) {
      const task = normalized[index];
      const subagentId = crypto.randomUUID();
      const payloadId = crypto.randomUUID();
      const encrypted = encryptAgentPayload({
        runId,
        payloadId,
        kind: 'subagent_task',
        value: task,
        env
      });
      const inserted = await client.query(
        `INSERT INTO agent_subagents
          (id,run_id,ordinal,role,label,request_hash,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,
           clock_timestamp()+($7::text || ' days')::interval)
         RETURNING *`,
        [
          subagentId,
          runId,
          index + 1,
          sanitizeText(task.role, 80),
          sanitizeText(task.label, 160),
          hashRequest(task),
          config.retentionDays
        ]
      );
      await client.query(
        `INSERT INTO agent_subagent_payloads
          (id,subagent_id,run_id,algorithm,key_version,iv,auth_tag,ciphertext,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
           clock_timestamp()+($9::text || ' days')::interval)`,
        [
          payloadId,
          subagentId,
          runId,
          encrypted.algorithm,
          encrypted.keyVersion,
          encrypted.iv,
          encrypted.authTag,
          encrypted.ciphertext,
          config.retentionDays
        ]
      );
      await insertEvent(client, {
        runId,
        subagentId,
        type: 'subagent.created',
        phase: 'running',
        summary: `已创建 ${task.label}`,
        data: { ordinal: index + 1, role: task.role }
      });
      created.push({ ...publicSubagent(inserted.rows[0]), task });
    }
    return created;
  });

  const loadSubagentContext = async ({ runId, subagentId, workerId, leaseEpoch }) => withTransaction(
    pool,
    async (client) => {
      const result = await client.query(
        `SELECT subagent.*,run.worker_id,run.lease_epoch,run.lease_expires_at,run.status AS run_status,
                payload.id AS payload_id,payload.algorithm,payload.key_version,
                payload.iv,payload.auth_tag,payload.ciphertext,
                checkpoint.id AS checkpoint_id,
                checkpoint.algorithm AS checkpoint_algorithm,
                checkpoint.key_version AS checkpoint_key_version,
                checkpoint.iv AS checkpoint_iv,
                checkpoint.auth_tag AS checkpoint_auth_tag,
                checkpoint.ciphertext AS checkpoint_ciphertext
           FROM agent_subagents subagent
           JOIN agent_runs run ON run.id=subagent.run_id
           JOIN agent_subagent_payloads payload ON payload.subagent_id=subagent.id
             AND payload.expires_at>clock_timestamp()
           LEFT JOIN agent_subagent_model_checkpoints checkpoint
             ON checkpoint.subagent_id=subagent.id
            AND checkpoint.expires_at>clock_timestamp()
          WHERE subagent.id=$1 AND subagent.run_id=$2`,
        [subagentId, runId]
      );
      if (!result.rowCount) throw new ApiError(404, 'AGENT_SUBAGENT_NOT_FOUND');
      const row = result.rows[0];
      assertWorkerLease(row, { workerId, leaseEpoch });
      const task = decryptAgentPayload({
        runId,
        payloadId: row.payload_id,
        kind: 'subagent_task',
        record: row,
        env
      });
      const checkpoint = row.checkpoint_id ? decryptAgentPayload({
        runId,
        payloadId: row.checkpoint_id,
        kind: 'subagent_checkpoint',
        record: {
          algorithm: row.checkpoint_algorithm,
          key_version: row.checkpoint_key_version,
          iv: row.checkpoint_iv,
          auth_tag: row.checkpoint_auth_tag,
          ciphertext: row.checkpoint_ciphertext
        },
        env
      }) : null;
      return { subagent: publicSubagent(row), task, checkpoint };
    }
  );

  const startSubagent = async ({ runId, subagentId, workerId, leaseEpoch }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query(
        'SELECT worker_id,lease_epoch,lease_expires_at,status FROM agent_runs WHERE id=$1 FOR UPDATE',
        [runId]
      );
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
      const current = await client.query(
        'SELECT * FROM agent_subagents WHERE id=$1 AND run_id=$2 FOR UPDATE',
        [subagentId, runId]
      );
      if (!current.rowCount) throw new ApiError(404, 'AGENT_SUBAGENT_NOT_FOUND');
      if (current.rows[0].cancel_requested || current.rows[0].status === 'cancelled') {
        return publicSubagent(current.rows[0]);
      }
      if (SUBAGENT_TERMINAL_STATUSES.has(current.rows[0].status)) {
        return publicSubagent(current.rows[0]);
      }
      const updated = await client.query(
        `UPDATE agent_subagents
            SET status='running',started_at=COALESCE(started_at,now()),updated_at=now()
          WHERE id=$1 RETURNING *`,
        [subagentId]
      );
      if (current.rows[0].status !== 'running') {
        await insertEvent(client, {
          runId,
          subagentId,
          type: 'subagent.started',
          phase: 'running',
          summary: `${updated.rows[0].label} 开始执行`
        });
      }
      return publicSubagent(updated.rows[0]);
    }
  );

  const finishSubagent = async ({
    runId,
    subagentId,
    workerId,
    leaseEpoch,
    status,
    summary = '',
    outputFiles = [],
    errorCode = null
  }) => withTransaction(pool, async (client) => {
    if (!SUBAGENT_TERMINAL_STATUSES.has(status)) {
      throw new ApiError(400, 'AGENT_SUBAGENT_STATUS_INVALID');
    }
    const run = await client.query(
      'SELECT worker_id,lease_epoch,lease_expires_at FROM agent_runs WHERE id=$1 FOR UPDATE',
      [runId]
    );
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    const current = await client.query(
      'SELECT * FROM agent_subagents WHERE id=$1 AND run_id=$2 FOR UPDATE',
      [subagentId, runId]
    );
    if (!current.rowCount) throw new ApiError(404, 'AGENT_SUBAGENT_NOT_FOUND');
    if (SUBAGENT_TERMINAL_STATUSES.has(current.rows[0].status)) {
      return publicSubagent(current.rows[0]);
    }
    const safeFiles = (Array.isArray(outputFiles) ? outputFiles : []).slice(0, 100).map((file) => ({
      path: sanitizeText(file?.path, 500),
      byteSize: Math.max(0, Number(file?.byteSize || 0)),
      sha256: sanitizeText(file?.sha256, 64)
    })).filter((file) => file.path);
    const updated = await client.query(
      `UPDATE agent_subagents
          SET status=$3,summary=$4,output_files=$5,error_code=$6,
              finished_at=now(),updated_at=now()
        WHERE id=$1 AND run_id=$2 RETURNING *`,
      [
        subagentId,
        runId,
        status,
        sanitizeText(summary, 4000),
        JSON.stringify(sanitizeLogValue(safeFiles)),
        errorCode ? sanitizeText(errorCode, 100) : null
      ]
    );
    await insertEvent(client, {
      runId,
      subagentId,
      type: `subagent.${status}`,
      phase: status,
      summary: status === 'succeeded'
        ? `${updated.rows[0].label} 已完成`
        : status === 'failed'
          ? `${updated.rows[0].label} 执行失败`
          : `${updated.rows[0].label} 已取消`,
      data: { errorCode: errorCode || undefined, outputFileCount: safeFiles.length }
    });
    return publicSubagent(updated.rows[0]);
  });

  const recordSubagentUsage = async ({
    runId,
    subagentId,
    workerId,
    leaseEpoch,
    estimatedCredits,
    usage = {}
  }) => withTransaction(pool, async (client) => {
    const run = await client.query(
      'SELECT worker_id,lease_epoch,lease_expires_at,max_credits FROM agent_runs WHERE id=$1 FOR UPDATE',
      [runId]
    );
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    const credits = Math.max(0, Number(estimatedCredits || 0));
    if (credits > Number(run.rows[0].max_credits || 0)) {
      throw new ApiError(409, 'AGENT_BUDGET_EXCEEDED');
    }
    const updated = await client.query(
      `UPDATE agent_subagents
          SET estimated_credits_used=GREATEST(estimated_credits_used,$3),
              usage=usage || $4::jsonb,updated_at=now()
        WHERE id=$1 AND run_id=$2 AND status='running'
        RETURNING *`,
      [subagentId, runId, credits, JSON.stringify(sanitizeLogValue(usage))]
    );
    if (!updated.rowCount) throw new ApiError(409, 'AGENT_SUBAGENT_NOT_RUNNING');
    await insertEvent(client, {
      runId,
      subagentId,
      type: 'subagent.progress',
      phase: 'running',
      summary: '子 Agent 用量已更新',
      data: { estimatedCredits: Number(updated.rows[0].estimated_credits_used || 0) }
    });
    return publicSubagent(updated.rows[0]);
  });

  const saveSubagentModelCheckpoint = async ({
    runId,
    subagentId,
    workerId,
    leaseEpoch,
    value
  }) => withTransaction(pool, async (client) => {
    const current = await client.query(
      `SELECT subagent.id,run.worker_id,run.lease_epoch,run.lease_expires_at
         FROM agent_subagents subagent
         JOIN agent_runs run ON run.id=subagent.run_id
        WHERE subagent.id=$1 AND subagent.run_id=$2 AND subagent.status='running'
        FOR UPDATE OF subagent,run`,
      [subagentId, runId]
    );
    if (!current.rowCount) throw new ApiError(409, 'AGENT_SUBAGENT_NOT_RUNNING');
    assertWorkerLease(current.rows[0], { workerId, leaseEpoch });
    const existing = await client.query(
      'SELECT id FROM agent_subagent_model_checkpoints WHERE subagent_id=$1 FOR UPDATE',
      [subagentId]
    );
    const payloadId = existing.rows[0]?.id || crypto.randomUUID();
    const encrypted = encryptAgentPayload({
      runId,
      payloadId,
      kind: 'subagent_checkpoint',
      value,
      env
    });
    await client.query(
      `INSERT INTO agent_subagent_model_checkpoints
        (id,subagent_id,run_id,algorithm,key_version,iv,auth_tag,ciphertext,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
         clock_timestamp()+($9::text || ' days')::interval)
       ON CONFLICT (subagent_id) DO UPDATE SET
         algorithm=EXCLUDED.algorithm,key_version=EXCLUDED.key_version,
         iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,ciphertext=EXCLUDED.ciphertext,
         expires_at=EXCLUDED.expires_at,updated_at=now()`,
      [
        payloadId,
        subagentId,
        runId,
        encrypted.algorithm,
        encrypted.keyVersion,
        encrypted.iv,
        encrypted.authTag,
        encrypted.ciphertext,
        config.retentionDays
      ]
    );
    return true;
  });

  const clearSubagentModelCheckpoint = async ({ runId, subagentId, workerId, leaseEpoch }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query(
        'SELECT worker_id,lease_epoch,lease_expires_at FROM agent_runs WHERE id=$1 FOR UPDATE',
        [runId]
      );
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
      await client.query(
        'DELETE FROM agent_subagent_model_checkpoints WHERE subagent_id=$1 AND run_id=$2',
        [subagentId, runId]
      );
      return true;
    }
  );

  const getSubagentControlState = async ({ runId, subagentId }) => {
    const result = await pool.query(
      `SELECT subagent.status,subagent.cancel_requested,subagent.step_count,
              subagent.consecutive_failures,
              run.status AS run_status,run.cancel_requested AS run_cancel_requested
         FROM agent_subagents subagent
         JOIN agent_runs run ON run.id=subagent.run_id
        WHERE subagent.id=$1 AND subagent.run_id=$2`,
      [subagentId, runId]
    );
    if (!result.rowCount) throw new ApiError(404, 'AGENT_SUBAGENT_NOT_FOUND');
    return result.rows[0];
  };

  const cancelSubagent = async ({ userId, runId, subagentId }) => withTransaction(
    pool,
    async (client) => {
      await resolveOwnedRun(client, { userId, runId, lock: true });
      const current = await client.query(
        'SELECT * FROM agent_subagents WHERE id=$1 AND run_id=$2 FOR UPDATE',
        [subagentId, runId]
      );
      if (!current.rowCount) throw new ApiError(404, 'AGENT_SUBAGENT_NOT_FOUND');
      if (SUBAGENT_TERMINAL_STATUSES.has(current.rows[0].status)) {
        return publicSubagent(current.rows[0]);
      }
      const updated = await client.query(
        `UPDATE agent_subagents
            SET status='cancelled',cancel_requested=true,error_code='AGENT_SUBAGENT_CANCELLED',
                finished_at=now(),updated_at=now()
          WHERE id=$1 RETURNING *`,
        [subagentId]
      );
      await insertEvent(client, {
        runId,
        subagentId,
        type: 'subagent.cancelled',
        phase: 'cancelled',
        summary: `${updated.rows[0].label} 已单独取消`,
        data: { requestedBy: 'user' }
      });
      return publicSubagent(updated.rows[0]);
    }
  );

  const enqueue = async (runId) => {
    if (!queuePublisher || typeof queuePublisher.publish !== 'function') {
      throw new ApiError(503, 'AGENT_QUEUE_NOT_CONFIGURED', { retryable: true });
    }
    await queuePublisher.publish(runId);
  };

  const resolveUserAccess = async ({ userId }) => withTransaction(pool, async (client) => (
    resolveAgentUserId(client, userId)
  ));

  const getServiceStatus = async () => {
    const result = await pool.query(
      `WITH latest_worker AS (
         SELECT worker_id,status,model_provider,model_name,sandbox_provider,
                sandbox_mode,concurrency,browser_ready,egress_verified,
                desktop_relay_ready,sandbox_image_ref,last_seen_at
           FROM agent_worker_heartbeats
          ORDER BY last_seen_at DESC
          LIMIT 1
       ), queue_state AS (
         SELECT count(*)::integer AS queue_depth,min(queued_at) AS oldest_queued_at
           FROM agent_runs WHERE status='queued'
       )
       SELECT worker.*,
              worker.last_seen_at > clock_timestamp()-interval '60 seconds'
                AND worker.status='online' AS worker_online,
              queue.queue_depth,queue.oldest_queued_at
         FROM queue_state queue
         LEFT JOIN latest_worker worker ON true`
    );
    const row = result.rows[0] || {};
    const workerOnline = row.worker_online === true;
    const configuredModel = Object.freeze({
      provider: String(config.modelProvider || ''),
      model: String(config.modelName || '')
    });
    const workerModel = row.model_provider && row.model_name
      ? Object.freeze({
          provider: String(row.model_provider),
          model: String(row.model_name)
        })
      : null;
    const workerModelReady = Boolean(
      workerOnline &&
      workerModel &&
      workerModel.provider === configuredModel.provider &&
      workerModel.model === configuredModel.model
    );
    const queueDepth = Number(row.queue_depth || 0);
    let providerScheduler = {
      enabled: config.providerSchedulerEnabled,
      ready: !config.providerSchedulerEnabled,
      mode: config.providerSchedulerEnabled ? 'postgres-v1' : 'process-local'
    };
    let durability = {
      checkpointVersion: config.checkpointVersion,
      leaseEpochReady: false,
      modelReceiptsReady: false,
      toolReceiptsReady: false,
      budgetReservationsReady: false,
      pricingReady: !['siliconflow', 'cloudflare'].includes(config.modelProvider) || (
        modelPricingRates(config).input > 0 &&
        modelPricingRates(config).output > 0
      )
    };
    try {
      const durableSchema = await pool.query(
        `SELECT
           EXISTS(
             SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='agent_runs' AND column_name='lease_epoch'
           ) AS has_lease_epoch,
           to_regclass('public.agent_model_call_receipts') IS NOT NULL AS has_receipts,
           to_regclass('public.agent_tool_call_receipts') IS NOT NULL AS has_tool_receipts,
           to_regclass('public.agent_budget_reservations') IS NOT NULL AS has_reservations`
      );
      durability = {
        ...durability,
        leaseEpochReady: durableSchema.rows[0]?.has_lease_epoch === true,
        modelReceiptsReady: durableSchema.rows[0]?.has_receipts === true,
        toolReceiptsReady: durableSchema.rows[0]?.has_tool_receipts === true,
        budgetReservationsReady: durableSchema.rows[0]?.has_reservations === true
      };
    } catch {}
    if (config.providerSchedulerEnabled) {
      try {
        const scheduler = await pool.query(
          `SELECT to_regclass('public.agent_provider_scheduler') IS NOT NULL AS has_scheduler,
                  to_regclass('public.agent_provider_requests') IS NOT NULL AS has_requests`
        );
        providerScheduler = {
          ...providerScheduler,
          ready: scheduler.rows[0]?.has_scheduler === true &&
            scheduler.rows[0]?.has_requests === true
        };
      } catch {
        providerScheduler = { ...providerScheduler, ready: false };
      }
    }
    return {
      enabled: config.enabled,
      workerOnline,
      workerModelReady,
      configuredModel,
      workerModel,
      queueDepth,
      oldestQueuedAt: row.oldest_queued_at || null,
      concurrency: Number(row.concurrency || 1),
      modelFamily: workerModel?.model || config.modelName,
      sandboxMode: row.sandbox_mode || config.sandboxMode,
      browserReady: workerModelReady && row.browser_ready === true,
      egressVerified: workerModelReady && row.egress_verified === true,
      desktopRelayReady: workerModelReady && row.desktop_relay_ready === true,
      sandboxImageRef: row.sandbox_image_ref || null,
      browserPublicEnabled: config.publicBrowserEnabled,
      imageGenerationPublicEnabled: config.publicImageGenerationEnabled,
      subagentsEnabled: config.publicSubagentsEnabled,
      subagentMaxConcurrent: config.subagentMaxConcurrent,
      subagentSandboxMode: config.subagentSandboxMode,
      runtimeV2Enabled: config.runtimeV2Enabled,
      runtimeV2RolloutPercent: config.runtimeV2RolloutPercent,
      runtimeV2CanaryConfigured: config.runtimeV2CanaryUserIds.length > 0,
      promptEngineVersion: config.promptEngineVersion,
      adaptiveReasoningEnabled: config.adaptiveReasoningEnabled,
      projectMemoryEnabled: config.projectMemoryEnabled,
      providerScheduler,
      runtimeProfile: {
        version: 'v2.1',
        promptEngineVersion: config.promptEngineVersion,
        checkpointVersion: config.checkpointVersion,
        model: config.modelName,
        actorSamplingProfile: config.actorSamplingProfile.id
      },
      durability,
      fairScheduling: {
        enabled: config.providerSchedulerEnabled,
        agingSeconds: 30,
        admissionControl: true
      },
      accessMode: config.betaMode,
      availabilityNote: workerOnline
        ? (workerModelReady ? (queueDepth > 0 ? 'busy' : 'ready') : 'worker_model_mismatch')
        : 'worker_offline'
    };
  };

  const quote = async ({
    userId,
    objective,
    capabilities,
    browserConfig,
    deliverables,
    maxCredits
  }) => {
    if (!config.enabled) throw new ApiError(404, 'AGENT_FEATURE_DISABLED');
    const normalizedObjective = normalizeObjective(objective);
    const requestedDeliverables = normalizeDeliverables(deliverables);
    const imageRequested = requestedDeliverables.includes('image') ||
      inferRequiredDeliverables(normalizedObjective).includes('image');
    const requestedCapabilities = normalizeCapabilities({
      ...(capabilities && typeof capabilities === 'object' ? capabilities : {}),
      generate_images: imageRequested || capabilities?.generate_images === true
    }, env);
    if (imageRequested && requestedCapabilities.generate_images !== true) {
      throw new ApiError(503, 'AGENT_IMAGE_GENERATION_NOT_PUBLIC', { retryable: false });
    }
    const requestedBrowser = normalizeBrowserConfig(browserConfig);
    if (requestedCapabilities.browser && requestedBrowser.allowedOrigins.length === 0) {
      throw new ApiError(400, 'AGENT_BROWSER_ORIGIN_REQUIRED', {
        field: 'browserConfig.allowedOrigins'
      });
    }
    const complexity = Math.min(
      1,
      normalizedObjective.length / 4000 +
        Object.values(requestedCapabilities).filter(Boolean).length / 20 +
        requestedDeliverables.length / 10
    );
    const estimatedMinimum = Math.max(5, Math.round(10 + complexity * 15));
    const estimatedMaximum = Math.min(
      config.hardMaxCredits,
      Math.max(estimatedMinimum, Math.round(30 + complexity * 70))
    );
    const chosenMaximum = maxCredits === undefined
      ? Math.min(config.defaultMaxCredits, config.hardMaxCredits)
      : clampCredits(maxCredits, config.hardMaxCredits);

    const result = await withTransaction(pool, async (client) => {
      const dbUserId = await resolveAgentUserId(client, userId);
      const usage = await client.query(
        `SELECT reserved_credits,consumed_credits
           FROM agent_daily_free_usage
          WHERE user_id=$1 AND usage_date=current_date`,
        [dbUserId]
      );
      const trialUsage = await client.query(
        `SELECT granted_credits,reserved_credits,consumed_credits
           FROM agent_trial_usage WHERE user_id=$1`,
        [dbUserId]
      );
      const wallet = await client.query(
        'SELECT available_credits,frozen_credits FROM wallets WHERE user_id=$1',
        [dbUserId]
      );
      const daily = usage.rows[0] || {};
      const trial = trialUsage.rows[0] || {};
      const trialGranted = Math.max(
        Number(config.trialCredits || 0),
        Number(trial.granted_credits || 0)
      );
      const trialRemaining = Math.max(
        0,
        trialGranted -
          Number(trial.reserved_credits || 0) -
          Number(trial.consumed_credits || 0)
      );
      const dailyRemaining = Math.max(
        0,
        config.dailyFreeCredits -
          Number(daily.reserved_credits || 0) -
          Number(daily.consumed_credits || 0)
      );
      return {
        trialRemaining,
        dailyRemaining,
        freeRemaining: trialRemaining + dailyRemaining,
        walletAvailable: Number(wallet.rows[0]?.available_credits || 0),
        runtimeAssignment: resolveAgentRuntimeAssignment(config, dbUserId)
      };
    });
    const requiredPaidHold = Math.max(0, chosenMaximum - result.freeRemaining);
    return {
      currency: 'credits',
      freeCreditsRemaining: result.freeRemaining,
      trialCreditsRemaining: result.trialRemaining,
      dailyFreeCreditsRemaining: result.dailyRemaining,
      estimatedCredits: { minimum: estimatedMinimum, maximum: estimatedMaximum },
      maximumCredits: chosenMaximum,
      hardMaximumCredits: config.hardMaxCredits,
      requiredPaidHold,
      canStart: result.walletAvailable >= requiredPaidHold,
      runtime: { version: result.runtimeAssignment.version },
      limits: {
        minutes: config.maxMinutes,
        steps: config.maxSteps,
        memoryMb: config.memoryMb,
        diskGb: config.diskGb,
        concurrentRuns: 1
      },
      requirements: {
        database: true,
        payloadEncryption: hasAgentPayloadKey(env),
        modelProvider: config.modelProvider === 'ollama' ||
          (config.modelProvider === 'siliconflow' && Boolean(config.siliconFlowApiKey)) ||
          (config.modelProvider === 'cloudflare' && Boolean(
            config.cloudflareAccountId && config.cloudflareApiToken
          )) ||
          (config.modelProvider === 'openai' && Boolean(config.openAiApiKey)) ||
          config.runtimeDriver === 'fixture',
        sandboxProvider: config.sandboxMode === 'local' ||
          Boolean(config.cuaApiKey) ||
          config.sandboxProvider === 'fixture' ||
          config.runtimeDriver === 'fixture'
      }
    };
  };

  const createRun = async ({
    userId,
    objective,
    assetIds,
    maxCredits,
    capabilities,
    browserConfig,
    deliverables,
    taskSpec: proposedTaskSpec,
    projectId,
    idempotencyKey: rawIdempotencyKey
  }) => {
    const liveConfig = assertAgentRuntimeReady(env);
    if (!hasAgentPayloadKey(env)) {
      throw new ApiError(503, 'AGENT_PAYLOAD_KEY_MISSING', { retryable: false });
    }
    const normalizedObjective = normalizeObjective(objective);
    const normalizedAssetIds = normalizeAssetIds(assetIds);
    const normalizedDeliverables = normalizeDeliverables(deliverables);
    const imageRequested = normalizedDeliverables.includes('image') ||
      inferRequiredDeliverables(normalizedObjective).includes('image');
    const normalizedCapabilities = normalizeCapabilities({
      ...(capabilities && typeof capabilities === 'object' ? capabilities : {}),
      generate_images: imageRequested || capabilities?.generate_images === true
    }, env);
    if (imageRequested && normalizedCapabilities.generate_images !== true) {
      throw new ApiError(503, 'AGENT_IMAGE_GENERATION_NOT_PUBLIC', { retryable: false });
    }
    const normalizedBrowser = normalizeBrowserConfig(browserConfig);
    if (normalizedCapabilities.browser && normalizedBrowser.allowedOrigins.length === 0) {
      throw new ApiError(400, 'AGENT_BROWSER_ORIGIN_REQUIRED', {
        field: 'browserConfig.allowedOrigins'
      });
    }
    if (
      normalizedCapabilities.browser &&
      (config.browserMode !== 'full-approval-v1' || config.sandboxEgressPolicy !== 'restricted-v1')
    ) {
      throw new ApiError(503, 'AGENT_BROWSER_NOT_READY', { retryable: false });
    }
    if (
      normalizedCapabilities.browser !== true &&
      (
        normalizedBrowser.allowedOrigins.length ||
        normalizedBrowser.profileId ||
        normalizedBrowser.persistSession
      )
    ) {
      throw new ApiError(403, 'AGENT_CAPABILITY_NOT_GRANTED', {
        capability: 'browser'
      });
    }
    if (normalizedBrowser.persistSession && normalizedBrowser.allowedOrigins.length !== 1) {
      throw new ApiError(400, 'AGENT_BROWSER_PROFILE_REQUIRES_ONE_ORIGIN', {
        field: 'browserConfig.allowedOrigins'
      });
    }
    const budget = maxCredits === undefined
      ? liveConfig.defaultMaxCredits
      : clampCredits(maxCredits, liveConfig.hardMaxCredits);
    const idempotencyKey = requireIdempotencyKey(rawIdempotencyKey);
    const compileRuntimeRequest = (runtimeVersion) => {
      const runtimeV2 = Number(runtimeVersion) === 2;
      const normalizedTaskSpec = runtimeV2 && proposedTaskSpec
        ? normalizeTaskSpec({
            ...proposedTaskSpec,
            goal: normalizedObjective,
            deliverables: normalizedDeliverables,
            allowedOrigins: normalizedBrowser.allowedOrigins,
            budget: { maxCredits: budget }
          }, {
            objective: normalizedObjective,
            deliverables: normalizedDeliverables,
            capabilities: normalizedCapabilities,
            allowedOrigins: normalizedBrowser.allowedOrigins,
            maxCredits: budget
          })
        : null;
      const requestHash = hashRequest({
        objective: normalizedObjective,
        assetIds: normalizedAssetIds,
        maxCredits: budget,
        capabilities: normalizedCapabilities,
        deliverables: normalizedDeliverables,
        browserConfig: normalizedBrowser,
        projectId: projectId || null,
        taskSpec: normalizedTaskSpec
      });
      // A Run created without a router-compiled TaskSpec still needs the
      // Planner. Do not freeze an incomplete execution profile before the
      // Planner has produced a server-validated TaskSpec; the Worker pins the
      // final capability-intersected profile exactly once afterwards. Runs
      // that already carry a validated TaskSpec remain immutable at creation.
      const promptProfile = runtimeV2 && normalizedTaskSpec
        ? compileAgentPrompt({
            objective: normalizedObjective,
            capabilities: normalizedCapabilities,
            deliverables: normalizedDeliverables,
            taskSpec: normalizedTaskSpec,
            phase: normalizedTaskSpec?.plan?.[0]?.phase || (
              normalizedCapabilities.browser ? 'research' : 'production'
            ),
            toolSchemas: FUNCTION_TOOLS,
            modelConfig: {
              actorSamplingProfile: config.actorSamplingProfile,
              adaptiveReasoningEnabled: config.adaptiveReasoningEnabled,
              stageMaxOutputTokens: config.stageMaxOutputTokens,
              pricingSnapshot: config.modelPricingSnapshot
            },
            textModel: config.modelName
          })
        : null;
      const runtimeProfileSummary = promptProfile?.runtimeProfileSummary || {
        runtimeVersion: runtimeV2 ? 2 : 1,
        modelProvider: liveConfig.modelProvider,
        model: liveConfig.modelName,
        modelConfig: {
          pricingSnapshot: liveConfig.modelPricingSnapshot
        }
      };
      return {
        normalizedTaskSpec,
        promptProfile,
        requestHash,
        runtimeProfileSummary,
        runtimeV2
      };
    };

    const created = await withTransaction(pool, async (client) => {
      const dbUserId = await resolveAgentUserId(client, userId);
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`agent-run:${dbUserId}:${idempotencyKey}`]
      );
      const account = await client.query(
        `SELECT id,status,(email IS NOT NULL OR phone IS NOT NULL OR EXISTS (
           SELECT 1 FROM user_identities identity WHERE identity.user_id=users.id
         )) AS verified
           FROM users WHERE id=$1 FOR SHARE`,
        [dbUserId]
      );
      if (
        !account.rowCount ||
        account.rows[0].status !== 'active' ||
        account.rows[0].verified !== true
      ) {
        throw new ApiError(403, 'VERIFIED_ACCOUNT_REQUIRED');
      }
      const replay = await client.query(
        'SELECT * FROM agent_runs WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE',
        [dbUserId, idempotencyKey]
      );
      const runtimeAssignment = replay.rowCount
        ? { version: Number(replay.rows[0].runtime_version || 1), reason: 'replay' }
        : resolveAgentRuntimeAssignment(liveConfig, dbUserId);
      const {
        normalizedTaskSpec,
        promptProfile,
        requestHash,
        runtimeProfileSummary,
        runtimeV2
      } = compileRuntimeRequest(runtimeAssignment.version);
      if (replay.rowCount) {
        if (!secureEqual(replay.rows[0].request_hash, requestHash)) {
          throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
        }
        return { row: replay.rows[0], replayed: true };
      }
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        ['agent-global-queue-capacity']
      );
      const queued = await client.query(
        `SELECT count(*)::integer AS count FROM agent_runs WHERE status='queued'`
      );
      if (Number(queued.rows[0]?.count || 0) >= liveConfig.maxQueuedRuns) {
        throw new ApiError(503, 'AGENT_QUEUE_FULL', { retryable: true });
      }
      if (projectId) {
        const project = await client.query(
          `SELECT id FROM creative_projects
            WHERE id=$1 AND user_id=$2 AND status<>'trashed'`,
          [projectId, dbUserId]
        );
        if (!project.rowCount) throw new ApiError(404, 'PROJECT_NOT_FOUND');
      }
      if (normalizedAssetIds.length) {
        const owned = await client.query(
          `SELECT id FROM assets
            WHERE owner_user_id=$1 AND id=ANY($2::uuid[])`,
          [dbUserId, normalizedAssetIds]
        );
        if (owned.rowCount !== normalizedAssetIds.length) {
          throw new ApiError(404, 'AGENT_INPUT_ASSET_NOT_FOUND');
        }
      }
      if (normalizedBrowser.profileId) {
        const profile = await client.query(
          `SELECT site_origin FROM agent_browser_profiles
            WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()`,
          [normalizedBrowser.profileId, dbUserId]
        );
        if (!profile.rowCount) throw new ApiError(404, 'AGENT_BROWSER_PROFILE_NOT_FOUND');
        if (!normalizedBrowser.allowedOrigins.includes(profile.rows[0].site_origin)) {
          throw new ApiError(400, 'AGENT_BROWSER_PROFILE_ORIGIN_MISMATCH');
        }
      }
      const runId = crypto.randomUUID();
      const inserted = await client.query(
        `INSERT INTO agent_runs
          (id,user_id,project_id,status,idempotency_key,request_hash,
           model_provider,model_name,sandbox_provider,sandbox_version,
           capabilities,browser_config,max_credits,runtime_version,prompt_profile,
           prompt_hash,skill_versions,runtime_profile_hash,runtime_profile_summary,
           queued_at,queue_expires_at)
         VALUES ($1,$2,$3,'queued',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
           $17,$18,now(),clock_timestamp()+($19::text || ' hours')::interval)
         RETURNING *`,
        [
          runId,
          dbUserId,
          projectId || null,
          idempotencyKey,
          requestHash,
          liveConfig.modelProvider,
          liveConfig.modelName,
          liveConfig.sandboxProvider,
          liveConfig.sandboxVersion,
          JSON.stringify(normalizedCapabilities),
          JSON.stringify(normalizedBrowser),
          budget,
          runtimeV2 ? 2 : 1,
          promptProfile?.promptProfile || null,
          promptProfile ? Buffer.from(promptProfile.promptHash, 'hex') : null,
          JSON.stringify(Object.fromEntries(
            (promptProfile?.skills || []).map((skill) => [skill.id, skill.version])
          )),
          promptProfile ? Buffer.from(promptProfile.runtimeProfileHash, 'hex') : null,
          JSON.stringify(sanitizeLogValue(runtimeProfileSummary)),
          liveConfig.queueMaxWaitHours
        ]
      );
      const payloadId = crypto.randomUUID();
      const encrypted = encryptAgentPayload({
        runId,
        payloadId,
        kind: 'objective',
        value: {
          objective: normalizedObjective,
          assetIds: normalizedAssetIds,
          deliverables: normalizedDeliverables,
          taskSpec: normalizedTaskSpec,
          createdBy: 'user'
        },
        env
      });
      await client.query(
        `INSERT INTO agent_run_payloads
          (id,run_id,kind,algorithm,key_version,iv,auth_tag,ciphertext,expires_at)
         VALUES ($1,$2,'objective',$3,$4,$5,$6,$7,
           clock_timestamp()+($8::text || ' days')::interval)`,
        [
          payloadId,
          runId,
          encrypted.algorithm,
          encrypted.keyVersion,
          encrypted.iv,
          encrypted.authTag,
          encrypted.ciphertext,
          liveConfig.retentionDays
        ]
      );
      const hold = await reserveAgentBudget({
        client,
        runId,
        userId: dbUserId,
        maxCredits: budget,
        trialCredits: liveConfig.trialCredits,
        dailyFreeCredits: liveConfig.dailyFreeCredits,
        holdMinutes: liveConfig.queueMaxWaitHours * 60 + liveConfig.maxMinutes + 15
      });
      await client.query(
        'UPDATE agent_runs SET free_credits_reserved=$2 WHERE id=$1',
        [runId, hold.freeCredits]
      );
      await insertEvent(client, {
        runId,
        type: 'run.queued',
        phase: 'queued',
        summary: '任务已进入 Agent 队列',
        data: {
          maxCredits: budget,
          freeCredits: hold.freeCredits,
          runtimeVersion: runtimeV2 ? 2 : 1,
          runtimeAssignment: runtimeAssignment.reason,
          promptProfile: promptProfile?.promptProfile || null,
          skillIds: (promptProfile?.skills || []).map((skill) => skill.id)
        }
      });
      return {
        row: { ...inserted.rows[0], free_credits_reserved: hold.freeCredits },
        replayed: false
      };
    }).catch((error) => {
      if (String(error?.code || '') === '23505' &&
          String(error?.constraint || '') === 'agent_runs_one_active_per_user_idx') {
        throw new ApiError(409, 'AGENT_CONCURRENT_RUN_LIMIT', { retryable: true });
      }
      throw error;
    });

    if (!created.replayed) {
      try {
        await enqueue(created.row.id);
      } catch (error) {
        await failRun({
          runId: created.row.id,
          errorCode: 'AGENT_QUEUE_UNAVAILABLE',
          refundable: true
        });
        throw error;
      }
    }
    return { ...publicRun(created.row, { maxSteps: liveConfig.maxSteps }), replayed: created.replayed };
  };

  const listRuns = async ({ userId, limit = 30, cursor = null }) => withTransaction(
    pool,
    async (client) => {
      const dbUserId = await resolveAgentUserId(client, userId);
      const result = await client.query(
        `SELECT run.*,hold.paid_credits,hold.free_credits AS hold_free_credits,
                hold.charged_credits AS hold_charged,hold.status AS hold_status
           FROM agent_runs run
           LEFT JOIN agent_budget_holds hold ON hold.run_id=run.id
          WHERE run.user_id=$1
            AND ($2::timestamptz IS NULL OR run.created_at<$2)
          ORDER BY run.created_at DESC
          LIMIT $3`,
        [
          dbUserId,
          cursor && !Number.isNaN(new Date(cursor).getTime()) ? new Date(cursor) : null,
          Math.max(1, Math.min(100, Number(limit) || 30))
        ]
      );
      const payloads = result.rowCount
        ? await client.query(
            `SELECT DISTINCT ON (run_id) *
               FROM agent_run_payloads
              WHERE run_id=ANY($1::uuid[]) AND kind='objective' AND expires_at>now()
              ORDER BY run_id,created_at`,
            [result.rows.map((row) => row.id)]
          )
        : { rows: [] };
      const objectiveByRun = new Map(payloads.rows.map((record) => [record.run_id, record]));
      const subagents = result.rowCount
        ? await client.query(
            'SELECT * FROM agent_subagents WHERE run_id=ANY($1::uuid[]) ORDER BY run_id,ordinal',
            [result.rows.map((row) => row.id)]
          )
        : { rows: [] };
      const subagentsByRun = new Map();
      for (const subagent of subagents.rows) {
        const entries = subagentsByRun.get(subagent.run_id) || [];
        entries.push(publicSubagent(subagent));
        subagentsByRun.set(subagent.run_id, entries);
      }
      return result.rows.map((row) => {
        const objective = objectivePublicFields({
          runId: row.id,
          record: objectiveByRun.get(row.id),
          env
        });
        return publicRun(row, {
          maxSteps: config.maxSteps,
          subagents: subagentsByRun.get(row.id) || [],
          publicFields: objective.objectivePreview
            ? { objectivePreview: objective.objectivePreview }
            : {}
        });
      });
    }
  );

  const getRun = async ({ userId, runId }) => withTransaction(pool, async (client) => {
    const { row } = await resolveOwnedRun(client, { userId, runId });
    const approvals = await client.query(
      `SELECT id,action_type,recipient,risk_level,change_summary,evidence_summary,
              impact_summary,rollback_summary,status,expires_at,decided_at,created_at
         FROM agent_approvals
        WHERE run_id=$1 ORDER BY created_at DESC`,
      [runId]
    );
    const artifacts = await client.query(
      'SELECT * FROM agent_artifacts WHERE run_id=$1 ORDER BY created_at,version',
      [runId]
    );
    const objectivePayload = await client.query(
      `SELECT * FROM agent_run_payloads
        WHERE run_id=$1 AND kind='objective' AND expires_at>now()
        ORDER BY created_at LIMIT 1`,
      [runId]
    );
    const subagents = await listSubagentsWithClient(client, runId);
    return publicRun(row, {
      maxSteps: config.maxSteps,
      subagents: subagents.map(publicSubagent),
      publicFields: {
        ...objectivePublicFields({
          runId,
          record: objectivePayload.rows[0],
          env
        }),
        approvals: approvals.rows.map((approval) => ({
          approvalId: approval.id,
          actionType: approval.action_type,
          recipient: approval.recipient,
          riskLevel: approval.risk_level,
          changeSummary: approval.change_summary,
          evidenceSummary: approval.evidence_summary,
          impactSummary: approval.impact_summary,
          rollbackSummary: approval.rollback_summary,
          status: approval.status,
          expiresAt: approval.expires_at,
          decidedAt: approval.decided_at,
          createdAt: approval.created_at
        })),
        artifacts: artifacts.rows.map(publicArtifact)
      }
    });
  });

  const listEvents = async ({ userId, runId, after = 0, limit = 250 }) => withTransaction(
    pool,
    async (client) => {
      await resolveOwnedRun(client, { userId, runId });
      const cursor = Math.max(0, Number.parseInt(String(after || 0), 10) || 0);
      const result = await client.query(
        `SELECT * FROM agent_events
          WHERE run_id=$1 AND id>$2
          ORDER BY id
          LIMIT $3`,
        [runId, cursor, Math.max(1, Math.min(500, Number(limit) || 250))]
      );
      return result.rows.map(publicEvent);
    }
  );

  const listObservedSources = async ({ runId }) => {
    const result = await pool.query(
      `SELECT DISTINCT url
         FROM (
           SELECT sanitized_output->>'url' AS url
             FROM agent_steps
            WHERE run_id=$1
              AND status='succeeded'
              AND sanitized_output ? 'url'
           UNION ALL
           SELECT source->>'url' AS url
             FROM agent_artifacts artifact
             CROSS JOIN LATERAL jsonb_array_elements(artifact.sources) source
            WHERE artifact.run_id=$1
              AND artifact.verification_status='passed'
         ) observed
        WHERE url IS NOT NULL AND url<>''`,
      [runId]
    );
    return result.rows.map((row) => row.url);
  };

  const listArtifacts = async ({ userId, runId }) => withTransaction(pool, async (client) => {
    await resolveOwnedRun(client, { userId, runId });
    const result = await client.query(
      'SELECT * FROM agent_artifacts WHERE run_id=$1 ORDER BY created_at,version',
      [runId]
    );
    return result.rows.map(publicArtifact);
  });

  const pauseRun = async ({ userId, runId }) => withTransaction(pool, async (client) => {
    const { row } = await resolveOwnedRun(client, { userId, runId, lock: true });
    if (TERMINAL_STATUSES.has(row.status)) throw new ApiError(409, 'AGENT_RUN_TERMINAL');
    const immediate = ['draft', 'queued', 'waiting_user'].includes(row.status);
    const result = await client.query(
      `UPDATE agent_runs
          SET pause_requested=true,
              status=CASE WHEN $2 THEN 'paused' ELSE status END,
              worker_id=CASE WHEN $2 THEN NULL ELSE worker_id END,
              lease_expires_at=CASE WHEN $2 THEN NULL ELSE lease_expires_at END,
              updated_at=now()
        WHERE id=$1 RETURNING *`,
      [runId, immediate]
    );
    await insertEvent(client, {
      runId,
      type: immediate ? 'run.paused' : 'run.pause_requested',
      phase: result.rows[0].status,
      summary: immediate ? '任务已暂停' : '将在当前安全步骤后暂停'
    });
    const refreshed = await resolveOwnedRun(client, { userId, runId });
    return publicRun(refreshed.row, { maxSteps: config.maxSteps });
  });

  const resumeRun = async ({ userId, runId }) => {
    const resumed = await withTransaction(pool, async (client) => {
      const { row } = await resolveOwnedRun(client, { userId, runId, lock: true });
      if (!['paused', 'waiting_user'].includes(row.status)) {
        throw new ApiError(409, 'AGENT_RUN_NOT_RESUMABLE');
      }
      const pending = await client.query(
        `SELECT 1 FROM agent_approvals
          WHERE run_id=$1 AND status='pending' AND expires_at>now()
          LIMIT 1`,
        [runId]
      );
      if (pending.rowCount) throw new ApiError(409, 'AGENT_APPROVAL_PENDING');
      const resumableCheckpoint = { ...(row.checkpoint || {}) };
      if ([
        'image_call_ambiguous',
        'model_call_ambiguous',
        'tool_call_ambiguous',
        'runtime_call_ambiguous'
      ].includes(resumableCheckpoint.retryReason)) {
        const receipts = resumableCheckpoint.toolReceipts &&
          typeof resumableCheckpoint.toolReceipts === 'object'
          ? resumableCheckpoint.toolReceipts
          : {};
        resumableCheckpoint.toolReceipts = Object.fromEntries(
          Object.entries(receipts).filter(([, receipt]) => !(
            ['kolors', 'sandbox_shell'].includes(receipt?.kind) &&
            ['dispatched', 'ambiguous'].includes(receipt?.state)
          ))
        );
        const parsedToolRetryEpoch = Number(resumableCheckpoint.toolRetryEpoch || 0);
        resumableCheckpoint.toolRetryEpoch = (
          Number.isSafeInteger(parsedToolRetryEpoch) && parsedToolRetryEpoch >= 0
            ? parsedToolRetryEpoch
            : 0
        ) + 1;
      }
      delete resumableCheckpoint.retryRequired;
      delete resumableCheckpoint.retryReason;
      delete resumableCheckpoint.clarificationRequired;
      delete resumableCheckpoint.clarificationReason;
      const result = await client.query(
        `UPDATE agent_runs
            SET status='queued',pause_requested=false,cancel_requested=false,
                queued_at=now(),
                queue_expires_at=clock_timestamp()+($2::text || ' hours')::interval,
                checkpoint=$3::jsonb,
                worker_id=NULL,lease_expires_at=NULL,updated_at=now()
          WHERE id=$1 RETURNING *`,
        [runId, config.queueMaxWaitHours, JSON.stringify(resumableCheckpoint)]
      );
      await client.query(
        `UPDATE agent_budget_holds
            SET expires_at=clock_timestamp()+($2::text || ' minutes')::interval
          WHERE run_id=$1 AND status='held'`,
        [runId, config.queueMaxWaitHours * 60 + config.maxMinutes + 15]
      );
      await insertEvent(client, {
        runId,
        type: 'run.resumed',
        phase: 'queued',
        summary: '任务已恢复并重新进入队列'
      });
      return result.rows[0];
    });
    try {
      await enqueue(runId);
    } catch (error) {
      await failRun({ runId, errorCode: 'AGENT_QUEUE_UNAVAILABLE', refundable: true });
      throw error;
    }
    return publicRun(resumed, { maxSteps: config.maxSteps });
  };

  const consumeKnownTerminalCosts = async (client, runId, {
    outcome = 'cancelled',
    receiptErrorCode = 'AGENT_CANCELLED_AFTER_RECEIPT',
    unreadableErrorCode = 'AGENT_CANCELLED_RECEIPT_UNREADABLE',
    eventPhase = 'cancelled'
  } = {}) => {
    const normalizedOutcome = ['succeeded', 'failed', 'cancelled'].includes(outcome)
      ? outcome
      : 'failed';
    const receivedModels = await client.query(
      `SELECT receipt.*,reservation.state AS reservation_state,
              reservation.reservation_key,call.subagent_id,call.provider,call.model_name,
              run.runtime_profile_summary
         FROM agent_model_call_receipts receipt
         JOIN agent_model_calls call ON call.id=receipt.id
         JOIN agent_runs run ON run.id=receipt.run_id
         JOIN agent_budget_reservations reservation
           ON reservation.run_id=receipt.run_id AND reservation.model_call_id=receipt.id
        WHERE receipt.run_id=$1
          AND (
            receipt.state='received'
            OR (
              receipt.state='consumed'
              AND reservation.state IN ('reserved','released')
            )
          )
        FOR UPDATE OF receipt,call,reservation`,
      [runId]
    );
    for (const receipt of receivedModels.rows) {
      let payload;
      try {
        payload = decryptAgentPayload({
          runId,
          payloadId: receipt.id,
          kind: 'model_call_response',
          record: {
            algorithm: receipt.algorithm,
            iv: receipt.response_iv,
            auth_tag: receipt.response_auth_tag,
            ciphertext: receipt.response_ciphertext
          },
          env
        });
      } catch {
        await client.query(
          `UPDATE agent_model_call_receipts
              SET state='consumed',consumed_at=COALESCE(consumed_at,clock_timestamp()),
                  updated_at=clock_timestamp()
            WHERE id=$1 AND run_id=$2 AND state='received'`,
          [receipt.id, runId]
        );
        await client.query(
          `UPDATE agent_budget_reservations
              SET state='consumed',actual_credits=0,
                  consumed_at=COALESCE(consumed_at,clock_timestamp()),
                  released_at=NULL,updated_at=clock_timestamp()
            WHERE run_id=$1 AND reservation_key=$2
              AND state IN ('reserved','released')`,
          [runId, receipt.reservation_key]
        );
        await client.query(
          `UPDATE agent_model_calls
              SET outcome=$2,error_code=$3,
                  finished_at=COALESCE(finished_at,clock_timestamp())
            WHERE id=$1`,
          [receipt.id, normalizedOutcome, unreadableErrorCode]
        );
        await insertEvent(client, {
          runId,
          type: 'model.call.receipt_unreadable',
          phase: eventPhase,
          summary: '终态清理时无法解密已收到的模型回执，回执已封存且未知费用由平台承担',
          data: { callId: receipt.id }
        });
        continue;
      }
      const usage = payload?.response?.usage || {};
      const tokenCount = (value) => {
        const parsed = Number(value || 0);
        return Number.isFinite(parsed) ? Math.ceil(Math.max(0, Math.min(1_000_000_000, parsed))) : 0;
      };
      const inputTokens = tokenCount(usage.prompt_tokens || usage.input_tokens);
      const outputTokens = tokenCount(usage.completion_tokens || usage.output_tokens);
      const actualCredits = usageCreditsForRun({
        inputTokens,
        outputTokens,
        config,
        run: receipt
      });
      if (['reserved', 'released'].includes(receipt.reservation_state)) {
        await client.query(
          `UPDATE agent_budget_reservations
              SET state='consumed',actual_credits=$3,consumed_at=clock_timestamp(),
                  released_at=NULL,updated_at=clock_timestamp()
            WHERE run_id=$1 AND reservation_key=$2 AND state IN ('reserved','released')`,
          [runId, receipt.reservation_key, actualCredits]
        );
      }
      // A readable received response is a determined Provider result. Restore
      // its internal reservation even if an older terminal path released it so
      // replay keeps receipt and budget state consistent; a settled refundable
      // hold still means the platform, not the user, absorbs the cost.
      await client.query(
        `UPDATE agent_model_call_receipts
            SET state='consumed',consumed_at=COALESCE(consumed_at,clock_timestamp()),
                updated_at=clock_timestamp()
          WHERE id=$1 AND run_id=$2 AND state='received'`,
        [receipt.id, runId]
      );
      await client.query(
        `UPDATE agent_model_calls
            SET input_tokens=GREATEST(input_tokens,$2),
                output_tokens=GREATEST(output_tokens,$3),
                outcome=$4,error_code=$5,
                finished_at=COALESCE(finished_at,clock_timestamp())
          WHERE id=$1`,
        [receipt.id, inputTokens, outputTokens, normalizedOutcome, receiptErrorCode]
      );
    }

    await client.query(
      `UPDATE agent_budget_reservations reservation
          SET state='consumed',actual_credits=receipt.actual_credits,
              consumed_at=clock_timestamp(),updated_at=clock_timestamp()
         FROM agent_tool_call_receipts receipt
        WHERE reservation.run_id=$1 AND reservation.state='reserved'
          AND receipt.run_id=reservation.run_id
          AND receipt.reservation_key=reservation.reservation_key
          AND receipt.state='consumed'`,
      [runId]
    );
    const totals = await client.query(
      `SELECT COALESCE(sum(actual_credits),0)::numeric AS consumed
         FROM agent_budget_reservations
        WHERE run_id=$1 AND state='consumed'`,
      [runId]
    );
    const consumed = Number(totals.rows[0]?.consumed || 0);
    await client.query(
      `UPDATE agent_runs
          SET estimated_credits_used=GREATEST(
                estimated_credits_used,
                LEAST(max_credits::numeric,$2::numeric)
              ),
              platform_overrun_credits=GREATEST(
                platform_overrun_credits,
                GREATEST(0::numeric,$2::numeric-max_credits::numeric)
              ),
              updated_at=clock_timestamp()
        WHERE id=$1`,
      [runId, consumed]
    );
    await client.query(
      `UPDATE agent_subagents subagent
          SET estimated_credits_used=GREATEST(
                subagent.estimated_credits_used,
                totals.consumed
              ),
              updated_at=clock_timestamp()
         FROM (
           SELECT subagent_id,COALESCE(sum(actual_credits),0)::numeric AS consumed
             FROM agent_budget_reservations
            WHERE run_id=$1 AND state='consumed' AND subagent_id IS NOT NULL
            GROUP BY subagent_id
         ) totals
        WHERE subagent.id=totals.subagent_id AND subagent.run_id=$1`,
      [runId]
    );
    return consumed;
  };

  const cancelRun = async ({ userId, runId }) => withTransaction(pool, async (client) => {
    const { row } = await resolveOwnedRun(client, { userId, runId, lock: true });
    if (TERMINAL_STATUSES.has(row.status)) return publicRun(row, { maxSteps: config.maxSteps });
    await client.query(
      `UPDATE agent_runs
          SET status='cancelled',cancel_requested=true,worker_id=NULL,lease_expires_at=NULL,
              finished_at=now(),updated_at=now(),error_code='AGENT_CANCELLED'
        WHERE id=$1 RETURNING *`,
      [runId]
    );
    const knownActualCredits = await consumeKnownTerminalCosts(client, runId);
    await settleAgentBudget({
      client,
      runId,
      actualCredits: Math.max(Number(row.estimated_credits_used || 0), knownActualCredits),
      refundable: false,
      reason: 'user_cancelled'
    });
    await client.query(
      `UPDATE agent_budget_reservations
          SET state='released',released_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE run_id=$1 AND state='reserved'`,
      [runId]
    );
    const cancelledQueuedModels = await client.query(
      `DELETE FROM agent_model_call_receipts
        WHERE run_id=$1 AND state='queued'
        RETURNING id`,
      [runId]
    );
    if (cancelledQueuedModels.rowCount) {
      await client.query(
        `UPDATE agent_model_calls
            SET outcome='cancelled',error_code='AGENT_CANCELLED_BEFORE_DISPATCH',
                finished_at=COALESCE(finished_at,clock_timestamp())
          WHERE id=ANY($1::uuid[])`,
        [cancelledQueuedModels.rows.map((entry) => entry.id)]
      );
    }
    const ambiguousModels = await client.query(
      `UPDATE agent_model_call_receipts
          SET state='ambiguous',ambiguous_at=COALESCE(ambiguous_at,clock_timestamp()),
              updated_at=clock_timestamp()
        WHERE run_id=$1 AND state='dispatched'
        RETURNING id`,
      [runId]
    );
    if (ambiguousModels.rowCount) {
      await client.query(
        `UPDATE agent_model_calls
            SET outcome='cancelled',error_code='AGENT_CANCELLED_DURING_DISPATCH',
                finished_at=COALESCE(finished_at,clock_timestamp())
          WHERE id=ANY($1::uuid[])`,
        [ambiguousModels.rows.map((entry) => entry.id)]
      );
      await insertEvent(client, {
        runId,
        type: 'model.call.ambiguous',
        phase: 'cancelled',
        summary: '取消发生在模型请求派发后，未知结果未计费也不会自动重试',
        data: { callIds: ambiguousModels.rows.map((entry) => entry.id) }
      });
    }
    await client.query(
      `UPDATE agent_model_calls
          SET outcome='cancelled',error_code='AGENT_CANCELLED_AFTER_RECEIPT',
              finished_at=COALESCE(finished_at,clock_timestamp())
        WHERE id IN (
          SELECT id FROM agent_model_call_receipts
           WHERE run_id=$1 AND state='received'
        )
          AND outcome='running'`,
      [runId]
    );
    const ambiguousTools = await client.query(
      `UPDATE agent_tool_call_receipts
          SET state='ambiguous',ambiguous_at=COALESCE(ambiguous_at,clock_timestamp()),
              updated_at=clock_timestamp()
        WHERE run_id=$1 AND state='dispatched'
        RETURNING id,kind`,
      [runId]
    );
    if (ambiguousTools.rowCount) {
      const kinds = [...new Set(ambiguousTools.rows.map((entry) => entry.kind))];
      await insertEvent(client, {
        runId,
        type: kinds.length === 1 && kinds[0] === 'kolors'
          ? 'image.call.ambiguous'
          : 'tool.call.ambiguous',
        phase: 'cancelled',
        summary: '取消发生在工具派发后，未知结果未计费也不会自动重试',
        data: {
          receiptIds: ambiguousTools.rows.map((entry) => entry.id),
          kinds
        }
      });
    }
    await cancelAllSubagentsWithClient(client, runId, 'PARENT_RUN_CANCELLED');
    await revokeDesktopTickets(client, runId);
    await insertEvent(client, {
      runId,
      type: 'run.cancelled',
      phase: 'cancelled',
      summary: '任务已取消，已结算实际用量并释放其余冻结点数'
    });
    const refreshed = await resolveOwnedRun(client, { userId, runId });
    return publicRun(refreshed.row, { maxSteps: config.maxSteps });
  });

  const submitInput = async ({
    userId,
    runId,
    message,
    approvalId,
    decision,
    decisionReason,
    takeoverEnded = false,
    takeoverApprovalId = null
  }) => {
    let shouldEnqueue = false;
    const result = await withTransaction(pool, async (client) => {
      const { dbUserId, row } = await resolveOwnedRun(client, { userId, runId, lock: true });
      if (TERMINAL_STATUSES.has(row.status)) throw new ApiError(409, 'AGENT_RUN_TERMINAL');
      let eventType = 'run.input_received';
      let summary = '已收到补充信息';
      if (approvalId) {
        if (!['approved', 'denied'].includes(String(decision || ''))) {
          throw new ApiError(400, 'AGENT_APPROVAL_DECISION_INVALID', { field: 'decision' });
        }
        const approval = await client.query(
          `UPDATE agent_approvals
              SET status=$4,decided_by_user_id=$2,decided_at=now()
            WHERE id=$1 AND run_id=$3 AND status='pending' AND expires_at>now()
            RETURNING *`,
          [approvalId, dbUserId, runId, decision]
        );
        if (!approval.rowCount) throw new ApiError(404, 'AGENT_APPROVAL_NOT_AVAILABLE');
        assertApprovalDecisionAllowed({
          riskLevel: approval.rows[0].risk_level,
          decision
        });
        const payloadId = crypto.randomUUID();
        const encryptedDecision = encryptAgentPayload({
          runId,
          payloadId,
          kind: 'user_input',
          value: {
            type: 'approval_decision',
            actionType: approval.rows[0].action_type,
            decision,
            reason: sanitizeText(decisionReason, 500)
          },
          env
        });
        await client.query(
          `INSERT INTO agent_run_payloads
            (id,run_id,kind,algorithm,key_version,iv,auth_tag,ciphertext,expires_at)
           VALUES ($1,$2,'user_input',$3,$4,$5,$6,$7,
             clock_timestamp()+($8::text || ' days')::interval)`,
          [
            payloadId,
            runId,
            encryptedDecision.algorithm,
            encryptedDecision.keyVersion,
            encryptedDecision.iv,
            encryptedDecision.authTag,
            encryptedDecision.ciphertext,
            config.retentionDays
          ]
        );
        eventType = `approval.${decision}`;
        summary = decision === 'approved' ? '用户已批准关键动作' : '用户已拒绝关键动作';
      } else {
        const normalizedMessage = String(message || '').trim();
        if (!normalizedMessage && !takeoverEnded) {
          throw new ApiError(400, 'AGENT_INPUT_REQUIRED', { field: 'message' });
        }
        if (normalizedMessage.length > 20_000) {
          throw new ApiError(413, 'AGENT_INPUT_TOO_LARGE', { field: 'message' });
        }
        if (normalizedMessage) {
          const payloadId = crypto.randomUUID();
          const encrypted = encryptAgentPayload({
            runId,
            payloadId,
            kind: 'user_input',
            value: { message: normalizedMessage },
            env
          });
          await client.query(
            `INSERT INTO agent_run_payloads
              (id,run_id,kind,algorithm,key_version,iv,auth_tag,ciphertext,expires_at)
             VALUES ($1,$2,'user_input',$3,$4,$5,$6,$7,
               clock_timestamp()+($8::text || ' days')::interval)`,
            [
              payloadId,
              runId,
              encrypted.algorithm,
              encrypted.keyVersion,
              encrypted.iv,
              encrypted.authTag,
              encrypted.ciphertext,
              config.retentionDays
            ]
          );
        }
        if (takeoverEnded) {
          const normalizedTakeoverApprovalId = String(takeoverApprovalId || '').trim();
          if (!UUID_RE.test(normalizedTakeoverApprovalId)) {
            throw new ApiError(400, 'AGENT_TAKEOVER_APPROVAL_REQUIRED', {
              field: 'takeoverApprovalId'
            });
          }
          const takeover = await client.query(
            `UPDATE agent_approvals
                SET status='approved',decided_by_user_id=$2,decided_at=now(),used_at=NULL
              WHERE run_id=$1 AND id=$3 AND status='pending' AND risk_level='blocked'
                AND expires_at>now()`,
            [runId, dbUserId, normalizedTakeoverApprovalId]
          );
          if (!takeover.rowCount) throw new ApiError(404, 'AGENT_APPROVAL_NOT_AVAILABLE');
          await revokeDesktopTickets(client, runId);
          const payloadId = crypto.randomUUID();
          const encryptedTakeover = encryptAgentPayload({
            runId,
            payloadId,
            kind: 'user_input',
            value: {
              type: 'takeover_ended',
              approvalId: normalizedTakeoverApprovalId,
              message: '用户已完成登录或 CAPTCHA 接管。'
            },
            env
          });
          await client.query(
            `INSERT INTO agent_run_payloads
              (id,run_id,kind,algorithm,key_version,iv,auth_tag,ciphertext,expires_at)
             VALUES ($1,$2,'user_input',$3,$4,$5,$6,$7,
               clock_timestamp()+($8::text || ' days')::interval)`,
            [
              payloadId,
              runId,
              encryptedTakeover.algorithm,
              encryptedTakeover.keyVersion,
              encryptedTakeover.iv,
              encryptedTakeover.authTag,
              encryptedTakeover.ciphertext,
              config.retentionDays
            ]
          );
          eventType = 'takeover.ended';
          summary = '用户已结束接管';
        }
      }
      if (['waiting_user', 'paused'].includes(row.status)) {
        const pending = await client.query(
          `SELECT 1 FROM agent_approvals
            WHERE run_id=$1 AND status='pending' AND expires_at>now()
            LIMIT 1`,
          [runId]
        );
        if (!pending.rowCount) {
          await client.query(
            `UPDATE agent_runs
                SET status='queued',pause_requested=false,queued_at=now(),
                    queue_expires_at=clock_timestamp()+($2::text || ' hours')::interval,
                    worker_id=NULL,lease_expires_at=NULL,updated_at=now()
              WHERE id=$1`,
            [runId, config.queueMaxWaitHours]
          );
          await client.query(
            `UPDATE agent_budget_holds
                SET expires_at=clock_timestamp()+($2::text || ' minutes')::interval
              WHERE run_id=$1 AND status='held'`,
            [runId, config.queueMaxWaitHours * 60 + config.maxMinutes + 15]
          );
          shouldEnqueue = true;
        }
      }
      await insertEvent(client, {
        runId,
        type: eventType,
        phase: shouldEnqueue ? 'queued' : row.status,
        summary,
        data: approvalId
          ? { approvalId, decision }
          : {
              takeoverEnded: Boolean(takeoverEnded),
              takeoverApprovalId: takeoverEnded ? takeoverApprovalId : undefined
            }
      });
      return true;
    });
    if (shouldEnqueue) await enqueue(runId);
    return result;
  };

  const claimRun = async ({ runId, workerId }) => withTransaction(pool, async (client) => {
    const result = await client.query(
      `UPDATE agent_runs
          SET status='provisioning',worker_id=$2,lease_epoch=lease_epoch+1,
              lease_expires_at=clock_timestamp()+($3::text || ' seconds')::interval,
              started_at=COALESCE(started_at,now()),updated_at=now()
        WHERE id=$1 AND status='queued' AND pause_requested=false AND cancel_requested=false
          AND queue_expires_at>clock_timestamp()
        RETURNING *`,
      [runId, workerId, config.leaseSeconds]
    );
    if (!result.rowCount) return null;
    await client.query(
      `UPDATE agent_budget_holds
          SET expires_at=clock_timestamp()+($2::text || ' minutes')::interval
        WHERE run_id=$1 AND status='held'`,
      [runId, config.maxMinutes + 15]
    );
    await insertEvent(client, {
      runId,
      type: 'run.provisioning',
      phase: 'provisioning',
      summary: '正在创建隔离云电脑'
    });
    return result.rows[0];
  });

  const loadPrivateContext = async ({ runId }) => withTransaction(pool, async (client) => {
    const run = await client.query('SELECT * FROM agent_runs WHERE id=$1', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    const payloads = await client.query(
      `SELECT * FROM agent_run_payloads
        WHERE run_id=$1 AND expires_at>now()
        ORDER BY created_at`,
      [runId]
    );
    const modelCheckpoint = await client.query(
      `SELECT * FROM agent_model_checkpoints
        WHERE run_id=$1 AND expires_at>now()
        LIMIT 1`,
      [runId]
    );
    return {
      run: run.rows[0],
      payloads: payloads.rows.map((record) => ({
        kind: record.kind,
        value: decryptAgentPayload({
          runId,
          payloadId: record.id,
          kind: record.kind,
          record,
          env
        })
      })),
      modelCheckpoint: modelCheckpoint.rowCount
        ? decryptAgentPayload({
            runId,
            payloadId: modelCheckpoint.rows[0].id,
            kind: 'model_checkpoint',
            record: modelCheckpoint.rows[0],
            env
          })
        : null
    };
  });

  const decodeToolReceipt = (row) => ({
    id: row.id,
    key: row.receipt_key,
    kind: row.kind,
    state: row.state,
    subagentId: row.subagent_id || null,
    reservationKey: row.reservation_key,
    requestSha256: Buffer.from(row.request_sha256).toString('hex'),
    actualCredits: row.actual_credits === null ? null : Number(row.actual_credits),
    result: row.result_ciphertext
      ? decryptAgentPayload({
          runId: row.run_id,
          payloadId: row.id,
          kind: 'tool_call_result',
          record: {
            algorithm: row.algorithm,
            iv: row.result_iv,
            auth_tag: row.result_auth_tag,
            ciphertext: row.result_ciphertext
          },
          env
        })
      : null,
    leaseEpoch: Number(row.lease_epoch || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });

  const listToolReceipts = async ({ runId, workerId, leaseEpoch }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
      const result = await client.query(
        `SELECT * FROM agent_tool_call_receipts
          WHERE run_id=$1 AND expires_at>clock_timestamp()
          ORDER BY created_at,id`,
        [runId]
      );
      return result.rows.map(decodeToolReceipt);
    }
  );

  const persistToolReceipt = async ({
    runId,
    workerId,
    leaseEpoch,
    subagentId = null,
    receiptKey,
    kind,
    state,
    reservationKey,
    requestSha256,
    actualCredits = null,
    result = null,
    legacyImport = false
  }) => {
    const normalizedKey = normalizeToolReceiptKey(receiptKey);
    const normalizedReservationKey = normalizeToolReceiptKey(reservationKey);
    const normalizedKind = String(kind || '').trim();
    const normalizedState = String(state || '').trim();
    const normalizedHash = normalizeSha256(requestSha256);
    if (!TOOL_RECEIPT_KINDS.has(normalizedKind)) {
      throw new ApiError(400, 'AGENT_TOOL_RECEIPT_KIND_INVALID');
    }
    if (!TOOL_RECEIPT_STATES.has(normalizedState)) {
      throw new ApiError(400, 'AGENT_TOOL_RECEIPT_STATE_INVALID');
    }
    if (subagentId !== null && !UUID_RE.test(String(subagentId || ''))) {
      throw new ApiError(400, 'AGENT_TOOL_RECEIPT_SUBAGENT_INVALID');
    }
    const normalizedCredits = actualCredits === null ? null : Number(actualCredits);
    if (
      normalizedState === 'consumed' &&
      (!Number.isFinite(normalizedCredits) || normalizedCredits < 0 || result === null)
    ) {
      throw new ApiError(400, 'AGENT_TOOL_RECEIPT_RESULT_INVALID');
    }
    if (normalizedState !== 'consumed' && (normalizedCredits !== null || result !== null)) {
      throw new ApiError(400, 'AGENT_TOOL_RECEIPT_RESULT_INVALID');
    }

    return withTransaction(pool, async (client) => {
      const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
      if (!['provisioning', 'running', 'verifying'].includes(run.rows[0].status)) {
        throw new ApiError(409, 'AGENT_STATE_TRANSITION_INVALID');
      }
      if (subagentId) {
        const subagent = await client.query(
          'SELECT 1 FROM agent_subagents WHERE id=$1 AND run_id=$2',
          [subagentId, runId]
        );
        if (!subagent.rowCount) throw new ApiError(404, 'AGENT_SUBAGENT_NOT_FOUND');
      }
      const existing = await client.query(
        `SELECT * FROM agent_tool_call_receipts
          WHERE run_id=$1 AND receipt_key=$2
          FOR UPDATE`,
        [runId, normalizedKey]
      );
      const prior = existing.rows[0] || null;
      const hashBuffer = Buffer.from(normalizedHash, 'hex');
      if (prior && (
        prior.kind !== normalizedKind ||
        String(prior.subagent_id || '') !== String(subagentId || '') ||
        prior.reservation_key !== normalizedReservationKey ||
        !secureEqual(prior.request_sha256, hashBuffer)
      )) {
        throw new ApiError(409, 'AGENT_TOOL_RECEIPT_CONFLICT', { retryable: false });
      }
      if (prior?.state === normalizedState) return decodeToolReceipt(prior);
      if (
        (!prior && normalizedState !== 'dispatched' && legacyImport !== true) ||
        (prior && prior.state !== 'dispatched') ||
        (prior && !['consumed', 'ambiguous'].includes(normalizedState))
      ) {
        throw new ApiError(409, 'AGENT_TOOL_RECEIPT_TRANSITION_INVALID', {
          from: prior?.state || null,
          to: normalizedState,
          retryable: false
        });
      }
      const receiptId = prior?.id || crypto.randomUUID();
      const encrypted = normalizedState === 'consumed'
        ? encryptAgentPayload({
            runId,
            payloadId: receiptId,
            kind: 'tool_call_result',
            value: result,
            env
          })
        : null;
      const updated = prior
        ? await client.query(
            `UPDATE agent_tool_call_receipts
                SET state=$3,worker_id=$4,lease_epoch=$5,actual_credits=$6,
                    result_iv=$7,result_auth_tag=$8,result_ciphertext=$9,
                    consumed_at=CASE WHEN $3='consumed' THEN clock_timestamp() ELSE NULL END,
                    ambiguous_at=CASE WHEN $3='ambiguous' THEN clock_timestamp() ELSE NULL END,
                    updated_at=clock_timestamp()
              WHERE id=$1 AND run_id=$2
              RETURNING *`,
            [
              receiptId, runId, normalizedState, workerId, Number(leaseEpoch), normalizedCredits,
              encrypted?.iv || null, encrypted?.authTag || null, encrypted?.ciphertext || null
            ]
          )
        : await client.query(
            `INSERT INTO agent_tool_call_receipts
              (id,run_id,subagent_id,receipt_key,kind,state,worker_id,lease_epoch,
               reservation_key,request_sha256,actual_credits,algorithm,key_version,
               result_iv,result_auth_tag,result_ciphertext,consumed_at,ambiguous_at,expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
               COALESCE($12,'aes-256-gcm-v1'),COALESCE($13,1),$14,$15,$16,
               CASE WHEN $6='consumed' THEN clock_timestamp() ELSE NULL END,
               CASE WHEN $6='ambiguous' THEN clock_timestamp() ELSE NULL END,
               clock_timestamp()+($17::text || ' days')::interval)
             RETURNING *`,
            [
              receiptId, runId, subagentId, normalizedKey, normalizedKind, normalizedState,
              workerId, Number(leaseEpoch), normalizedReservationKey, hashBuffer, normalizedCredits,
              encrypted?.algorithm || null, encrypted?.keyVersion || null, encrypted?.iv || null,
              encrypted?.authTag || null, encrypted?.ciphertext || null, config.retentionDays
            ]
          );
      return decodeToolReceipt(updated.rows[0]);
    });
  };

  const removeDispatchedToolReceipt = async ({
    runId,
    workerId,
    leaseEpoch,
    receiptKey,
    requestSha256
  }) => withTransaction(pool, async (client) => {
    const normalizedKey = normalizeToolReceiptKey(receiptKey);
    const normalizedHash = normalizeSha256(requestSha256);
    const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    const removed = await client.query(
      `DELETE FROM agent_tool_call_receipts
        WHERE run_id=$1 AND receipt_key=$2 AND state='dispatched'
          AND request_sha256=$3
        RETURNING id`,
      [runId, normalizedKey, Buffer.from(normalizedHash, 'hex')]
    );
    return removed.rowCount > 0;
  });

  const clearLegacyToolReceiptCheckpoint = async ({ runId, workerId, leaseEpoch }) => {
    const result = await pool.query(
      `UPDATE agent_runs
          SET checkpoint=checkpoint-'toolReceipts',updated_at=clock_timestamp()
        WHERE id=$1 AND worker_id=$2 AND lease_epoch=$3
          AND lease_expires_at>clock_timestamp()
          AND status IN ('provisioning','running','verifying')
        RETURNING id`,
      [runId, workerId, Number(leaseEpoch || 0)]
    );
    if (!result.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
    return true;
  };

  const transitionRun = async ({
    runId,
    workerId,
    leaseEpoch,
    toStatus,
    eventType,
    summary,
    checkpoint,
    sandboxRef,
    displayUrl
  }) => withTransaction(pool, async (client) => {
    const current = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
    if (!current.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    const row = current.rows[0];
    assertWorkerLease(row, { workerId, leaseEpoch });
    if (!ALLOWED_TRANSITIONS[row.status]?.has(toStatus) && row.status !== toStatus) {
      throw new ApiError(409, 'AGENT_STATE_TRANSITION_INVALID', {
        from: row.status,
        to: toStatus
      });
    }
    const result = await client.query(
      `UPDATE agent_runs
          SET status=$2,
              checkpoint=CASE
                WHEN $3::jsonb IS NULL THEN checkpoint
                ELSE checkpoint || $3::jsonb
              END,
              sandbox_ref=COALESCE($4,sandbox_ref),
              display_url=COALESCE($5,display_url),
              sandbox_worker_id=CASE
                WHEN $4::text IS NOT NULL AND $7::text IS NOT NULL THEN $7::text
                ELSE sandbox_worker_id
              END,
              lease_expires_at=CASE
                WHEN $2 IN ('succeeded','failed','cancelled','paused','waiting_user') THEN NULL
                ELSE clock_timestamp()+($6::text || ' seconds')::interval
              END,
              worker_id=CASE
                WHEN $2 IN ('succeeded','failed','cancelled','paused','waiting_user') THEN NULL
                ELSE worker_id
              END,
              updated_at=now()
        WHERE id=$1 RETURNING *`,
      [
        runId,
        toStatus,
        checkpoint === undefined ? null : JSON.stringify(sanitizeLogValue(checkpoint)),
        sandboxRef || null,
        displayUrl || null,
        config.leaseSeconds,
        workerId || null
      ]
    );
    await revokeDesktopTickets(client, runId);
    await insertEvent(client, {
      runId,
      type: eventType || `run.${toStatus}`,
      phase: toStatus,
      summary: summary || `任务状态更新为 ${toStatus}`
    });
    return result.rows[0];
  });

  const appendStep = async ({
    runId,
    workerId,
    leaseEpoch,
    subagentId = null,
    role,
    status,
    toolName = null,
    riskLevel = 'low',
    summary = '',
    sanitizedInput = {},
    sanitizedOutput = {},
    actionFingerprint = null
  }) => withTransaction(pool, async (client) => {
    const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    let subagent = null;
    if (subagentId) {
      const selected = await client.query(
        'SELECT * FROM agent_subagents WHERE id=$1 AND run_id=$2 FOR UPDATE',
        [subagentId, runId]
      );
      if (!selected.rowCount) throw new ApiError(404, 'AGENT_SUBAGENT_NOT_FOUND');
      subagent = selected.rows[0];
      if (subagent.status !== 'running' || subagent.cancel_requested) {
        throw new ApiError(409, 'AGENT_SUBAGENT_NOT_RUNNING');
      }
      if (Number(subagent.step_count || 0) + 1 > config.subagentMaxSteps) {
        throw new ApiError(409, 'AGENT_SUBAGENT_STEP_LIMIT_REACHED');
      }
    }
    const sequence = Number(run.rows[0].step_count || 0) + 1;
    if (sequence > config.maxSteps) throw new ApiError(409, 'AGENT_STEP_LIMIT_REACHED');
    const previousStep = status === 'failed'
      ? await client.query(
          `SELECT status,action_fingerprint
             FROM agent_steps
            WHERE run_id=$1
              AND subagent_id IS NOT DISTINCT FROM $2::uuid
            ORDER BY sequence DESC
            LIMIT 1`,
          [runId, subagentId]
        )
      : { rows: [] };
    const previous = previousStep.rows[0] || {};
    const nextFailureCount = nextConsecutiveFailureCount({
      currentCount: subagent
        ? subagent.consecutive_failures
        : run.rows[0].consecutive_failures,
      currentStatus: status,
      currentFingerprint: actionFingerprint,
      previousStatus: previous.status,
      previousFingerprint: previous.action_fingerprint
    });
    const step = await client.query(
      `INSERT INTO agent_steps
        (run_id,subagent_id,sequence,role,status,tool_name,action_fingerprint,risk_level,
         summary,sanitized_input,sanitized_output,started_at,finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),
         CASE WHEN $5 IN ('succeeded','failed','skipped') THEN now() ELSE NULL END)
       RETURNING *`,
      [
        runId,
        subagentId,
        sequence,
        role,
        status,
        toolName,
        actionFingerprint,
        riskLevel,
        sanitizeText(summary, 500),
        JSON.stringify(sanitizeLogValue(sanitizedInput)),
        JSON.stringify(sanitizeLogValue(sanitizedOutput))
      ]
    );
    if (subagent) {
      await client.query(
        `UPDATE agent_subagents
            SET step_count=step_count+1,
                consecutive_failures=$2,
                updated_at=now()
          WHERE id=$1`,
        [subagentId, nextFailureCount]
      );
    }
    await client.query(
      `UPDATE agent_runs
          SET step_count=$2,
              consecutive_failures=CASE
                WHEN $4::boolean THEN consecutive_failures
                ELSE $5
              END,
              lease_expires_at=clock_timestamp()+($3::text || ' seconds')::interval,
              updated_at=now()
        WHERE id=$1`,
      [runId, sequence, config.leaseSeconds, Boolean(subagentId), nextFailureCount]
    );
    await insertEvent(client, {
      runId,
      subagentId,
      type: 'step.recorded',
      phase: run.rows[0].status,
      summary,
      data: { sequence, role, status, toolName, riskLevel, subagentId }
    });
    return step.rows[0];
  });

  const getControlState = async ({ runId }) => {
    const result = await pool.query(
      `SELECT status,pause_requested,cancel_requested,step_count,replan_count,
              consecutive_failures,unchanged_screenshots
         FROM agent_runs WHERE id=$1`,
      [runId]
    );
    if (!result.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    return result.rows[0];
  };

  const assertWorkerLeaseActive = async ({ runId, workerId, leaseEpoch }) => {
    const result = await pool.query(
      `SELECT 1 FROM agent_runs
        WHERE id=$1 AND worker_id=$2 AND lease_epoch=$3
          AND lease_expires_at>clock_timestamp()
          AND status IN ('provisioning','running','verifying')`,
      [runId, workerId, Number(leaseEpoch || 0)]
    );
    if (!result.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
    return true;
  };

  const recordUsage = async ({ runId, workerId, leaseEpoch, estimatedCredits, items = {} }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
      const estimated = Math.max(0, Number(estimatedCredits || 0));
      if (estimated > Number(run.rows[0].max_credits || 0)) {
        throw new ApiError(409, 'AGENT_BUDGET_EXCEEDED');
      }
      await client.query(
        `UPDATE agent_runs
            SET estimated_credits_used=GREATEST(estimated_credits_used,$2),
                lease_expires_at=clock_timestamp()+($3::text || ' seconds')::interval,
                updated_at=now()
          WHERE id=$1`,
        [runId, estimated, config.leaseSeconds]
      );
      const persisted = Math.max(
        Number(run.rows[0].estimated_credits_used || 0),
        estimated
      );
      await insertEvent(client, {
        runId,
        type: 'cost.updated',
        phase: run.rows[0].status,
        summary: '费用估算已更新',
        data: { estimatedCredits: persisted, items }
      });
      return persisted;
    }
  );

  const reserveRuntimeBudget = async ({
    runId,
    workerId,
    leaseEpoch,
    component,
    reservationKey,
    maximumCredits,
    subagentId = null,
    modelCallId = null,
    preserveVerifierCredits = 0
  }) => withTransaction(pool, async (client) => {
    const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    const requested = Math.max(0, Number(maximumCredits || 0));
    if (!Number.isFinite(requested)) throw new ApiError(400, 'AGENT_BUDGET_INVALID');
    const key = sanitizeText(reservationKey, 200);
    if (!key) throw new ApiError(400, 'AGENT_BUDGET_RESERVATION_KEY_INVALID');
    const existing = await client.query(
      'SELECT * FROM agent_budget_reservations WHERE run_id=$1 AND reservation_key=$2 FOR UPDATE',
      [runId, key]
    );
    if (existing.rowCount) return existing.rows[0];
    const totals = await client.query(
      `SELECT
         COALESCE(sum(CASE WHEN state='reserved' THEN reserved_credits ELSE 0 END),0)::numeric AS reserved,
         COALESCE(sum(CASE WHEN state='consumed' THEN actual_credits ELSE 0 END),0)::numeric AS consumed
       FROM agent_budget_reservations WHERE run_id=$1`,
      [runId]
    );
    const committed = Number(totals.rows[0]?.reserved || 0) + Number(totals.rows[0]?.consumed || 0);
    const verifierReserve = component === 'verifier'
      ? 0
      : Math.max(0, Number(preserveVerifierCredits || 0));
    if (committed + requested + verifierReserve > Number(run.rows[0].max_credits || 0) + 1e-9) {
      throw new ApiError(409, 'AGENT_BUDGET_EXCEEDED', {
        requestedCredits: requested,
        remainingCredits: Math.max(0, Number(run.rows[0].max_credits || 0) - committed),
        verifierReserveCredits: verifierReserve
      });
    }
    const inserted = await client.query(
      `INSERT INTO agent_budget_reservations
        (run_id,model_call_id,subagent_id,component,reservation_key,reserved_credits)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [runId, modelCallId, subagentId, component, key, requested]
    );
    return inserted.rows[0];
  });

  const consumeRuntimeBudget = async ({
    runId,
    workerId,
    leaseEpoch,
    reservationKey,
    actualCredits
  }) => {
    const consumedReservation = await withTransaction(pool, async (client) => {
    const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    let actual = Math.max(0, Number(actualCredits || 0));
    if (!Number.isFinite(actual)) throw new ApiError(400, 'AGENT_BUDGET_INVALID');
    const reservation = await client.query(
      'SELECT * FROM agent_budget_reservations WHERE run_id=$1 AND reservation_key=$2 FOR UPDATE',
      [runId, sanitizeText(reservationKey, 200)]
    );
    if (!reservation.rowCount) throw new ApiError(404, 'AGENT_BUDGET_RESERVATION_NOT_FOUND');
    if (reservation.rows[0].state === 'consumed') return reservation.rows[0];
    if (reservation.rows[0].state === 'released') {
      let receiptCredits = null;
      if (reservation.rows[0].model_call_id) {
        const receipt = await client.query(
          `SELECT * FROM agent_model_call_receipts
            WHERE id=$1 AND run_id=$2 AND state IN ('received','consumed')
            FOR UPDATE`,
          [reservation.rows[0].model_call_id, runId]
        );
        if (receipt.rowCount && receipt.rows[0].response_ciphertext) {
          const payload = decryptAgentPayload({
            runId,
            payloadId: receipt.rows[0].id,
            kind: 'model_call_response',
            record: {
              algorithm: receipt.rows[0].algorithm,
              iv: receipt.rows[0].response_iv,
              auth_tag: receipt.rows[0].response_auth_tag,
              ciphertext: receipt.rows[0].response_ciphertext
            },
            env
          });
          const usage = payload?.response?.usage || {};
          const tokenCount = (value) => {
            const parsed = Number(value || 0);
            return Number.isFinite(parsed)
              ? Math.ceil(Math.max(0, Math.min(1_000_000_000, parsed)))
              : 0;
          };
          receiptCredits = usageCreditsForRun({
            inputTokens: tokenCount(usage.prompt_tokens || usage.input_tokens),
            outputTokens: tokenCount(usage.completion_tokens || usage.output_tokens),
            config,
            run: run.rows[0]
          });
        }
      }
      if (receiptCredits === null) {
        const receipt = await client.query(
          `SELECT actual_credits FROM agent_tool_call_receipts
            WHERE run_id=$1 AND reservation_key=$2 AND state='consumed'
            FOR UPDATE`,
          [runId, sanitizeText(reservationKey, 200)]
        );
        if (receipt.rowCount) receiptCredits = Number(receipt.rows[0].actual_credits || 0);
      }
      if (receiptCredits === null) {
        throw new ApiError(409, 'AGENT_BUDGET_RESERVATION_RELEASED');
      }
      if (Math.abs(actual - receiptCredits) > 0.00011) {
        throw new ApiError(409, 'AGENT_BUDGET_RECEIPT_COST_MISMATCH', {
          retryable: false
        });
      }
      actual = receiptCredits;
    } else if (reservation.rows[0].state !== 'reserved') {
      throw new ApiError(409, 'AGENT_BUDGET_RESERVATION_RELEASED');
    }
    const updated = await client.query(
      `UPDATE agent_budget_reservations
          SET state='consumed',actual_credits=$3,consumed_at=clock_timestamp(),
              released_at=NULL,updated_at=clock_timestamp()
        WHERE run_id=$1 AND reservation_key=$2 RETURNING *`,
      [runId, sanitizeText(reservationKey, 200), actual]
    );
    const totals = await client.query(
      `SELECT COALESCE(sum(actual_credits),0)::numeric AS consumed
         FROM agent_budget_reservations WHERE run_id=$1 AND state='consumed'`,
      [runId]
    );
    const consumed = Number(totals.rows[0]?.consumed || 0);
    await client.query(
      `UPDATE agent_runs
          SET estimated_credits_used=GREATEST(
                estimated_credits_used,
                LEAST(max_credits::numeric,$2::numeric)
              ),
              platform_overrun_credits=GREATEST(
                platform_overrun_credits,
                GREATEST(0::numeric,$2::numeric-max_credits::numeric)
              ),
              lease_expires_at=clock_timestamp()+($3::text || ' seconds')::interval,
              updated_at=now()
        WHERE id=$1`,
      [runId, consumed, config.leaseSeconds]
    );
      return updated.rows[0];
    });
    await testController?.hit('after_budget_consume', {
      runId,
      reservationKey: sanitizeText(reservationKey, 200)
    });
    return consumedReservation;
  };

  const releaseRuntimeBudget = async ({ runId, workerId, leaseEpoch, reservationKey }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
      const result = await client.query(
      `UPDATE agent_budget_reservations
          SET state='released',released_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE run_id=$1 AND reservation_key=$2 AND state='reserved'
        RETURNING *`,
      [runId, sanitizeText(reservationKey, 200)]
      );
      return result.rows[0] || null;
    }
  );

  const saveCheckpoint = async ({ runId, workerId, leaseEpoch, checkpoint }) => withTransaction(
    pool,
    async (client) => {
      const result = await client.query(
        `UPDATE agent_runs
            SET checkpoint=checkpoint || $3::jsonb,
                lease_expires_at=clock_timestamp()+($4::text || ' seconds')::interval,
                updated_at=now()
          WHERE id=$1
            AND worker_id=$2
            AND lease_epoch=$5
            AND lease_expires_at>clock_timestamp()
            AND status IN ('provisioning','running','verifying')
          RETURNING checkpoint`,
        [
          runId,
          workerId,
          JSON.stringify(sanitizeLogValue(checkpoint || {})),
          config.leaseSeconds,
          Number(leaseEpoch || 0)
        ]
      );
      if (!result.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
      return result.rows[0].checkpoint;
    }
  );

  const saveModelCheckpoint = async ({
    runId,
    workerId,
    leaseEpoch,
    value
  }) => withTransaction(pool, async (client) => {
    const run = await client.query(
      'SELECT id,status,worker_id,lease_epoch,lease_expires_at FROM agent_runs WHERE id=$1 FOR UPDATE',
      [runId]
    );
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    if (!['provisioning', 'running', 'verifying'].includes(run.rows[0].status)) {
      throw new ApiError(409, 'AGENT_STATE_TRANSITION_INVALID');
    }
    const existing = await client.query(
      'SELECT id FROM agent_model_checkpoints WHERE run_id=$1 FOR UPDATE',
      [runId]
    );
    const payloadId = existing.rows[0]?.id || crypto.randomUUID();
    const encrypted = encryptAgentPayload({
      runId,
      payloadId,
      kind: 'model_checkpoint',
      value,
      env
    });
    await client.query(
      `INSERT INTO agent_model_checkpoints
        (id,run_id,algorithm,key_version,iv,auth_tag,ciphertext,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,
         clock_timestamp()+($8::text || ' days')::interval)
       ON CONFLICT (run_id) DO UPDATE
         SET algorithm=EXCLUDED.algorithm,
             key_version=EXCLUDED.key_version,
             iv=EXCLUDED.iv,
             auth_tag=EXCLUDED.auth_tag,
             ciphertext=EXCLUDED.ciphertext,
             expires_at=EXCLUDED.expires_at,
             updated_at=now()`,
      [
        payloadId,
        runId,
        encrypted.algorithm,
        encrypted.keyVersion,
        encrypted.iv,
        encrypted.authTag,
        encrypted.ciphertext,
        config.retentionDays
      ]
    );
    await client.query(
      `UPDATE agent_runs
          SET checkpoint=checkpoint || $3::jsonb,
              lease_expires_at=clock_timestamp()+($4::text || ' seconds')::interval,
              updated_at=now()
        WHERE id=$1 AND worker_id=$2`,
      [
        runId,
        workerId,
        JSON.stringify({
          modelResponseId: String(value?.responseId || '').slice(0, 200),
          durableToolResume: true
        }),
        config.leaseSeconds
      ]
    );
    return true;
  });

  const clearModelCheckpoint = async ({ runId, workerId, leaseEpoch }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query(
        'SELECT status,worker_id,lease_epoch,lease_expires_at FROM agent_runs WHERE id=$1 FOR UPDATE',
        [runId]
      );
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
      await client.query('DELETE FROM agent_model_checkpoints WHERE run_id=$1', [runId]);
      await client.query(
        `UPDATE agent_runs
            SET checkpoint=checkpoint - 'durableToolResume',updated_at=now()
          WHERE id=$1`,
        [runId]
      );
      return true;
    }
  );

  const savePlan = async ({ runId, workerId, leaseEpoch, plan, explanation }) => withTransaction(
    pool,
    async (client) => {
      const locked = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
      if (!locked.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      assertWorkerLease(locked.rows[0], { workerId, leaseEpoch });
      if (locked.rows[0].status !== 'running') throw new ApiError(409, 'AGENT_RUN_NOT_RUNNING');
      const requested = Array.isArray(plan) ? plan : [];
      const prior = Array.isArray(locked.rows[0].checkpoint?.plan)
        ? locked.rows[0].checkpoint.plan
        : [];
      if (!requested.length || requested.length > 12) {
        throw new ApiError(400, 'AGENT_PLAN_INVALID');
      }
      const priorById = new Map(prior.map((step) => [String(step?.id || ''), step]));
      if (prior.length && (
        requested.length !== prior.length ||
        requested.some((step, index) => (
          String(step?.id || '') !== String(prior[index]?.id || '') ||
          !priorById.has(String(step?.id || ''))
        ))
      )) {
        throw new ApiError(400, 'AGENT_PLAN_INVALID', { reason: 'stable_step_ids_required' });
      }
      let pendingSeen = false;
      let inProgressCount = 0;
      const normalized = requested.map((step, index) => {
        const id = sanitizeText(step?.id, 80);
        const label = sanitizeText(step?.label, 160);
        const status = String(step?.status || '');
        const priorStep = priorById.get(id);
        if (!id || !label || !['pending', 'in_progress', 'completed'].includes(status)) {
          throw new ApiError(400, 'AGENT_PLAN_INVALID');
        }
        if (priorStep?.status === 'completed' && status !== 'completed') {
          throw new ApiError(400, 'AGENT_PLAN_INVALID', { reason: 'completed_step_is_immutable' });
        }
        if (status === 'in_progress') inProgressCount += 1;
        if (status === 'pending') pendingSeen = true;
        if (pendingSeen && status === 'completed') {
          throw new ApiError(400, 'AGENT_PLAN_INVALID', { reason: 'completed_steps_must_be_prefix' });
        }
        const requestedPhase = String(step?.phase || '');
        if (
          !priorStep &&
          Number(locked.rows[0].runtime_version || 1) === 2 &&
          !PHASES.has(requestedPhase)
        ) {
          throw new ApiError(400, 'AGENT_PLAN_INVALID', {
            reason: 'server_phase_required'
          });
        }
        return {
          id,
          label,
          phase: priorStep?.phase || String(requestedPhase || (index === requested.length - 1
            ? 'verification'
            : 'production')),
          status
        };
      });
      if (inProgressCount > 1) throw new ApiError(400, 'AGENT_PLAN_INVALID');
      const substantiveReplan = prior.length > 0 && normalized.some((step, index) => (
        step.label !== String(prior[index]?.label || '')
      ));
      if (substantiveReplan && Number(locked.rows[0].replan_count || 0) >= 3) {
        throw new ApiError(409, 'AGENT_REPLAN_LIMIT_REACHED');
      }
      const result = await client.query(
        `UPDATE agent_runs
            SET checkpoint=checkpoint || $3::jsonb,
                replan_count=replan_count+$6,
                lease_expires_at=clock_timestamp()+($4::text || ' seconds')::interval,
                updated_at=now()
          WHERE id=$1
            AND worker_id=$2
            AND lease_epoch=$5
            AND lease_expires_at>clock_timestamp()
            AND status='running'
          RETURNING checkpoint,replan_count`,
        [
          runId,
          workerId,
          JSON.stringify(sanitizeLogValue({
            plan: normalized,
            planExplanation: explanation
          })),
          config.leaseSeconds,
          Number(leaseEpoch || 0),
          substantiveReplan ? 1 : 0
        ]
      );
      if (!result.rowCount) {
        throw new ApiError(409, 'AGENT_LEASE_LOST');
      }
      return { ...result.rows[0], steps: normalized };
    }
  );

  const appendRuntimeEvent = async ({
    runId,
    workerId,
    leaseEpoch,
    type,
    phase = null,
    summary = '',
    data = {}
  }) => withTransaction(pool, async (client) => {
    const eventType = sanitizeText(type, 100);
    const lease = await client.query(
      `SELECT 1 FROM agent_runs
        WHERE id=$1 AND worker_id=$2 AND lease_epoch=$3
          AND lease_expires_at>clock_timestamp()
          AND status IN ('running','verifying')
        FOR UPDATE`,
      [runId, workerId, Number(leaseEpoch || 0)]
    );
    if (!lease.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
    const sanitizedData = sanitizeLogValue(data);
    let eventData = sanitizedData && typeof sanitizedData === 'object' && !Array.isArray(sanitizedData)
      ? sanitizedData
      : {};
    if (eventType === 'run.ready_to_finalize') {
      const existingBoundary = await client.query(
        `SELECT * FROM agent_events
          WHERE run_id=$1 AND event_type='run.ready_to_finalize'
          ORDER BY id
          LIMIT 1`,
        [runId]
      );
      if (existingBoundary.rowCount) return publicEvent(existingBoundary.rows[0]);
      const modelCallBoundary = await client.query(
        'SELECT count(*)::integer AS count FROM agent_model_calls WHERE run_id=$1',
        [runId]
      );
      eventData = {
        ...eventData,
        modelCallCount: Number(modelCallBoundary.rows[0]?.count || 0)
      };
    }
    return insertEvent(client, {
      runId,
      type: eventType,
      phase: phase ? sanitizeText(phase, 80) : null,
      summary: sanitizeText(summary, 500),
      data: eventData
    });
  });

  const pinRuntimeProfile = async ({ runId, workerId, leaseEpoch, profile }) => {
    if (!profile || Number(profile.runtimeVersion) !== 2) {
      throw new ApiError(400, 'AGENT_RUNTIME_PROFILE_INVALID');
    }
    const promptHash = String(profile.promptHash || '').toLowerCase();
    const runtimeProfileHash = String(profile.runtimeProfileHash || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(promptHash) || !/^[a-f0-9]{64}$/.test(runtimeProfileHash)) {
      throw new ApiError(400, 'AGENT_RUNTIME_PROFILE_INVALID');
    }
    const profileValues = {
      promptProfile: sanitizeText(profile.promptProfile, 80),
      promptHash: Buffer.from(promptHash, 'hex'),
      skillVersions: Object.fromEntries(
        (Array.isArray(profile.skills) ? profile.skills : [])
          .map((skill) => [sanitizeText(skill.id, 80), Number(skill.version || 0)])
          .filter(([id, version]) => id && Number.isSafeInteger(version) && version > 0)
      ),
      runtimeProfileHash: Buffer.from(runtimeProfileHash, 'hex'),
      runtimeProfileSummary: sanitizeLogValue(profile.runtimeProfileSummary || {})
    };
    const updated = await pool.query(
      `UPDATE agent_runs
          SET prompt_profile=$3,prompt_hash=$4,skill_versions=$5,
              runtime_profile_hash=$6,runtime_profile_summary=$7,updated_at=now()
        WHERE id=$1 AND worker_id=$2 AND runtime_version=2
          AND lease_epoch=$8 AND lease_expires_at>clock_timestamp()
          AND runtime_profile_hash IS NULL
          AND status IN ('running','verifying')
        RETURNING prompt_profile,prompt_hash,skill_versions,runtime_profile_hash,runtime_profile_summary`,
      [
        runId,
        workerId,
        profileValues.promptProfile,
        profileValues.promptHash,
        JSON.stringify(profileValues.skillVersions),
        profileValues.runtimeProfileHash,
        JSON.stringify(profileValues.runtimeProfileSummary),
        Number(leaseEpoch || 0)
      ]
    );
    if (updated.rowCount) return updated.rows[0];
    const existing = await pool.query(
      `SELECT prompt_profile,prompt_hash,skill_versions,runtime_profile_hash,runtime_profile_summary
         FROM agent_runs
        WHERE id=$1 AND worker_id=$2 AND runtime_version=2
          AND lease_epoch=$3 AND lease_expires_at>clock_timestamp()
          AND status IN ('running','verifying')`,
      [runId, workerId, Number(leaseEpoch || 0)]
    );
    if (!existing.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
    const row = existing.rows[0];
    const stableJson = (value) => JSON.stringify(canonicalize(value || {}));
    if (
      row.prompt_profile !== profileValues.promptProfile ||
      !secureEqual(row.prompt_hash, profileValues.promptHash) ||
      !secureEqual(row.runtime_profile_hash, profileValues.runtimeProfileHash) ||
      stableJson(row.skill_versions) !== stableJson(profileValues.skillVersions) ||
      stableJson(row.runtime_profile_summary) !== stableJson(profileValues.runtimeProfileSummary)
    ) {
      throw new ApiError(409, 'AGENT_RUNTIME_PROFILE_MISMATCH', { retryable: false });
    }
    return row;
  };

  const recordScreenshot = async ({ runId, workerId, leaseEpoch, sha256 }) => withTransaction(
    pool,
    async (client) => {
      const result = await client.query(
        `UPDATE agent_runs
            SET unchanged_screenshots=CASE
                  WHEN checkpoint->>'lastScreenshotHash'=$3
                    THEN LEAST(3,unchanged_screenshots+1)
                  ELSE 0
                END,
                checkpoint=jsonb_set(
                  checkpoint,
                  '{lastScreenshotHash}',
                  to_jsonb($3::text),
                  true
                ),
                lease_expires_at=clock_timestamp()+($4::text || ' seconds')::interval,
                updated_at=now()
          WHERE id=$1 AND worker_id=$2 AND lease_epoch=$5
            AND lease_expires_at>clock_timestamp() AND status='running'
          RETURNING unchanged_screenshots`,
        [runId, workerId, String(sha256 || ''), config.leaseSeconds, Number(leaseEpoch || 0)]
      );
      if (!result.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
      return Number(result.rows[0].unchanged_screenshots || 0);
    }
  );

  const requestApproval = async ({
    runId,
    workerId,
    leaseEpoch,
    stepId = null,
    actionType,
    recipient = '',
    riskLevel = 'high',
    changeSummary,
    evidenceSummary = '',
    impactSummary = '',
    rollbackSummary = '',
    fingerprint
  }) => withTransaction(pool, async (client) => {
    const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    const actionHash = Buffer.isBuffer(fingerprint)
      ? fingerprint
      : crypto.createHash('sha256').update(JSON.stringify({
          actionType,
          recipient,
          changeSummary,
          evidenceSummary,
          impactSummary,
          rollbackSummary
        })).digest();
    const existing = await client.query(
      `SELECT * FROM agent_approvals
        WHERE run_id=$1 AND action_fingerprint=$2
          AND status='pending' AND expires_at>now()
        ORDER BY created_at DESC LIMIT 1
        FOR UPDATE`,
      [runId, actionHash]
    );
    const approval = existing.rowCount ? existing : await client.query(
      `INSERT INTO agent_approvals
        (run_id,step_id,action_type,action_fingerprint,recipient,risk_level,change_summary,
         evidence_summary,impact_summary,rollback_summary,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         clock_timestamp()+($11::text || ' minutes')::interval)
       RETURNING *`,
      [
        runId,
        stepId,
        sanitizeText(actionType, 100),
        actionHash,
        sanitizeText(recipient, 240),
        riskLevel,
        sanitizeText(changeSummary, 1000),
        sanitizeText(evidenceSummary, 1000),
        sanitizeText(impactSummary, 1000),
        sanitizeText(rollbackSummary, 1000),
        config.approvalMinutes
      ]
    );
    await client.query(
      `UPDATE agent_runs
          SET status='waiting_user',worker_id=NULL,lease_expires_at=NULL,updated_at=now()
        WHERE id=$1 AND status NOT IN ('succeeded','failed','cancelled')`,
      [runId]
    );
    await insertEvent(client, {
      runId,
      type: riskLevel === 'blocked' ? 'takeover.required' : 'approval.required',
      phase: 'waiting_user',
      summary: riskLevel === 'blocked'
        ? '需要用户接管云电脑完成身份验证'
        : '关键动作等待用户确认',
      data: {
        approvalId: approval.rows[0].id,
        actionType,
        recipient,
        riskLevel
      }
    });
    return approval.rows[0];
  });

  const consumeApproval = async ({ runId, workerId, leaseEpoch, fingerprint }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
      const actionHash = Buffer.isBuffer(fingerprint)
        ? fingerprint
        : Buffer.from(String(fingerprint || ''), 'hex');
      if (actionHash.length !== 32) return null;
      const result = await client.query(
        `UPDATE agent_approvals
            SET used_at=now()
          WHERE id=(
            SELECT id FROM agent_approvals
             WHERE run_id=$1 AND action_fingerprint=$2
               AND status IN ('approved','denied')
               AND used_at IS NULL AND expires_at>now()
             ORDER BY decided_at DESC
             LIMIT 1
             FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
        [runId, actionHash]
      );
      return result.rows[0] || null;
    }
  );

  const consumeSessionAuthorization = async ({
    runId,
    workerId,
    leaseEpoch,
    actionType,
    recipient
  }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
      const normalizedAction = normalizeActionType(actionType);
      const allowed = new Set([
        'send',
        'publish',
        'submit',
        'delete',
        'change_permissions',
        'browser_fill',
        'browser_interaction'
      ]);
      if (!allowed.has(normalizedAction)) return null;
      let origin;
      try {
        const parsed = new URL(String(recipient || '').trim());
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
        origin = parsed.origin;
      } catch {
        return null;
      }
      const idleMinutes = Math.max(
        5,
        Math.min(120, Number.parseInt(env.DESIGN_CONVERSATION_AUTH_IDLE_MINUTES || '30', 10) || 30)
      );
      const result = await client.query(
        `UPDATE design_session_authorizations authorization
            SET last_used_at=now(),
                expires_at=clock_timestamp()+($4::text || ' minutes')::interval,
                updated_at=now()
          WHERE authorization.id=(
            SELECT candidate.id
              FROM design_session_authorizations candidate
              JOIN design_conversations conversation
                ON conversation.id=candidate.conversation_id
              JOIN design_executions execution
                ON execution.conversation_id=conversation.id
             WHERE execution.agent_run_id=$1
               AND candidate.user_id=conversation.user_id
               AND candidate.site_origin=$2
               AND candidate.action_type=$3
               AND candidate.status='active'
               AND candidate.expires_at>clock_timestamp()
               AND conversation.expires_at>clock_timestamp()
             ORDER BY candidate.created_at DESC
             LIMIT 1
             FOR UPDATE SKIP LOCKED
          )
          RETURNING authorization.*`,
        [runId, origin, normalizedAction, idleMinutes]
      );
      if (!result.rowCount) return null;
      return {
        id: result.rows[0].id,
        status: 'approved',
        action_type: normalizedAction,
        recipient: origin,
        expires_at: result.rows[0].expires_at,
        sessionAuthorization: true
      };
    }
  );

  const createDesktopTicket = async ({
    userId,
    runId,
    approvalId
  }) => withTransaction(pool, async (client) => {
    const { dbUserId, row } = await resolveOwnedRun(client, { userId, runId, lock: true });
    if (
      row.status !== 'waiting_user' ||
      !row.sandbox_ref ||
      !row.sandbox_worker_id
    ) {
      throw new ApiError(409, 'AGENT_TAKEOVER_NOT_AVAILABLE');
    }
    const approval = await client.query(
      `SELECT id FROM agent_approvals
        WHERE id=$1 AND run_id=$2 AND status='pending' AND risk_level='blocked'
          AND expires_at>clock_timestamp()
        FOR UPDATE`,
      [approvalId, runId]
    );
    if (!approval.rowCount) throw new ApiError(409, 'AGENT_TAKEOVER_APPROVAL_REQUIRED');
    const worker = await client.query(
      `SELECT desktop_relay_ready,egress_verified,browser_ready,
              last_seen_at>clock_timestamp()-interval '60 seconds' AS fresh
         FROM agent_worker_heartbeats WHERE worker_id=$1`,
      [row.sandbox_worker_id]
    );
    if (
      !worker.rows[0]?.fresh ||
      worker.rows[0]?.desktop_relay_ready !== true ||
      worker.rows[0]?.egress_verified !== true ||
      worker.rows[0]?.browser_ready !== true
    ) {
      throw new ApiError(503, 'AGENT_DESKTOP_RELAY_UNAVAILABLE', { retryable: true });
    }
    await client.query(
      `UPDATE agent_desktop_tickets SET revoked_at=now()
        WHERE run_id=$1 AND user_id=$2 AND consumed_at IS NULL
          AND revoked_at IS NULL`,
      [runId, dbUserId]
    );
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest();
    const result = await client.query(
      `INSERT INTO agent_desktop_tickets
        (run_id,user_id,approval_id,worker_id,sandbox_ref,token_hash,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '60 seconds')
       RETURNING id,expires_at`,
      [
        runId,
        dbUserId,
        approvalId,
        row.sandbox_worker_id,
        row.sandbox_ref,
        tokenHash
      ]
    );
    await insertEvent(client, {
      runId,
      type: 'takeover.ticket_issued',
      phase: 'waiting_user',
      summary: '已签发一次性桌面接管票据',
      data: { ticketId: result.rows[0].id, expiresInSeconds: 60 }
    });
    return {
      ticketId: result.rows[0].id,
      token,
      expiresAt: result.rows[0].expires_at
    };
  });

  const registerArtifact = async ({
    runId,
    workerId,
    leaseEpoch,
    assetId,
    parentArtifactId = null,
    role,
    filename,
    mimeType,
    byteSize,
    sha256,
    version = 1,
    verificationStatus = 'pending',
    verification = {},
    sources = [],
    costCredits = 0
  }) => withTransaction(pool, async (client) => {
    const normalizedFilename = sanitizeText(filename, 240);
    const normalizedMimeType = sanitizeText(mimeType, 160);
    const normalizedAssetId = assetId || null;
    const digest = String(sha256 || '').trim().toLowerCase();
    const run = await client.query(
      'SELECT id,expires_at,runtime_version,worker_id,lease_epoch,lease_expires_at FROM agent_runs WHERE id=$1 FOR UPDATE',
      [runId]
    );
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    if (Number(run.rows[0].runtime_version || 1) === 2) {
      assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    }
    if (verificationStatus === 'passed' && /^[a-f0-9]{64}$/.test(digest)) {
      const existing = await client.query(
        `SELECT * FROM agent_artifacts
          WHERE run_id=$1
            AND filename=$2
            AND mime_type=$3
            AND sha256=decode($4,'hex')
            AND asset_id IS NOT DISTINCT FROM $5::uuid
            AND verification_status='passed'
          ORDER BY created_at DESC
          LIMIT 1`,
        [runId, normalizedFilename, normalizedMimeType, digest, normalizedAssetId]
      );
      if (existing.rowCount) {
        return { ...publicArtifact(existing.rows[0]), alreadyRegistered: true };
      }
    }
    const artifact = await client.query(
      `INSERT INTO agent_artifacts
        (run_id,asset_id,parent_artifact_id,role,filename,mime_type,byte_size,sha256,
         version,verification_status,verification,sources,cost_credits,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        runId,
        normalizedAssetId,
        parentArtifactId,
        role,
        normalizedFilename,
        normalizedMimeType,
        Math.max(0, Number(byteSize || 0)),
        digest ? Buffer.from(digest, 'hex') : null,
        Math.max(1, Number(version || 1)),
        verificationStatus,
        JSON.stringify(sanitizeLogValue(verification)),
        JSON.stringify(sanitizeLogValue(sources)),
        Math.max(0, Math.ceil(Number(costCredits || 0))),
        run.rows[0].expires_at
      ]
    );
    await insertEvent(client, {
      runId,
      type: 'artifact.created',
      phase: 'running',
      summary: `已生成 ${sanitizeText(filename, 120)}`,
      data: {
        artifactId: artifact.rows[0].id,
        role,
        verificationStatus
      }
    });
    return publicArtifact(artifact.rows[0]);
  });

  const findArtifactByContent = async ({
    runId,
    filename,
    mimeType,
    sha256,
    assetId
  }) => {
    const digest = String(sha256 || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(digest)) return null;
    const result = await pool.query(
      `SELECT * FROM agent_artifacts
        WHERE run_id=$1
          AND filename=$2
          AND mime_type=$3
          AND sha256=decode($4,'hex')
          AND asset_id IS NOT DISTINCT FROM $5::uuid
          AND verification_status='passed'
        ORDER BY created_at DESC
        LIMIT 1`,
      [
        runId,
        sanitizeText(filename, 240),
        sanitizeText(mimeType, 160),
        digest,
        assetId || null
      ]
    );
    return result.rowCount
      ? { ...publicArtifact(result.rows[0]), alreadyRegistered: true }
      : null;
  };

  const finishRun = async ({
    runId,
    workerId,
    leaseEpoch,
    actualCredits,
    checklist
  }) => {
    const finished = await withTransaction(pool, async (client) => {
    const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    if (run.rows[0].status !== 'verifying') {
      throw new ApiError(409, 'AGENT_NOT_VERIFYING');
    }
    const artifacts = await client.query(
      `SELECT role,mime_type,verification_status,sources
         FROM agent_artifacts WHERE run_id=$1`,
      [runId]
    );
    const steps = await client.query(
      `SELECT sequence,role,status,tool_name,action_fingerprint,risk_level,
              sanitized_input,sanitized_output
         FROM agent_steps WHERE run_id=$1 ORDER BY sequence`,
      [runId]
    );
    const approvals = await client.query(
      `SELECT action_fingerprint,status,used_at
         FROM agent_approvals WHERE run_id=$1`,
      [runId]
    );
    const modelCheckpoint = await client.query(
      'SELECT * FROM agent_model_checkpoints WHERE run_id=$1 LIMIT 1 FOR UPDATE',
      [runId]
    );
    const durableState = modelCheckpoint.rowCount && Number(run.rows[0].runtime_version || 1) === 2
      ? decryptAgentPayload({
          runId,
          payloadId: modelCheckpoint.rows[0].id,
          kind: 'model_checkpoint',
          record: modelCheckpoint.rows[0],
          env
        })
      : null;
    const readyToFinalize = durableState?.readyToFinalize &&
      typeof durableState.readyToFinalize === 'object'
      ? durableState.readyToFinalize
      : null;
    const activeSubagents = await client.query(
      `SELECT count(*)::integer AS count
         FROM agent_subagents
        WHERE run_id=$1 AND status IN ('queued','running')`,
      [runId]
    );
    if (Number(activeSubagents.rows[0]?.count || 0) > 0) {
      throw new ApiError(409, 'AGENT_SUBAGENTS_STILL_RUNNING');
    }
    const requirements = checklist && typeof checklist === 'object' ? checklist : {};
    const budgetUsage = await client.query(
      `SELECT COALESCE(sum(actual_credits),0)::numeric AS consumed
         FROM agent_budget_reservations
        WHERE run_id=$1 AND state='consumed'`,
      [runId]
    );
    const effectiveActualCredits = Math.max(
      0,
      Number(actualCredits || 0),
      Number(budgetUsage.rows[0]?.consumed || 0)
    );
    const requiredCount = Math.max(0, Number(requirements.requiredArtifactCount || 0));
    const requiredDeliverables = Array.isArray(requirements.requiredDeliverables)
      ? requirements.requiredDeliverables
      : [];
    const deliverablesComplete = requiredDeliverablesSatisfied(
      artifacts.rows,
      requiredDeliverables
    );
    const textOnly = requiredCount === 0 && requiredDeliverables.length === 0;
    const finalTextHash = String(readyToFinalize?.finalTextSha256 || '').toLowerCase();
    const semanticVerification = readyToFinalize?.semanticVerification &&
      typeof readyToFinalize.semanticVerification === 'object'
      ? readyToFinalize.semanticVerification
      : null;
    const textOnlyVerified = textOnly && readyToFinalize?.kind === 'text' &&
      /^[a-f0-9]{64}$/.test(finalTextHash) && semanticVerification?.passed === true;
    if (
      (!textOnly && artifacts.rowCount < requiredCount) ||
      artifacts.rows.some((artifact) => artifact.verification_status !== 'passed') ||
      !deliverablesComplete ||
      (!textOnly && !artifacts.rows.some((artifact) => (
        artifact.role === 'editable' ||
        artifact.role === 'source' ||
        artifact.role === 'website' ||
        artifact.role === 'package' ||
        (
          artifact.role === 'image' &&
          ['image/png', 'image/jpeg', 'image/webp'].includes(artifact.mime_type)
        )
      ))) ||
      (textOnly && !textOnlyVerified) ||
      (Number(run.rows[0].runtime_version || 1) === 2 && (
        !readyToFinalize || semanticVerification?.passed !== true
      ))
    ) {
      throw new ApiError(409, 'AGENT_VERIFICATION_INCOMPLETE');
    }
    const trajectory = evaluateAgentTrajectory({
      run: run.rows[0],
      steps: steps.rows,
      approvals: approvals.rows,
      artifacts: artifacts.rows,
      modelCheckpointPresent: modelCheckpoint.rowCount > 0,
      modelCheckpointReadyToFinalize: Boolean(readyToFinalize),
      textOnlyVerified,
      actualCredits: effectiveActualCredits,
      maxSteps: config.maxSteps
    });
    if (!trajectory.passed) {
      throw new ApiError(409, 'AGENT_TRAJECTORY_VERIFICATION_FAILED', {
        failedChecks: trajectory.checks
          .filter((check) => !check.passed)
          .map((check) => check.id)
      });
    }
    requirements.trajectory = trajectory;
    if (semanticVerification) requirements.semanticVerification = semanticVerification;
    const settlement = await settleAgentBudget({
      client,
      runId,
      actualCredits: effectiveActualCredits,
      refundable: false,
      reason: 'verified_success'
    });
    const result = await client.query(
      `UPDATE agent_runs
          SET status='succeeded',completion_checklist=$2,
              checkpoint=jsonb_set(
                checkpoint,
                '{plan}',
                COALESCE((
                  SELECT jsonb_agg(
                    jsonb_set(step,'{status}','"completed"'::jsonb,true)
                  )
                  FROM jsonb_array_elements(checkpoint->'plan') AS step
                ),'[]'::jsonb),
                true
              ),
              error_code=NULL,
              charged_credits=$3,
              final_text_sha256=$4,
              semantic_verification=$5,
              platform_overrun_credits=GREATEST(0,$6::numeric - max_credits),
              worker_id=NULL,lease_expires_at=NULL,
              finished_at=now(),updated_at=now()
        WHERE id=$1 RETURNING *`,
      [
        runId,
        JSON.stringify(sanitizeLogValue(requirements)),
        settlement.chargedCredits,
        finalTextHash ? Buffer.from(finalTextHash, 'hex') : null,
        JSON.stringify(sanitizeLogValue(semanticVerification || {})),
        effectiveActualCredits
      ]
    );
    await client.query('DELETE FROM agent_model_checkpoints WHERE run_id=$1', [runId]);
    await client.query(
      `UPDATE agent_budget_reservations
          SET state='released',released_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE run_id=$1 AND state='reserved'`,
      [runId]
    );
    await client.query(
      `UPDATE agent_model_call_receipts
          SET state='consumed',consumed_at=COALESCE(consumed_at,clock_timestamp()),
              updated_at=clock_timestamp()
        WHERE run_id=$1 AND state='received'`,
      [runId]
    );
    await revokeDesktopTickets(client, runId);
    await insertEvent(client, {
      runId,
      type: 'run.succeeded',
      phase: 'succeeded',
      summary: '验证器已确认全部交付物',
      data: { chargedCredits: settlement.chargedCredits }
    });
      await testController?.hit('before_finish_commit', { runId, status: 'succeeded' });
      return result.rows[0];
    });
    await testController?.hit('after_finish_commit', { runId, status: 'succeeded' });
    return finished;
  };

  const failRun = async ({
    runId,
    workerId = null,
    leaseEpoch = null,
    errorCode,
    refundable = true,
    actualCredits = 0
  }) => withTransaction(pool, async (client) => {
    const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    if (TERMINAL_STATUSES.has(run.rows[0].status)) return run.rows[0];
    if (workerId !== null || leaseEpoch !== null) {
      assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    }
    const knownActualCredits = await consumeKnownTerminalCosts(client, runId, {
      outcome: 'failed',
      receiptErrorCode: 'AGENT_FAILED_AFTER_RECEIPT',
      unreadableErrorCode: 'AGENT_FAILED_RECEIPT_UNREADABLE',
      eventPhase: 'failed'
    });
    const settlement = await settleAgentBudget({
      client,
      runId,
      actualCredits: Math.max(Number(actualCredits || 0), knownActualCredits),
      refundable,
      reason: sanitizeText(errorCode, 100)
    });
    await client.query(
      `UPDATE agent_budget_reservations
          SET state='released',released_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE run_id=$1 AND state='reserved'`,
      [runId]
    ).catch(() => {});
    const result = await client.query(
      `UPDATE agent_runs
          SET status='failed',error_code=$2,charged_credits=$3,
              worker_id=NULL,lease_expires_at=NULL,finished_at=now(),updated_at=now()
        WHERE id=$1 RETURNING *`,
      [runId, sanitizeText(errorCode || 'AGENT_FAILED', 100), settlement.chargedCredits]
    );
    await cancelAllSubagentsWithClient(client, runId, 'PARENT_RUN_FAILED');
    await revokeDesktopTickets(client, runId);
    await insertEvent(client, {
      runId,
      type: 'run.failed',
      phase: 'failed',
      summary: errorCode === 'AGENT_APPROVAL_EXPIRED'
        ? '审批已超时，任务停止并按已使用费用结算'
        : refundable
          ? '任务失败，Agent 模型与沙箱冻结费用已释放'
          : '任务失败，已发生的不可退款费用已单列结算',
      data: {
        errorCode: errorCode || 'AGENT_FAILED',
        chargedCredits: settlement.chargedCredits,
        refundable
      }
    });
    return result.rows[0];
  });

  const reconcileTerminalReceipts = async ({ limit = 100, userIds = null } = {}) => {
    const bounded = Math.max(1, Math.min(1000, Number(limit) || 100));
    const scopedUserIds = Array.isArray(userIds)
      ? [...new Set(userIds.map((value) => String(value || '').trim()).filter(Boolean))]
      : [];
    if (scopedUserIds.some((value) => !UUID_RE.test(value))) {
      throw new TypeError('AGENT_TERMINAL_RECEIPT_USER_SCOPE_INVALID');
    }
    const candidates = await pool.query(
      `SELECT DISTINCT run.id,run.status
         FROM agent_runs run
         JOIN agent_model_call_receipts receipt ON receipt.run_id=run.id
         JOIN agent_budget_reservations reservation
           ON reservation.run_id=receipt.run_id AND reservation.model_call_id=receipt.id
        WHERE run.status IN ('succeeded','failed','cancelled')
          AND (
            receipt.state='received'
            OR (
              receipt.state='consumed'
              AND reservation.state IN ('reserved','released')
            )
          )
          AND ($2::uuid[] IS NULL OR run.user_id=ANY($2::uuid[]))
        ORDER BY run.id
        LIMIT $1`,
      [bounded, scopedUserIds.length ? scopedUserIds : null]
    );
    let runsReconciled = 0;
    let receiptsResolved = 0;
    for (const candidate of candidates.rows) {
      const reconciled = await withTransaction(pool, async (client) => {
        const run = await client.query(
          `SELECT id,status FROM agent_runs WHERE id=$1 FOR UPDATE`,
          [candidate.id]
        );
        if (!run.rowCount || !TERMINAL_STATUSES.has(run.rows[0].status)) return 0;
        const before = await client.query(
          `SELECT count(*)::integer AS count
             FROM agent_model_call_receipts receipt
             JOIN agent_budget_reservations reservation
               ON reservation.run_id=receipt.run_id AND reservation.model_call_id=receipt.id
            WHERE receipt.run_id=$1
              AND (
                receipt.state='received'
                OR (
                  receipt.state='consumed'
                  AND reservation.state IN ('reserved','released')
                )
              )`,
          [candidate.id]
        );
        if (Number(before.rows[0]?.count || 0) === 0) return 0;
        const terminalOutcome = run.rows[0].status === 'cancelled'
          ? 'cancelled'
          : run.rows[0].status === 'succeeded'
            ? 'succeeded'
            : 'failed';
        await consumeKnownTerminalCosts(client, candidate.id, {
          outcome: terminalOutcome,
          receiptErrorCode: terminalOutcome === 'cancelled'
            ? 'AGENT_CANCELLED_AFTER_RECEIPT'
            : terminalOutcome === 'succeeded'
              ? null
              : 'AGENT_FAILED_AFTER_RECEIPT',
          unreadableErrorCode: terminalOutcome === 'cancelled'
            ? 'AGENT_CANCELLED_RECEIPT_UNREADABLE'
            : 'AGENT_FAILED_RECEIPT_UNREADABLE',
          eventPhase: run.rows[0].status
        });
        const after = await client.query(
          `SELECT count(*)::integer AS count
             FROM agent_model_call_receipts receipt
             JOIN agent_budget_reservations reservation
               ON reservation.run_id=receipt.run_id AND reservation.model_call_id=receipt.id
            WHERE receipt.run_id=$1
              AND (
                receipt.state='received'
                OR (
                  receipt.state='consumed'
                  AND reservation.state IN ('reserved','released')
                )
              )`,
          [candidate.id]
        );
        return Math.max(
          0,
          Number(before.rows[0]?.count || 0) - Number(after.rows[0]?.count || 0)
        );
      });
      if (reconciled > 0) {
        runsReconciled += 1;
        receiptsResolved += reconciled;
      }
    }
    return { runsReconciled, receiptsResolved };
  };

  const expireStaleRuns = async ({ limit = 100, targetRunId = null } = {}) => {
    const bounded = Math.max(1, Math.min(1000, Number(limit) || 100));
    const scopedRunId = targetRunId == null ? null : String(targetRunId || '').trim();
    if (scopedRunId && !UUID_RE.test(scopedRunId)) {
      throw new TypeError('AGENT_RECOVERY_RUN_ID_INVALID');
    }
    if (scopedRunId && !(
      String(env.NODE_ENV || '').trim() === 'test' ||
      String(env.APP_ENV || '').trim() === 'dev'
    )) {
      throw new TypeError('AGENT_TARGETED_RECOVERY_FORBIDDEN');
    }
    const expiredLeases = await pool.query(
      `SELECT id FROM agent_runs
        WHERE status IN ('provisioning','running','verifying')
          AND worker_id IS NOT NULL
          AND lease_expires_at<=clock_timestamp()
          AND ($2::uuid IS NULL OR id=$2)
        ORDER BY lease_expires_at
        LIMIT $1`,
      [bounded, scopedRunId || null]
    );
    let recovered = 0;
    for (const candidate of expiredLeases.rows) {
      const decision = await withTransaction(pool, async (client) => {
        const locked = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [candidate.id]);
        if (!locked.rowCount ||
            !['provisioning', 'running', 'verifying'].includes(locked.rows[0].status) ||
            !locked.rows[0].lease_expires_at ||
            new Date(locked.rows[0].lease_expires_at).getTime() > Date.now()) {
          return 'skipped';
        }
        const uncertainModels = await client.query(
          `SELECT receipt.id,receipt.state
             FROM agent_model_call_receipts receipt
            WHERE receipt.run_id=$1 AND receipt.state IN ('dispatched','ambiguous')
            FOR UPDATE`,
          [candidate.id]
        );
        const uncertainTools = await client.query(
          `SELECT receipt.id,receipt.subagent_id,receipt.receipt_key,receipt.kind,
                  receipt.reservation_key,receipt.state
             FROM agent_tool_call_receipts receipt
            WHERE receipt.run_id=$1 AND receipt.state IN ('dispatched','ambiguous')
            FOR UPDATE`,
          [candidate.id]
        );
        const unsent = await client.query(
          `SELECT id FROM agent_model_call_receipts
            WHERE run_id=$1 AND state='queued'
            FOR UPDATE`,
          [candidate.id]
        );
        if (unsent.rowCount) {
          await client.query(
            `UPDATE agent_budget_reservations
                SET state='released',released_at=clock_timestamp(),updated_at=clock_timestamp()
              WHERE run_id=$1 AND state='reserved'
                AND model_call_id=ANY($2::uuid[])`,
            [candidate.id, unsent.rows.map((row) => row.id)]
          );
          await client.query(
            `UPDATE agent_model_calls
                SET outcome='cancelled',error_code='AGENT_WORKER_LEASE_EXPIRED_BEFORE_DISPATCH',
                    finished_at=COALESCE(finished_at,clock_timestamp())
              WHERE id=ANY($1::uuid[])`,
            [unsent.rows.map((row) => row.id)]
          );
          await client.query(
            `DELETE FROM agent_model_call_receipts WHERE id=ANY($1::uuid[])`,
            [unsent.rows.map((row) => row.id)]
          );
        }
        if (uncertainModels.rowCount || uncertainTools.rowCount) {
          const hasModelAmbiguity = uncertainModels.rowCount > 0;
          const toolKinds = new Set(uncertainTools.rows.map((row) => row.kind));
          const hasToolAmbiguity = uncertainTools.rowCount > 0;
          const shellReceiptProbeOnly = !hasModelAmbiguity && hasToolAmbiguity &&
            toolKinds.size === 1 && toolKinds.has('sandbox_shell') &&
            uncertainTools.rows.every((row) => (
              row.state === 'dispatched' && row.subagent_id === null
            ));
          const imageOnlyAmbiguity = hasToolAmbiguity &&
            toolKinds.size === 1 && toolKinds.has('kolors');
          if (shellReceiptProbeOnly) {
            await client.query(
              `UPDATE agent_budget_reservations reservation
                  SET state='released',released_at=clock_timestamp(),updated_at=clock_timestamp()
                WHERE reservation.run_id=$1 AND reservation.state='reserved'
                  AND reservation.reservation_key IN (
                    SELECT receipt.reservation_key FROM agent_tool_call_receipts receipt
                     WHERE receipt.run_id=$1 AND receipt.state='dispatched'
                       AND receipt.kind='sandbox_shell'
                  )`,
              [candidate.id]
            );
            await client.query(
              `UPDATE agent_runs
                  SET status='queued',worker_id=NULL,lease_expires_at=NULL,
                      queued_at=clock_timestamp(),
                      queue_expires_at=clock_timestamp()+($2::text || ' hours')::interval,
                      checkpoint=checkpoint || $3::jsonb,updated_at=clock_timestamp()
                WHERE id=$1`,
              [candidate.id, config.queueMaxWaitHours, JSON.stringify({
                phase: 'queued',
                retryRequired: false,
                retryReason: null,
                shellReceiptProbeRequired: true
              })]
            );
            await client.query(
              `UPDATE agent_budget_holds
                  SET expires_at=clock_timestamp()+($2::text || ' minutes')::interval
                WHERE run_id=$1 AND status='held'`,
              [candidate.id, config.queueMaxWaitHours * 60 + config.maxMinutes + 15]
            );
            await insertEvent(client, {
              runId: candidate.id,
              type: 'tool.call.recovery_probe_queued',
              phase: 'queued',
              summary: '已安全排队探测沙箱 Shell 回执，不会重复执行'
            });
            return 'queued';
          }
          await client.query(
            `UPDATE agent_model_call_receipts
                SET state='ambiguous',ambiguous_at=COALESCE(ambiguous_at,clock_timestamp()),
                    updated_at=clock_timestamp()
              WHERE run_id=$1 AND state='dispatched'`,
            [candidate.id]
          );
          await client.query(
            `UPDATE agent_tool_call_receipts
                SET state='ambiguous',ambiguous_at=COALESCE(ambiguous_at,clock_timestamp()),
                    updated_at=clock_timestamp()
              WHERE run_id=$1 AND state='dispatched'`,
            [candidate.id]
          );
          await client.query(
            `UPDATE agent_budget_reservations reservation
                SET state='released',released_at=clock_timestamp(),updated_at=clock_timestamp()
              WHERE reservation.run_id=$1 AND reservation.state='reserved'
                AND reservation.model_call_id IN (
                  SELECT id FROM agent_model_call_receipts
                   WHERE run_id=$1 AND state='ambiguous'
                )`,
            [candidate.id]
          );
          await client.query(
            `UPDATE agent_budget_reservations reservation
                SET state='released',released_at=clock_timestamp(),updated_at=clock_timestamp()
              WHERE reservation.run_id=$1 AND reservation.state='reserved'
                AND reservation.reservation_key IN (
                  SELECT receipt.reservation_key FROM agent_tool_call_receipts receipt
                   WHERE receipt.run_id=$1 AND receipt.state='ambiguous'
                )`,
            [candidate.id]
          );
          await client.query(
            `UPDATE agent_model_calls
                SET outcome='failed',error_code='AGENT_MODEL_CALL_AMBIGUOUS',
                    finished_at=COALESCE(finished_at,clock_timestamp())
              WHERE id IN (
                SELECT id FROM agent_model_call_receipts
                 WHERE run_id=$1 AND state='ambiguous'
              )`,
            [candidate.id]
          );
          const retryReason = hasModelAmbiguity && hasToolAmbiguity
            ? 'runtime_call_ambiguous'
            : hasModelAmbiguity
              ? 'model_call_ambiguous'
              : imageOnlyAmbiguity
                ? 'image_call_ambiguous'
                : 'tool_call_ambiguous';
          await client.query(
            `UPDATE agent_runs
                SET status='waiting_user',worker_id=NULL,lease_expires_at=NULL,
                    checkpoint=checkpoint || $2::jsonb,updated_at=clock_timestamp()
              WHERE id=$1`,
            [candidate.id, JSON.stringify({
              phase: 'waiting_user',
              retryRequired: true,
              retryReason
            })]
          );
          // A recovery that needs explicit user confirmation must retain its
          // original hold long enough for the user to decide. Without this
          // extension, an already-expired hold is selected by the later hold
          // expiry sweep in this same expireStaleRuns() call and the newly
          // recovered waiting_user run is immediately failed.
          await client.query(
            `UPDATE agent_budget_holds
                SET expires_at=clock_timestamp()+($2::text || ' minutes')::interval
              WHERE run_id=$1 AND status='held'`,
            [candidate.id, config.queueMaxWaitHours * 60 + config.maxMinutes + 15]
          );
          if (hasModelAmbiguity) {
            await insertEvent(client, {
              runId: candidate.id,
              type: 'model.call.ambiguous',
              phase: 'waiting_user',
              summary: 'Worker 中断时模型请求状态不确定，系统没有自动重试或计费',
              data: { callIds: uncertainModels.rows.map((row) => row.id) }
            });
          }
          if (hasToolAmbiguity) {
            await insertEvent(client, {
              runId: candidate.id,
              type: imageOnlyAmbiguity ? 'image.call.ambiguous' : 'tool.call.ambiguous',
              phase: 'waiting_user',
              summary: imageOnlyAmbiguity
                ? 'Worker 中断时图片生成状态不确定，系统没有自动重试或计费'
                : 'Worker 中断时工具执行结果不确定，系统没有自动重试或计费',
              data: {
                receiptIds: uncertainTools.rows.map((row) => row.id),
                kinds: [...toolKinds]
              }
            });
          }
          await insertEvent(client, {
            runId: candidate.id,
            type: 'run.retry_required',
            phase: 'waiting_user',
            summary: '需要用户确认后再安全重试'
          });
          return 'waiting_user';
        }
        await client.query(
          `UPDATE agent_runs
              SET status='queued',worker_id=NULL,lease_expires_at=NULL,queued_at=clock_timestamp(),
                  queue_expires_at=clock_timestamp()+($2::text || ' hours')::interval,
                  updated_at=clock_timestamp()
            WHERE id=$1`,
          [candidate.id, config.queueMaxWaitHours]
        );
        await client.query(
          `UPDATE agent_budget_holds
              SET expires_at=clock_timestamp()+($2::text || ' minutes')::interval
            WHERE run_id=$1 AND status='held'`,
          [candidate.id, config.queueMaxWaitHours * 60 + config.maxMinutes + 15]
        );
        await insertEvent(client, {
          runId: candidate.id,
          type: 'run.lease_recovered',
          phase: 'queued',
          summary: 'Worker 租约中断，任务已从持久化检查点安全恢复排队'
        });
        return 'queued';
      });
      if (decision === 'queued') {
        await enqueue(candidate.id);
        recovered += 1;
      } else if (decision === 'waiting_user') {
        recovered += 1;
      }
    }
    const expiredQueued = await pool.query(
      `SELECT id FROM agent_runs
        WHERE status='queued' AND queue_expires_at<=clock_timestamp()
          AND ($2::uuid IS NULL OR id=$2)
        ORDER BY queue_expires_at
        LIMIT $1`,
      [bounded, scopedRunId || null]
    );
    let released = 0;
    for (const row of expiredQueued.rows) {
      const result = await failRun({
        runId: row.id,
        errorCode: 'AGENT_QUEUE_WAIT_EXPIRED',
        refundable: true
      });
      if (result?.status === 'failed') released += 1;
    }
    const expiredApprovals = await pool.query(
      `SELECT run.id,run.estimated_credits_used
         FROM agent_runs run
         JOIN agent_budget_holds hold ON hold.run_id=run.id
        WHERE run.status='waiting_user'
          AND ($2::uuid IS NULL OR run.id=$2)
          AND hold.status='held'
          AND EXISTS (
            SELECT 1 FROM agent_approvals approval
             WHERE approval.run_id=run.id
               AND approval.status='pending'
               AND approval.expires_at<=clock_timestamp()
          )
          AND NOT EXISTS (
            SELECT 1 FROM agent_approvals approval
             WHERE approval.run_id=run.id
               AND approval.status='pending'
               AND approval.expires_at>clock_timestamp()
          )
        ORDER BY run.updated_at
        LIMIT $1`,
      [bounded, scopedRunId || null]
    );
    for (const row of expiredApprovals.rows) {
      const result = await failRun({
        runId: row.id,
        errorCode: 'AGENT_APPROVAL_EXPIRED',
        refundable: false,
        actualCredits: Number(row.estimated_credits_used || 0)
      });
      if (result?.status === 'failed') released += 1;
    }
    const expired = await pool.query(
      `SELECT run.id
         FROM agent_runs run
         JOIN agent_budget_holds hold ON hold.run_id=run.id
        WHERE run.status IN (
          'draft','queued','provisioning','running','waiting_user','paused','verifying'
        )
          AND ($2::uuid IS NULL OR run.id=$2)
          AND hold.status='held'
          AND hold.expires_at<=clock_timestamp()
        ORDER BY hold.expires_at
        LIMIT $1`,
      [bounded, scopedRunId || null]
    );
    for (const row of expired.rows) {
      const result = await failRun({
        runId: row.id,
        errorCode: 'AGENT_BUDGET_HOLD_EXPIRED',
        refundable: true
      });
      if (result?.status === 'failed') released += 1;
    }
    return released + recovered;
  };

  // A scoped recovery hook for deterministic and live DEV harnesses. It is
  // intentionally not exposed through an HTTP route and is fail-closed in any
  // non-test/non-DEV process.
  const recoverExpiredRun = async ({ runId } = {}) => expireStaleRuns({
    limit: 1,
    targetRunId: runId
  });

  const listTerminalSandboxes = async ({ limit = 100, userIds = null } = {}) => {
    const scopedUserIds = Array.isArray(userIds)
      ? [...new Set(userIds.map((value) => String(value || '').trim()).filter(Boolean))]
      : [];
    if (scopedUserIds.some((value) => !UUID_RE.test(value))) {
      throw new TypeError('AGENT_TERMINAL_SANDBOX_USER_SCOPE_INVALID');
    }
    const result = await pool.query(
      `SELECT run.id,run.sandbox_ref,
              CASE WHEN run.sandbox_ref IS NULL THEN true ELSE false END AS derived_reference
         FROM agent_runs run
        WHERE run.status IN ('succeeded','failed','cancelled')
          AND ($2::uuid[] IS NULL OR run.user_id=ANY($2::uuid[]))
          AND (
            run.sandbox_ref IS NOT NULL
            OR EXISTS(
              SELECT 1 FROM agent_events provisioning
               WHERE provisioning.run_id=run.id
                 AND provisioning.event_type='run.provisioning'
            )
          )
          AND NOT EXISTS(
            SELECT 1 FROM agent_events destroyed
             WHERE destroyed.run_id=run.id
               AND destroyed.event_type='sandbox.destroyed'
          )
        ORDER BY run.finished_at NULLS FIRST,run.updated_at
        LIMIT $1`,
      [
        Math.max(1, Math.min(1000, Number(limit) || 100)),
        scopedUserIds.length ? scopedUserIds : null
      ]
    );
    return result.rows.map((row) => ({
      runId: row.id,
      sandboxRef: row.sandbox_ref,
      derivedReference: row.derived_reference === true
    }));
  };

  const markSandboxDestroyed = async ({ runId, sandboxRef }) => withTransaction(
    pool,
    async (client) => {
      const result = await client.query(
        `UPDATE agent_runs
            SET sandbox_ref=NULL,display_url=NULL,updated_at=now()
          WHERE id=$1
            AND status IN ('succeeded','failed','cancelled')
            AND (sandbox_ref=$2 OR sandbox_ref IS NULL)
            AND NOT EXISTS(
              SELECT 1 FROM agent_events destroyed
               WHERE destroyed.run_id=agent_runs.id
                 AND destroyed.event_type='sandbox.destroyed'
            )
          RETURNING id,status`,
        [runId, sandboxRef]
      );
      if (!result.rowCount) return false;
      await revokeDesktopTickets(client, runId);
      await insertEvent(client, {
        runId,
        type: 'sandbox.destroyed',
        phase: result.rows[0].status,
        summary: '隔离云电脑已销毁'
      });
      return true;
    }
  );

  const purgeExpiredPrivateData = async ({ limit = 500 } = {}) => withTransaction(
    pool,
    async (client) => {
      const bounded = Math.max(1, Math.min(5000, Number(limit) || 500));
      const profiles = await client.query(
        `DELETE FROM agent_browser_profiles
          WHERE id IN (
            SELECT id FROM agent_browser_profiles
             WHERE expires_at<=clock_timestamp() OR revoked_at IS NOT NULL
             ORDER BY expires_at
             LIMIT $1
          )
          RETURNING id`,
        [bounded]
      );
      const payloads = await client.query(
        `DELETE FROM agent_run_payloads
          WHERE id IN (
            SELECT payload.id FROM agent_run_payloads payload
             JOIN agent_runs run ON run.id=payload.run_id
             WHERE payload.expires_at<=clock_timestamp()
               AND run.status IN ('succeeded','failed','cancelled')
             ORDER BY payload.expires_at
             LIMIT $1
          )
          RETURNING id`,
        [bounded]
      );
      const modelCheckpoints = await client.query(
        `DELETE FROM agent_model_checkpoints
          WHERE id IN (
            SELECT checkpoint.id FROM agent_model_checkpoints checkpoint
             JOIN agent_runs run ON run.id=checkpoint.run_id
             WHERE checkpoint.expires_at<=clock_timestamp()
               AND run.status IN ('succeeded','failed','cancelled')
             ORDER BY checkpoint.expires_at
             LIMIT $1
          )
          RETURNING id`,
        [bounded]
      );
      const subagentPayloads = await client.query(
        `DELETE FROM agent_subagent_payloads
          WHERE id IN (
            SELECT payload.id FROM agent_subagent_payloads payload
             JOIN agent_runs run ON run.id=payload.run_id
             WHERE payload.expires_at<=clock_timestamp()
               AND run.status IN ('succeeded','failed','cancelled')
             ORDER BY payload.expires_at
             LIMIT $1
          )
          RETURNING id`,
        [bounded]
      );
      const subagentCheckpoints = await client.query(
        `DELETE FROM agent_subagent_model_checkpoints
          WHERE id IN (
            SELECT checkpoint.id FROM agent_subagent_model_checkpoints checkpoint
             JOIN agent_runs run ON run.id=checkpoint.run_id
             WHERE checkpoint.expires_at<=clock_timestamp()
               AND run.status IN ('succeeded','failed','cancelled')
             ORDER BY checkpoint.expires_at
             LIMIT $1
          )
          RETURNING id`,
        [bounded]
      );
      await client.query(
        `UPDATE agent_approvals
            SET status='expired',decided_at=COALESCE(decided_at,now())
          WHERE status='pending' AND expires_at<=clock_timestamp()`
      );
      const receipts = await client.query(
        `DELETE FROM agent_model_call_receipts receipt
          USING agent_runs run
          WHERE receipt.run_id=run.id
            AND receipt.expires_at<=clock_timestamp()
            AND run.status IN ('succeeded','failed','cancelled')`
      );
      const toolReceipts = await client.query(
        `DELETE FROM agent_tool_call_receipts receipt
          USING agent_runs run
          WHERE receipt.run_id=run.id
            AND receipt.expires_at<=clock_timestamp()
            AND run.status IN ('succeeded','failed','cancelled')`
      );
      const reservations = await client.query(
        `DELETE FROM agent_budget_reservations reservation
          USING agent_runs run
          WHERE reservation.run_id=run.id
            AND reservation.state IN ('consumed','released')
            AND run.status IN ('succeeded','failed','cancelled')
            AND run.finished_at<clock_timestamp()-interval '30 days'`
      );
      return {
        browserProfilesDeleted: profiles.rowCount,
        payloadsDeleted: payloads.rowCount,
        modelCheckpointsDeleted: modelCheckpoints.rowCount,
        subagentPayloadsDeleted: subagentPayloads.rowCount,
        subagentCheckpointsDeleted: subagentCheckpoints.rowCount,
        modelCallReceiptsDeleted: receipts.rowCount,
        toolCallReceiptsDeleted: toolReceipts.rowCount,
        budgetReservationsDeleted: reservations.rowCount
      };
    }
  );

  const listBrowserProfiles = async ({ userId }) => withTransaction(pool, async (client) => {
    const dbUserId = await resolveAgentUserId(client, userId);
    const result = await client.query(
      `SELECT id,site_origin,label,last_used_at,expires_at,created_at
         FROM agent_browser_profiles
        WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()
        ORDER BY last_used_at DESC NULLS LAST,created_at DESC`,
      [dbUserId]
    );
    return result.rows.map((row) => ({
      profileId: row.id,
      siteOrigin: row.site_origin,
      label: row.label,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    }));
  });

  const deleteBrowserProfile = async ({ userId, profileId }) => withTransaction(
    pool,
    async (client) => {
      const dbUserId = await resolveAgentUserId(client, userId);
      const result = await client.query(
        `UPDATE agent_browser_profiles
            SET revoked_at=now(),ciphertext=$3,iv=$4,auth_tag=$5
          WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL
          RETURNING id`,
        [
          profileId,
          dbUserId,
          crypto.randomBytes(1),
          crypto.randomBytes(12),
          crypto.randomBytes(16)
        ]
      );
      if (!result.rowCount) throw new ApiError(404, 'AGENT_BROWSER_PROFILE_NOT_FOUND');
      return true;
    }
  );

  const loadBrowserProfile = async ({ userId, profileId }) => withTransaction(
    pool,
    async (client) => {
      if (!UUID_RE.test(String(profileId || ''))) {
        throw new ApiError(400, 'AGENT_BROWSER_PROFILE_ID_INVALID');
      }
      const result = await client.query(
        `SELECT * FROM agent_browser_profiles
          WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()
          FOR UPDATE`,
        [profileId, userId]
      );
      if (!result.rowCount) throw new ApiError(404, 'AGENT_BROWSER_PROFILE_NOT_FOUND');
      const row = result.rows[0];
      const value = decryptBrowserProfile({
        userId: row.user_id,
        profileId: row.id,
        siteOrigin: row.site_origin,
        record: row,
        env
      });
      await client.query(
        'UPDATE agent_browser_profiles SET last_used_at=now() WHERE id=$1',
        [row.id]
      );
      return {
        profileId: row.id,
        siteOrigin: row.site_origin,
        archiveBase64: String(value.archiveBase64 || '')
      };
    }
  );

  const saveBrowserProfile = async ({
    runId,
    workerId,
    leaseEpoch,
    userId,
    siteOrigin,
    archiveBase64,
    label = ''
  }) => withTransaction(pool, async (client) => {
    const run = await client.query(
      'SELECT worker_id,lease_epoch,lease_expires_at FROM agent_runs WHERE id=$1 FOR UPDATE',
      [runId]
    );
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    assertWorkerLease(run.rows[0], { workerId, leaseEpoch });
    let origin;
    try {
      const parsed = new URL(String(siteOrigin || ''));
      if (parsed.protocol !== 'https:') throw new Error('protocol');
      origin = parsed.origin;
    } catch {
      throw new ApiError(400, 'AGENT_BROWSER_PROFILE_ORIGIN_INVALID');
    }
    const archive = Buffer.from(String(archiveBase64 || ''), 'base64');
    if (!archive.length || archive.length > 1400 * 1024) {
      throw new ApiError(413, 'AGENT_BROWSER_PROFILE_TOO_LARGE');
    }
    const selected = await client.query(
      `SELECT id FROM agent_browser_profiles
        WHERE user_id=$1 AND site_origin=$2 AND revoked_at IS NULL
        FOR UPDATE`,
      [userId, origin]
    );
    const profileId = selected.rows[0]?.id || crypto.randomUUID();
    const encrypted = encryptBrowserProfile({
      userId,
      profileId,
      siteOrigin: origin,
      value: { archiveBase64: archive.toString('base64') },
      env
    });
    const result = await client.query(
      `INSERT INTO agent_browser_profiles
        (id,user_id,site_origin,label,algorithm,key_version,iv,auth_tag,ciphertext,
         last_used_at,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),
         clock_timestamp()+interval '30 days')
       ON CONFLICT (user_id,site_origin) WHERE revoked_at IS NULL DO UPDATE SET
         label=EXCLUDED.label,algorithm=EXCLUDED.algorithm,key_version=EXCLUDED.key_version,
         iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,ciphertext=EXCLUDED.ciphertext,
         last_used_at=now(),expires_at=EXCLUDED.expires_at
       RETURNING id`,
      [
        profileId,
        userId,
        origin,
        sanitizeText(label || new URL(origin).hostname, 120),
        encrypted.algorithm,
        encrypted.keyVersion,
        encrypted.iv,
        encrypted.authTag,
        encrypted.ciphertext
      ]
    );
    return result.rows[0].id;
  });

  const listIntegrations = async ({ userId }) => withTransaction(pool, async (client) => {
    const dbUserId = await resolveAgentUserId(client, userId);
    const result = await client.query(
      `SELECT provider,external_subject,scopes,status,last_used_at,expires_at,created_at
         FROM agent_integrations WHERE user_id=$1 ORDER BY provider`,
      [dbUserId]
    );
    return result.rows.map((row) => ({
      provider: row.provider,
      subject: row.external_subject,
      scopes: row.scopes || [],
      status: row.status,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    }));
  });

  return {
    appendStep,
    appendRuntimeEvent,
    assertWorkerLeaseActive,
    cancelRun,
    cancelSubagent,
    claimRun,
    clearLegacyToolReceiptCheckpoint,
    clearModelCheckpoint,
    clearSubagentModelCheckpoint,
    consumeApproval,
    consumeSessionAuthorization,
    createDesktopTicket,
    createRun,
    createSubagents,
    deleteBrowserProfile,
    failRun,
    expireStaleRuns,
    findArtifactByContent,
    finishRun,
    finishSubagent,
    getControlState,
    getRun,
    getServiceStatus,
    getSubagentControlState,
    listArtifacts,
    listBrowserProfiles,
    listEvents,
    listIntegrations,
    listObservedSources,
    listRuns,
    listToolReceipts,
    pinRuntimeProfile,
    reconcileTerminalReceipts,
    listTerminalSandboxes,
    loadPrivateContext,
    loadSubagentContext,
    loadBrowserProfile,
    markSandboxDestroyed,
    pauseRun,
    purgeExpiredPrivateData,
    recoverExpiredRun,
    quote,
    reserveRuntimeBudget,
    recordUsage,
    recordSubagentUsage,
    recordScreenshot,
    registerArtifact,
    releaseRuntimeBudget,
    removeDispatchedToolReceipt,
    saveCheckpoint,
    saveBrowserProfile,
    saveModelCheckpoint,
    saveSubagentModelCheckpoint,
    requestApproval,
    resolveUserAccess,
    resumeRun,
    savePlan,
    persistToolReceipt,
    consumeRuntimeBudget,
    submitInput,
    startSubagent,
    transitionRun
  };
};

module.exports = {
  ACTIVE_STATUSES,
  ALLOWED_TRANSITIONS,
  TERMINAL_STATUSES,
  assertApprovalDecisionAllowed,
  createAgentRunService,
  hashRequest,
  insertEvent,
  normalizeAssetIds,
  normalizeBrowserConfig,
  normalizeCapabilities,
  normalizeDeliverables,
  normalizeObjective,
  normalizeDelegatedTasks,
  nextConsecutiveFailureCount,
  modelPricingRates,
  publicArtifact,
  publicEvent,
  publicRun,
  publicSubagent,
  objectivePublicFields,
  requireIdempotencyKey,
  usageCreditsForRun
};
