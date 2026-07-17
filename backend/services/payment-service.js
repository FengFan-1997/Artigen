const crypto = require('crypto');
const { getPool, withTransaction } = require('../db/pool');
const { ApiError } = require('../lib/api-error');
const { fetchWithTimeout } = require('../lib/fetch-utils');
const { buildAfdianSignPayload, verifyAfdianWebhookSign } = require('../lib/afdian-webhook');
const { resolveUserId } = require('./billing-service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_ORDER_RE = /^pay_[a-z0-9_]{8,200}$/i;

const firstText = (...values) => {
  for (const value of values) {
    const text = typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : '';
    if (text) return text;
  }
  return '';
};

const extractRemarkValue = (remark, keys) => {
  const escaped = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = String(remark || '').match(
    new RegExp(`\\b(?:${escaped})\\s*[:=]\\s*([^\\s,;]{1,200})`, 'i')
  );
  return match ? String(match[1] || '').trim() : '';
};

const parseAmountMinor = (value) => {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number(String(match[2] || '').padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(whole) || whole < 0) return null;
  const minor = whole * 100 + fraction;
  return Number.isSafeInteger(minor) ? minor : null;
};

const parsePlanPackageMap = (env = process.env) => {
  const output = {};
  const addObject = (raw, reverse = false) => {
    if (!raw) return;
    let parsed;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    for (const [left, right] of Object.entries(parsed)) {
      const a = String(left || '').trim();
      const b = String(right || '').trim();
      if (!a || !b) continue;
      if (reverse) output[b] = a;
      else output[a] = b;
    }
  };
  addObject(env.AFDIAN_PLAN_PACKAGE_MAP);
  addObject(env.AFDIAN_PACKAGE_PLAN_ID_MAP, true);
  return output;
};

const parseJsonObject = (raw) => {
  if (!raw) return {};
  try {
    const value = JSON.parse(String(raw));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

const packageReferenceCandidates = (paymentPackage) => {
  const values = new Set([
    String(paymentPackage?.packageId || '').trim().toLowerCase(),
    String(paymentPackage?.packageSku || '').trim().toLowerCase()
  ].filter(Boolean));
  const sku = String(paymentPackage?.packageSku || '').trim().toLowerCase();
  const match = sku.match(/^credits\.([a-z0-9_-]+)(?:\.v\d+)?$/);
  if (match) values.add(match[1]);
  return [...values];
};

const lookupPackageConfig = (rawMap, paymentPackage) => {
  const map = parseJsonObject(rawMap);
  const normalized = new Map(
    Object.entries(map).map(([key, value]) => [String(key || '').trim().toLowerCase(), value])
  );
  for (const reference of packageReferenceCandidates(paymentPackage)) {
    const value = firstText(normalized.get(reference));
    if (value) return value;
  }
  return '';
};

const assertSafePaymentUrl = (raw, env = process.env) => {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', { retryable: true });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', { retryable: true });
  }
  if (String(env.NODE_ENV || '').toLowerCase() === 'production' && url.protocol !== 'https:') {
    throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', { retryable: true });
  }
  return url;
};

const buildAfdianApiRequest = ({ providerEventId, env = process.env, now = Date.now }) => {
  const userId = String(env.AFDIAN_API_USER_ID || '').trim();
  const token = String(env.AFDIAN_API_TOKEN || '').trim();
  const outTradeNo = String(providerEventId || '').trim();
  if (!userId || !token) {
    throw new ApiError(503, 'PAYMENT_RECONCILIATION_NOT_CONFIGURED', { retryable: true });
  }
  if (!outTradeNo || outTradeNo.length > 200) {
    throw new ApiError(400, 'INVALID_PROVIDER_ORDER');
  }
  const params = JSON.stringify({ out_trade_no: outTradeNo });
  const ts = Math.floor(Number(now()) / 1000);
  if (!Number.isSafeInteger(ts) || ts <= 0) {
    throw new ApiError(500, 'INVALID_SERVER_TIME');
  }
  const sign = crypto
    .createHash('md5')
    .update(`${token}params${params}ts${ts}user_id${userId}`, 'utf8')
    .digest('hex');
  return { user_id: userId, params, ts, sign };
};

const queryAfdianProviderOrder = async ({
  providerEventId,
  env = process.env,
  fetcher = fetchWithTimeout,
  now = Date.now
} = {}) => {
  const endpoint = assertSafePaymentUrl(
    env.AFDIAN_QUERY_ORDER_URL || 'https://afdian.net/api/open/query-order',
    env
  );
  const request = buildAfdianApiRequest({ providerEventId, env, now });
  let response;
  try {
    response = await fetcher(
      endpoint.toString(),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(request)
      },
      15_000
    );
  } catch {
    throw new ApiError(503, 'PAYMENT_RECONCILIATION_FAILED', { retryable: true });
  }
  if (!response?.ok) {
    throw new ApiError(503, 'PAYMENT_RECONCILIATION_FAILED', { retryable: true });
  }
  const body = await response.json().catch(() => null);
  if (Number(body?.ec) !== 200 || !Array.isArray(body?.data?.list)) {
    throw new ApiError(503, 'PAYMENT_RECONCILIATION_FAILED', { retryable: true });
  }
  const expected = String(providerEventId || '').trim();
  const order = body.data.list.find(
    (entry) => String(entry?.out_trade_no || '').trim() === expected
  );
  if (!order) {
    throw new ApiError(503, 'PAYMENT_PROVIDER_ORDER_NOT_FOUND', { retryable: true });
  }
  return order;
};

