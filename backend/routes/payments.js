const { ApiError, sendApiError } = require('../lib/api-error');
const { assertAdmin, parseCookieToken, resolveAuthUser } = require('../lib/auth-utils');
const { getPool, isDatabaseConfigured } = require('../db/pool');
const { resolveUserId } = require('../services/billing-service');
const { recordGenerationTaskEvent } = require('../services/generation-analytics-service');
const { canUseLegacyJsonBilling } = require('../lib/legacy-finance-policy');
const {
  AdminAuthorizationError,
  requireActiveAdministrator
} = require('../services/admin-auth-service');
const {
  buildAfdianPayUrl,
  claimAfdianPaymentOrder,
  createPaymentOrder,
  listAfdianDeadLetters,
  reconcileAfdianDeadLetter,
  processAfdianPaymentCallback
} = require('../services/payment-service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const paidFeaturesEnabled = (env = process.env) => {
  return /^(1|true)$/i.test(String(env.PAID_FEATURES_ENABLED || '').trim());
};

const paymentsEnabled = (env = process.env) => {
  if (Object.prototype.hasOwnProperty.call(env, 'PAYMENTS_ENABLED')) {
    return paidFeaturesEnabled(env) &&
      /^(1|true)$/i.test(String(env.PAYMENTS_ENABLED || '').trim());
  }
  return paidFeaturesEnabled(env);
};

const legacyJsonBillingEnabled = (env = process.env) => {
  return canUseLegacyJsonBilling({ env });
};

const CLIENT_PAYMENT_AUTHORITY = new Set([
  'amount', 'amountcny', 'amountminor', 'cost', 'credits', 'currency', 'points',
  'userid', 'user_id'
]);

const containsClientPaymentAuthority = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  return Object.keys(body).some((key) => CLIENT_PAYMENT_AUTHORITY.has(String(key).toLowerCase()));
};

const shortPackageId = (sku) => {
  const match = String(sku || '').trim().match(/^credits\.([a-z0-9_-]+)(?:\.v\d+)?$/i);
  return match ? match[1].toLowerCase() : '';
};

const epochMillis = (value) => {
  const millis = value ? new Date(value).getTime() : 0;
  return Number.isFinite(millis) ? millis : 0;
};

const publicCreditsBalance = (row) => ({
  userId: row.legacy_user_id || row.user_id,
  available: Number(row.available_credits),
  frozen: Number(row.frozen_credits),
  lastCheckinDay: ''
});

const publicCreditsOrder = (row) => ({
  // Preserve the legacy consumer field without disclosing the provider order ID.
  afdianOrderId: row.id,
  orderId: row.id,
  userId: row.legacy_user_id || row.user_id,
  credits: Number(row.expected_credits),
  packageId: shortPackageId(row.package_sku),
  packageSku: row.package_sku,
  status: row.status,
  createdAt: epochMillis(row.paid_at || row.created_at)
});

const publicCreditsHold = (row) => {
  const status = row.status === 'settled'
    ? 'confirmed'
    : row.status === 'released'
      ? 'refunded'
      : 'frozen';
  return {
    id: row.id,
    userId: row.legacy_user_id || row.user_id,
    cost: Number(row.credits),
    reason: row.operation || row.tool_id || '',
    requestId: row.idempotency_key || row.task_id,
    status,
    createdAt: epochMillis(row.created_at),
    updatedAt: epochMillis(row.resolved_at || row.task_updated_at || row.created_at)
  };
};

const assertRequestedUserOwner = (requestedUserId, owner) => {
  const requested = String(requestedUserId || '').trim();
  if (!requested) return true;
  const aliases = new Set([
    String(owner?.authUserId || '').trim(),
    String(owner?.dbUserId || '').trim(),
    String(owner?.legacyUserId || '').trim()
  ].filter(Boolean));
  if (!aliases.has(requested)) throw new ApiError(403, 'FORBIDDEN');
  return true;
};

const requireCookieUser = (req) => {
  if (!parseCookieToken(req)) throw new ApiError(401, 'LOGIN_REQUIRED');
  const auth = resolveAuthUser(req);
  if (!auth.ok) throw new ApiError(auth.status || 401, auth.error || 'LOGIN_REQUIRED');
  return auth;
};

