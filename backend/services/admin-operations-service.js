const { getPool } = require('../db/pool');
const { normalizeCategory } = require('../lib/privacy-metadata');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_STATUSES = new Set(['active', 'disabled']);

class AdminOperationsError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'AdminOperationsError';
    this.code = code;
    this.status = status;
  }
}

const boundedInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const toTimestamp = (value) => {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
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

const findUser = async (client, reference, { lock = false } = {}) => {
  const value = String(reference || '').trim();
  if (!value) throw new AdminOperationsError('MISSING_USER_ID', 400);
  const lockSql = lock ? ' FOR UPDATE' : '';
  const result = UUID_RE.test(value)
    ? await client.query(
        `SELECT id, legacy_user_id, username, email, display_name, status
           FROM users WHERE id=$1::uuid LIMIT 1${lockSql}`,
        [value]
      )
    : await client.query(
        `SELECT id, legacy_user_id, username, email, display_name, status
           FROM users
          WHERE legacy_user_id=$1
             OR lower(COALESCE(username::text,''))=lower($1)
             OR lower(COALESCE(email::text,''))=lower($1)
          LIMIT 2${lockSql}`,
        [value]
      );
  if (result.rowCount !== 1) throw new AdminOperationsError('USER_NOT_FOUND', 404);
  return result.rows[0];
};

const createAdminOperationsService = ({ pool = getPool() } = {}) => {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new AdminOperationsError('DATABASE_NOT_CONFIGURED', 503);
  }

  const getOverview = async () => {
    const result = await pool.query(`
      SELECT
        (SELECT count(*)::bigint FROM users WHERE status <> 'deleted') AS users_total,
        (SELECT count(*)::bigint FROM users
          WHERE status <> 'deleted' AND created_at >= now() - interval '7 days') AS users_new_7d,
        (SELECT count(DISTINCT actor_user_id)::bigint FROM behavior_events
          WHERE actor_user_id IS NOT NULL
            AND occurred_at >= now() - interval '24 hours') AS users_active_24h,
        (SELECT COALESCE(sum(available_credits),0)::text FROM wallets) AS credits_available,
        (SELECT COALESCE(sum(frozen_credits),0)::text FROM wallets) AS credits_frozen,
        (SELECT count(*)::bigint FROM wallet_ledger
          WHERE created_at >= now() - interval '24 hours') AS ledger_entries_24h,
        (SELECT count(*)::bigint FROM payment_orders
          WHERE created_at >= now() - interval '7 days') AS orders_7d,
        (SELECT COALESCE(sum(expected_amount_minor),0)::bigint FROM payment_orders
          WHERE status IN ('paid','credited')
            AND created_at >= now() - interval '7 days') AS revenue_minor_7d,
        (SELECT count(*)::bigint FROM tool_tasks
          WHERE created_at >= now() - interval '24 hours') AS tasks_24h,
        (SELECT count(*)::bigint FROM tool_tasks
          WHERE status='success'
            AND created_at >= now() - interval '24 hours') AS tasks_success_24h,
        (SELECT count(*)::bigint FROM tool_tasks
          WHERE status='failed'
            AND created_at >= now() - interval '24 hours') AS tasks_failed_24h,
        (SELECT count(*)::bigint FROM credit_holds
          WHERE status='held' AND expires_at < now()) AS overdue_holds,
        (SELECT count(*)::bigint FROM behavior_events
          WHERE occurred_at >= now() - interval '24 hours') AS behavior_events_24h,
        (SELECT count(*)::bigint FROM behavior_events
          WHERE event_type='page_view'
            AND occurred_at >= now() - interval '24 hours') AS page_views_24h,
        (SELECT count(*)::bigint FROM behavior_events
          WHERE event_type='ui_click'
            AND occurred_at >= now() - interval '24 hours') AS clicks_24h,
        (SELECT count(*)::bigint FROM audit_events
          WHERE created_at >= now() - interval '24 hours') AS audit_events_24h
    `);
    const row = result.rows[0] || {};
    return {
      users: {
        total: Number(row.users_total || 0),
        new7d: Number(row.users_new_7d || 0),
        active24h: Number(row.users_active_24h || 0)
      },
      credits: {
        available: Number(row.credits_available || 0),
        frozen: Number(row.credits_frozen || 0),
        ledgerEntries24h: Number(row.ledger_entries_24h || 0),
        overdueHolds: Number(row.overdue_holds || 0)
      },
      commerce: {
        orders7d: Number(row.orders_7d || 0),
        revenueMinor7d: Number(row.revenue_minor_7d || 0)
      },
      generation: {
        tasks24h: Number(row.tasks_24h || 0),
        success24h: Number(row.tasks_success_24h || 0),
        failed24h: Number(row.tasks_failed_24h || 0)
      },
      behavior: {
        events24h: Number(row.behavior_events_24h || 0),
        pageViews24h: Number(row.page_views_24h || 0),
        clicks24h: Number(row.clicks_24h || 0)
      },
      audit: {
        events24h: Number(row.audit_events_24h || 0)
      },
      generatedAt: Date.now()
    };
  };

  const listCreditLedger = async ({
    userId = '',
    entryType = '',
    from,
    to,
    limit = 100,
    offset = 0
  } = {}) => {
    const normalizedUser = String(userId || '').trim();
    const normalizedEntryType = normalizeCategory(entryType);
    const pageLimit = boundedInt(limit, 100, 1, 500);
    const pageOffset = boundedInt(offset, 0, 0, 2_000_000);
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    const safeFrom = fromDate && Number.isFinite(fromDate.getTime()) ? fromDate : null;
    const safeTo = toDate && Number.isFinite(toDate.getTime()) ? toDate : null;
    const values = [normalizedUser, normalizedEntryType, safeFrom, safeTo];
    const where = `
      WHERE (
        $1::text = ''
        OR u.id::text = $1
        OR COALESCE(u.legacy_user_id,'') = $1
        OR lower(COALESCE(u.email::text,'')) = lower($1)
        OR lower(COALESCE(u.username::text,'')) = lower($1)
      )
        AND ($2::text = '' OR l.entry_type=$2)
        AND ($3::timestamptz IS NULL OR l.created_at >= $3)
        AND ($4::timestamptz IS NULL OR l.created_at <= $4)
    `;
    const result = await pool.query(
      `SELECT l.id, l.entry_type AS "entryType",
              l.delta_available AS "deltaAvailable", l.delta_frozen AS "deltaFrozen",
              l.balance_available AS "balanceAvailable",
              l.balance_frozen AS "balanceFrozen",
              l.reference_type AS "referenceType", l.reference_id AS "referenceId",
              l.idempotency_key AS "idempotencyKey", l.created_at AS "createdAt",
              COALESCE(u.legacy_user_id,u.id::text) AS "userId",
              COALESCE(u.username,'') AS username, COALESCE(u.email::text,'') AS email
         FROM wallet_ledger l
         JOIN users u ON u.id=l.user_id
         ${where}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT $5 OFFSET $6`,
      [...values, pageLimit, pageOffset]
    );
    const count = await pool.query(
      `SELECT count(*)::bigint AS count
         FROM wallet_ledger l
         JOIN users u ON u.id=l.user_id
         ${where}`,
      values
    );
    return {
      total: Number(count.rows[0]?.count || 0),
      items: result.rows.map((row) => ({
        ...row,
        id: String(row.id),
        deltaAvailable: Number(row.deltaAvailable || 0),
        deltaFrozen: Number(row.deltaFrozen || 0),
        balanceAvailable: Number(row.balanceAvailable || 0),
        balanceFrozen: Number(row.balanceFrozen || 0),
        createdAt: toTimestamp(row.createdAt)
      }))
    };
  };

  const listAuditEvents = async ({
    actor = '',
    eventType = '',
    targetType = '',
    from,
    to,
    limit = 100,
    offset = 0
  } = {}) => {
    const normalizedActor = String(actor || '').trim();
    const normalizedEvent = normalizeCategory(eventType);
    const normalizedTarget = normalizeCategory(targetType);
    const pageLimit = boundedInt(limit, 100, 1, 500);
    const pageOffset = boundedInt(offset, 0, 0, 2_000_000);
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    const safeFrom = fromDate && Number.isFinite(fromDate.getTime()) ? fromDate : null;
    const safeTo = toDate && Number.isFinite(toDate.getTime()) ? toDate : null;
    const values = [normalizedActor, normalizedEvent, normalizedTarget, safeFrom, safeTo];
    const where = `
      WHERE (
        $1::text = ''
        OR a.actor_user_id::text = $1
        OR COALESCE(u.legacy_user_id,'') = $1
        OR lower(COALESCE(u.email::text,'')) = lower($1)
        OR lower(COALESCE(u.username::text,'')) = lower($1)
      )
        AND ($2::text = '' OR a.event_type=$2)
        AND ($3::text = '' OR a.target_type=$3)
        AND ($4::timestamptz IS NULL OR a.created_at >= $4)
        AND ($5::timestamptz IS NULL OR a.created_at <= $5)
    `;
    const result = await pool.query(
      `SELECT a.id, a.event_type AS "eventType", a.target_type AS "targetType",
              a.target_id AS "targetId", a.request_id AS "requestId",
              a.metadata, a.created_at AS "createdAt",
              COALESCE(u.legacy_user_id,u.id::text,'system') AS "actorId",
              COALESCE(u.username,'system') AS "actorName"
         FROM audit_events a
         LEFT JOIN users u ON u.id=a.actor_user_id
         ${where}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $6 OFFSET $7`,
      [...values, pageLimit, pageOffset]
    );
    const count = await pool.query(
      `SELECT count(*)::bigint AS count
         FROM audit_events a
         LEFT JOIN users u ON u.id=a.actor_user_id
         ${where}`,
      values
    );
    return {
      total: Number(count.rows[0]?.count || 0),
      items: result.rows.map((row) => ({
        ...row,
        id: String(row.id),
        createdAt: toTimestamp(row.createdAt)
      }))
    };
  };

  const updateUserStatus = async ({
    userId,
    status,
    actorUserId,
    requestId = ''
  } = {}) => {
    const nextStatus = normalizeCategory(status);
    if (!USER_STATUSES.has(nextStatus)) {
      throw new AdminOperationsError('INVALID_USER_STATUS', 400);
    }
    return withTransaction(pool, async (client) => {
      const user = await findUser(client, userId, { lock: true });
      if (String(user.id) === String(actorUserId || '') && nextStatus !== 'active') {
        throw new AdminOperationsError('ADMIN_CANNOT_DISABLE_SELF', 409);
      }
      const updated = await client.query(
        `UPDATE users
            SET status=$2, updated_at=now()
          WHERE id=$1
          RETURNING id, legacy_user_id, username, email, display_name, status, updated_at`,
        [user.id, nextStatus]
      );
      if (nextStatus === 'disabled') {
        await client.query(
          `UPDATE sessions
              SET revoked_at=COALESCE(revoked_at,now())
            WHERE user_id=$1 AND revoked_at IS NULL`,
          [user.id]
        );
      }
      await client.query(
        `INSERT INTO audit_events
          (actor_user_id, event_type, target_type, target_id, request_id, metadata)
         VALUES ($1,'admin.user.status_changed','user',$2,$3,$4::jsonb)`,
        [
          actorUserId || null,
          String(user.id),
          String(requestId || '').trim() || null,
          JSON.stringify({ from: String(user.status), to: nextStatus })
        ]
      );
      const row = updated.rows[0];
      return {
        userId: String(row.legacy_user_id || row.id),
        username: String(row.username || ''),
        email: String(row.email || ''),
        name: String(row.display_name || row.username || ''),
        status: String(row.status),
        updatedAt: toTimestamp(row.updated_at)
      };
    });
  };

  return {
    getOverview,
    listAuditEvents,
    listCreditLedger,
    updateUserStatus
  };
};

module.exports = {
  AdminOperationsError,
  createAdminOperationsService
};
