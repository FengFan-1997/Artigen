const { getPool } = require('../db/pool');
const {
  opaqueReference,
  sanitizeAuditHistoryEntry,
  sanitizeImageHistoryEntry,
  sanitizeUsageLedgerEntry
} = require('../lib/privacy-metadata');

const RECORD_KINDS = Object.freeze(['usage', 'image_history', 'audit_history']);
const RECORD_KIND_SET = new Set(RECORD_KINDS);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const usesOperationalRecordStore = (env = process.env) => (
  Boolean(String(env?.DATABASE_URL || '').trim())
);

const normalizeKind = (value) => {
  const kind = String(value || '').trim().toLowerCase();
  return RECORD_KIND_SET.has(kind) ? kind : '';
};

const normalizePage = ({ limit = 200, offset = 0 } = {}) => ({
  limit: Math.floor(Math.max(1, Math.min(20_000, Number(limit) || 200))),
  offset: Math.floor(Math.max(0, Math.min(2_000_000, Number(offset) || 0)))
});

const sanitizeOperationalPayload = (kind, entry) => {
  if (kind === 'usage') return sanitizeUsageLedgerEntry(entry);
  if (kind === 'image_history') return sanitizeImageHistoryEntry(entry);
  if (kind === 'audit_history') return sanitizeAuditHistoryEntry(entry);
  return null;
};

const toDate = (value) => {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return new Date();
  return new Date(Math.min(Date.now() + 5 * 60_000, timestamp));
};

const upsertOperationalRecord = async ({
  kind,
  userId,
  entry,
  pool = getPool()
}) => {
  const normalizedKind = normalizeKind(kind);
  const payload = sanitizeOperationalPayload(normalizedKind, entry);
  if (!normalizedKind || !payload) {
    return { ok: false, error: 'INVALID_OPERATIONAL_RECORD' };
  }
  const recordKey = String(payload.requestId || payload.id || '').trim();
  if (!recordKey) return { ok: false, error: 'MISSING_RECORD_KEY' };
  const publicUserId = String(userId || payload.userId || '').trim().slice(0, 160);
  const userRef = opaqueReference(publicUserId, 'user');
  const actorCandidate = UUID_RE.test(publicUserId) ? publicUserId.toLowerCase() : null;
  const occurredAt = toDate(payload.ts || payload.createdAt);
  const persistedPayload = { ...payload };
  delete persistedPayload.userId;

  const result = await pool.query(
    `INSERT INTO operational_records
      (record_kind, record_key, actor_user_id, user_ref, payload, occurred_at)
     VALUES (
       $1, $2,
       (SELECT id FROM users WHERE id=$3::uuid),
       $4, $5::jsonb, $6
     )
     ON CONFLICT (record_kind, record_key)
     DO UPDATE SET
       actor_user_id=COALESCE(operational_records.actor_user_id, EXCLUDED.actor_user_id),
       user_ref=CASE
         WHEN operational_records.user_ref='' THEN EXCLUDED.user_ref
         ELSE operational_records.user_ref
       END,
       payload=operational_records.payload || EXCLUDED.payload,
       occurred_at=GREATEST(operational_records.occurred_at, EXCLUDED.occurred_at),
       updated_at=now()
     RETURNING id, record_kind, record_key, actor_user_id, user_ref, payload,
       occurred_at, created_at, updated_at, (xmax <> 0) AS existed`,
    [
      normalizedKind,
      recordKey.slice(0, 128),
      actorCandidate,
      userRef,
      JSON.stringify(persistedPayload),
      occurredAt
    ]
  );
  const row = result.rows[0] || {};
  return {
    ok: true,
    existed: Boolean(row.existed),
    chargedAlready: Boolean(row.existed && row.payload?.chargedAt),
    item: {
      ...(row.payload || persistedPayload),
      ...(publicUserId ? { userId: publicUserId } : {})
    }
  };
};

