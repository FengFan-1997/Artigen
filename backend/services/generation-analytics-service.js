const { getPool, isDatabaseConfigured } = require('../db/pool');
const { opaqueReference, normalizeCategory } = require('../lib/privacy-metadata');

const GENERATION_EVENT_TYPES = Object.freeze([
  'workspace_view',
  'prompt_start',
  'quote_shown',
  'quote_confirmed',
  'auth_blocked',
  'task_queued',
  'task_running',
  'task_success',
  'task_fail',
  'task_cancel',
  'first_image_visible',
  'download',
  'edit',
  'reference',
  'variation',
  'payment_confirmed'
]);

const GENERATION_EVENT_TYPE_SET = new Set(GENERATION_EVENT_TYPES);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{64}$/i;
const ENUM_FIELDS = new Map([
  ['operation', new Set(['generate', 'directions'])],
  ['mode', new Set(['quick', 'deep', 'variation'])],
  ['locale', new Set(['zh', 'en'])],
  ['aspectRatio', new Set(['1:1', '4:5', '3:4', '16:9', '9:16'])],
  ['status', new Set(['queued', 'running', 'success', 'failed', 'cancelled'])],
  ['source', new Set(['workspace', 'template', 'history', 'editor', 'recovery', 'server'])],
  ['errorCategory', new Set([
    'auth', 'billing', 'cancelled', 'input', 'policy', 'provider', 'storage', 'timeout',
    'unavailable', 'unknown', 'worker'
  ])]
]);
const BOOLEAN_FIELDS = new Set([
  'authenticated', 'hasDirection', 'hasProductProfile', 'hasReferences', 'restored', 'retryable'
]);
const INTEGER_FIELDS = new Map([
  ['promptLength', [0, 20_000]],
  ['referenceCount', [0, 3]],
  ['outputCount', [0, 20]],
  ['quotedCredits', [0, 1_000_000]],
  ['chargedCredits', [0, 1_000_000]],
  ['refundedCredits', [0, 1_000_000]],
  ['queueMs', [0, 86_400_000]],
  ['providerMs', [0, 86_400_000]],
  ['persistMs', [0, 86_400_000]],
  ['durationMs', [0, 86_400_000]],
  ['costMinor', [0, 1_000_000_000]]
]);

const cleanUuid = (value) => {
  const text = String(value || '').trim();
  return UUID_RE.test(text) ? text.toLowerCase() : null;
};

const sanitizeGenerationProperties = (raw) => {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [key, allowed] of ENUM_FIELDS) {
    const value = String(input[key] || '').trim();
    if (allowed.has(value)) out[key] = value;
  }
  for (const key of BOOLEAN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = Boolean(input[key]);
  }
  for (const [key, [min, max]] of INTEGER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = Number(input[key]);
    if (Number.isSafeInteger(value)) out[key] = Math.max(min, Math.min(max, value));
  }
  const profileId = normalizeCategory(input.profileId).slice(0, 64);
  if (/^[a-z0-9][a-z0-9_.:-]{0,63}$/.test(profileId)) out.profileId = profileId;
  for (const key of ['promptHash', 'inputHash']) {
    const value = String(input[key] || '').trim().toLowerCase();
    if (HASH_RE.test(value)) out[key] = value;
  }
  return out;
};

const normalizeEventInput = ({ eventType, body, req }) => {
  const type = String(eventType || '').trim().toLowerCase();
  if (!GENERATION_EVENT_TYPE_SET.has(type)) return null;
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  const durationMs = Number(payload.durationMs ?? body?.durationMs);
  const occurredAtMs = Number(body?.ts);
  const occurredAt = Number.isFinite(occurredAtMs) && occurredAtMs > 0
    ? new Date(Math.min(Date.now() + 5 * 60_000, occurredAtMs))
    : new Date();
  const authUserId = cleanUuid(req?.authResolution?.dbUserId || req?.authUser?.dbUserId);
  return {
    eventType: type,
    actorUserId: authUserId,
    sessionRef: opaqueReference(body?.sessionId, 'session') || null,
    projectRef: opaqueReference(body?.projectId, 'project') || null,
    requestRef: opaqueReference(body?.requestId, 'request') || null,
    taskId: cleanUuid(payload.taskId || body?.taskId),
    quoteId: cleanUuid(payload.quoteId || body?.quoteId),
    properties: sanitizeGenerationProperties(payload),
    durationMs: Number.isSafeInteger(durationMs)
      ? Math.max(0, Math.min(86_400_000, durationMs))
      : null,
    occurredAt
  };
};

