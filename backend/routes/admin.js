const crypto = require('crypto');
const fs = require('fs');
const { rateLimit, getRateLimitStats } = require('../lib/rateLimit');
const {
  resolveConsoleAdminAccount,
  createAdminToken,
  assertAdmin,
  parseBearerToken,
  verifyAdminToken,
  isProductionRuntime,
  sanitizeUserProfile,
  readUsersMap
} = require('../lib/auth-utils');
const { getPool, isDatabaseConfigured } = require('../db/pool');
const {
  AdminAuthorizationError,
  requireActiveAdministrator,
  requireAdminDatabaseAtLogin
} = require('../services/admin-auth-service');
const {
  AdminFinanceError,
  MAX_CREDITS,
  createAdminFinanceService,
  resolveAdminFinancialDataSource
} = require('../services/admin-finance-service');
const {
  AdminOperationsError,
  createAdminOperationsService
} = require('../services/admin-operations-service');
const {
  listOperationalRecords,
  usesOperationalRecordStore
} = require('../services/operational-record-service');
const {
  readJson,
  USERS_FILE,
  CHATS_FILE,
  PAY_ORDERS_FILE,
  CREDITS_ORDERS_FILE,
  ANALYTICS_EVENTS_FILE,
  readUserMemory,
  writeJson,
  writeUserMemory,
  MEMORY_DIR
} = require('../utils/storage');
const { credits: imgCredits } = require('../imgagent');
const {
  opaqueReference,
  sanitizeAnalyticsEvent,
  sanitizeAuditHistoryEntry,
  sanitizeImageHistoryEntry,
  sanitizeUserHistoryMemory
} = require('../lib/privacy-metadata');

const clampInt = (n, min, max) => {
  const v = Number.parseInt(n, 10);
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
};
const normalizeReasonKey = (raw) => {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return '';
  return key.replace(/[\s/-]+/g, '_');
};
const readAnalyticsEvents = () => {
  const raw = readJson(ANALYTICS_EVENTS_FILE, { v: 1, items: [] });
  const original = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw.items) ? raw.items : [];
  const items = original.map(sanitizeAnalyticsEvent).filter(Boolean);
  if (JSON.stringify(original) !== JSON.stringify(items)) {
    writeJson(ANALYTICS_EVENTS_FILE, { v: 1, items });
  }
  return items;
};
const readSanitizedUserMemory = (userId) => {
  const scrubbed = sanitizeUserHistoryMemory(readUserMemory(userId, {}));
  if (scrubbed.changed) writeUserMemory(userId, scrubbed.memory);
  return scrubbed.memory;
};
const resolveReasonText = (reason) => {
  const key = normalizeReasonKey(reason);
  if (!key) return '';
  const map = {
    aidesign_quick: '生图',
    aidesign_generate: '生图',
    aidesign: '生图',
    aidesign_semantic: '深度思考语义分析',
    aidesign_directions: '深度思考语义分析',
    aidesign_deep_analysis: '深度思考语义分析',
    agentimg_directions: '深度思考语义分析',
    aidesign_final: '生图',
    aidesign_deep_generate: '生图',
    ai_lab: 'AI实验室',
    ai_image_workshop: 'AI影像工坊',
    ai_design: '生图',
    ai_background: 'AI背景',
    ai_id_photo: 'AI证件照',
    id_photo: 'AI证件照',
    ai_old_photo: 'AI老照片',
    old_photo: 'AI老照片',
    ai_ingredient_list: 'AI配料表',
    img2img: '生图',
    generate: '生成'
  };
  return map[key] || '';
};
const resolveImageSource = (item) => {
  const type = String(item?.type || '').trim().toLowerCase();
  const purpose = String(item?.purpose || '').trim().toLowerCase();
  if (type) return type;
  return purpose || '';
};

