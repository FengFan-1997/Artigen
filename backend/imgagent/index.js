const credits = require('./credits');
const profiles = require('./profiles');
const { readJson, writeJson, PAY_ORDERS_FILE } = require('../utils/storage');
const {
  isPaidAiUserId,
  normalizeOperationKey,
  resolveCreditsCosts,
  resolveServerCreditCost
} = require('../lib/credit-pricing');
const { processAfdianWebhook } = require('../lib/afdian-webhook');
const { buildOldPhotoPrompt, isAbortError } = require('../services/old-photo-service');
const { canUseLegacyJsonBilling } = require('../lib/legacy-finance-policy');
const {
  categoryMetadata,
  classifyModel,
  contentMetadata,
  networkMetadata,
  opaqueReference,
  sanitizeImageHistoryEntry,
  sanitizeUserHistoryMemory
} = require('../lib/privacy-metadata');

const installImgagentRoutes = (app, opts) => {
  const assertAuthUserMatches = opts?.assertAuthUserMatches;
  const callSiliconFlowImageGenerate = opts?.callSiliconFlowImageGenerate;
  const persistImageRefForUser = opts?.persistImageRefForUser;
  const persistGenerateImageInputForUser = opts?.persistGenerateImageInputForUser;
  const appendUserImageHistory = opts?.appendUserImageHistory;
  const appendUserAuditHistory = opts?.appendUserAuditHistory;
  const readUserMemory = opts?.readUserMemory;
  const writeUserMemory = opts?.writeUserMemory;
  const ensureUserMemoryShape = opts?.ensureUserMemoryShape;
  const imgCredits = opts?.imgCredits;
  const getClientIp = opts?.getClientIp;
  const sanitizeLedgerId = opts?.sanitizeLedgerId;
  const upsertUsageLedgerItem = opts?.upsertUsageLedgerItem;
  const rateLimit = opts?.rateLimit;
  const isProd = !!opts?.isProd;
  const legacyJsonBillingEnabled = canUseLegacyJsonBilling({ isProd });

  const isGuestUserId = (userId) => {
    const uid = String(userId || '').replace(/^[\s\uFEFF\u200B\u200C\u200D]+|[\s\uFEFF\u200B\u200C\u200D]+$/g, '');
    return !!uid && uid.startsWith('guest_');
  };
  const safeLedgerId = (value) => {
    if (typeof sanitizeLedgerId === 'function') return sanitizeLedgerId(value);
    return String(value || '').trim();
  };
  const requestPrivacyMetadata = (body, req) => ({
    ...(body?.sessionId ? { sessionRef: opaqueReference(body.sessionId, 'session') } : {}),
    ...(body?.projectId ? { projectRef: opaqueReference(body.projectId, 'project') } : {}),
    ...categoryMetadata(body?.requestSource, 'requestSource'),
    ...networkMetadata({
      ip: typeof getClientIp === 'function' ? getClientIp(req) : '',
      ua: typeof req?.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : ''
    })
  });

  const clampInt = (v, min, max) => {
    const n = Number.parseInt(String(v ?? ''), 10);
    if (!Number.isFinite(n)) return min;
    return Math.min(Math.max(n, min), max);
  };
  const normalizeReasonKey = normalizeOperationKey;
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
  const IMG2IMG_USER_MAX_CONCURRENCY = (() => {
    const v = Number.parseInt(String(process.env.IMG2IMG_USER_MAX_CONCURRENCY || ''), 10);
    return Number.isFinite(v) && v >= 0 ? Math.min(v, 20) : 2;
  })();
  const img2imgUserInFlight = new Map();
  const acquireImg2imgUserSlot = (userId) => {
    if (IMG2IMG_USER_MAX_CONCURRENCY <= 0) return { ok: true, release: () => { } };
    const uid = String(userId || '').trim();
    if (!uid) return { ok: true, release: () => { } };
    const now = Date.now();
    if (img2imgUserInFlight.size > 6000) {
      let removed = 0;
      for (const [k, v] of img2imgUserInFlight) {
        const last = Number(v?.last || 0) || 0;
        if (now - last > 10 * 60 * 1000) {
          img2imgUserInFlight.delete(k);
          removed += 1;
        }
        if (removed > 500) break;
      }
    }
    const cur = img2imgUserInFlight.get(uid) || { n: 0, last: now };
    const n = Number(cur?.n || 0) || 0;
    if (n >= IMG2IMG_USER_MAX_CONCURRENCY) return { ok: false, release: () => { } };
    img2imgUserInFlight.set(uid, { n: n + 1, last: now });
    const release = () => {
      const cur2 = img2imgUserInFlight.get(uid);
      if (!cur2) return;
      const n2 = Math.max(0, (Number(cur2?.n || 0) || 0) - 1);
      if (n2 <= 0) img2imgUserInFlight.delete(uid);
      else img2imgUserInFlight.set(uid, { n: n2, last: Date.now() });
    };
    return { ok: true, release };
  };

  const extractProviderImages = (data) => {
    const list = Array.isArray(data?.images)
      ? data.images
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.output)
          ? data.output
          : [];
    const out = [];
    for (const it of list) {
      if (typeof it === 'string') {
        const u = it.trim();
        if (u) out.push(u);
        continue;
      }
      if (it && typeof it === 'object') {
        const u = typeof it.url === 'string' ? it.url.trim() : typeof it.image === 'string' ? it.image.trim() : '';
        if (u) out.push(u);
      }
    }
    return out;
  };
  const payPackages = {
    starter: { packageId: 'starter', amountCny: 9.9, credits: 400 },
    standard: { packageId: 'standard', amountCny: 19.9, credits: 1000 },
    pro: { packageId: 'pro', amountCny: 49.9, credits: 3000 },
    ultimate: { packageId: 'ultimate', amountCny: 99.9, credits: 10000 }
  };
  const resolvePayPackage = (packageId) => {
    const k = String(packageId || '').trim().toLowerCase();
    const hit = payPackages[k];
    return hit && typeof hit === 'object' ? hit : null;
  };
  const makePayOrderId = () => {
    return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  };
  const resolveAfdianPageUrl = () => {
    const u = String(process.env.AFDIAN_PAGE_URL || process.env.AFDIAN_PAY_URL || '').trim();
    return u || 'https://afdian.com/';
  };
  const parseJsonObjectFromEnv = (envKey) => {
    const raw = String(process.env[envKey] || '').trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };
  const parseAfdianPackagePayUrlMap = () => {
    const parsed = parseJsonObjectFromEnv('AFDIAN_PACKAGE_PAY_URL_MAP');
    if (!parsed) return null;
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      const pkgId = String(k || '').trim().toLowerCase();
      const url = String(v || '').trim();
      if (!pkgId || !url) continue;
      out[pkgId] = url;
    }
    return Object.keys(out).length ? out : null;
  };
  const parseAfdianPackagePlanIdMap = () => {
    const parsed = parseJsonObjectFromEnv('AFDIAN_PACKAGE_PLAN_ID_MAP');
    if (!parsed) return null;
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      const pkgId = String(k || '').trim().toLowerCase();
      const planId = String(v || '').trim();
      if (!pkgId || !planId) continue;
      out[pkgId] = planId;
    }
    return Object.keys(out).length ? out : null;
  };
  const resolveAfdianOrderCreateUrl = () => {
    const u = String(process.env.AFDIAN_ORDER_CREATE_URL || '').trim();
    return u || 'https://afdian.com/order/create';
  };
  const resolveAfdianBasePayUrl = (pkg) => {
    const pkgId = String(pkg?.packageId || '').trim().toLowerCase();
    if (pkgId) {
      const urlMap = parseAfdianPackagePayUrlMap();
      const url = urlMap ? String(urlMap[pkgId] || '').trim() : '';
      if (url) return url;

      const planIdMap = parseAfdianPackagePlanIdMap();
      const planId = planIdMap ? String(planIdMap[pkgId] || '').trim() : '';
      if (planId) {
        const base = resolveAfdianOrderCreateUrl();
        const joiner = base.includes('?') ? '&' : '?';
        return `${base}${joiner}plan_id=${encodeURIComponent(planId)}&product_type=0`;
      }
    }
    return resolveAfdianPageUrl();
  };
  const appendQueryParams = (baseUrl, params) => {
    const base = String(baseUrl || '').trim();
    if (!base) return '';
    const pairs = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && String(v).trim());
    if (!pairs.length) return base;
    const q = pairs
      .map(([k, v]) => `${encodeURIComponent(String(k))}=${encodeURIComponent(String(v))}`)
      .join('&');
    const joiner = base.includes('?') ? '&' : '?';
    return `${base}${joiner}${q}`;
  };
  const buildAfdianPayUrl = (orderId, userId, pkg) => {
    const base = resolveAfdianBasePayUrl(pkg);
    const oid = String(orderId || '').trim();
    if (!oid) return base;
    const uid = String(userId || '').trim();
    const pkgId = String(pkg?.packageId || pkg?.packageId === '' ? pkg.packageId : pkg || '').trim();
    const remarkParts = [
      uid ? `userId=${uid}` : '',
      pkgId ? `packageId=${pkgId}` : '',
      oid ? `orderId=${oid}` : ''
    ].filter(Boolean);
    return appendQueryParams(base, {
      custom_order_id: oid,
      ...(remarkParts.length ? { remark: remarkParts.join(' ') } : {})
    });
  };
  const readPayOrdersMap = () => {
    const raw = readJson(PAY_ORDERS_FILE, {});
    return raw && typeof raw === 'object' ? raw : {};
  };
  const writePayOrdersMap = (m) => writeJson(PAY_ORDERS_FILE, m && typeof m === 'object' ? m : {});
  const prunePayOrdersMap = (m) => {
    const maxKeep = (() => {
      const v = Number.parseInt(String(process.env.PAY_ORDERS_MAX_KEEP || '5000'), 10);
      return Number.isFinite(v) && v > 0 ? Math.min(v, 20000) : 5000;
    })();
    const maxAgeMs = (() => {
      const v = Number.parseInt(String(process.env.PAY_ORDERS_MAX_AGE_DAYS || '30'), 10);
      const days = Number.isFinite(v) && v > 0 ? Math.min(v, 365) : 30;
      return days * 24 * 60 * 60 * 1000;
    })();
    const nowMs = Date.now();
    const entries = Object.entries(m || {})
      .map(([k, v]) => [k, v && typeof v === 'object' ? v : null])
      .filter(([, v]) => !!v);
    const filtered = entries.filter(([, v]) => {
      const createdAt = Number(v.createdAt ?? 0) || 0;
      if (!createdAt) return true;
      return nowMs - createdAt <= maxAgeMs;
    });
    if (filtered.length <= maxKeep) {
      const out = {};
      for (const [k, v] of filtered) out[k] = v;
      return out;
    }
    filtered.sort((a, b) => (Number(b[1].createdAt ?? 0) || 0) - (Number(a[1].createdAt ?? 0) || 0));
    const out = {};
    for (const [k, v] of filtered.slice(0, maxKeep)) out[k] = v;
    return out;
  };
  const savePayOrder = (input) => {
    const id = String(input?.orderId || '').trim();
    if (!id) return;
    const m = readPayOrdersMap();
    m[id] = {
      orderId: id,
      userId: String(input?.userId || '').trim(),
      packageId: String(input?.packageId || '').trim(),
      amountCny: Number(input?.amountCny ?? 0) || 0,
      credits: Number(input?.credits ?? 0) || 0,
      status: 'pending',
      createdAt: Number(input?.createdAt ?? 0) || Date.now(),
      updatedAt: Date.now()
    };
    writePayOrdersMap(prunePayOrdersMap(m));
  };
  const getPayOrder = (orderId) => {
    const id = String(orderId || '').trim();
    if (!id) return null;
    const m = readPayOrdersMap();
    const rec = m[id];
    return rec && typeof rec === 'object' ? rec : null;
  };
  const completePayOrder = (input) => {
    const localOrderId = String(input?.localOrderId || '').trim();
    const providerOrderId = String(input?.providerOrderId || '').trim();
    if (!localOrderId || !providerOrderId) return { ok: false, error: 'INVALID_ORDER_ID' };
    const orders = readPayOrdersMap();
    const current = orders[localOrderId];
    if (!current || typeof current !== 'object') return { ok: false, error: 'UNKNOWN_LOCAL_ORDER' };
    if (String(current.status || '').trim().toLowerCase() !== 'pending') {
      return { ok: false, error: 'ORDER_NOT_PENDING' };
    }
    orders[localOrderId] = {
      ...current,
      status: 'paid',
      afdianOrderId: providerOrderId,
      paidAt: Date.now(),
      updatedAt: Date.now()
    };
    writePayOrdersMap(orders);
    return { ok: true, order: orders[localOrderId] };
  };

  const parsePlanPackageMap = () => {
    const fromPlanEnv = (() => {
      const parsed = parseJsonObjectFromEnv('AFDIAN_PLAN_PACKAGE_MAP');
      if (!parsed) return {};
      const out = {};
      for (const [k, v] of Object.entries(parsed)) {
        const planId = String(k || '').trim();
        const pkgId = String(v || '').trim().toLowerCase();
        if (!planId || !pkgId) continue;
        out[planId] = pkgId;
      }
      return out;
    })();
    const fromPkgEnv = (() => {
      const pkgMap = parseAfdianPackagePlanIdMap();
      if (!pkgMap) return {};
      const out = {};
      for (const [pkgId, planId] of Object.entries(pkgMap)) {
        const pid = String(planId || '').trim();
        const kid = String(pkgId || '').trim().toLowerCase();
        if (!pid || !kid) continue;
        out[pid] = kid;
      }
      return out;
    })();
    const merged = { ...fromPlanEnv, ...fromPkgEnv };
    return Object.keys(merged).length ? merged : null;
  };
  // --- Profile & API Keys ---
  app.get('/api/user/profile', (req, res) => {
    const userId = String(req.query.userId || '').trim();
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;
    }
    const profile = profiles.getProfile(userId);
    res.json({ ok: true, profile });
  });

  app.post('/api/user/profile', (req, res) => {
    const { userId, ...data } = req.body || {};
    const uid = String(userId || '').trim();
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, uid);
      if (!auth) return;
    }
    const result = profiles.updateProfile(uid, data);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, profile: result.profile });
  });

  app.get('/api/user/apikeys', (req, res) => {
    const userId = String(req.query.userId || '').trim();
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;
    }
    const keys = profiles.getApiKeys(userId);
    res.json({ ok: true, apiKeys: keys });
  });

  app.post('/api/user/apikeys', (req, res) => {
    const { userId, name } = req.body || {};
    const uid = String(userId || '').trim();
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, uid);
      if (!auth) return;
    }
    const result = profiles.createApiKey(uid, name);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, apiKey: result.apiKey });
  });

  app.delete('/api/user/apikeys/:keyId', (req, res) => {
    const userId = String(req.query.userId || '').trim();
    const keyId = req.params.keyId;
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;
    }
    const result = profiles.revokeApiKey(userId, keyId);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  });

  // --- Credits & Wallet ---
  app.get('/api/credits/balance', (req, res) => {
    if (!legacyJsonBillingEnabled) {
      return res.status(503).json({ error: 'LEGACY_CREDITS_DISABLED' });
    }
    try {
      const userId = String(req.query.userId || '').trim();
      if (typeof assertAuthUserMatches === 'function') {
        const auth = assertAuthUserMatches(req, res, userId);
        if (!auth) return;
      }
      const bal = credits.getBalance(userId);
      if (!bal) return res.status(400).json({ error: 'UserId is required' });
      res.json(bal);
    } catch (err) {
      console.error('Error in GET /api/credits/balance:', err);
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  app.get('/api/credits/costs', (req, res) => {
    const costs = resolveCreditsCosts();
    res.json({
      ok: true,
      generate: costs.generate,
      img2img: costs.img2img,
      aidesignQuick: costs.aidesignQuick,
      aidesignSemantic: costs.aidesignSemantic,
      aidesignFinal: costs.aidesignFinal,
      aiLab: costs.aiLab,
      aiImageWorkshop: costs.aiImageWorkshop,
      aiBackground: costs.aiBackground,
      aiIdPhoto: costs.aiIdPhoto,
      aiOldPhoto: costs.aiOldPhoto,
      aiIngredientList: costs.aiIngredientList
    });
  });

  app.get('/api/images/history/:userId', (req, res) => {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'MISSING_USER_ID' });

    if (!isGuestUserId(userId) && typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;
    }

    try {
      if (typeof readUserMemory !== 'function' || typeof ensureUserMemoryShape !== 'function') {
        return res.status(501).json({ ok: false, error: 'MEMORY_NOT_CONFIGURED' });
      }
      const limit = clampInt(req.query.limit, 1, 200);
      const offset = clampInt(req.query.offset, 0, 5000);
      const rawMemory = ensureUserMemoryShape(userId, readUserMemory(userId, null));
      const scrubbed = sanitizeUserHistoryMemory(rawMemory);
      const mem = ensureUserMemoryShape(userId, scrubbed.memory);
      if (scrubbed.changed && typeof writeUserMemory === 'function') {
        writeUserMemory(userId, mem);
      }
      const list = Array.isArray(mem?.image_history)
        ? mem.image_history.map(sanitizeImageHistoryEntry).filter(Boolean)
        : [];
      const total = list.length;
      const start = Math.max(0, Math.min(total, offset));
      const end = Math.max(start, Math.min(total, start + limit));
      const items = list.slice(start, end);
      return res.json({ ok: true, total, items });
    } catch {
      return res.status(500).json({ ok: false, error: 'HISTORY_FAILED' });
    }
  });

  const IMG2IMG_RATE_MAX = (() => {
    const v = Number.parseInt(String(process.env.IMG2IMG_RATE_MAX || ''), 10);
    return Number.isFinite(v) && v > 0 ? v : 30;
  })();
  const IMG2IMG_RATE_WINDOW_MS = (() => {
    const v = Number.parseInt(String(process.env.IMG2IMG_RATE_WINDOW_MS || ''), 10);
    return Number.isFinite(v) && v > 0 ? v : 60 * 1000;
  })();

  app.post(
    '/api/img2img',
    typeof rateLimit === 'function'
      ? rateLimit('img2img', { max: IMG2IMG_RATE_MAX, windowMs: IMG2IMG_RATE_WINDOW_MS })
      : (req, res, next) => next(),
    async (req, res) => {
      const body = req.body || {};
      const userId = String(body.userId || '').trim();
      const requestId = String(body.requestId || res.locals?.requestId || '').trim();
      const startedAt = Date.now();
      const requestedPrompt = String(body.prompt || '').trim();
      const requestedNegativePrompt = typeof body.negativePrompt === 'string' ? body.negativePrompt : '';
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      const params = body.params && typeof body.params === 'object' ? body.params : undefined;
      const imagesRaw = Array.isArray(body.images) ? body.images : [];
      const timeoutMsRaw = Number(body.timeoutMs ?? 0) || 0;
      const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? Math.min(timeoutMsRaw, 180000) : undefined;
      const userText = typeof body.userText === 'string' ? body.userText.trim() : '';
      const reason = String(body.reason || 'img2img').trim() || 'img2img';
      const reasonKey = normalizeReasonKey(reason);
      const isOldPhoto = reasonKey === 'old_photo' || reasonKey === 'ai_old_photo';
      const oldPhotoPolicy = isOldPhoto
        ? buildOldPhotoPrompt(
            body.colorize === true ||
              /color/i.test(String(body.operation || body.mode || '')) ||
              /(^|:)colorize(?=:|$)/i.test(userText)
              ? 'enhance-colorize'
              : 'enhance'
          )
        : null;
      const prompt = oldPhotoPolicy?.prompt || requestedPrompt;
      const negativePrompt = oldPhotoPolicy?.negativePrompt || requestedNegativePrompt;

      if (!isPaidAiUserId(userId)) return res.status(401).json({ error: 'LOGIN_REQUIRED', requestId });
      if (!prompt) return res.status(400).json({ error: 'EMPTY_PROMPT', requestId });

      if (typeof assertAuthUserMatches !== 'function') {
        return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED', requestId });
      }
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;

      if (!legacyJsonBillingEnabled) {
        return res.status(410).json({
          error: isOldPhoto ? 'USE_TOOL_TASK_API' : 'LEGACY_BILLING_DISABLED',
          requestId
        });
      }
      if (
        isOldPhoto && (
          !imgCredits ||
          typeof imgCredits.freezeCredits !== 'function' ||
          typeof imgCredits.refundHold !== 'function' ||
          typeof imgCredits.settleHold !== 'function' ||
          typeof persistImageRefForUser !== 'function'
        )
      ) {
        return res.status(503).json({ error: 'OLD_PHOTO_PIPELINE_NOT_CONFIGURED', requestId });
      }

      if (typeof callSiliconFlowImageGenerate !== 'function') {
        return res.status(501).json({ error: 'IMG_PROVIDER_NOT_CONFIGURED', requestId });
      }

      const userSlot = acquireImg2imgUserSlot(userId);
      if (!userSlot.ok) return res.status(503).json({ error: 'SERVER_BUSY', requestId });

      const requestAbort = new AbortController();
      const abortRequest = () => {
        if (!requestAbort.signal.aborted) requestAbort.abort();
      };
      const abortOnClose = () => {
        if (!res.writableFinished) abortRequest();
      };
      req.once('aborted', abortRequest);
      res.once('close', abortOnClose);

      let hold = null;
      try {
        // Pricing is server-owned. `body.cost` is intentionally ignored.
        const resolvedCost = resolveServerCreditCost({
          endpoint: 'img2img',
          operation: reason
        });
        let ledgerRequestId = safeLedgerId(requestId);

        hold = (() => {
          try {
            if (!imgCredits || typeof imgCredits.freezeCredits !== 'function') return null;
            return imgCredits.freezeCredits({
              userId,
              cost: resolvedCost,
              requestId,
              reason,
              reasonText: resolveReasonText(reason)
            });
          } catch {
            return null;
          }
        })();
        if (hold && !hold.ok) {
          const wallet = hold.wallet && typeof hold.wallet === 'object' ? hold.wallet : undefined;
          return res
            .status(402)
            .json({ error: String(hold.error || 'CREDITS_ERROR'), requestId, ...(wallet ? { wallet } : {}) });
        }
        if (!ledgerRequestId) ledgerRequestId = safeLedgerId(hold?.requestId);

        let response = null;
        try {
          response = await callSiliconFlowImageGenerate({
            prompt,
            negativePrompt,
            params,
            images: imagesRaw,
            timeoutMs,
            signal: requestAbort.signal,
            ...(model ? { model } : {})
          });
        } catch (e) {
          if (hold?.holdId && imgCredits && typeof imgCredits.refundHold === 'function') {
            try {
              imgCredits.refundHold({ userId, holdId: hold.holdId });
            } catch { }
          }
          const code = isAbortError(e, requestAbort.signal)
            ? 'TASK_CANCELLED'
            : typeof e?.code === 'string' && e.code.trim()
              ? e.code.trim()
              : typeof e?.message === 'string' && e.message.trim()
                ? e.message.trim()
                : 'IMG2IMG_FAILED';
          const status = code === 'TASK_CANCELLED'
            ? 499
            : typeof e?.status === 'number' && e.status >= 400 ? e.status : 500;
          if (ledgerRequestId && typeof upsertUsageLedgerItem === 'function') {
            try {
              const provider = 'siliconflow';
              const modelUsed =
                typeof e?.modelTried === 'string' && e.modelTried.trim()
                  ? e.modelTried.trim()
                  : model;
              upsertUsageLedgerItem({
                requestId: ledgerRequestId,
                ts: Date.now(),
                userId,
                ...(body.sessionId ? { sessionRef: opaqueReference(body.sessionId, 'session') } : {}),
                ...(body.projectId ? { projectRef: opaqueReference(body.projectId, 'project') } : {}),
                trigger: normalizeReasonKey(reason) || 'img2img',
                provider,
                ...(modelUsed ? { model: classifyModel(modelUsed) } : {}),
                creditsDelta: 0,
                creditsPlanned: resolvedCost,
                ...contentMetadata(userText, 'userText'),
                status: 'error',
                errorCode: code,
                durationMs: Math.max(0, Date.now() - startedAt),
                ...requestPrivacyMetadata(body, req)
              });
            } catch { }
          }
          if (typeof appendUserAuditHistory === 'function') {
            try {
              const entry = {
                id: requestId || ledgerRequestId || `img2img_${Date.now().toString(36)}`,
                ts: Date.now(),
                kind: 'image',
                biz: normalizeReasonKey(reason) || 'img2img',
                provider: 'siliconflow',
                ...(model ? { model: classifyModel(model) } : {}),
                cost: resolvedCost,
                ...contentMetadata(prompt, 'prompt'),
                ...contentMetadata(negativePrompt, 'negativePrompt'),
                ...contentMetadata(userText, 'userText'),
                ...contentMetadata(body.pageContext, 'pageContext'),
                ...requestPrivacyMetadata(body, req),
                ...(Object.prototype.hasOwnProperty.call(body || {}, 'deepMode') ? { deepMode: !!body.deepMode } : {}),
                status: 'error',
                error: code,
                durationMs: Math.max(0, Date.now() - startedAt)
              };
              appendUserAuditHistory({ userId, entry });
            } catch { }
          }
          if (res.destroyed || res.writableEnded) return;
          return res.status(status).json({ error: code, requestId });
        }

        const data = response?.data;
        const providerImages = extractProviderImages(data);
        const persistedOutputs = [];
        const persistErrors = new Map();
        for (const url of providerImages) {
          const originalUrl = String(url || '').trim();
          if (!originalUrl) continue;
          let persistedUrl = '';
          let persistError = '';
          if (typeof persistImageRefForUser === 'function') {
            try {
              const r = await persistImageRefForUser({ userId, url: originalUrl, prefix: 'gen', withMeta: true });
              if (r && typeof r === 'object') {
                if (r.ok && typeof r.url === 'string') persistedUrl = String(r.url || '').trim();
                else persistError = String(r.error || 'PERSIST_FAILED');
              } else {
                persistedUrl = String(r || '').trim();
              }
            } catch (e) {
              persistError =
                typeof e?.code === 'string' && e.code.trim()
                  ? e.code.trim()
                  : typeof e?.message === 'string' && e.message.trim()
                    ? e.message.trim()
                    : 'PERSIST_FAILED';
            }
          }
          const finalUrl = String(persistedUrl || originalUrl).trim();
          if (!finalUrl) continue;
          const persistedOk = !!persistedUrl && finalUrl.startsWith('/files/');
          if (!persistedOk) {
            const key = persistError || 'PERSIST_FAILED';
            persistErrors.set(key, (persistErrors.get(key) || 0) + 1);
          }
          persistedOutputs.push({
            url: finalUrl,
            persisted: persistedOk,
            ...(persistedOk ? {} : { persistError: persistError || 'PERSIST_FAILED' })
          });
        }

        const outputFailureCode = !persistedOutputs.length
          ? 'EMPTY_IMAGE_RESULT'
          : isOldPhoto && (
              persistedOutputs.length !== providerImages.length ||
              persistedOutputs.some((output) => !output.persisted)
            )
            ? 'OUTPUT_PERSIST_FAILED'
            : '';
        if (outputFailureCode) {
          if (hold?.holdId && imgCredits && typeof imgCredits.refundHold === 'function') {
            try {
              imgCredits.refundHold({ userId, holdId: hold.holdId });
            } catch { }
          }
          if (ledgerRequestId && typeof upsertUsageLedgerItem === 'function') {
            try {
              const provider = 'siliconflow';
              const modelUsed =
                typeof response?.modelUsed === 'string' && response.modelUsed.trim() ? response.modelUsed.trim() : model;
              upsertUsageLedgerItem({
                requestId: ledgerRequestId,
                ts: Date.now(),
                userId,
                ...(body.sessionId ? { sessionRef: opaqueReference(body.sessionId, 'session') } : {}),
                ...(body.projectId ? { projectRef: opaqueReference(body.projectId, 'project') } : {}),
                trigger: normalizeReasonKey(reason) || 'img2img',
                provider,
                ...(modelUsed ? { model: classifyModel(modelUsed) } : {}),
                creditsDelta: 0,
                creditsPlanned: resolvedCost,
                ...contentMetadata(userText, 'userText'),
                status: 'error',
                errorCode: outputFailureCode,
                durationMs: Math.max(0, Date.now() - startedAt),
                ...requestPrivacyMetadata(body, req)
              });
            } catch { }
          }
          if (typeof appendUserAuditHistory === 'function') {
            try {
              const entry = {
                id: requestId || ledgerRequestId || `img2img_${Date.now().toString(36)}`,
                ts: Date.now(),
                kind: 'image',
                biz: normalizeReasonKey(reason) || 'img2img',
                provider: 'siliconflow',
                ...(model ? { model: classifyModel(model) } : {}),
                cost: resolvedCost,
                ...contentMetadata(prompt, 'prompt'),
                ...contentMetadata(negativePrompt, 'negativePrompt'),
                ...contentMetadata(userText, 'userText'),
                ...contentMetadata(body.pageContext, 'pageContext'),
                ...requestPrivacyMetadata(body, req),
                ...(Object.prototype.hasOwnProperty.call(body || {}, 'deepMode') ? { deepMode: !!body.deepMode } : {}),
                status: 'error',
                error: outputFailureCode,
                durationMs: Math.max(0, Date.now() - startedAt)
              };
              appendUserAuditHistory({ userId, entry });
            } catch { }
          }
          if (res.destroyed || res.writableEnded) return;
          return res.status(502).json({ error: outputFailureCode, requestId });
        }

        if (requestAbort.signal.aborted) {
          if (hold?.holdId && imgCredits && typeof imgCredits.refundHold === 'function') {
            try {
              imgCredits.refundHold({ userId, holdId: hold.holdId });
            } catch { }
          }
          if (res.destroyed || res.writableEnded) return;
          return res.status(499).json({ error: 'TASK_CANCELLED', requestId });
        }

        if (hold?.holdId && imgCredits && typeof imgCredits.settleHold === 'function') {
          try {
            const settled = imgCredits.settleHold({ userId, holdId: hold.holdId, actualCost: resolvedCost });
            if (isOldPhoto && (!settled || !settled.ok)) {
              try {
                imgCredits.refundHold({ userId, holdId: hold.holdId });
              } catch { }
              if (res.destroyed || res.writableEnded) return;
              return res.status(500).json({ error: 'CREDITS_SETTLE_FAILED', requestId });
            }
          } catch {
            if (isOldPhoto) {
              try {
                imgCredits.refundHold({ userId, holdId: hold.holdId });
              } catch { }
              if (res.destroyed || res.writableEnded) return;
              return res.status(500).json({ error: 'CREDITS_SETTLE_FAILED', requestId });
            }
          }
        }

        const persistInputImage = async (img) => {
          if (typeof img === 'string') {
            const originalUrl = img.trim();
            if (!originalUrl) return { url: '', persisted: false, persistError: 'INVALID_INPUT' };
            if (typeof persistImageRefForUser !== 'function') {
              return { url: originalUrl, persisted: originalUrl.startsWith('/files/') };
            }
            let persistedUrl = '';
            let persistError = '';
            try {
              const r = await persistImageRefForUser({ userId, url: originalUrl, prefix: 'in', withMeta: true });
              if (r && typeof r === 'object') {
                if (r.ok && typeof r.url === 'string') persistedUrl = String(r.url || '').trim();
                else persistError = String(r.error || 'PERSIST_FAILED');
              } else {
                persistedUrl = String(r || '').trim();
              }
            } catch (e) {
              persistError =
                typeof e?.code === 'string' && e.code.trim()
                  ? e.code.trim()
                  : typeof e?.message === 'string' && e.message.trim()
                    ? e.message.trim()
                    : 'PERSIST_FAILED';
            }
            const finalUrl = String(persistedUrl || originalUrl).trim();
            const persistedOk = !!persistedUrl && finalUrl.startsWith('/files/');
            return {
              url: finalUrl,
              persisted: persistedOk,
              ...(persistedOk ? {} : { persistError: persistError || 'PERSIST_FAILED' })
            };
          }
          if (img && typeof img === 'object') {
            if (typeof persistGenerateImageInputForUser !== 'function') {
              return { url: '', persisted: false, persistError: 'PERSIST_NOT_CONFIGURED' };
            }
            const saved = persistGenerateImageInputForUser({ userId, image: img, prefix: 'in' });
            const url = String(saved || '').trim();
            const persistedOk = !!url && url.startsWith('/files/');
            return { url, persisted: persistedOk, ...(persistedOk ? {} : { persistError: 'WRITE_FAILED' }) };
          }
          return { url: '', persisted: false, persistError: 'INVALID_INPUT' };
        };

        const persistedInputs = [];
        for (const it of imagesRaw) {
          const info = await persistInputImage(it);
          const finalUrl = String(info?.url || '').trim();
          if (!finalUrl) continue;
          persistedInputs.push({
            url: finalUrl,
            persisted: !!info?.persisted,
            ...(info?.persistError ? { persistError: String(info.persistError) } : {})
          });
        }

        const persistSummary = (() => {
          const attempted = providerImages.length;
          const persisted = persistedOutputs.filter((it) => !!it.persisted).length;
          const failed = Math.max(0, attempted - persisted);
          const failures = Array.from(persistErrors.entries())
            .map(([error, count]) => ({ error, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);
          return { attempted, persisted, failed, ...(failures.length ? { failures } : {}) };
        })();

        if (ledgerRequestId && typeof upsertUsageLedgerItem === 'function') {
          try {
            const provider = 'siliconflow';
            const modelUsed =
              typeof response?.modelUsed === 'string' && response.modelUsed.trim() ? response.modelUsed.trim() : model;
            const seed = typeof data?.seed === 'number' ? data.seed : undefined;
            upsertUsageLedgerItem({
              requestId: ledgerRequestId,
              ts: Date.now(),
              userId,
              ...(body.sessionId ? { sessionRef: opaqueReference(body.sessionId, 'session') } : {}),
              ...(body.projectId ? { projectRef: opaqueReference(body.projectId, 'project') } : {}),
              trigger: normalizeReasonKey(reason) || 'img2img',
              provider,
              ...(modelUsed ? { model: classifyModel(modelUsed) } : {}),
              creditsDelta: resolvedCost,
              ...contentMetadata(userText, 'userText'),
              status: 'ok',
              durationMs: Math.max(0, Date.now() - startedAt),
              ...requestPrivacyMetadata(body, req),
              imageCount: persistedOutputs.length,
              ...(persistSummary ? {
                persist: {
                  attempted: persistSummary.attempted,
                  persisted: persistSummary.persisted,
                  failed: persistSummary.failed
                }
              } : {}),
              ...(seed !== undefined ? { seed } : {})
            });
          } catch { }
        }

        if (typeof appendUserImageHistory === 'function') {
          try {
            const id =
              requestId ||
              `imgwork_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            const provider = 'siliconflow';
            const model = typeof response?.modelUsed === 'string' && response.modelUsed.trim() ? response.modelUsed.trim() : '';
            const seed = typeof data?.seed === 'number' ? data.seed : undefined;
            const entry = {
              id,
              ts: Date.now(),
              type: 'img2img',
              provider,
              ...(model ? { model: classifyModel(model) } : {}),
              cost: resolvedCost,
              ...contentMetadata(prompt, 'prompt'),
              ...contentMetadata(negativePrompt, 'negativePrompt'),
              ...contentMetadata(userText, 'userText'),
              assets: persistedOutputs.map((it) => ({ assetId: opaqueReference(it.url, 'asset') })),
              ...(persistedInputs.length
                ? {
                  inputAssets: persistedInputs.map((it) => ({ assetId: opaqueReference(it.url, 'asset') }))
                }
                : {}),
              ...(seed !== undefined ? { seed } : {}),
              ...requestPrivacyMetadata(body, req),
              ...(persistSummary ? {
                persist: {
                  attempted: persistSummary.attempted,
                  persisted: persistSummary.persisted,
                  failed: persistSummary.failed
                }
              } : {})
            };
            appendUserImageHistory({ userId, entry });
          } catch { }
        }
        if (typeof appendUserAuditHistory === 'function') {
          try {
            const modelUsed =
              typeof response?.modelUsed === 'string' && response.modelUsed.trim() ? response.modelUsed.trim() : model;
            const entry = {
              id: requestId || ledgerRequestId || `img2img_${Date.now().toString(36)}`,
              ts: Date.now(),
              kind: 'image',
              biz: normalizeReasonKey(reason) || 'img2img',
              provider: 'siliconflow',
              ...(modelUsed ? { model: classifyModel(modelUsed) } : {}),
              cost: resolvedCost,
              ...contentMetadata(prompt, 'prompt'),
              ...contentMetadata(negativePrompt, 'negativePrompt'),
              ...contentMetadata(userText, 'userText'),
              ...contentMetadata(body.pageContext, 'pageContext'),
              ...requestPrivacyMetadata(body, req),
              ...(Object.prototype.hasOwnProperty.call(body || {}, 'deepMode') ? { deepMode: !!body.deepMode } : {}),
              status: 'ok',
              durationMs: Math.max(0, Date.now() - startedAt),
              assets: persistedOutputs.map((it) => ({ assetId: opaqueReference(it.url, 'asset') }))
            };
            appendUserAuditHistory({ userId, entry });
          } catch { }
        }

        if (res.destroyed || res.writableEnded) return;
        res.json({
          ok: true,
          requestId,
          images: persistedOutputs.map((it) => ({
            url: it.url,
            persisted: !!it.persisted,
            ...(it.persistError ? { persistError: it.persistError } : {})
          })),
          persist: persistSummary,
          ...(typeof data?.seed === 'number' ? { seed: data.seed } : {}),
          ...(data && typeof data === 'object' && data.timings && typeof data.timings === 'object' ? { timings: data.timings } : {})
        });
      } finally {
        req.removeListener('aborted', abortRequest);
        res.removeListener('close', abortOnClose);
        try {
          userSlot.release();
        } catch { }
      }
    }
  );

  app.post('/api/credits/checkin', (req, res) => {
    if (!legacyJsonBillingEnabled) {
      return res.status(410).json({ ok: false, error: 'LEGACY_CREDITS_DISABLED' });
    }
    const userId = String(req.body?.userId || req.query?.userId || '').trim();
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;
    }
    if (!userId || userId.startsWith('guest_')) return res.status(401).json({ ok: false, error: 'LOGIN_REQUIRED' });
    const amount = (() => {
      const v = Number.parseInt(String(process.env.CREDITS_CHECKIN_ADD || '2'), 10);
      return Number.isFinite(v) && v > 0 ? v : 2;
    })();
    const result = credits.checkinCredits({ userId, credits: amount });
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    res.json({
      ok: true,
      alreadyCheckedIn: !!result.alreadyCheckedIn,
      creditsAdded: Number(result.creditsAdded || 0) || 0,
      wallet: result.wallet || null
    });
  });

  app.post('/api/pay/create-order', (req, res) => {
    if (!legacyJsonBillingEnabled) {
      return res.status(503).json({ error: 'PAID_BILLING_UNAVAILABLE' });
    }
    const { userId, packageId } = req.body || {};
    const uid = String(userId || '').trim();
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, uid);
      if (!auth) return;
    }
    if (!uid || uid.startsWith('guest_')) return res.status(401).json({ error: 'Login required' });

    const pkg = resolvePayPackage(packageId);
    if (!pkg) return res.status(400).json({ error: 'INVALID_PACKAGE' });

    const orderId = makePayOrderId();
    savePayOrder({
      orderId,
      userId: uid,
      packageId: pkg.packageId,
      amountCny: pkg.amountCny,
      credits: pkg.credits
    });
    res.json({
      ok: true,
      orderId,
      userId: uid,
      packageId: pkg.packageId,
      amountCny: pkg.amountCny,
      credits: pkg.credits,
      payUrl: buildAfdianPayUrl(orderId, uid, pkg)
    });
  });

  app.post('/api/pay/afdian/webhook', (req, res) => {
    if (!legacyJsonBillingEnabled) {
      return res.status(503).json({ ec: 500, em: 'PAID_BILLING_UNAVAILABLE' });
    }
    const ok = () => res.json({ ec: 200, em: '' });
    try {
      processAfdianWebhook({
        body: req.body || {},
        env: process.env,
        isProd,
        getPayOrder,
        resolvePayPackage,
        planPackageMap: parsePlanPackageMap(),
        applyCredits: (payment) => credits.applyAfdianOrder(payment),
        completePayOrder
      });
      return ok();
    } catch {
      return ok();
    }
  });

  app.get('/api/credits/orders', (req, res) => {
    if (!legacyJsonBillingEnabled) {
      return res.status(503).json({ error: 'LEGACY_CREDITS_DISABLED' });
    }
    const userId = String(req.query.userId || '').trim();
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;
    }
    const list = credits.getOrders(userId);
    res.json({ ok: true, orders: list });
  });

  app.get('/api/credits/holds', (req, res) => {
    if (!legacyJsonBillingEnabled) {
      return res.status(503).json({ error: 'LEGACY_CREDITS_DISABLED' });
    }
    const userId = String(req.query.userId || '').trim();
    const limit = Number.parseInt(String(req.query.limit || ''), 10);
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;
    }
    const list = credits.getHolds(userId, { limit }).map((h) => {
      const reasonText = String(h?.reasonText || '').trim() || resolveReasonText(h?.reason);
      const cost = Number(h?.cost ?? 0) || 0;
      const reasonTextWithCost = reasonText ? `${reasonText}-${cost}` : '';
      return { ...h, reasonText, reasonTextWithCost };
    });
    res.json({ ok: true, holds: list });
  });

  app.post('/api/credits/order/mock', (req, res) => {
    if (
      !legacyJsonBillingEnabled ||
      String(process.env.ENABLE_MOCK_ORDERS || '').trim() !== '1'
    ) {
      return res.status(404).json({ error: 'Not Found' });
    }
    const { userId, amount, credits: creditsCount } = req.body || {};
    const uid = String(userId || '').trim();
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, uid);
      if (!auth) return;
    }

    // Mock only: treat as afdian order with random ID
    const mockOrderId = `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const result = credits.applyAfdianOrder({
      afdianOrderId: mockOrderId,
      userId: uid,
      credits: Number(creditsCount) || 10
    });

    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, orderId: mockOrderId, wallet: result.wallet });
  });
};

module.exports = { installImgagentRoutes, credits };
