const { getPool, isDatabaseConfigured } = require('../db/pool');
const {
  classifyUserAgent,
  hashMetadata,
  normalizeCategory,
  opaqueReference,
  sanitizeAnalyticsPayload,
  sanitizeAnalyticsUrl
} = require('../lib/privacy-metadata');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_EVENT_RE = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;
const SAFE_ACTION_RE = /^[a-z0-9][a-z0-9_.:/-]{0,95}$/;
const SAFE_ELEMENT_RE = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_PURGE_INTERVAL_MS = 60 * 60_000;
const DEFAULT_PURGE_MAX_BATCHES = 20;

const boundedInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const cleanUuid = (value) => {
  const text = String(value || '').trim();
  return UUID_RE.test(text) ? text.toLowerCase() : null;
};

const normalizeSafeKey = (value, fallback, pattern, maxLength) => {
  const normalized = normalizeCategory(value, fallback).slice(0, maxLength);
  return pattern.test(normalized) ? normalized : fallback;
};

const retentionDays = (env = process.env) =>
  boundedInt(env.BEHAVIOR_EVENT_RETENTION_DAYS, DEFAULT_RETENTION_DAYS, 7, 365);

const purgeBatchSize = (env = process.env) =>
  boundedInt(env.BEHAVIOR_EVENT_PURGE_BATCH_SIZE, 5_000, 100, 50_000);

const purgeIntervalMs = (env = process.env) =>
  boundedInt(
    env.BEHAVIOR_EVENT_PURGE_INTERVAL_MS,
    DEFAULT_PURGE_INTERVAL_MS,
    60_000,
    24 * 60 * 60_000
  );

const purgeMaxBatches = (env = process.env) =>
  boundedInt(
    env.BEHAVIOR_EVENT_PURGE_MAX_BATCHES,
    DEFAULT_PURGE_MAX_BATCHES,
    1,
    100
  );

const normalizeBehaviorInput = ({
  body,
  req,
  getClientIp = () => ''
} = {}) => {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const payload =
    input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {};
  const eventType = normalizeSafeKey(input.eventType, 'event', SAFE_EVENT_RE, 64);
  const category = normalizeSafeKey(
    payload.category || (eventType === 'page_view' ? 'navigation' : 'interaction'),
    'interaction',
    SAFE_EVENT_RE,
    64
  );
  const actionCandidate =
    payload.action || payload.actionKey || payload.target || payload.toolId || payload.operation || '';
  const action = actionCandidate
    ? normalizeSafeKey(actionCandidate, '', SAFE_ACTION_RE, 96)
    : '';
  const elementCandidate = payload.element || payload.tag || payload.component || '';
  const element = elementCandidate
    ? normalizeSafeKey(elementCandidate, '', SAFE_ELEMENT_RE, 64)
    : '';
  const occurredAtMs = Number(input.ts);
  const now = Date.now();
  const occurredAt =
    Number.isFinite(occurredAtMs) && occurredAtMs > 0
      ? new Date(Math.max(now - 365 * 24 * 60 * 60_000, Math.min(now + 5 * 60_000, occurredAtMs)))
      : new Date(now);
  const authUserId = cleanUuid(req?.authResolution?.dbUserId || req?.authUser?.dbUserId);
  const publicUserId = String(
    req?.authResolution?.userId || req?.authUser?.userId || input.userId || ''
  ).trim();
  const requestSeed = String(input.requestId || '').trim() || `${eventType}:${occurredAt.getTime()}`;
  const properties = sanitizeAnalyticsPayload(payload);
  const ip = typeof getClientIp === 'function' ? String(getClientIp(req) || '') : '';
  const userAgent = String(req?.headers?.['user-agent'] || '');

  return {
    eventId: opaqueReference(requestSeed, 'event'),
    actorUserId: authUserId,
    userRef: opaqueReference(publicUserId, 'user'),
    sessionRef: opaqueReference(input.sessionId, 'session') || null,
    projectRef: opaqueReference(input.projectId, 'project') || null,
    eventType,
    category,
    path: sanitizeAnalyticsUrl(input.path || payload.pagePath || payload.path || '').slice(0, 512),
    action: action || null,
    element: element || null,
    properties,
    requestId: opaqueReference(input.requestId, 'request') || null,
    ipHash: ip ? hashMetadata(ip, 'ip') : null,
    deviceCategory: classifyUserAgent(userAgent) || null,
    occurredAt
  };
};