const resolveBillingOwner = async (client, auth, requestedUserId) => {
  const dbUserId = await resolveUserId(client, auth.dbUserId || auth.userId);
  const user = await client.query(
    'SELECT id, legacy_user_id FROM users WHERE id=$1 LIMIT 1',
    [dbUserId]
  );
  if (!user.rowCount) throw new ApiError(401, 'SESSION_INVALID');
  const owner = {
    authUserId: auth.userId,
    dbUserId: user.rows[0].id,
    legacyUserId: user.rows[0].legacy_user_id
  };
  assertRequestedUserOwner(requestedUserId, owner);
  return owner;
};

const assertPaymentsAvailable = ({
  enabled = paymentsEnabled(),
  databaseConfigured = isDatabaseConfigured()
} = {}) => {
  if (!enabled) throw new ApiError(503, 'PAID_FEATURES_DISABLED', { retryable: true });
  if (!databaseConfigured) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
  return true;
};

const assertCreditFeaturesAvailable = ({
  enabled = paidFeaturesEnabled(),
  databaseConfigured = isDatabaseConfigured()
} = {}) => {
  if (!enabled) throw new ApiError(503, 'PAID_FEATURES_DISABLED', { retryable: true });
  if (!databaseConfigured) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
  return true;
};

const publicPackage = (row) => ({
  packageId: row.id,
  sku: row.sku,
  title: row.title,
  amountMinor: Number(row.amount_minor),
  currency: row.currency,
  credits: Number(row.credits)
});

