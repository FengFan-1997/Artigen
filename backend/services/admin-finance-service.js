const crypto = require('crypto');

const { getPool } = require('../db/pool');
const { canUseLegacyJsonBilling } = require('../lib/legacy-finance-policy');

const MAX_CREDITS = 2_147_483_647;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AdminFinanceError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'AdminFinanceError';
    this.code = code;
    this.status = status;
  }
}

const resolveAdminFinancialDataSource = ({ env = process.env } = {}) => {
  if (String(env.DATABASE_URL || '').trim()) return 'postgres';
  if (canUseLegacyJsonBilling({ env })) return 'legacy';
  return 'unavailable';
};

const toTimestamp = (value) => {
  if (!value) return 0;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const normalizePage = ({ limit = 200, offset = 0 } = {}) => ({
  limit: Math.floor(Math.max(1, Math.min(2000, Number(limit) || 200))),
  offset: Math.floor(Math.max(0, Math.min(2_000_000, Number(offset) || 0)))
});

const normalizeAvailable = (value) => {
  const available = Number(value);
  if (!Number.isSafeInteger(available) || available < 0 || available > MAX_CREDITS) {
    throw new AdminFinanceError('INVALID_AVAILABLE', 400);
  }
  return available;
};

const normalizeIdempotencyKey = ({ key }) => {
  const raw = String(key || '').trim();
  if (!raw || raw.length > 200 || !/^[A-Za-z0-9._~:+\-/]+$/.test(raw)) {
    throw new AdminFinanceError('INVALID_IDEMPOTENCY_KEY', 400);
  }
  const digest = crypto
    .createHash('sha256')
    .update(raw, 'utf8')
    .digest('hex');
  return `admin-adjust:${digest}`;
};

const withPoolTransaction = async (pool, callback) => {
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

const createAdminFinanceService = ({ pool = getPool() } = {}) => {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new AdminFinanceError('DATABASE_NOT_CONFIGURED', 503);
  }

  const findUserReference = async (client, value) => {
    const uid = String(value || '').trim();
    if (!uid) throw new AdminFinanceError('MISSING_USER_ID', 400);
    const result = UUID_RE.test(uid)
      ? await client.query(
          `SELECT id, COALESCE(legacy_user_id,id::text) AS public_user_id
           FROM users WHERE id=$1::uuid LIMIT 1`,
          [uid]
        )
      : await client.query(
          `SELECT id, COALESCE(legacy_user_id,id::text) AS public_user_id
           FROM users WHERE legacy_user_id=$1 LIMIT 1`,
          [uid]
        );
    if (!result.rowCount) throw new AdminFinanceError('USER_NOT_FOUND', 404);
    return result.rows[0];
  };

  const listUsers = async ({ q = '', limit, offset } = {}) => {
    const page = normalizePage({ limit, offset });
    const search = String(q || '').trim();
    const result = await pool.query(
      `WITH filtered AS (
         SELECT u.id, u.legacy_user_id, u.email, u.username, u.display_name, u.status,
                u.created_at, w.available_credits, w.frozen_credits, w.updated_at,
                GREATEST(
                  (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id=u.id),
                  (SELECT max(b.occurred_at) FROM behavior_events b WHERE b.actor_user_id=u.id)
                ) AS last_seen,
                (SELECT count(*)::int FROM behavior_events b
                  WHERE b.actor_user_id=u.id AND b.event_type='page_view') AS visits
           FROM users u
           LEFT JOIN wallets w ON w.user_id=u.id
          WHERE $1='' OR u.id::text ILIKE '%' || $1 || '%'
             OR COALESCE(u.legacy_user_id,'') ILIKE '%' || $1 || '%'
             OR COALESCE(u.email::text,'') ILIKE '%' || $1 || '%'
             OR COALESCE(u.username::text,'') ILIKE '%' || $1 || '%'
             OR COALESCE(u.display_name,'') ILIKE '%' || $1 || '%'
       )
       SELECT *, count(*) OVER()::int AS total_count
         FROM filtered
        ORDER BY COALESCE(last_seen, created_at) DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [search, page.limit, page.offset]
    );
    const items = result.rows.map((row) => ({
      userId: String(row.legacy_user_id || row.id),
      email: String(row.email || ''),
      username: String(row.username || ''),
      name: String(row.display_name || row.username || ''),
      status: String(row.status || 'active'),
      createdAt: toTimestamp(row.created_at),
      lastSeen: toTimestamp(row.last_seen),
      visits: Number(row.visits || 0),
      wallet: row.available_credits === null || row.available_credits === undefined
        ? null
        : {
            available: Number(row.available_credits),
            frozen: Number(row.frozen_credits),
            updatedAt: toTimestamp(row.updated_at)
          }
    }));
    let total = Number(result.rows[0]?.total_count || 0);
    if (!result.rowCount && page.offset > 0) {
      const count = await pool.query(
        `SELECT count(*)::int AS total_count FROM users u
          WHERE $1='' OR u.id::text ILIKE '%' || $1 || '%'
             OR COALESCE(u.legacy_user_id,'') ILIKE '%' || $1 || '%'
             OR COALESCE(u.email::text,'') ILIKE '%' || $1 || '%'
             OR COALESCE(u.username::text,'') ILIKE '%' || $1 || '%'
             OR COALESCE(u.display_name,'') ILIKE '%' || $1 || '%'`,
        [search]
      );
      total = Number(count.rows[0]?.total_count || 0);
    }
    return { total, items };
  };

  const listOrders = async ({ userId, limit, offset } = {}) => {
    const uid = String(userId || '').trim();
    if (!uid) throw new AdminFinanceError('MISSING_USER_ID', 400);
    const page = normalizePage({ limit, offset });
    const user = await findUserReference(pool, uid);
    const result = await pool.query(
      `SELECT o.id, o.provider, o.provider_order_id, o.expected_amount_minor,
              o.currency, o.expected_credits, o.status, o.created_at, o.updated_at,
              p.id AS package_id, p.sku AS package_sku,
              COALESCE(u.legacy_user_id,u.id::text) AS public_user_id,
              count(*) OVER()::int AS total_count
         FROM payment_orders o
         JOIN users u ON u.id=o.user_id
         JOIN payment_packages p ON p.id=o.package_id
        WHERE o.user_id=$1
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT $2 OFFSET $3`,
      [user.id, page.limit, page.offset]
    );
    const items = result.rows.map((row) => ({
      kind: 'pay',
      id: String(row.id),
      orderId: String(row.id),
      providerOrderId: String(row.provider_order_id || ''),
      provider: String(row.provider || ''),
      userId: String(row.public_user_id),
      packageId: String(row.package_sku || row.package_id),
      packageDatabaseId: String(row.package_id),
      amountCny: Number(row.expected_amount_minor) / 100,
      amountMinor: Number(row.expected_amount_minor),
      currency: String(row.currency || ''),
      credits: Number(row.expected_credits),
      status: String(row.status || ''),
      createdAt: toTimestamp(row.created_at),
      updatedAt: toTimestamp(row.updated_at)
    }));
    let total = Number(result.rows[0]?.total_count || 0);
    if (!result.rowCount && page.offset > 0) {
      const count = await pool.query(
        `SELECT count(*)::int AS total_count
           FROM payment_orders o JOIN users u ON u.id=o.user_id
          WHERE o.user_id=$1`,
        [user.id]
      );
      total = Number(count.rows[0]?.total_count || 0);
    }
    return { total, items };
  };

  const listHolds = async ({ userId, limit, offset } = {}) => {
    const uid = String(userId || '').trim();
    if (!uid) throw new AdminFinanceError('MISSING_USER_ID', 400);
    const page = normalizePage({ limit, offset });
    const user = await findUserReference(pool, uid);
    const result = await pool.query(
      `SELECT h.id, h.credits, h.status, h.expires_at, h.created_at, h.resolved_at,
              t.id AS task_id, t.idempotency_key, t.tool_id, t.operation,
              COALESCE(u.legacy_user_id,u.id::text) AS public_user_id,
              count(*) OVER()::int AS total_count
         FROM credit_holds h
         JOIN users u ON u.id=h.user_id
         JOIN tool_tasks t ON t.id=h.task_id
        WHERE h.user_id=$1
        ORDER BY h.created_at DESC, h.id DESC
        LIMIT $2 OFFSET $3`,
      [user.id, page.limit, page.offset]
    );
    const items = result.rows.map((row) => {
      const reason = `${String(row.tool_id || '')}:${String(row.operation || '')}`;
      const credits = Number(row.credits);
      return {
        id: String(row.id),
        holdId: String(row.id),
        userId: String(row.public_user_id),
        taskId: String(row.task_id),
        requestId: String(row.idempotency_key || ''),
        cost: credits,
        credits,
        reason,
        reasonText: reason,
        reasonTextWithCost: `${reason}-${credits}`,
        status: String(row.status || ''),
        createdAt: toTimestamp(row.created_at),
        updatedAt: toTimestamp(row.resolved_at || row.created_at),
        expiresAt: toTimestamp(row.expires_at)
      };
    });
    let total = Number(result.rows[0]?.total_count || 0);
    if (!result.rowCount && page.offset > 0) {
      const count = await pool.query(
        `SELECT count(*)::int AS total_count
           FROM credit_holds h JOIN users u ON u.id=h.user_id
          WHERE h.user_id=$1`,
        [user.id]
      );
      total = Number(count.rows[0]?.total_count || 0);
    }
    return { total, items };
  };

  const adjustAvailableCredits = async ({
    userId,
    available,
    idempotencyKey,
    actor = 'console-admin',
    actorUserId = null,
    requestId = ''
  } = {}) => {
    const uid = String(userId || '').trim();
    if (!uid) throw new AdminFinanceError('MISSING_USER_ID', 400);
    const targetAvailable = normalizeAvailable(available);
    const ledgerKey = normalizeIdempotencyKey({ key: idempotencyKey });
    const auditActorUserId = actorUserId == null || actorUserId === ''
      ? null
      : String(actorUserId).trim();
    if (auditActorUserId && !UUID_RE.test(auditActorUserId)) {
      throw new AdminFinanceError('INVALID_ADMIN_ACTOR', 400);
    }

    return withPoolTransaction(pool, async (client) => {
      const user = await findUserReference(client, uid);

      await client.query(
        `INSERT INTO wallets (user_id, available_credits, frozen_credits)
         VALUES ($1,0,0) ON CONFLICT (user_id) DO NOTHING`,
        [user.id]
      );
      const walletResult = await client.query(
        `SELECT available_credits, frozen_credits, updated_at
           FROM wallets WHERE user_id=$1 FOR UPDATE`,
        [user.id]
      );
      if (!walletResult.rowCount) throw new AdminFinanceError('WALLET_NOT_FOUND', 409);
      const wallet = walletResult.rows[0];

      const replayResult = await client.query(
        `SELECT balance_available, balance_frozen, metadata, created_at
           FROM wallet_ledger WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1`,
        [user.id, ledgerKey]
      );
      if (replayResult.rowCount) {
        const prior = replayResult.rows[0];
        if (Number(prior.metadata?.targetAvailable) !== targetAvailable) {
          throw new AdminFinanceError('IDEMPOTENCY_CONFLICT', 409);
        }
        return {
          replayed: true,
          wallet: {
            userId: String(user.public_user_id),
            available: Number(wallet.available_credits),
            frozen: Number(wallet.frozen_credits),
            updatedAt: toTimestamp(wallet.updated_at)
          }
        };
      }

      const previousAvailable = Number(wallet.available_credits);
      const frozen = Number(wallet.frozen_credits);
      const delta = targetAvailable - previousAvailable;
      const updated = await client.query(
        `UPDATE wallets
            SET available_credits=$2, version=version+1, updated_at=now()
          WHERE user_id=$1
          RETURNING available_credits, frozen_credits, updated_at`,
        [user.id, targetAvailable]
      );
      const updatedWallet = updated.rows[0];
      const metadata = {
        actor: String(actor || 'console-admin').slice(0, 120),
        previousAvailable,
        targetAvailable
      };
      await client.query(
        `INSERT INTO wallet_ledger
          (user_id, entry_type, delta_available, delta_frozen, balance_available,
           balance_frozen, reference_type, reference_id, idempotency_key, metadata)
         VALUES ($1,'admin_adjustment',$2,0,$3,$4,'admin_credit_adjustment',$5,$6,$7)`,
        [
          user.id,
          delta,
          Number(updatedWallet.available_credits),
          Number(updatedWallet.frozen_credits),
          ledgerKey,
          ledgerKey,
          JSON.stringify(metadata)
        ]
      );
      await client.query(
        `INSERT INTO audit_events
          (actor_user_id, event_type, target_type, target_id, request_id, metadata)
         VALUES ($1,'admin.wallet.adjusted','wallet',$2,$3,$4)`,
        [
          auditActorUserId,
          String(user.id),
          String(requestId || '').trim().slice(0, 200) || null,
          JSON.stringify({ ...metadata, delta, idempotencyKeyHash: ledgerKey.slice('admin-adjust:'.length) })
        ]
      );
      return {
        replayed: false,
        wallet: {
          userId: String(user.public_user_id),
          available: Number(updatedWallet.available_credits),
          frozen: Number(updatedWallet.frozen_credits),
          updatedAt: toTimestamp(updatedWallet.updated_at)
        }
      };
    });
  };

  return { listUsers, listOrders, listHolds, adjustAvailableCredits };
};

module.exports = {
  AdminFinanceError,
  MAX_CREDITS,
  createAdminFinanceService,
  normalizeIdempotencyKey,
  resolveAdminFinancialDataSource,
  toTimestamp,
  withPoolTransaction
};