const listOperationalRecords = async ({
  kind,
  userId = '',
  from,
  to,
  trigger = '',
  model = '',
  sessionRef = '',
  projectRef = '',
  biz = '',
  entryKind = '',
  status = '',
  limit,
  offset,
  pool = getPool()
}) => {
  const normalizedKind = normalizeKind(kind);
  if (!normalizedKind) throw new Error('INVALID_OPERATIONAL_RECORD_KIND');
  const page = normalizePage({ limit, offset });
  const publicUserId = String(userId || '').trim();
  const userRef = publicUserId ? opaqueReference(publicUserId, 'user') : '';
  const fromDate = Number.isFinite(Number(from)) && Number(from) > 0 ? new Date(Number(from)) : null;
  const toDateValue = Number.isFinite(Number(to)) && Number(to) > 0 ? new Date(Number(to)) : null;
  const values = [
    normalizedKind,
    userRef,
    fromDate,
    toDateValue,
    String(trigger || '').trim().toLowerCase(),
    String(model || '').trim().toLowerCase(),
    String(sessionRef || '').trim(),
    String(projectRef || '').trim(),
    String(biz || '').trim().toLowerCase(),
    String(entryKind || '').trim().toLowerCase(),
    String(status || '').trim().toLowerCase(),
    page.limit,
    page.offset
  ];
  const where = `
    record_kind=$1
    AND ($2='' OR user_ref=$2)
    AND ($3::timestamptz IS NULL OR occurred_at >= $3)
    AND ($4::timestamptz IS NULL OR occurred_at <= $4)
    AND ($5='' OR lower(COALESCE(payload->>'trigger',''))=$5)
    AND ($6='' OR lower(COALESCE(payload->>'model',payload->>'modelFamily',''))=$6)
    AND ($7='' OR COALESCE(payload->>'sessionRef','')=$7)
    AND ($8='' OR COALESCE(payload->>'projectRef','')=$8)
    AND ($9='' OR lower(COALESCE(payload->>'biz',payload->>'purpose',''))=$9)
    AND ($10='' OR lower(COALESCE(payload->>'kind',''))=$10)
    AND ($11='' OR lower(COALESCE(payload->>'status',''))=$11)
  `;
  const [countResult, rowsResult] = await Promise.all([
    pool.query(`SELECT count(*)::bigint AS count FROM operational_records WHERE ${where}`, values.slice(0, 11)),
    pool.query(
      `SELECT records.*,
              COALESCE(u.legacy_user_id,u.id::text) AS public_user_id,
              COALESCE(u.username,'') AS username,
              COALESCE(u.email::text,'') AS email
         FROM (
           SELECT id, record_key, actor_user_id, user_ref, payload, occurred_at
             FROM operational_records
            WHERE ${where}
            ORDER BY occurred_at DESC, id DESC
            LIMIT $12 OFFSET $13
         ) records
         LEFT JOIN users u ON u.id=records.actor_user_id
        ORDER BY records.occurred_at DESC, records.id DESC`,
      values
    )
  ]);
  const items = rowsResult.rows.map((row) => ({
    ...(row.payload && typeof row.payload === 'object' ? row.payload : {}),
    userId: publicUserId || String(row.public_user_id || row.actor_user_id || row.user_ref || ''),
    ...(row.username ? { username: String(row.username) } : {}),
    ...(row.email ? { email: String(row.email) } : {}),
    ts: row.occurred_at instanceof Date
      ? row.occurred_at.getTime()
      : Date.parse(String(row.occurred_at || '')) || Number(row.payload?.ts || 0) || 0
  }));
  return {
    total: Number(countResult.rows[0]?.count || 0),
    items
  };
};

module.exports = {
  RECORD_KINDS,
  listOperationalRecords,
  normalizePage,
  sanitizeOperationalPayload,
  upsertOperationalRecord,
  usesOperationalRecordStore
};
