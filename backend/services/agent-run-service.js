const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');
const { resolveUserId } = require('./billing-service');
const { getAgentConfig, assertAgentRuntimeReady } = require('./agent-config');
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
const {
  evaluateAgentTrajectory
} = require('./agent-trajectory-evaluator');
const {
  normalizeActionType,
  sanitizeLogValue,
  sanitizeText
} = require('./agent-policy-service');

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
    durableCheckpointSaved: row.checkpoint?.durableToolResume === true
  },
  error: row.error_code ? { code: row.error_code } : null,
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
  queuePublisher = null
} = {}) => {
  if (!pool || typeof pool.connect !== 'function') {
    throw new TypeError('AGENT_RUN_POOL_REQUIRED');
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
    if (run.rows[0].worker_id !== workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
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

  const loadSubagentContext = async ({ runId, subagentId, workerId }) => withTransaction(
    pool,
    async (client) => {
      const result = await client.query(
        `SELECT subagent.*,run.worker_id,run.status AS run_status,
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
      if (workerId && row.worker_id !== workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
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

  const startSubagent = async ({ runId, subagentId, workerId }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query('SELECT worker_id,status FROM agent_runs WHERE id=$1', [runId]);
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      if (run.rows[0].worker_id !== workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
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
    status,
    summary = '',
    outputFiles = [],
    errorCode = null
  }) => withTransaction(pool, async (client) => {
    if (!SUBAGENT_TERMINAL_STATUSES.has(status)) {
      throw new ApiError(400, 'AGENT_SUBAGENT_STATUS_INVALID');
    }
    const run = await client.query('SELECT worker_id FROM agent_runs WHERE id=$1', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    if (run.rows[0].worker_id !== workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
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
    estimatedCredits,
    usage = {}
  }) => withTransaction(pool, async (client) => {
    const run = await client.query('SELECT worker_id,max_credits FROM agent_runs WHERE id=$1', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    if (run.rows[0].worker_id !== workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
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
    value
  }) => withTransaction(pool, async (client) => {
    const current = await client.query(
      `SELECT subagent.id,run.worker_id
         FROM agent_subagents subagent
         JOIN agent_runs run ON run.id=subagent.run_id
        WHERE subagent.id=$1 AND subagent.run_id=$2 AND subagent.status='running'
        FOR UPDATE OF subagent`,
      [subagentId, runId]
    );
    if (!current.rowCount) throw new ApiError(409, 'AGENT_SUBAGENT_NOT_RUNNING');
    if (current.rows[0].worker_id !== workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
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

  const clearSubagentModelCheckpoint = async ({ runId, subagentId, workerId }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query('SELECT worker_id FROM agent_runs WHERE id=$1', [runId]);
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      if (workerId && run.rows[0].worker_id !== workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
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
    const queueDepth = Number(row.queue_depth || 0);
    return {
      enabled: config.enabled,
      workerOnline,
      queueDepth,
      oldestQueuedAt: row.oldest_queued_at || null,
      concurrency: Number(row.concurrency || 1),
      modelFamily: row.model_name || config.modelName,
      sandboxMode: row.sandbox_mode || config.sandboxMode,
      browserReady: workerOnline && row.browser_ready === true,
      egressVerified: workerOnline && row.egress_verified === true,
      desktopRelayReady: workerOnline && row.desktop_relay_ready === true,
      sandboxImageRef: row.sandbox_image_ref || null,
      browserPublicEnabled: config.publicBrowserEnabled,
      imageGenerationPublicEnabled: config.publicImageGenerationEnabled,
      subagentsEnabled: config.publicSubagentsEnabled,
      subagentMaxConcurrent: config.subagentMaxConcurrent,
      subagentSandboxMode: config.subagentSandboxMode,
      accessMode: config.betaMode,
      availabilityNote: workerOnline
        ? (queueDepth > 0 ? 'busy' : 'ready')
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
        walletAvailable: Number(wallet.rows[0]?.available_credits || 0)
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
          Boolean(config.openAiApiKey) ||
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
    const requestIdentity = {
      objective: normalizedObjective,
      assetIds: normalizedAssetIds,
      maxCredits: budget,
      capabilities: normalizedCapabilities,
      deliverables: normalizedDeliverables,
      browserConfig: normalizedBrowser,
      projectId: projectId || null
    };
    const requestHash = hashRequest(requestIdentity);

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
           capabilities,browser_config,max_credits,queued_at,queue_expires_at)
         VALUES ($1,$2,$3,'queued',$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),
           clock_timestamp()+($13::text || ' hours')::interval)
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
        data: { maxCredits: budget, freeCredits: hold.freeCredits }
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
      const result = await client.query(
        `UPDATE agent_runs
            SET status='queued',pause_requested=false,cancel_requested=false,
                queued_at=now(),
                queue_expires_at=clock_timestamp()+($2::text || ' hours')::interval,
                worker_id=NULL,lease_expires_at=NULL,updated_at=now()
          WHERE id=$1 RETURNING *`,
        [runId, config.queueMaxWaitHours]
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
    await settleAgentBudget({
      client,
      runId,
      actualCredits: Number(row.estimated_credits_used || 0),
      refundable: false,
      reason: 'user_cancelled'
    });
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
          SET status='provisioning',worker_id=$2,
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

  const transitionRun = async ({
    runId,
    workerId,
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
    if (workerId && row.worker_id !== workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
    if (!ALLOWED_TRANSITIONS[row.status]?.has(toStatus) && row.status !== toStatus) {
      throw new ApiError(409, 'AGENT_STATE_TRANSITION_INVALID', {
        from: row.status,
        to: toStatus
      });
    }
    const result = await client.query(
      `UPDATE agent_runs
          SET status=$2,
              checkpoint=COALESCE($3::jsonb,checkpoint),
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
    if (workerId && run.rows[0].worker_id !== workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
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
                consecutive_failures=CASE
                  WHEN $2='failed' THEN LEAST(2,consecutive_failures+1)
                  WHEN $2='succeeded' THEN 0
                  ELSE consecutive_failures
                END,
                updated_at=now()
          WHERE id=$1`,
        [subagentId, status]
      );
    }
    await client.query(
      `UPDATE agent_runs
          SET step_count=$2,
              consecutive_failures=CASE
                WHEN $5::boolean THEN consecutive_failures
                WHEN $4='failed' THEN LEAST(2,consecutive_failures+1)
                WHEN $4='succeeded' THEN 0
                ELSE consecutive_failures
              END,
              lease_expires_at=clock_timestamp()+($3::text || ' seconds')::interval,
              updated_at=now()
        WHERE id=$1`,
      [runId, sequence, config.leaseSeconds, status, Boolean(subagentId)]
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

  const recordUsage = async ({ runId, workerId, estimatedCredits, items = {} }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      if (workerId && run.rows[0].worker_id !== workerId) {
        throw new ApiError(409, 'AGENT_LEASE_LOST');
      }
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

  const saveCheckpoint = async ({ runId, workerId, checkpoint }) => withTransaction(
    pool,
    async (client) => {
      const result = await client.query(
        `UPDATE agent_runs
            SET checkpoint=checkpoint || $3::jsonb,
                lease_expires_at=clock_timestamp()+($4::text || ' seconds')::interval,
                updated_at=now()
          WHERE id=$1
            AND worker_id=$2
            AND status IN ('provisioning','running','verifying')
          RETURNING checkpoint`,
        [
          runId,
          workerId,
          JSON.stringify(sanitizeLogValue(checkpoint || {})),
          config.leaseSeconds
        ]
      );
      if (!result.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
      return result.rows[0].checkpoint;
    }
  );

  const saveModelCheckpoint = async ({
    runId,
    workerId,
    value
  }) => withTransaction(pool, async (client) => {
    const run = await client.query(
      'SELECT id,status,worker_id FROM agent_runs WHERE id=$1 FOR UPDATE',
      [runId]
    );
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    if (run.rows[0].worker_id !== workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
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

  const clearModelCheckpoint = async ({ runId, workerId }) => withTransaction(
    pool,
    async (client) => {
      const run = await client.query(
        'SELECT status,worker_id FROM agent_runs WHERE id=$1 FOR UPDATE',
        [runId]
      );
      if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
      if (workerId && run.rows[0].worker_id !== workerId) {
        throw new ApiError(409, 'AGENT_LEASE_LOST');
      }
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

  const savePlan = async ({ runId, workerId, plan, explanation }) => withTransaction(
    pool,
    async (client) => {
      const result = await client.query(
        `UPDATE agent_runs
            SET checkpoint=checkpoint || $3::jsonb,
                replan_count=CASE
                  WHEN checkpoint ? 'plan' THEN replan_count+1
                  ELSE replan_count
                END,
                lease_expires_at=clock_timestamp()+($4::text || ' seconds')::interval,
                updated_at=now()
          WHERE id=$1
            AND worker_id=$2
            AND status='running'
            AND (NOT (checkpoint ? 'plan') OR replan_count<3)
          RETURNING checkpoint,replan_count`,
        [
          runId,
          workerId,
          JSON.stringify(sanitizeLogValue({
            plan,
            planExplanation: explanation
          })),
          config.leaseSeconds
        ]
      );
      if (!result.rowCount) {
        const state = await client.query(
          'SELECT replan_count FROM agent_runs WHERE id=$1 AND worker_id=$2',
          [runId, workerId]
        );
        if (Number(state.rows[0]?.replan_count || 0) >= 3) {
          throw new ApiError(409, 'AGENT_REPLAN_LIMIT_REACHED');
        }
        throw new ApiError(409, 'AGENT_LEASE_LOST');
      }
      return result.rows[0];
    }
  );

  const recordScreenshot = async ({ runId, workerId, sha256 }) => withTransaction(
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
          WHERE id=$1 AND worker_id=$2 AND status='running'
          RETURNING unchanged_screenshots`,
        [runId, workerId, String(sha256 || ''), config.leaseSeconds]
      );
      if (!result.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
      return Number(result.rows[0].unchanged_screenshots || 0);
    }
  );

  const requestApproval = async ({
    runId,
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

  const consumeApproval = async ({ runId, fingerprint }) => withTransaction(
    pool,
    async (client) => {
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

  const consumeSessionAuthorization = async ({ runId, actionType, recipient }) => withTransaction(
    pool,
    async (client) => {
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
      'SELECT id,expires_at FROM agent_runs WHERE id=$1 FOR UPDATE',
      [runId]
    );
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
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
    actualCredits,
    checklist
  }) => withTransaction(pool, async (client) => {
    const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    if (workerId && run.rows[0].worker_id !== workerId) throw new ApiError(409, 'AGENT_LEASE_LOST');
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
      'SELECT 1 FROM agent_model_checkpoints WHERE run_id=$1 LIMIT 1',
      [runId]
    );
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
    const requiredCount = Math.max(1, Number(requirements.requiredArtifactCount || 1));
    const requiredDeliverables = Array.isArray(requirements.requiredDeliverables)
      ? requirements.requiredDeliverables
      : [];
    const deliverablesComplete = requiredDeliverablesSatisfied(
      artifacts.rows,
      requiredDeliverables
    );
    if (
      artifacts.rowCount < requiredCount ||
      artifacts.rows.some((artifact) => artifact.verification_status !== 'passed') ||
      !deliverablesComplete ||
      !artifacts.rows.some((artifact) => (
        artifact.role === 'editable' ||
        artifact.role === 'source' ||
        artifact.role === 'website' ||
        artifact.role === 'package' ||
        (
          artifact.role === 'image' &&
          ['image/png', 'image/jpeg', 'image/webp'].includes(artifact.mime_type)
        )
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
      actualCredits,
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
    const settlement = await settleAgentBudget({
      client,
      runId,
      actualCredits,
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
              charged_credits=$3,worker_id=NULL,lease_expires_at=NULL,
              finished_at=now(),updated_at=now()
        WHERE id=$1 RETURNING *`,
      [
        runId,
        JSON.stringify(sanitizeLogValue(requirements)),
        settlement.chargedCredits
      ]
    );
    await revokeDesktopTickets(client, runId);
    await insertEvent(client, {
      runId,
      type: 'run.succeeded',
      phase: 'succeeded',
      summary: '验证器已确认全部交付物',
      data: { chargedCredits: settlement.chargedCredits }
    });
    return result.rows[0];
  });

  const failRun = async ({
    runId,
    errorCode,
    refundable = true,
    actualCredits = 0
  }) => withTransaction(pool, async (client) => {
    const run = await client.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [runId]);
    if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    if (TERMINAL_STATUSES.has(run.rows[0].status)) return run.rows[0];
    const settlement = await settleAgentBudget({
      client,
      runId,
      actualCredits,
      refundable,
      reason: sanitizeText(errorCode, 100)
    });
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

  const expireStaleRuns = async ({ limit = 100 } = {}) => {
    const bounded = Math.max(1, Math.min(1000, Number(limit) || 100));
    const expiredQueued = await pool.query(
      `SELECT id FROM agent_runs
        WHERE status='queued' AND queue_expires_at<=clock_timestamp()
        ORDER BY queue_expires_at
        LIMIT $1`,
      [bounded]
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
      [bounded]
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
          AND hold.status='held'
          AND hold.expires_at<=clock_timestamp()
        ORDER BY hold.expires_at
        LIMIT $1`,
      [bounded]
    );
    for (const row of expired.rows) {
      const result = await failRun({
        runId: row.id,
        errorCode: 'AGENT_BUDGET_HOLD_EXPIRED',
        refundable: true
      });
      if (result?.status === 'failed') released += 1;
    }
    return released;
  };

  const listTerminalSandboxes = async ({ limit = 100 } = {}) => {
    const result = await pool.query(
      `SELECT id,sandbox_ref
         FROM agent_runs
        WHERE status IN ('succeeded','failed','cancelled')
          AND sandbox_ref IS NOT NULL
        ORDER BY finished_at NULLS FIRST,updated_at
        LIMIT $1`,
      [Math.max(1, Math.min(1000, Number(limit) || 100))]
    );
    return result.rows.map((row) => ({
      runId: row.id,
      sandboxRef: row.sandbox_ref
    }));
  };

  const markSandboxDestroyed = async ({ runId, sandboxRef }) => withTransaction(
    pool,
    async (client) => {
      const result = await client.query(
        `UPDATE agent_runs
            SET sandbox_ref=NULL,display_url=NULL,updated_at=now()
          WHERE id=$1
            AND sandbox_ref=$2
            AND status IN ('succeeded','failed','cancelled')
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
            SELECT id FROM agent_run_payloads
             WHERE expires_at<=clock_timestamp()
             ORDER BY expires_at
             LIMIT $1
          )
          RETURNING id`,
        [bounded]
      );
      const modelCheckpoints = await client.query(
        `DELETE FROM agent_model_checkpoints
          WHERE id IN (
            SELECT id FROM agent_model_checkpoints
             WHERE expires_at<=clock_timestamp()
             ORDER BY expires_at
             LIMIT $1
          )
          RETURNING id`,
        [bounded]
      );
      const subagentPayloads = await client.query(
        `DELETE FROM agent_subagent_payloads
          WHERE id IN (
            SELECT id FROM agent_subagent_payloads
             WHERE expires_at<=clock_timestamp()
             ORDER BY expires_at
             LIMIT $1
          )
          RETURNING id`,
        [bounded]
      );
      const subagentCheckpoints = await client.query(
        `DELETE FROM agent_subagent_model_checkpoints
          WHERE id IN (
            SELECT id FROM agent_subagent_model_checkpoints
             WHERE expires_at<=clock_timestamp()
             ORDER BY expires_at
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
      return {
        browserProfilesDeleted: profiles.rowCount,
        payloadsDeleted: payloads.rowCount,
        modelCheckpointsDeleted: modelCheckpoints.rowCount,
        subagentPayloadsDeleted: subagentPayloads.rowCount,
        subagentCheckpointsDeleted: subagentCheckpoints.rowCount
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
    userId,
    siteOrigin,
    archiveBase64,
    label = ''
  }) => withTransaction(pool, async (client) => {
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
    cancelRun,
    cancelSubagent,
    claimRun,
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
    listTerminalSandboxes,
    loadPrivateContext,
    loadSubagentContext,
    loadBrowserProfile,
    markSandboxDestroyed,
    pauseRun,
    purgeExpiredPrivateData,
    quote,
    recordUsage,
    recordSubagentUsage,
    recordScreenshot,
    registerArtifact,
    saveCheckpoint,
    saveBrowserProfile,
    saveModelCheckpoint,
    saveSubagentModelCheckpoint,
    requestApproval,
    resolveUserAccess,
    resumeRun,
    savePlan,
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
  publicArtifact,
  publicEvent,
  publicRun,
  publicSubagent,
  objectivePublicFields,
  requireIdempotencyKey
};