const buildAfdianPayUrl = (paymentOrder, env = process.env) => {
  const direct = lookupPackageConfig(env.AFDIAN_PACKAGE_PAY_URL_MAP, paymentOrder);
  const planId = lookupPackageConfig(env.AFDIAN_PACKAGE_PLAN_ID_MAP, paymentOrder);
  const fallback = firstText(env.AFDIAN_PAGE_URL, env.AFDIAN_PAY_URL);
  let base = direct;
  if (!base && planId) {
    base = firstText(env.AFDIAN_ORDER_CREATE_URL) || 'https://afdian.com/order/create';
  }
  if (!base) base = fallback;
  if (!base) {
    throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', { retryable: true });
  }

  const url = assertSafePaymentUrl(base, env);
  if (planId && !direct) {
    url.searchParams.set('plan_id', planId);
    url.searchParams.set('product_type', '0');
  }
  const orderId = String(paymentOrder?.orderId || '').trim();
  const packageSku = String(paymentOrder?.packageSku || '').trim();
  if (!UUID_RE.test(orderId) || !packageSku) {
    throw new ApiError(500, 'INVALID_LOCAL_PAYMENT_ORDER');
  }
  // The callback may carry a user or credit count, but neither is placed in this
  // provider URL or trusted later. Both are derived from the locked local order.
  url.searchParams.set('custom_order_id', orderId);
  url.searchParams.set('remark', `packageSku=${packageSku} orderId=${orderId}`);
  return url.toString();
};

const parseAfdianCallback = (body, env = process.env) => {
  const payload = body && typeof body === 'object' ? body : {};
  const data = payload.data && typeof payload.data === 'object' ? payload.data : null;
  const order = data?.order && typeof data.order === 'object' ? data.order : null;
  if (!order) return { ok: false, error: 'MISSING_ORDER' };
  if (Number.parseInt(String(order.status ?? ''), 10) !== 2) {
    return { ok: false, error: 'ORDER_NOT_PAID' };
  }
  const providerEventId = firstText(order.out_trade_no, order.trade_no, order.order_id);
  if (!providerEventId || /^test[_-]/i.test(providerEventId)) {
    return { ok: false, error: 'INVALID_PROVIDER_ORDER' };
  }
  const sign = firstText(payload.sign, data.sign, order.sign);
  const remark = firstText(order.remark, order.remark_text, order.note, order.memo);
  const localOrderId = firstText(
    order.custom_order_id,
    order.customOrderId,
    extractRemarkValue(remark, ['orderId', 'order_id', 'localOrderId'])
  );
  const planId = firstText(order.plan_id, order.planId);
  const planMap = parsePlanPackageMap(env);
  const packageRef = firstText(
    order.package_sku,
    order.packageSku,
    order.package_id,
    order.packageId,
    planId ? planMap[planId] : '',
    extractRemarkValue(remark, ['packageSku', 'packageId', 'package_id'])
  );
  const appUserId = firstText(
    order.app_user_id,
    order.appUserId,
    order.uid,
    extractRemarkValue(remark, ['userId', 'user_id', 'appUserId'])
  );
  const amountMinor = parseAmountMinor(
    firstText(order.total_amount, order.totalAmount, order.show_amount, order.showAmount)
  );
  return {
    ok: true,
    order,
    sign,
    providerEventId,
    localOrderId,
    packageRef,
    appUserId,
    amountMinor,
    payloadHash: crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest()
  };
};