const insertGenerationEvent = async ({ eventType, body, req, pool = getPool() }) => {
  const event = normalizeEventInput({ eventType, body, req });
  if (!event) return null;
  const inserted = await pool.query(
    `INSERT INTO generation_events
      (event_type, actor_user_id, session_ref, project_ref, request_ref,
       task_id, quote_id, properties, duration_ms, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
     RETURNING id, event_type, session_ref, project_ref, request_ref,
       task_id, quote_id, properties, duration_ms, occurred_at`,
    [
      event.eventType,
      event.actorUserId,
      event.sessionRef,
      event.projectRef,
      event.requestRef,
      event.taskId,
      event.quoteId,
      JSON.stringify(event.properties),
      event.durationMs,
      event.occurredAt
    ]
  );
  return inserted.rows[0] || null;
};

const recordGenerationTaskEvent = async ({
  eventType,
  actorUserId,
  taskId,
  quoteId,
  operation,
  status,
  durationMs,
  properties = {},
  pool = getPool()
}) => {
  const type = String(eventType || '').trim().toLowerCase();
  if (!GENERATION_EVENT_TYPE_SET.has(type)) return null;
  const event = {
    eventType: type,
    actorUserId: cleanUuid(actorUserId),
    sessionRef: null,
    projectRef: null,
    requestRef: null,
    taskId: cleanUuid(taskId),
    quoteId: cleanUuid(quoteId),
    properties: sanitizeGenerationProperties({ operation, status, durationMs, ...properties }),
    durationMs: Number.isSafeInteger(Number(durationMs))
      ? Math.max(0, Math.min(86_400_000, Number(durationMs)))
      : null,
    occurredAt: new Date()
  };
  const inserted = await pool.query(
    `INSERT INTO generation_events
      (event_type, actor_user_id, session_ref, project_ref, request_ref,
       task_id, quote_id, properties, duration_ms, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
     RETURNING id, event_type, task_id, properties, duration_ms, occurred_at`,
    [
      event.eventType,
      event.actorUserId,
      event.sessionRef,
      event.projectRef,
      event.requestRef,
      event.taskId,
      event.quoteId,
      JSON.stringify(event.properties),
      event.durationMs,
      event.occurredAt
    ]
  );
  return inserted.rows[0] || null;
};

const listGenerationEvents = async ({ limit = 200, offset = 0, eventType = '', pool = getPool() } = {}) => {
  const boundedLimit = Math.max(1, Math.min(2000, Number(limit) || 200));
  const boundedOffset = Math.max(0, Math.min(2_000_000, Number(offset) || 0));
  const normalizedType = GENERATION_EVENT_TYPE_SET.has(String(eventType || '').trim().toLowerCase())
    ? String(eventType).trim().toLowerCase()
    : '';
  const result = await pool.query(
    `SELECT id, event_type AS "eventType", session_ref AS "sessionRef",
       project_ref AS "projectRef", request_ref AS "requestRef", task_id AS "taskId",
       quote_id AS "quoteId", properties, duration_ms AS "durationMs",
       occurred_at AS "occurredAt"
     FROM generation_events
     WHERE ($1::text = '' OR event_type=$1)
     ORDER BY occurred_at DESC
     LIMIT $2 OFFSET $3`,
    [normalizedType, boundedLimit, boundedOffset]
  );
  const count = await pool.query(
    `SELECT count(*)::bigint AS count FROM generation_events
     WHERE ($1::text = '' OR event_type=$1)`,
    [normalizedType]
  );
  return { total: Number(count.rows[0]?.count || 0), items: result.rows };
};