const insertBehaviorEvent = async ({
  body,
  req,
  getClientIp,
  pool = getPool()
} = {}) => {
  const event = normalizeBehaviorInput({ body, req, getClientIp });
  const inserted = await pool.query(
    `INSERT INTO behavior_events
      (event_id, actor_user_id, user_ref, session_ref, project_ref, event_type,
       category, path, action, element, properties, request_id, ip_hash,
       device_category, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id, event_id, event_type, occurred_at`,
    [
      event.eventId,
      event.actorUserId,
      event.userRef,
      event.sessionRef,
      event.projectRef,
      event.eventType,
      event.category,
      event.path,
      event.action,
      event.element,
      JSON.stringify(event.properties),
      event.requestId,
      event.ipHash,
      event.deviceCategory,
      event.occurredAt
    ]
  );
  return {
    item: inserted.rows[0] || {
      event_id: event.eventId,
      event_type: event.eventType,
      occurred_at: event.occurredAt
    },
    duplicate: inserted.rowCount === 0
  };
};

const listBehaviorEvents = async ({
  userId = '',
  eventType = '',
  path = '',
  action = '',
  from,
  to,
  limit = 100,
  offset = 0,
  pool = getPool()
} = {}) => {
  const normalizedUser = String(userId || '').trim();
  const userRef = opaqueReference(normalizedUser, 'user');
  const normalizedEventType = normalizeCategory(eventType);
  const normalizedPath = sanitizeAnalyticsUrl(path);
  const normalizedAction = normalizeCategory(action);
  const pageLimit = boundedInt(limit, 100, 1, 500);
  const pageOffset = boundedInt(offset, 0, 0, 2_000_000);
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const safeFrom = fromDate && Number.isFinite(fromDate.getTime()) ? fromDate : null;
  const safeTo = toDate && Number.isFinite(toDate.getTime()) ? toDate : null;
  const values = [
    normalizedUser,
    userRef,
    normalizedEventType,
    normalizedPath,
    normalizedAction,
    safeFrom,
    safeTo
  ];
  const where = `
    WHERE (
      $1::text = ''
      OR b.user_ref = $2
      OR u.id::text = $1
      OR COALESCE(u.legacy_user_id,'') = $1
      OR lower(COALESCE(u.email::text,'')) = lower($1)
      OR lower(COALESCE(u.username::text,'')) = lower($1)
    )
      AND ($3::text = '' OR b.event_type = $3)
      AND ($4::text = '' OR b.path = $4)
      AND ($5::text = '' OR b.action = $5)
      AND ($6::timestamptz IS NULL OR b.occurred_at >= $6)
      AND ($7::timestamptz IS NULL OR b.occurred_at <= $7)
  `;
  const rows = await pool.query(
    `SELECT b.id, b.event_id AS "eventId", b.event_type AS "eventType",
            b.category, b.path, b.action, b.element, b.properties,
            b.user_ref AS "userRef", b.session_ref AS "sessionRef",
            b.project_ref AS "projectRef", b.device_category AS "deviceCategory",
            b.occurred_at AS "occurredAt",
            COALESCE(u.legacy_user_id,u.id::text,b.user_ref) AS "userId",
            COALESCE(u.username,'') AS username, COALESCE(u.email::text,'') AS email
       FROM behavior_events b
       LEFT JOIN users u ON u.id=b.actor_user_id
       ${where}
      ORDER BY b.occurred_at DESC, b.id DESC
      LIMIT $8 OFFSET $9`,
    [...values, pageLimit, pageOffset]
  );
  const count = await pool.query(
    `SELECT count(*)::bigint AS count
       FROM behavior_events b
       LEFT JOIN users u ON u.id=b.actor_user_id
       ${where}`,
    values
  );
  return {
    total: Number(count.rows[0]?.count || 0),
    items: rows.rows.map((row) => ({
      ...row,
      ts: new Date(row.occurredAt).getTime()
    }))
  };
};