const packageAliases = (order) => {
  const aliases = new Set([
    String(order.packageId || '').trim().toLowerCase(),
    String(order.packageSku || '').trim().toLowerCase()
  ].filter(Boolean));
  const sku = String(order.packageSku || '').trim().toLowerCase();
  const match = sku.match(/^credits\.([a-z0-9_-]+)(?:\.v\d+)?$/);
  if (match) aliases.add(match[1]);
  return aliases;
};

const validateCallbackAgainstOrder = (callback, order) => {
  if (!order) return { ok: false, error: 'UNKNOWN_ORDER' };
  if (String(order.status || '').toLowerCase() !== 'pending') {
    return { ok: false, error: 'ORDER_NOT_PENDING' };
  }
  if (
    callback.appUserId &&
    callback.appUserId !== String(order.legacyUserId || '').trim()
  ) {
    return { ok: false, error: 'USER_MISMATCH' };
  }
  if (!callback.packageRef || !packageAliases(order).has(callback.packageRef.toLowerCase())) {
    return { ok: false, error: 'PACKAGE_MISMATCH' };
  }
  if (callback.amountMinor == null || callback.amountMinor !== Number(order.amountMinor)) {
    return { ok: false, error: 'AMOUNT_MISMATCH' };
  }
  return { ok: true };
};