const getAdminFinanceContext = () => {
  const source = resolveAdminFinancialDataSource({ env: process.env });
  return {
    source,
    service: source === 'postgres' ? createAdminFinanceService({ pool: getPool() }) : null
  };
};

const resolveAdminActor = (req) => {
  const bearer = parseBearerToken(req);
  if (bearer) {
    const verified = verifyAdminToken(bearer);
    if (verified.ok) return String(verified.username || 'console-admin').slice(0, 120);
  }
  return 'legacy-console-admin';
};

const resolveAdminIdempotencyKey = (req, res) => {
  const header = req?.headers?.['idempotency-key'];
  const rawHeader = Array.isArray(header) ? header[0] : header;
  return String(
    rawHeader || req?.body?.idempotencyKey || res?.locals?.requestId || crypto.randomUUID()
  ).trim();
};

const respondAdminFinanceError = (res, error, routeName) => {
  if (error instanceof AdminAuthorizationError) {
    return res.status(error.status || 403).json({ error: error.code || 'ADMIN_AUTH_FORBIDDEN' });
  }
  if (error instanceof AdminFinanceError) {
    return res.status(error.status || 400).json({ error: error.code || 'ADMIN_FINANCE_ERROR' });
  }
  console.error(`Error in ${routeName}:`, error);
  return res.status(500).json({ error: 'Internal Server Error' });
};

const respondAdminOperationsError = (res, error, routeName) => {
  if (error instanceof AdminAuthorizationError) {
    return res.status(error.status || 403).json({ error: error.code || 'ADMIN_AUTH_FORBIDDEN' });
  }
  if (error instanceof AdminOperationsError) {
    return res.status(error.status || 400).json({ error: error.code || 'ADMIN_OPERATIONS_ERROR' });
  }
  console.error(`Error in ${routeName}:`, error);
  return res.status(500).json({ error: 'ADMIN_OPERATIONS_UNAVAILABLE' });
};