const getBehaviorSummary = async ({ days = 14, pool = getPool() } = {}) => {
  const boundedDays = boundedInt(days, 14, 1, 90);
  const values = [String(boundedDays)];
  const totals = await pool.query(
    `SELECT count(*)::bigint AS events,
            count(*) FILTER (WHERE event_type='page_view')::bigint AS page_views,
            count(*) FILTER (WHERE event_type='ui_click')::bigint AS clicks,
            count(DISTINCT COALESCE(actor_user_id::text,NULLIF(user_ref,'')))::bigint AS active_users
       FROM behavior_events
      WHERE occurred_at >= now() - ($1 || ' days')::interval`,
    values
  );
  const daily = await pool.query(
    `SELECT to_char(date_trunc('day',occurred_at),'YYYY-MM-DD') AS day,
            count(*)::bigint AS events,
            count(*) FILTER (WHERE event_type='page_view')::bigint AS page_views,
            count(*) FILTER (WHERE event_type='ui_click')::bigint AS clicks,
            count(DISTINCT COALESCE(actor_user_id::text,NULLIF(user_ref,'')))::bigint AS active_users
       FROM behavior_events
      WHERE occurred_at >= now() - ($1 || ' days')::interval
      GROUP BY date_trunc('day',occurred_at)
      ORDER BY date_trunc('day',occurred_at)`,
    values
  );
  const topPages = await pool.query(
    `SELECT path, count(*)::bigint AS count
       FROM behavior_events
      WHERE occurred_at >= now() - ($1 || ' days')::interval
        AND event_type='page_view' AND path <> ''
      GROUP BY path ORDER BY count(*) DESC, path LIMIT 10`,
    values
  );
  const topActions = await pool.query(
    `SELECT action, count(*)::bigint AS count
       FROM behavior_events
      WHERE occurred_at >= now() - ($1 || ' days')::interval
        AND event_type='ui_click' AND action IS NOT NULL
      GROUP BY action ORDER BY count(*) DESC, action LIMIT 10`,
    values
  );
  const row = totals.rows[0] || {};
  return {
    days: boundedDays,
    totals: {
      events: Number(row.events || 0),
      pageViews: Number(row.page_views || 0),
      clicks: Number(row.clicks || 0),
      activeUsers: Number(row.active_users || 0)
    },
    daily: daily.rows.map((item) => ({
      day: String(item.day),
      events: Number(item.events || 0),
      pageViews: Number(item.page_views || 0),
      clicks: Number(item.clicks || 0),
      activeUsers: Number(item.active_users || 0)
    })),
    topPages: topPages.rows.map((item) => ({
      key: String(item.path || ''),
      count: Number(item.count || 0)
    })),
    topActions: topActions.rows.map((item) => ({
      key: String(item.action || ''),
      count: Number(item.count || 0)
    }))
  };
};

const purgeExpiredBehaviorEvents = async ({
  env = process.env,
  pool = getPool()
} = {}) => {
  const days = retentionDays(env);
  const batchSize = purgeBatchSize(env);
  const result = await pool.query(
    `WITH expired AS (
       SELECT id
         FROM behavior_events
        WHERE occurred_at < now() - ($1 || ' days')::interval
        ORDER BY occurred_at, id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     DELETE FROM behavior_events b
      USING expired
      WHERE b.id=expired.id`,
    [String(days), batchSize]
  );
  return { deleted: Number(result.rowCount || 0), retentionDays: days };
};

const createBehaviorRetentionService = ({
  env = process.env,
  pool = getPool(),
  logger = console,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) => {
  const intervalMs = purgeIntervalMs(env);
  const maxBatches = purgeMaxBatches(env);
  const batchSize = purgeBatchSize(env);
  let timer = null;
  let inFlight = null;

  const runOnce = async () => {
    if (!pool || typeof pool.query !== 'function') {
      return {
        ok: false,
        code: 'DATABASE_NOT_CONFIGURED',
        deleted: 0,
        batches: 0
      };
    }
    let deleted = 0;
    let batches = 0;
    try {
      while (batches < maxBatches) {
        const result = await purgeExpiredBehaviorEvents({ env, pool });
        batches += 1;
        deleted += Number(result.deleted || 0);
        if (Number(result.deleted || 0) < batchSize) break;
      }
      return {
        ok: true,
        deleted,
        batches,
        retentionDays: retentionDays(env),
        backlogPossible: batches === maxBatches
      };
    } catch (error) {
      const code = String(error?.code || error?.message || 'BEHAVIOR_RETENTION_FAILED')
        .trim()
        .slice(0, 120);
      logger.warn?.('[BehaviorRetention]', { code });
      return { ok: false, code, deleted, batches };
    }
  };

  const trigger = () => {
    if (inFlight) return inFlight;
    inFlight = runOnce().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const start = () => {
    if (timer) return false;
    void trigger();
    timer = setIntervalFn(() => {
      void trigger();
    }, intervalMs);
    timer?.unref?.();
    return true;
  };

  const stop = () => {
    if (!timer) return false;
    clearIntervalFn(timer);
    timer = null;
    return true;
  };

  const waitForIdle = async () => {
    if (inFlight) await inFlight;
  };

  return {
    config: {
      intervalMs,
      maxBatches,
      batchSize,
      retentionDays: retentionDays(env)
    },
    runOnce,
    start,
    stop,
    trigger,
    waitForIdle
  };
};

const usesBehaviorEventStore = () => isDatabaseConfigured();

module.exports = {
  createBehaviorRetentionService,
  getBehaviorSummary,
  insertBehaviorEvent,
  listBehaviorEvents,
  normalizeBehaviorInput,
  purgeExpiredBehaviorEvents,
  purgeBatchSize,
  purgeIntervalMs,
  purgeMaxBatches,
  retentionDays,
  usesBehaviorEventStore
};