class PgPaymentRepository {
  async transaction(callback) {
    return withTransaction(async (client) => callback({
      claimEvent: async ({ providerEventId, payloadHash }) => {
        const result = await client.query(
          `INSERT INTO payment_callback_events
            (provider, provider_event_id, payload_hash, signature_valid, status)
           VALUES ('afdian',$1,$2,true,'received')
           ON CONFLICT (provider, provider_event_id) DO UPDATE SET
             payload_hash=EXCLUDED.payload_hash,
             signature_valid=true,
             status='received',
             processed_at=NULL,
             attempt_count=payment_callback_events.attempt_count + 1,
             last_error=NULL
           WHERE payment_callback_events.status LIKE 'dead_letter:%'
           RETURNING id`,
          [providerEventId, payloadHash]
        );
        return result.rowCount ? result.rows[0].id : null;
      },
      lockOrder: async (localOrderId) => {
        const reference = String(localOrderId || '').trim();
        if (!UUID_RE.test(reference) && !LEGACY_ORDER_RE.test(reference)) return null;
        const result = await client.query(
          `SELECT po.id, po.user_id, po.package_id, po.expected_amount_minor,
                  po.expected_credits, po.status, u.legacy_user_id,
                  pp.sku AS package_sku
             FROM payment_orders po
             JOIN users u ON u.id = po.user_id
             JOIN payment_packages pp ON pp.id = po.package_id
            WHERE (po.id::text = $1 OR po.legacy_order_id = $1)
              AND po.provider = 'afdian'
            FOR UPDATE OF po`,
          [reference]
        );
        if (!result.rowCount) return null;
        const row = result.rows[0];
        return {
          id: row.id,
          userId: row.user_id,
          legacyUserId: row.legacy_user_id,
          packageId: row.package_id,
          packageSku: row.package_sku,
          amountMinor: Number(row.expected_amount_minor),
          credits: Number(row.expected_credits),
          status: row.status
        };
      },
      rejectEvent: async ({ eventId, paymentOrderId, error }) => {
        const safeError = String(error || 'UNKNOWN').slice(0, 80);
        await client.query(
          `UPDATE payment_callback_events
              SET payment_order_id=$2, status=$3, last_error=$4, processed_at=now()
            WHERE id=$1`,
          [eventId, paymentOrderId || null, `dead_letter:${safeError}`, safeError]
        );
      },
      creditPayment: async ({ eventId, order, providerEventId }) => {
        const wallet = await client.query(
          `SELECT available_credits, frozen_credits
             FROM wallets WHERE user_id=$1 FOR UPDATE`,
          [order.userId]
        );
        if (!wallet.rowCount) throw new ApiError(409, 'WALLET_NOT_FOUND');
        const updatedWallet = await client.query(
          `UPDATE wallets
              SET available_credits = available_credits + $2,
                  version = version + 1, updated_at=now()
            WHERE user_id=$1
            RETURNING available_credits, frozen_credits`,
          [order.userId, order.credits]
        );
        const payment = await client.query(
          `UPDATE payment_orders
              SET status='paid', provider_order_id=$2, paid_at=now(), updated_at=now()
            WHERE id=$1 AND status='pending'`,
          [order.id, providerEventId]
        );
        if (payment.rowCount !== 1) throw new ApiError(409, 'ORDER_NOT_PENDING');
        await client.query(
          `INSERT INTO wallet_ledger
            (user_id, entry_type, delta_available, delta_frozen,
             balance_available, balance_frozen, reference_type, reference_id,
             idempotency_key, metadata)
           VALUES ($1,'purchase',$2,0,$3,$4,'payment_order',$5,$6,$7)`,
          [
            order.userId,
            order.credits,
            updatedWallet.rows[0].available_credits,
            updatedWallet.rows[0].frozen_credits,
            order.id,
            `purchase:afdian:${providerEventId}`,
            JSON.stringify({ provider: 'afdian' })
          ]
        );
        await client.query(
          `UPDATE payment_callback_events
              SET payment_order_id=$2, status='processed', last_error=NULL, processed_at=now()
            WHERE id=$1`,
          [eventId, order.id]
        );
      },
      recordReconciliationAudit: async ({ eventId, order, providerEventId, actorUserId }) => {
        await client.query(
          `INSERT INTO audit_events
            (actor_user_id, event_type, target_type, target_id, metadata)
           VALUES ($1,'admin.payment.reconciled','payment_callback_event',$2,$3)`,
          [
            actorUserId,
            String(eventId),
            JSON.stringify({
              provider: 'afdian',
              providerEventId: String(providerEventId),
              paymentOrderId: String(order.id)
            })
          ]
        );
      }
    }));
  }
}

const applyParsedPaymentCallback = ({
  parsed,
  repository,
  adminActorUserId = null
}) => repository.transaction(async (tx) => {
  const eventId = await tx.claimEvent({
    providerEventId: parsed.providerEventId,
    payloadHash: parsed.payloadHash
  });
  if (!eventId) return { ok: true, replayed: true, credited: false };
  const order = await tx.lockOrder(parsed.localOrderId);
  const validated = validateCallbackAgainstOrder(parsed, order);
  if (!validated.ok) {
    await tx.rejectEvent({
      eventId,
      paymentOrderId: order?.id || null,
      error: validated.error
    });
    return { ok: false, error: validated.error, credited: false };
  }
  await tx.creditPayment({ eventId, order, providerEventId: parsed.providerEventId });
  if (adminActorUserId) {
    if (typeof tx.recordReconciliationAudit !== 'function') {
      throw new ApiError(500, 'PAYMENT_AUDIT_UNAVAILABLE');
    }
    await tx.recordReconciliationAudit({
      eventId,
      order,
      providerEventId: parsed.providerEventId,
      actorUserId: adminActorUserId
    });
  }
  return {
    ok: true,
    replayed: false,
    credited: true,
    orderId: order.id,
    actorUserId: order.userId,
    credits: Number(order.credits || 0)
  };
});