const publicOrder = (row) => ({
  orderId: row.id,
  packageId: row.package_id,
  packageSku: row.package_sku,
  packageTitle: row.package_title,
  provider: row.provider,
  amountMinor: Number(row.expected_amount_minor),
  currency: row.currency,
  credits: Number(row.expected_credits),
  status: row.status,
  paidAt: row.paid_at || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const installPaymentRoutes = (app, deps = {}) => {
  const rateLimit = typeof deps.rateLimit === 'function'
    ? deps.rateLimit
    : () => (_req, _res, next) => next();
  const limiter = rateLimit('payments_read_v2', { max: 120, windowMs: 60 * 1000 });
  const createLimiter = rateLimit('payments_create_v2', { max: 20, windowMs: 60 * 1000 });
  const asyncRoute = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof AdminAuthorizationError) {
        return res.status(error.status || 403).json({ error: error.code || 'ADMIN_AUTH_FORBIDDEN' });
      }
      sendApiError(res, error);
    }
  };

  app.get('/api/pay/packages', limiter, asyncRoute(async (_req, res) => {
    assertPaymentsAvailable();
    const result = await getPool().query(
      `SELECT id, sku, title, amount_minor, currency, credits
         FROM payment_packages
        WHERE active = true
        ORDER BY amount_minor ASC, id ASC`
    );
    return res.json({ ok: true, packages: result.rows.map(publicPackage) });
  }));

  app.get('/api/pay/orders/:orderId', limiter, asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    assertPaymentsAvailable();
    const auth = requireCookieUser(req);
    const orderId = String(req.params.orderId || '').trim();
    if (!UUID_RE.test(orderId)) throw new ApiError(400, 'INVALID_ID', { field: 'orderId' });

    const client = await getPool().connect();
    try {
      const dbUserId = await resolveUserId(client, auth.dbUserId || auth.userId);
      const result = await client.query(
        `SELECT po.*, pp.sku AS package_sku, pp.title AS package_title
           FROM payment_orders po
           JOIN payment_packages pp ON pp.id = po.package_id
          WHERE po.id = $1 AND po.user_id = $2`,
        [orderId, dbUserId]
      );
      if (!result.rowCount) throw new ApiError(404, 'ORDER_NOT_FOUND');
      return res.json({ ok: true, order: publicOrder(result.rows[0]) });
    } finally {
      client.release();
    }
  }));

  app.post('/api/pay/create-order', createLimiter, asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    assertPaymentsAvailable();
    const auth = requireCookieUser(req);
    if (containsClientPaymentAuthority(req.body)) {
      throw new ApiError(400, 'CLIENT_PAYMENT_AUTHORITY_NOT_ALLOWED');
    }
    const packageRef = String(req.body?.packageId || req.body?.packageSku || '').trim();
    if (!packageRef) throw new ApiError(400, 'INVALID_PACKAGE', { field: 'packageId' });

    const order = await createPaymentOrder({
      userId: auth.dbUserId || auth.userId,
      packageRef,
      payUrlBuilder: (created) => buildAfdianPayUrl(created)
    });
    return res.json({
      ok: true,
      orderId: order.orderId,
      packageId: order.packageId,
      packageSku: order.packageSku,
      title: order.title,
      amountMinor: order.amountMinor,
      amountCny: Number((order.amountMinor / 100).toFixed(2)),
      currency: order.currency,
      credits: order.credits,
      status: order.status,
      createdAt: order.createdAt,
      payUrl: order.payUrl
    });
  }));

  app.post('/api/pay/orders/:orderId/verify', createLimiter, asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    assertPaymentsAvailable();
    const auth = requireCookieUser(req);
    const result = await claimAfdianPaymentOrder({
      localOrderId: req.params.orderId,
      actorUserId: auth.dbUserId || auth.userId,
      providerOrderId: req.body?.providerOrderId
    });
    if (result.credited && !result.replayed) {
      await recordGenerationTaskEvent({
        eventType: 'payment_confirmed',
        actorUserId: result.actorUserId,
        properties: {
          source: 'server',
          chargedCredits: Math.max(0, Number(result.credits || 0))
        }
      }).catch((error) => {
        console.error('Payment analytics event failed', error?.code || error?.message || error);
      });
    }
    return res.json({
      ok: true,
      orderId: result.orderId,
      credited: Boolean(result.credited),
      replayed: Boolean(result.replayed),
      credits: Number(result.credits || 0)
    });
  }));

  const pgCreditRead = (handler) => async (req, res, next) => {
    if (legacyJsonBillingEnabled()) return next();
    try {
      res.setHeader('Cache-Control', 'private, no-store');
      assertCreditFeaturesAvailable();
      const auth = requireCookieUser(req);
      const client = await getPool().connect();
      try {
        const owner = await resolveBillingOwner(client, auth, req.query?.userId);
        return await handler(req, res, client, owner);
      } finally {
        client.release();
      }
    } catch (error) {
      return sendApiError(res, error);
    }
  };

  app.get('/api/credits/balance', limiter, pgCreditRead(async (_req, res, client, owner) => {
    const result = await client.query(
      `SELECT u.id AS user_id, u.legacy_user_id,
              w.available_credits, w.frozen_credits
         FROM users u JOIN wallets w ON w.user_id=u.id
        WHERE u.id=$1`,
      [owner.dbUserId]
    );
    if (!result.rowCount) throw new ApiError(409, 'WALLET_NOT_FOUND');
    return res.json(publicCreditsBalance(result.rows[0]));
  }));

  app.get('/api/credits/orders', limiter, pgCreditRead(async (req, res, client, owner) => {
    const requestedLimit = Number.parseInt(String(req.query?.limit || ''), 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 500)
      : 200;
    const result = await client.query(
      `SELECT po.id, po.user_id, po.expected_credits, po.status,
              po.paid_at, po.created_at, u.legacy_user_id, pp.sku AS package_sku
         FROM payment_orders po
         JOIN users u ON u.id=po.user_id
         JOIN payment_packages pp ON pp.id=po.package_id
        WHERE po.user_id=$1 AND po.status='paid'
        ORDER BY po.paid_at DESC NULLS LAST, po.created_at DESC
        LIMIT $2`,
      [owner.dbUserId, limit]
    );
    return res.json({ ok: true, orders: result.rows.map(publicCreditsOrder) });
  }));

  app.get('/api/credits/holds', limiter, pgCreditRead(async (req, res, client, owner) => {
    const requestedLimit = Number.parseInt(String(req.query?.limit || ''), 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 500)
      : 200;
    const result = await client.query(
      `SELECT h.id, h.user_id, h.credits, h.status, h.created_at, h.resolved_at,
              u.legacy_user_id, t.id AS task_id, t.tool_id, t.operation,
              t.idempotency_key, t.updated_at AS task_updated_at
         FROM credit_holds h
         JOIN users u ON u.id=h.user_id
         JOIN tool_tasks t ON t.id=h.task_id
        WHERE h.user_id=$1
        ORDER BY h.created_at DESC
        LIMIT $2`,
      [owner.dbUserId, limit]
    );
    return res.json({ ok: true, holds: result.rows.map(publicCreditsHold) });
  }));

  app.post('/api/pay/afdian/webhook', async (req, res, next) => {
    if (legacyJsonBillingEnabled()) return next();
    try {
      assertPaymentsAvailable();
      const result = await processAfdianPaymentCallback({ body: req.body || {} });
      if (result.ok) {
        if (result.credited && !result.replayed) {
          await recordGenerationTaskEvent({
            eventType: 'payment_confirmed',
            actorUserId: result.actorUserId,
            properties: {
              source: 'server',
              chargedCredits: Math.max(0, Number(result.credits || 0))
            }
          }).catch((error) => {
            console.error('Payment analytics event failed', error?.code || error?.message || error);
          });
        }
        return res.json({ ec: 200, em: '' });
      }

      const error = String(result.error || 'INVALID_CALLBACK');
      const signatureFailure = [
        'INVALID_SIGN', 'INVALID_SIGN_PAYLOAD', 'MISSING_SIGN',
        'SIGN_KEY_NOT_CONFIGURED', 'VERIFY_FAILED', 'PROVIDER_ORDER_MISMATCH'
      ].includes(error);
      if (signatureFailure) return res.status(401).json({ ec: 401, em: error });

      // Provider-verified mismatches are acknowledged to avoid a retry storm,
      // but retained as dead letters. A privileged reconciliation re-queries
      // the canonical provider order before it may claim and credit them.
      const acknowledgedDeadLetter = [
        'AMOUNT_MISMATCH', 'ORDER_NOT_PENDING', 'PACKAGE_MISMATCH',
        'UNKNOWN_ORDER', 'USER_MISMATCH'
      ].includes(error);
      if (acknowledgedDeadLetter) return res.json({ ec: 200, em: '' });
      return res.status(400).json({ ec: 400, em: error });
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        return sendApiError(res, error);
      }
      console.error('Afdian payment callback temporarily failed', error?.code || error?.message || error);
      return res.status(503).json({ ec: 500, em: 'TEMPORARY_FAILURE' });
    }
  });

  app.get('/api/admin/payments/dead-letters', limiter, asyncRoute(async (req, res) => {
    if (!assertAdmin(req, res)) return;
    assertPaymentsAvailable();
    await requireActiveAdministrator({ req, minimumRole: 'operator' });
    const limit = Number.parseInt(String(req.query?.limit || ''), 10);
    const events = await listAfdianDeadLetters({ limit });
    return res.json({ ok: true, events });
  }));

  app.post('/api/admin/payments/reconcile/:eventId', createLimiter, asyncRoute(async (req, res) => {
    if (!assertAdmin(req, res)) return;
    assertPaymentsAvailable();
    const principal = await requireActiveAdministrator({ req, minimumRole: 'admin' });
    const result = await reconcileAfdianDeadLetter({
      eventId: req.params.eventId,
      actorUserId: principal.actorUserId
    });
    if (!result.ok) {
      throw new ApiError(409, result.error || 'PAYMENT_RECONCILIATION_FAILED', {
        retryable: true
      });
    }
    return res.json({ ok: true, result });
  }));
};

module.exports = {
  assertCreditFeaturesAvailable,
  assertPaymentsAvailable,
  containsClientPaymentAuthority,
  assertRequestedUserOwner,
  installPaymentRoutes,
  legacyJsonBillingEnabled,
  paymentsEnabled,
  paidFeaturesEnabled,
  publicCreditsBalance,
  publicCreditsHold,
  publicCreditsOrder,
  publicOrder,
  publicPackage
};