const getGenerationFunnel = async ({ days = 14, pool = getPool() } = {}) => {
  const boundedDays = Math.max(1, Math.min(90, Number(days) || 14));
  const counts = await pool.query(
    `SELECT event_type, count(*)::bigint AS count
       FROM generation_events
      WHERE occurred_at >= now() - ($1::text || ' days')::interval
      GROUP BY event_type`,
    [String(boundedDays)]
  );
  const timing = await pool.query(
    `SELECT
       percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)
         FILTER (WHERE event_type='first_image_visible' AND duration_ms IS NOT NULL) AS first_image_p50_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
         FILTER (WHERE event_type='first_image_visible' AND duration_ms IS NOT NULL) AS first_image_p95_ms,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY (properties->>'providerMs')::integer)
         FILTER (WHERE properties ? 'providerMs') AS provider_p50_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY (properties->>'providerMs')::integer)
         FILTER (WHERE properties ? 'providerMs') AS provider_p95_ms
     FROM generation_events
     WHERE occurred_at >= now() - ($1::text || ' days')::interval`,
    [String(boundedDays)]
  );
  const operations = await pool.query(
    `SELECT operation,
       count(*) FILTER (WHERE status='success')::bigint AS success,
       count(*) FILTER (WHERE status='failed')::bigint AS failed,
       count(*) FILTER (WHERE status='cancelled')::bigint AS cancelled,
       count(*) FILTER (
         WHERE status IN ('failed','cancelled') AND refunded_credits >= quoted_credits
       )::bigint AS fully_refunded_failures,
       count(*) FILTER (
         WHERE status='failed' AND error_code IN (
           'OUTPUT_PERSIST_FAILED','ASSET_STORAGE_UNAVAILABLE','ASSET_STORAGE_NOT_CONFIGURED'
         )
       )::bigint AS persistence_failures,
       coalesce(sum(refunded_credits), 0)::bigint AS refunded_credits,
       coalesce(sum(charged_credits), 0)::bigint AS charged_credits,
       coalesce(avg(EXTRACT(EPOCH FROM (started_at-created_at))*1000)
         FILTER (WHERE started_at IS NOT NULL), 0)::bigint AS avg_queue_ms
     FROM tool_tasks
     WHERE tool_id='ai-design' AND created_at >= now() - ($1::text || ' days')::interval
     GROUP BY operation`,
    [String(boundedDays)]
  );
  const unsettled = await pool.query(
    `SELECT count(*)::bigint AS count,
       count(*) FILTER (WHERE h.expires_at <= now())::bigint AS overdue_count,
       coalesce(sum(credits), 0)::bigint AS credits
       FROM credit_holds h
       JOIN tool_tasks t ON t.id=h.task_id
      WHERE t.tool_id='ai-design' AND h.status='held'`
  );
  const queueTiming = await pool.query(
    `SELECT
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (started_at-created_at))*1000
       ) FILTER (WHERE started_at IS NOT NULL) AS queue_p50_ms,
       percentile_cont(0.95) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (started_at-created_at))*1000
       ) FILTER (WHERE started_at IS NOT NULL) AS queue_p95_ms
     FROM tool_tasks
     WHERE tool_id='ai-design' AND created_at >= now() - ($1::text || ' days')::interval`,
    [String(boundedDays)]
  );
  const eventQuality = await pool.query(
    `SELECT
       coalesce(sum((properties->>'costMinor')::bigint)
         FILTER (
           WHERE event_type='task_success' AND properties ? 'costMinor'
             AND properties->>'source'='server'
         ), 0)::bigint AS success_cost_minor,
       count(*) FILTER (
         WHERE event_type='task_success' AND properties ? 'costMinor'
           AND properties->>'source'='server'
       )::bigint AS success_events
     FROM generation_events
     WHERE occurred_at >= now() - ($1::text || ' days')::interval`,
    [String(boundedDays)]
  );
  const taskStages = await pool.query(
    `SELECT
       count(*)::bigint AS queued,
       count(*) FILTER (WHERE started_at IS NOT NULL)::bigint AS running,
       count(*) FILTER (WHERE status='success')::bigint AS success,
       count(*) FILTER (WHERE status='failed')::bigint AS failed,
       count(*) FILTER (WHERE status='cancelled')::bigint AS cancelled
     FROM tool_tasks
     WHERE tool_id='ai-design' AND created_at >= now() - ($1::text || ' days')::interval`,
    [String(boundedDays)]
  );
  const eventCounts = Object.fromEntries(GENERATION_EVENT_TYPES.map((type) => [type, 0]));
  for (const row of counts.rows) eventCounts[row.event_type] = Number(row.count || 0);
  eventCounts.task_queued = Number(taskStages.rows[0]?.queued || 0);
  eventCounts.task_running = Number(taskStages.rows[0]?.running || 0);
  eventCounts.task_success = Number(taskStages.rows[0]?.success || 0);
  eventCounts.task_fail = Number(taskStages.rows[0]?.failed || 0);
  eventCounts.task_cancel = Number(taskStages.rows[0]?.cancelled || 0);
  const terminal = operations.rows.reduce((sum, row) => (
    sum + Number(row.success || 0) + Number(row.failed || 0) + Number(row.cancelled || 0)
  ), 0);
  const successes = operations.rows.reduce((sum, row) => sum + Number(row.success || 0), 0);
  const refunds = operations.rows.reduce((sum, row) => sum + Number(row.refunded_credits || 0), 0);
  const failedOrCancelled = operations.rows.reduce((sum, row) => (
    sum + Number(row.failed || 0) + Number(row.cancelled || 0)
  ), 0);
  const fullyRefunded = operations.rows.reduce(
    (sum, row) => sum + Number(row.fully_refunded_failures || 0),
    0
  );
  const persistenceFailures = operations.rows.reduce(
    (sum, row) => sum + Number(row.persistence_failures || 0),
    0
  );
  const successEvents = Number(eventQuality.rows[0]?.success_events || 0);
  const successCostMinor = Number(eventQuality.rows[0]?.success_cost_minor || 0);
  return {
    days: boundedDays,
    events: eventCounts,
    operations: operations.rows.map((row) => ({
      operation: row.operation,
      success: Number(row.success || 0),
      failed: Number(row.failed || 0),
      cancelled: Number(row.cancelled || 0),
      refundedCredits: Number(row.refunded_credits || 0),
      chargedCredits: Number(row.charged_credits || 0),
      avgQueueMs: Number(row.avg_queue_ms || 0)
    })),
    successRate: terminal > 0 ? successes / terminal : 0,
    refundRate: failedOrCancelled > 0 ? fullyRefunded / failedOrCancelled : 1,
    assetPersistenceFailureRate: terminal > 0 ? persistenceFailures / terminal : 0,
    costPerSuccessfulTaskMinor: successEvents > 0 ? successCostMinor / successEvents : 0,
    refundedCredits: refunds,
    unsettledHolds: {
      count: Number(unsettled.rows[0]?.count || 0),
      overdueCount: Number(unsettled.rows[0]?.overdue_count || 0),
      credits: Number(unsettled.rows[0]?.credits || 0)
    },
    timing: {
      queueP50Ms: Number(queueTiming.rows[0]?.queue_p50_ms || 0),
      queueP95Ms: Number(queueTiming.rows[0]?.queue_p95_ms || 0),
      firstImageP50Ms: Number(timing.rows[0]?.first_image_p50_ms || 0),
      firstImageP95Ms: Number(timing.rows[0]?.first_image_p95_ms || 0),
      providerP50Ms: Number(timing.rows[0]?.provider_p50_ms || 0),
      providerP95Ms: Number(timing.rows[0]?.provider_p95_ms || 0)
    }
  };
};

module.exports = {
  GENERATION_EVENT_TYPES,
  getGenerationFunnel,
  insertGenerationEvent,
  isGenerationEventType: (value) => GENERATION_EVENT_TYPE_SET.has(String(value || '').trim().toLowerCase()),
  listGenerationEvents,
  normalizeEventInput,
  recordGenerationTaskEvent,
  sanitizeGenerationProperties,
  usesGenerationEventStore: () => isDatabaseConfigured()
};
