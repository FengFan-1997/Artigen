const credits = require('./credits');
const profiles = require('./profiles');
const { readJson, writeJson, PAY_ORDERS_FILE } = require('../utils/storage');

const installImgagentRoutes = (app, opts) => {
  const assertAuthUserMatches = opts?.assertAuthUserMatches;
  const payPackages = {
    starter: { packageId: 'starter', amountCny: 9.9, credits: 120 },
    standard: { packageId: 'standard', amountCny: 19.9, credits: 260 },
    pro: { packageId: 'pro', amountCny: 49.9, credits: 720 },
    ultimate: { packageId: 'ultimate', amountCny: 99.9, credits: 1600 }
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
        return `${resolveAfdianOrderCreateUrl()}?plan_id=${encodeURIComponent(planId)}`;
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
  const firstNonEmptyString = (...vals) => {
    for (const v of vals) {
      const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v).trim() : '';
      if (s) return s;
    }
    return '';
  };
  const extractUserIdFromText = (text) => {
    const s = String(text || '');
    const keyed = s.match(/\b(?:uid|userId|user_id|appUserId|app_user_id)\s*[:=]\s*([a-zA-Z0-9_-]{3,120})\b/);
    if (keyed) return String(keyed[1] || '').trim();
    const m = s.match(/\b(?:user|email)_[a-zA-Z0-9_-]{3,}\b/);
    return m ? String(m[0] || '').trim() : '';
  };
  const extractPackageIdFromText = (text) => {
    const s = String(text || '');
    const m = s.match(/\b(starter|standard|pro|ultimate)\b/i);
    return m ? String(m[1] || '').trim().toLowerCase() : '';
  };
  const extractPayOrderIdFromText = (text) => {
    const s = String(text || '');
    const m = s.match(/\bpay_[a-z0-9_]{8,}\b/i);
    return m ? String(m[0] || '').trim() : '';
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
  const getCreditsByAmountCny = (amount) => {
    const n = Number.parseFloat(String(amount ?? ''));
    if (!Number.isFinite(n) || n <= 0) return 0;
    const eps = 0.01;
    for (const pkg of Object.values(payPackages)) {
      const p = Number(pkg?.amountCny ?? 0) || 0;
      if (!p) continue;
      if (Math.abs(p - n) <= eps) return Number(pkg?.credits ?? 0) || 0;
      if (p.toFixed(2) === n.toFixed(2)) return Number(pkg?.credits ?? 0) || 0;
    }
    return 0;
  };
  const toCnyNumber = (amount) => {
    const n = Number.parseFloat(String(amount ?? ''));
    return Number.isFinite(n) ? n : NaN;
  };
  const equalsCny = (a, b) => {
    const x = toCnyNumber(a);
    const y = toCnyNumber(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return x.toFixed(2) === y.toFixed(2);
  };

  const verifyAfdianWebhookSign = (order, sign) => {
    const crypto = require('crypto');
    const publicKey = String(process.env.AFDIAN_WEBHOOK_PUBLIC_KEY || '').trim() || `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwwdaCg1Bt+UKZKs0R54y
lYnuANma49IpgoOwNmk3a0rhg/PQuhUJ0EOZSowIC44l0K3+fqGns3Ygi4AfmEfS
4EKbdk1ahSxu7Zkp2rHMt+R9GarQFQkwSS/5x1dYiHNVMiR8oIXDgjmvxuNes2Cr
8fw9dEF0xNBKdkKgG2qAawcN1nZrdyaKWtPVT9m2Hl0ddOO9thZmVLFOb9NVzgYf
jEgI+KWX6aY19Ka/ghv/L4t1IXmz9pctablN5S0CRWpJW3Cn0k6zSXgjVdKm4uN7
jRlgSRaf/Ind46vMCm3N2sgwxu/g3bnooW+db0iLo13zzuvyn727Q3UDQ0MmZcEW
MQIDAQAB
-----END PUBLIC KEY-----`;

    const outTradeNo = firstNonEmptyString(order?.out_trade_no, order?.trade_no, order?.order_id);
    const userId = firstNonEmptyString(order?.user_id, order?.userId);
    const planId = firstNonEmptyString(order?.plan_id, order?.planId);
    const totalAmount = firstNonEmptyString(order?.total_amount, order?.totalAmount);
    const signStr = `${outTradeNo}${userId}${planId}${totalAmount}`;
    if (!signStr) return { ok: false, error: 'INVALID_SIGN_STR' };

    try {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(signStr);
      verifier.end();
      const ok = verifier.verify(publicKey, Buffer.from(String(sign || ''), 'base64'));
      return ok ? { ok: true } : { ok: false, error: 'INVALID_SIGN' };
    } catch (e) {
      return { ok: false, error: 'VERIFY_FAILED' };
    }
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
    const userId = String(req.query.userId || '').trim();
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;
    }
    const bal = credits.getBalance(userId);
    if (!bal) return res.status(400).json({ error: 'UserId is required' });
    res.json(bal);
  });

  app.post('/api/credits/checkin', (req, res) => {
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
    const ok = () => res.json({ ec: 200, em: '' });
    try {
      const body = req.body || {};
      const data = body && typeof body === 'object' && body.data && typeof body.data === 'object' ? body.data : null;
      const order = data && typeof data.order === 'object' ? data.order : null;
      const sign = firstNonEmptyString(body.sign, body.signature, data?.sign, order?.sign);

      const orderStatus = order ? Number.parseInt(String(order?.status ?? ''), 10) : NaN;
      if (Number.isFinite(orderStatus) && orderStatus !== 2) {
        return ok();
      }

      const outTradeNo = firstNonEmptyString(order?.out_trade_no, order?.trade_no, order?.order_id);
      const isTestRequest =
        /^test[_-]/i.test(outTradeNo) ||
        /^(1|true)$/i.test(String(body.test || body.is_test || body.isTest || '').trim());
      if (isTestRequest) return ok();

      const afdianOrderId = firstNonEmptyString(
        body.afdianOrderId,
        body.afdian_order_id,
        body.orderId,
        body.order_id,
        body.tradeNo,
        body.trade_no,
        outTradeNo
      );
      const remarkText = firstNonEmptyString(
        body.remark,
        body.remarkText,
        body.remark_text,
        body.note,
        body.memo,
        order?.custom_order_id,
        order?.remark,
        order?.remark_text,
        order?.note,
        order?.memo
      );
      const payOrderId = firstNonEmptyString(
        body.payOrderId,
        body.pay_order_id,
        body.localOrderId,
        body.local_order_id,
        order?.custom_order_id,
        extractPayOrderIdFromText(remarkText)
      );
      const fallbackPayOrder = payOrderId ? getPayOrder(payOrderId) : null;

      const requireSign = String(process.env.AFDIAN_WEBHOOK_REQUIRE_SIGN || '').trim() === '1';
      if (order && (requireSign || sign)) {
        if (!sign) {
          if (!fallbackPayOrder) return ok();
        } else {
          const vr = verifyAfdianWebhookSign(order, sign);
          if (!vr.ok && !fallbackPayOrder) return ok();
        }
      }

      const uid = firstNonEmptyString(body.appUserId, body.app_user_id, body.uid, body.userId, extractUserIdFromText(remarkText));
      const planId = firstNonEmptyString(order?.plan_id, order?.planId);
      const planMap = parsePlanPackageMap();
      const pkgId = firstNonEmptyString(
        body.packageId,
        body.package_id,
        order?.packageId,
        order?.package_id,
        planId && planMap ? planMap[planId] : '',
        extractPackageIdFromText(remarkText)
      );
      const creditsCount = body.credits ?? body.credit ?? body.creditsCount ?? order?.credits ?? order?.credit;
      const resolvedCredits = (() => {
        const n = Number.parseInt(String(creditsCount ?? ''), 10);
        if (Number.isFinite(n) && n > 0) return n;
        const pkg = resolvePayPackage(pkgId);
        if (pkg) return pkg.credits;
        const fromAmount = getCreditsByAmountCny(firstNonEmptyString(order?.total_amount, order?.show_amount, order?.totalAmount));
        return fromAmount || 0;
      })();
      const resolvedUserId = firstNonEmptyString(fallbackPayOrder?.userId, uid);
      const resolvedPkgId = firstNonEmptyString(pkgId, fallbackPayOrder?.packageId);
      const resolvedCreditsFinal = (() => {
        const n = Number(fallbackPayOrder?.credits ?? 0) || 0;
        if (n > 0) return n;
        if (resolvedCredits > 0) return resolvedCredits;
        const pkg = resolvePayPackage(resolvedPkgId);
        return pkg ? Number(pkg.credits ?? 0) || 0 : 0;
      })();

      const enforceAmountMatch = String(process.env.AFDIAN_ENFORCE_AMOUNT_MATCH || '').trim() === '1';
      if (enforceAmountMatch && fallbackPayOrder && Number(fallbackPayOrder?.amountCny ?? 0) > 0) {
        const expected = Number(fallbackPayOrder.amountCny ?? 0) || 0;
        const actual = firstNonEmptyString(order?.total_amount, order?.totalAmount, order?.show_amount, order?.showAmount);
        if (actual && !equalsCny(expected, actual)) {
          return ok();
        }
      }

      if (!afdianOrderId || !resolvedUserId || resolvedUserId.startsWith('guest_') || Number(resolvedCreditsFinal || 0) <= 0) {
        return ok();
      }

      if (!fallbackPayOrder && !/^(user|email)_[a-zA-Z0-9_-]{3,}$/.test(resolvedUserId)) {
        return ok();
      }

      const result = credits.applyAfdianOrder({
        afdianOrderId,
        userId: resolvedUserId,
        credits: resolvedCreditsFinal
      });
      if (!result.ok) return ok();
      return ok();
    } catch {
      return ok();
    }
  });

  app.get('/api/credits/orders', (req, res) => {
    const userId = String(req.query.userId || '').trim();
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;
    }
    const list = credits.getOrders(userId);
    res.json({ ok: true, orders: list });
  });

  app.get('/api/credits/holds', (req, res) => {
    const userId = String(req.query.userId || '').trim();
    const limit = Number.parseInt(String(req.query.limit || ''), 10);
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;
    }
    const list = credits.getHolds(userId, { limit });
    res.json({ ok: true, holds: list });
  });

  app.post('/api/credits/order/mock', (req, res) => {
    if (String(process.env.ENABLE_MOCK_ORDERS || '').trim() !== '1') {
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