const installAdminRoutes = (app, deps = {}) => {
  const operationalStoreEnabled = deps.usesOperationalRecordStore || usesOperationalRecordStore;
  const listPersistentRecords = deps.listOperationalRecords || listOperationalRecords;
  app.use('/api/admin', async (req, res, next) => {
    const path = String(req.originalUrl || req.url || req.path || '').split('?')[0];
    if (path === '/api/admin/login' || String(req.path || '') === '/login') return next();
    if (!isProductionRuntime(process.env)) return next();
    if (!isDatabaseConfigured()) {
      return res.status(503).json({ error: 'ADMIN_DATABASE_REQUIRED' });
    }
    try {
      res.locals.adminPrincipal = await requireActiveAdministrator({
        req,
        minimumRole: 'operator'
      });
      return next();
    } catch (error) {
      if (error instanceof AdminAuthorizationError) {
        return res.status(error.status || 403).json({ error: error.code || 'ADMIN_AUTH_FORBIDDEN' });
      }
      return res.status(503).json({ error: 'ADMIN_DATABASE_UNAVAILABLE' });
    }
  });

  app.post('/api/admin/login', rateLimit('admin_login', { max: 30, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      const body = req && req.body && typeof req.body === 'object' ? req.body : {};
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!username || !password) return res.status(400).json({ error: 'INVALID_INPUT' });

      const cfg = resolveConsoleAdminAccount();
      if (!cfg.ok) {
        return res.status(501).json({ error: 'ADMIN_ACCOUNT_NOT_CONFIGURED' });
      }

      const uOk = (() => {
        try {
          const a = Buffer.from(username, 'utf8');
          const b = Buffer.from(cfg.username, 'utf8');
          if (a.length !== b.length) return false;
          return crypto.timingSafeEqual(a, b);
        } catch {
          return false;
        }
      })();
      const pOk = (() => {
        try {
          const a = Buffer.from(password, 'utf8');
          const b = Buffer.from(cfg.password, 'utf8');
          if (a.length !== b.length) return false;
          return crypto.timingSafeEqual(a, b);
        } catch {
          return false;
        }
      })();
      if (!uOk || !pOk) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

      const principal = await requireAdminDatabaseAtLogin({ username });
      const issued = createAdminToken(username, principal ? {
        userId: principal.actorUserId,
        role: principal.role
      } : {});
      return res.json({
        ok: true,
        token: issued.token,
        expiresAt: issued.expiresAt,
        role: principal?.role || 'development'
      });
    } catch (e) {
      if (e instanceof AdminAuthorizationError) {
        return res.status(e.status || 403).json({ error: e.code || 'ADMIN_AUTH_FORBIDDEN' });
      }
      console.error('Error in POST /api/admin/login:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/me', rateLimit('admin_me', { max: 120, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const principal =
        res.locals.adminPrincipal ||
        (isDatabaseConfigured()
          ? await requireActiveAdministrator({ req, minimumRole: 'operator' })
          : { username: resolveAdminActor(req), role: 'owner', legacy: true });
      return res.json({
        ok: true,
        principal: {
          username: String(principal.username || 'admin'),
          role: String(principal.role || 'operator'),
          legacy: Boolean(principal.legacy)
        }
      });
    } catch (error) {
      return respondAdminOperationsError(res, error, 'GET /api/admin/me');
    }
  });

  app.get('/api/admin/overview', rateLimit('admin_overview', { max: 60, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      if (!isDatabaseConfigured()) {
        return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
      }
      await requireActiveAdministrator({ req, minimumRole: 'operator' });
      const overview = await createAdminOperationsService().getOverview();
      return res.json({ ok: true, overview });
    } catch (error) {
      return respondAdminOperationsError(res, error, 'GET /api/admin/overview');
    }
  });

  app.get('/api/admin/credits/ledger', rateLimit('admin_credits_ledger', { max: 60, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      if (!isDatabaseConfigured()) {
        return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
      }
      await requireActiveAdministrator({ req, minimumRole: 'operator' });
      const result = await createAdminOperationsService().listCreditLedger({
        userId: req.query.userId,
        entryType: req.query.entryType,
        from: req.query.from,
        to: req.query.to,
        limit: req.query.limit,
        offset: req.query.offset
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return respondAdminOperationsError(res, error, 'GET /api/admin/credits/ledger');
    }
  });

  app.get('/api/admin/audit/events', rateLimit('admin_audit_events', { max: 60, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      if (!isDatabaseConfigured()) {
        return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
      }
      await requireActiveAdministrator({ req, minimumRole: 'operator' });
      const result = await createAdminOperationsService().listAuditEvents({
        actor: req.query.actor,
        eventType: req.query.eventType,
        targetType: req.query.targetType,
        from: req.query.from,
        to: req.query.to,
        limit: req.query.limit,
        offset: req.query.offset
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return respondAdminOperationsError(res, error, 'GET /api/admin/audit/events');
    }
  });

  app.post('/api/admin/users/status', rateLimit('admin_user_status', { max: 30, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      if (!isDatabaseConfigured()) {
        return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
      }
      const principal = await requireActiveAdministrator({ req, minimumRole: 'admin' });
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const user = await createAdminOperationsService().updateUserStatus({
        userId: body.userId,
        status: body.status,
        actorUserId: principal.actorUserId,
        requestId: String(res?.locals?.requestId || '').trim()
      });
      return res.json({ ok: true, user });
    } catch (error) {
      return respondAdminOperationsError(res, error, 'POST /api/admin/users/status');
    }
  });

  app.get('/api/admin/users', rateLimit('admin_users', { max: 60, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const q = String(req.query.q || '').trim().toLowerCase();
      const limit = clampInt(req.query.limit, 20, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);
      const finance = getAdminFinanceContext();
      if (finance.source === 'unavailable') {
        return res.status(503).json({ error: 'ADMIN_FINANCE_UNAVAILABLE' });
      }
      if (finance.source === 'postgres') {
        await requireActiveAdministrator({ req, minimumRole: 'operator' });
        const result = await finance.service.listUsers({ q, limit, offset });
        return res.json({ ok: true, ...result });
      }

      const users = readUsersMap();
      const analyticsEvents = readAnalyticsEvents();
      const analyticsUserRefs = new Map();
      for (const user of Object.values(users)) {
        const id = String(user?.id || user?.userId || '').trim();
        if (id) analyticsUserRefs.set(opaqueReference(id, 'user'), id);
      }
      const lastSeenByUser = new Map();
      const visitsByUser = new Map();
      for (const evt of analyticsEvents) {
        const userId = analyticsUserRefs.get(String(evt?.userId || '').trim()) || '';
        if (!userId) continue;
        const ts = Number(evt?.ts || 0) || 0;
        if (ts > (lastSeenByUser.get(userId) || 0)) lastSeenByUser.set(userId, ts);
        if (String(evt?.eventType || '').trim() === 'page_view') {
          visitsByUser.set(userId, (visitsByUser.get(userId) || 0) + 1);
        }
      }

      const chats = readJson(CHATS_FILE, {});
      if (chats && typeof chats === 'object') {
        for (const userId of Object.keys(chats)) {
          const history = Array.isArray(chats[userId]) ? chats[userId] : [];
          let maxTs = 0;
          for (const msg of history) {
            const ts = Number(msg?.ts || msg?.timestamp || 0) || 0;
            if (ts > maxTs) maxTs = ts;
          }
          if (maxTs > (lastSeenByUser.get(userId) || 0)) lastSeenByUser.set(userId, maxTs);
        }
      }

      const allUserIds = new Set();
      for (const u of Object.values(users)) {
        if (!u || typeof u !== 'object') continue;
        const uid = String(u?.id || u?.userId || '').trim();
        if (uid) allUserIds.add(uid);
      }
      for (const uid of lastSeenByUser.keys()) allUserIds.add(uid);
      for (const uid of visitsByUser.keys()) allUserIds.add(uid);

      const list = Array.from(allUserIds)
        .map((userId) => {
          const raw = users[userId];
          const u = raw && typeof raw === 'object' ? sanitizeUserProfile(raw) : {};
          const isGuest = userId.startsWith('guest_') || userId === 'guest';
          const lastSeen = Number(u?.lastSeen || 0) || Number(lastSeenByUser.get(userId) || 0) || 0;
          const visits = Number(u?.visits || 0) || Number(visitsByUser.get(userId) || 0) || 0;
          const createdAt = Number(u?.createdAt || 0) || 0;
          return {
            userId,
            email: typeof u?.email === 'string' ? u.email : '',
            username: typeof u?.username === 'string' ? u.username : '',
            name:
              typeof u?.name === 'string' && u.name.trim()
                ? u.name
                : isGuest
                  ? 'Guest'
                  : '',
            status: typeof u?.status === 'string' ? u.status : 'active',
            createdAt,
            lastSeen,
            visits
          };
        })
        .filter((u) => !!u.userId)
        .filter((u) => {
          if (!q) return true;
          return (
            u.userId.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q) ||
            u.name.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          const aRank = a.lastSeen || a.createdAt || 0;
          const bRank = b.lastSeen || b.createdAt || 0;
          return bRank - aRank;
        });

      const total = list.length;
      const page = list.slice(offset, offset + limit);
      const items = page.map((u) => {
        let wallet = null;
        try {
          wallet = imgCredits.getBalance(u.userId);
        } catch { }
        return { ...u, wallet };
      });
      return res.json({ ok: true, total, items });
    } catch (e) {
      return respondAdminFinanceError(res, e, 'GET /api/admin/users');
    }
  });

  app.get('/api/admin/chats/history', rateLimit('admin_chats_history', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const userId = String(req.query.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'MISSING_USER_ID' });

      const limit = clampInt(req.query.limit, 20, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);

      const allChats = readJson(CHATS_FILE, {});
      const history = allChats && typeof allChats === 'object' && Array.isArray(allChats[userId]) ? allChats[userId] : [];
      const total = history.length;

      const end = Math.max(0, Math.min(total, total - offset));
      const start = Math.max(0, end - limit);
      const items = history.slice(start, end);
      return res.json({ ok: true, total, items });
    } catch (e) {
      console.error('Error in GET /api/admin/chats/history:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/orders', rateLimit('admin_orders', { max: 60, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const userId = String(req.query.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'MISSING_USER_ID' });

      const limit = clampInt(req.query.limit, 20, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);
      const finance = getAdminFinanceContext();
      if (finance.source === 'unavailable') {
        return res.status(503).json({ error: 'ADMIN_FINANCE_UNAVAILABLE' });
      }
      if (finance.source === 'postgres') {
        await requireActiveAdministrator({ req, minimumRole: 'operator' });
        const result = await finance.service.listOrders({ userId, limit, offset });
        return res.json({ ok: true, ...result });
      }

      const payRaw = readJson(PAY_ORDERS_FILE, {});
      const creditsRaw = readJson(CREDITS_ORDERS_FILE, {});
      const payMap = payRaw && typeof payRaw === 'object' ? payRaw : {};
      const creditsMap = creditsRaw && typeof creditsRaw === 'object' ? creditsRaw : {};

      const payItems = Object.values(payMap)
        .filter((o) => o && typeof o === 'object' && String(o.userId || '').trim() === userId)
        .map((o) => ({
          kind: 'pay',
          id: String(o.orderId || '').trim(),
          orderId: String(o.orderId || '').trim(),
          userId: String(o.userId || '').trim(),
          packageId: String(o.packageId || '').trim(),
          amountCny: Number(o.amountCny ?? 0) || 0,
          credits: Number(o.credits ?? 0) || 0,
          createdAt: Number(o.createdAt ?? 0) || 0,
          updatedAt: Number(o.updatedAt ?? 0) || 0
        }))
        .filter((o) => !!o.id);

      const creditsItems = Object.values(creditsMap)
        .filter((o) => o && typeof o === 'object' && String(o.userId || '').trim() === userId)
        .map((o) => ({
          kind: 'credits',
          id: String(o.afdianOrderId || '').trim(),
          afdianOrderId: String(o.afdianOrderId || '').trim(),
          userId: String(o.userId || '').trim(),
          packageId: typeof o.packageId === 'string' ? String(o.packageId || '').trim() : '',
          credits: Number(o.credits ?? 0) || 0,
          createdAt: Number(o.createdAt ?? 0) || 0
        }))
        .filter((o) => !!o.id);

      const all = [...payItems, ...creditsItems].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const total = all.length;
      const items = all.slice(offset, offset + limit);
      return res.json({ ok: true, total, items });
    } catch (e) {
      return respondAdminFinanceError(res, e, 'GET /api/admin/orders');
    }
  });

  app.post('/api/admin/users/credits', rateLimit('admin_user_credits', { max: 60, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const body = req && req.body && typeof req.body === 'object' ? req.body : {};
      const userId = String(body.userId || '').trim();
      const hasAvailable = body.available !== null && body.available !== undefined && body.available !== '';
      const availableRaw = hasAvailable ? Number(body.available) : Number.NaN;
      const available = Number.isSafeInteger(availableRaw) && availableRaw >= 0 && availableRaw <= MAX_CREDITS
        ? availableRaw
        : null;
      if (!userId) return res.status(400).json({ error: 'MISSING_USER_ID' });
      if (available === null) return res.status(400).json({ error: 'INVALID_AVAILABLE' });

      const finance = getAdminFinanceContext();
      if (finance.source === 'unavailable') {
        return res.status(503).json({ error: 'ADMIN_FINANCE_UNAVAILABLE' });
      }
      if (finance.source === 'postgres') {
        const principal = await requireActiveAdministrator({ req, minimumRole: 'admin' });
        const result = await finance.service.adjustAvailableCredits({
          userId,
          available,
          idempotencyKey: resolveAdminIdempotencyKey(req, res),
          actor: principal.username || resolveAdminActor(req),
          actorUserId: principal.actorUserId,
          requestId: String(res?.locals?.requestId || '').trim()
        });
        return res.json({ ok: true, wallet: result.wallet, replayed: result.replayed });
      }

      const result = imgCredits.setAvailableCredits({ userId, available });
      if (!result || !result.ok) return res.status(400).json({ error: result?.error || 'SET_CREDITS_FAILED' });
      return res.json({ ok: true, wallet: result.wallet || null });
    } catch (e) {
      return respondAdminFinanceError(res, e, 'POST /api/admin/users/credits');
    }
  });

  app.get('/api/admin/credits/holds', rateLimit('admin_credits_holds', { max: 60, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const userId = String(req.query.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'MISSING_USER_ID' });

      const limit = clampInt(req.query.limit, 20, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);
      const finance = getAdminFinanceContext();
      if (finance.source === 'unavailable') {
        return res.status(503).json({ error: 'ADMIN_FINANCE_UNAVAILABLE' });
      }
      if (finance.source === 'postgres') {
        await requireActiveAdministrator({ req, minimumRole: 'operator' });
        const result = await finance.service.listHolds({ userId, limit, offset });
        return res.json({ ok: true, ...result });
      }
      const list = imgCredits
        .getHolds(userId, { limit: limit + offset })
        .slice(offset, offset + limit)
        .map((h) => {
          const reasonText = String(h?.reasonText || '').trim() || resolveReasonText(h?.reason);
          const cost = Number(h?.cost ?? 0) || 0;
          const reasonTextWithCost = reasonText ? `${reasonText}-${cost}` : '';
          return { ...h, reasonText, reasonTextWithCost };
        });
      return res.json({ ok: true, total: list.length, items: list });
    } catch (e) {
      return respondAdminFinanceError(res, e, 'GET /api/admin/credits/holds');
    }
  });

  app.get('/api/admin/images/history', rateLimit('admin_images_history', { max: 60, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const userId = String(req.query.userId || '').trim();
      const limit = clampInt(req.query.limit, 20, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);

      if (operationalStoreEnabled()) {
        const result = await listPersistentRecords({
          kind: 'image_history',
          userId,
          limit,
          offset
        });
        return res.json({
          ok: true,
          total: result.total,
          items: result.items.map((item) => ({
            ...item,
            source: resolveImageSource(item)
          }))
        });
      }

      let items = [];
      const users = readUsersMap();

      if (userId) {
        const mem = readSanitizedUserMemory(userId);
        const raw = Array.isArray(mem?.image_history) ? mem.image_history : [];
        items = raw.map(sanitizeImageHistoryEntry).filter(Boolean).map((it) => ({
          ...it, userId, source: resolveImageSource(it)
        }));
      } else {
        const allIds = new Set(
          Object.values(users)
            .map((u) => String(u?.id || '').trim())
            .filter(Boolean)
        );
        try {
          const files = fs.readdirSync(MEMORY_DIR, { withFileTypes: true });
          for (const file of files) {
            if (!file.isFile()) continue;
            const name = String(file.name || '');
            if (!name.startsWith('user_') || !name.endsWith('.json')) continue;
            const uid = name.slice(5, -5).trim();
            if (uid) allIds.add(uid);
          }
        } catch { }

        for (const uid of allIds) {
          const mem = readSanitizedUserMemory(uid);
          if (Array.isArray(mem?.image_history)) {
            items.push(
              ...mem.image_history.map(sanitizeImageHistoryEntry).filter(Boolean).map((it) => ({
                ...it, userId: uid, source: resolveImageSource(it)
              }))
            );
          }
        }
      }

      items.sort((a, b) => (b.ts || 0) - (a.ts || 0));

      const total = items.length;
      const page = items.slice(offset, offset + limit);
      return res.json({ ok: true, total, items: page });
    } catch (e) {
      console.error('Error in GET /api/admin/images/history:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/audit/history', rateLimit('admin_audit_history', { max: 60, windowMs: 60 * 1000 }), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const userId = String(req.query.userId || '').trim();
      const biz = normalizeReasonKey(req.query.biz || req.query.purpose || '');
      const kind = normalizeReasonKey(req.query.kind || '');
      const statusFilter = normalizeReasonKey(req.query.status || '');
      const limit = clampInt(req.query.limit, 20, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);

      if (operationalStoreEnabled()) {
        const result = await listPersistentRecords({
          kind: 'audit_history',
          userId,
          biz,
          entryKind: kind,
          status: statusFilter,
          limit,
          offset
        });
        return res.json({ ok: true, ...result });
      }

      const users = readUsersMap();

      let items = [];
      const pullFromUser = (uid) => {
        const mem = readSanitizedUserMemory(uid);
        const raw = Array.isArray(mem?.audit_history) ? mem.audit_history : [];
        if (!raw.length) return;
        for (const rawEntry of raw) {
          const it = sanitizeAuditHistoryEntry(rawEntry);
          if (!it) continue;
          const entryBiz = normalizeReasonKey(it.biz || it.purpose || it.trigger || '');
          const entryKind = normalizeReasonKey(it.kind || '');
          const entryStatus = normalizeReasonKey(it.status || '');
          if (biz && entryBiz !== biz) continue;
          if (kind && entryKind !== kind) continue;
          if (statusFilter && entryStatus !== statusFilter) continue;
          items.push({ ...it, userId: uid });
        }
      };

      if (userId) {
        pullFromUser(userId);
      } else {
        const allIds = new Set(
          Object.values(users)
            .map((u) => String(u?.id || '').trim())
            .filter(Boolean)
        );
        try {
          const files = fs.readdirSync(MEMORY_DIR, { withFileTypes: true });
          for (const file of files) {
            if (!file.isFile()) continue;
            const name = String(file.name || '');
            if (!name.startsWith('user_') || !name.endsWith('.json')) continue;
            const uid = name.slice(5, -5).trim();
            if (uid) allIds.add(uid);
          }
        } catch { }

        for (const uid of allIds) pullFromUser(uid);
      }

      items.sort((a, b) => (Number(b.ts || 0) || 0) - (Number(a.ts || 0) || 0));
      const total = items.length;
      const page = items.slice(offset, offset + limit);
      return res.json({ ok: true, total, items: page });
    } catch (e) {
      console.error('Error in GET /api/admin/audit/history:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/events', rateLimit('admin_events', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const userId = String(req.query.userId || '').trim();
      const limit = clampInt(req.query.limit, 50, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);

      const allEvents = readAnalyticsEvents();
      let filtered = Array.isArray(allEvents) ? allEvents : [];

      if (userId) {
        const userRef = opaqueReference(userId, 'user');
        filtered = filtered.filter((e) => String(e?.userId || '') === userRef);
      }

      filtered.sort((a, b) => (b.ts || 0) - (a.ts || 0));

      const total = filtered.length;
      const page = filtered.slice(offset, offset + limit);
      return res.json({ ok: true, total, items: page });
    } catch (e) {
      console.error('Error in GET /api/admin/events:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/ratelimit/stats', rateLimit('admin_ratelimit_stats', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const stats = typeof getRateLimitStats === 'function' ? getRateLimitStats() : null;
      return res.json({ ok: true, ...(stats || {}) });
    } catch (e) {
      console.error('Error in GET /api/admin/ratelimit/stats:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });
};

module.exports = { installAdminRoutes };