const getAfdianDeadLetter = async (eventId, pool = getPool()) => {
  const id = String(eventId || '').trim();
  if (!UUID_RE.test(id)) throw new ApiError(400, 'INVALID_ID', { field: 'eventId' });
  const result = await pool.query(
    `SELECT id, provider_event_id, status, signature_valid, attempt_count,
            last_error, received_at, processed_at, payment_order_id
       FROM payment_callback_events
      WHERE id=$1 AND provider='afdian' AND status LIKE 'dead_letter:%'
      LIMIT 1`,
    [id]
  );
  if (!result.rowCount) throw new ApiError(404, 'PAYMENT_EVENT_NOT_RECONCILABLE');
  return result.rows[0];
};

const listAfdianDeadLetters = async ({ limit = 100, pool = getPool() } = {}) => {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
  const result = await pool.query(
    `SELECT id, provider_event_id, status, attempt_count, last_error,
            received_at, processed_at, payment_order_id
       FROM payment_callback_events
      WHERE provider='afdian' AND status LIKE 'dead_letter:%'
      ORDER BY received_at ASC, id ASC
      LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map((row) => ({
    eventId: row.id,
    providerEventId: row.provider_event_id,
    status: row.status,
    attempts: Number(row.attempt_count || 0),
    error: row.last_error || null,
    paymentOrderId: row.payment_order_id || null,
    receivedAt: row.received_at,
    processedAt: row.processed_at || null
  }));
};

const reconcileAfdianDeadLetter = async ({
  eventId,
  actorUserId = null,
  env = process.env,
  repository = new PgPaymentRepository(),
  loadEvent = (id) => getAfdianDeadLetter(id),
  reconcileProviderOrder = ({ providerEventId }) => queryAfdianProviderOrder({
    providerEventId,
    env
  })
} = {}) => {
  const event = await loadEvent(eventId);
  if (!event || event.signature_valid === false || event.signatureValid === false) {
    throw new ApiError(409, 'PAYMENT_EVENT_NOT_RECONCILABLE');
  }
  const providerEventId = String(event.provider_event_id || event.providerEventId || '').trim();
  if (!providerEventId) throw new ApiError(409, 'PAYMENT_EVENT_NOT_RECONCILABLE');
  const canonicalOrder = await reconcileProviderOrder({ providerEventId });
  const parsed = parseAfdianCallback({ data: { order: canonicalOrder } }, env);
  if (!parsed.ok || parsed.providerEventId !== providerEventId) {
    throw new ApiError(409, parsed.error || 'PROVIDER_ORDER_MISMATCH');
  }
  return applyParsedPaymentCallback({ parsed, repository, adminActorUserId: actorUserId });
};

const processAfdianPaymentCallback = async ({
  body,
  env = process.env,
  repository = new PgPaymentRepository(),
  verifySignature = (order, sign) => verifyAfdianWebhookSign(order, sign, env),
  reconcileProviderOrder = ({ providerEventId }) => queryAfdianProviderOrder({
    providerEventId,
    env
  })
} = {}) => {
  const received = parseAfdianCallback(body, env);
  if (!received.ok) return received;
  const signature = await verifySignature(received.order, received.sign);
  if (signature !== true && !signature?.ok) {
    return { ok: false, error: String(signature?.error || 'INVALID_SIGN') };
  }

  // The provider's RSA signature does not cover custom_order_id or remark.
  // Fetch the canonical order through the authenticated provider API before
  // trusting either field, otherwise a valid same-price webhook could be
  // rebound to another local order.
  if (typeof reconcileProviderOrder !== 'function') {
    throw new ApiError(503, 'PAYMENT_RECONCILIATION_NOT_CONFIGURED', { retryable: true });
  }
  const canonicalOrder = await reconcileProviderOrder({
    providerEventId: received.providerEventId,
    receivedOrder: received.order
  });
  if (!canonicalOrder || typeof canonicalOrder !== 'object') {
    throw new ApiError(503, 'PAYMENT_PROVIDER_ORDER_NOT_FOUND', { retryable: true });
  }
  if (buildAfdianSignPayload(canonicalOrder) !== buildAfdianSignPayload(received.order)) {
    return { ok: false, error: 'PROVIDER_ORDER_MISMATCH' };
  }
  const canonicalSignature = await verifySignature(canonicalOrder, received.sign);
  if (canonicalSignature !== true && !canonicalSignature?.ok) {
    return { ok: false, error: String(canonicalSignature?.error || 'INVALID_SIGN') };
  }
  const parsed = parseAfdianCallback({ sign: received.sign, data: { order: canonicalOrder } }, env);
  if (!parsed.ok) return parsed;

  return applyParsedPaymentCallback({ parsed, repository });
};

const resolveActivePaymentPackage = async (client, packageRef) => {
  const ref = String(packageRef || '').trim().toLowerCase();
  if (!ref || ref.length > 160) {
    throw new ApiError(400, 'INVALID_PACKAGE', { field: 'packageId' });
  }
  const exact = await client.query(
    `SELECT * FROM payment_packages
      WHERE active=true AND (id::text=$1 OR lower(sku)=$1)
      LIMIT 1 FOR SHARE`,
    [ref]
  );
  if (exact.rowCount) return exact.rows[0];
  if (!/^[a-z0-9_-]{1,80}$/.test(ref)) {
    throw new ApiError(404, 'PACKAGE_NOT_FOUND', { field: 'packageId' });
  }
  const aliases = await client.query(
    `SELECT * FROM payment_packages
      WHERE active=true
        AND regexp_replace(
          regexp_replace(lower(sku), '^credits\\.', ''),
          '\\.v[0-9]+$', ''
        )=$1
      ORDER BY lower(sku) DESC, id ASC
      LIMIT 2 FOR SHARE`,
    [ref]
  );
  if (aliases.rowCount > 1) {
    throw new ApiError(409, 'PACKAGE_ALIAS_AMBIGUOUS', { field: 'packageId' });
  }
  if (!aliases.rowCount) throw new ApiError(404, 'PACKAGE_NOT_FOUND', { field: 'packageId' });
  return aliases.rows[0];
};

const createPaymentOrder = async ({
  userId,
  packageRef,
  provider = 'afdian',
  payUrlBuilder
}) => {
  return withTransaction(async (client) => {
    const dbUserId = await resolveUserId(client, userId);
    const row = await resolveActivePaymentPackage(client, packageRef);
    const created = await client.query(
      `INSERT INTO payment_orders
        (user_id, package_id, provider, expected_amount_minor, currency,
         expected_credits, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending')
       RETURNING *`,
      [dbUserId, row.id, provider, row.amount_minor, row.currency, row.credits]
    );
    const order = {
      orderId: created.rows[0].id,
      userId,
      packageId: row.id,
      packageSku: row.sku,
      title: row.title,
      amountMinor: Number(row.amount_minor),
      currency: row.currency,
      credits: Number(row.credits),
      status: created.rows[0].status,
      createdAt: created.rows[0].created_at
    };
    if (typeof payUrlBuilder === 'function') {
      order.payUrl = await payUrlBuilder(order);
    }
    return order;
  });
};

module.exports = {
  PgPaymentRepository,
  applyParsedPaymentCallback,
  assertSafePaymentUrl,
  buildAfdianApiRequest,
  buildAfdianPayUrl,
  createPaymentOrder,
  extractRemarkValue,
  getAfdianDeadLetter,
  listAfdianDeadLetters,
  packageAliases,
  parseAfdianCallback,
  parseAmountMinor,
  parsePlanPackageMap,
  packageReferenceCandidates,
  processAfdianPaymentCallback,
  queryAfdianProviderOrder,
  reconcileAfdianDeadLetter,
  resolveActivePaymentPackage,
  validateCallbackAgainstOrder
};
