const crypto = require('crypto');

const {
  readJson,
  writeJson,
  CREDITS_WALLET_FILE,
  CREDITS_HOLDS_FILE,
  CREDITS_ORDERS_FILE
} = require('../utils/storage');

const normalizeUserId = (userId) => String(userId || '').trim();

const now = () => Date.now();

const readWalletMap = () => {
  const raw = readJson(CREDITS_WALLET_FILE, {});
  return raw && typeof raw === 'object' ? raw : {};
};

const writeWalletMap = (m) => writeJson(CREDITS_WALLET_FILE, m && typeof m === 'object' ? m : {});

const readHoldsMap = () => {
  const raw = readJson(CREDITS_HOLDS_FILE, {});
  return raw && typeof raw === 'object' ? raw : {};
};

const writeHoldsMap = (m) => writeJson(CREDITS_HOLDS_FILE, m && typeof m === 'object' ? m : {});

const readOrdersMap = () => {
  const raw = readJson(CREDITS_ORDERS_FILE, {});
  return raw && typeof raw === 'object' ? raw : {};
};

const writeOrdersMap = (m) => writeJson(CREDITS_ORDERS_FILE, m && typeof m === 'object' ? m : {});

const ensureWallet = (userId, opts) => {
  const uid = normalizeUserId(userId);
  if (!uid) return null;

  const initCredits = (() => {
    const v = Number.parseInt(String(opts?.initCredits ?? process.env.CREDITS_INIT ?? '10'), 10);
    return Number.isFinite(v) && v >= 0 ? v : 10;
  })();

  const wallets = readWalletMap();
  const cur = wallets[uid];
  if (cur && typeof cur === 'object') {
    const available = Number(cur.available ?? 0) || 0;
    const frozen = Number(cur.frozen ?? 0) || 0;
    const createdAt = Number(cur.createdAt ?? 0) || 0;
    const updatedAt = Number(cur.updatedAt ?? 0) || 0;
    const lastCheckinDay = typeof cur.lastCheckinDay === 'string' ? cur.lastCheckinDay.trim() : '';
    const fixed = {
      available,
      frozen,
      createdAt: createdAt || now(),
      updatedAt: updatedAt || now(),
      ...(lastCheckinDay ? { lastCheckinDay } : {})
    };
    wallets[uid] = fixed;
    writeWalletMap(wallets);
    return fixed;
  }

  const created = { available: initCredits, frozen: 0, createdAt: now(), updatedAt: now(), lastCheckinDay: '' };
  wallets[uid] = created;
  writeWalletMap(wallets);
  return created;
};

const getBalance = (userId) => {
  const uid = normalizeUserId(userId);
  const wallet = ensureWallet(uid);
  if (!wallet) return null;
  return {
    userId: uid,
    available: wallet.available,
    frozen: wallet.frozen,
    lastCheckinDay: typeof wallet.lastCheckinDay === 'string' ? wallet.lastCheckinDay : ''
  };
};

const getTodayKey = () => {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const makeHoldId = () => {
  try {
    return `${crypto.randomBytes(16).toString('hex')}${now().toString(36)}`;
  } catch {
    return `${Math.random().toString(36).slice(2)}${now().toString(36)}`;
  }
};

const findHoldByRequestId = (holds, input) => {
  const uid = normalizeUserId(input.userId);
  const rid = String(input.requestId || '').trim();
  const reason = String(input.reason || '').trim();
  if (!uid || !rid) return null;
  for (const holdId of Object.keys(holds)) {
    const h = holds[holdId];
    if (!h || typeof h !== 'object') continue;
    if (String(h.userId || '').trim() !== uid) continue;
    if (String(h.requestId || '').trim() !== rid) continue;
    if (reason && String(h.reason || '').trim() !== reason) continue;
    return { holdId, hold: h };
  }
  return null;
};

const freezeCredits = (input) => {
  const uid = normalizeUserId(input?.userId);
  const cost = Number.parseInt(String(input?.cost ?? 0), 10);
  const requestId = String(input?.requestId || '').trim();
  const reason = String(input?.reason || '').trim();
  if (!uid) return { ok: false, error: 'MISSING_USER_ID' };
  if (!Number.isFinite(cost) || cost <= 0) return { ok: false, error: 'INVALID_COST' };

  ensureWallet(uid);
  const wallets = readWalletMap();
  const holds = readHoldsMap();

  const existing = requestId ? findHoldByRequestId(holds, { userId: uid, requestId, reason }) : null;
  if (existing) {
    const h = existing.hold;
    const st = String(h.status || '').trim();
    return {
      ok: true,
      holdId: existing.holdId,
      status: st || 'frozen',
      cost: Number(h.cost ?? 0) || cost,
      wallet: getBalance(uid)
    };
  }

  const w = wallets[uid];
  const available = Number(w?.available ?? 0) || 0;
  const frozen = Number(w?.frozen ?? 0) || 0;
  if (available < cost) {
    return { ok: false, error: 'INSUFFICIENT_CREDITS', wallet: getBalance(uid) };
  }

  const holdId = makeHoldId();
  wallets[uid] = { ...w, available: available - cost, frozen: frozen + cost, updatedAt: now() };
  holds[holdId] = {
    id: holdId,
    userId: uid,
    cost,
    reason,
    requestId,
    status: 'frozen',
    createdAt: now(),
    updatedAt: now()
  };

  writeWalletMap(wallets);
  writeHoldsMap(holds);

  return { ok: true, holdId, status: 'frozen', cost, wallet: getBalance(uid) };
};

const confirmHold = (input) => {
  const uid = normalizeUserId(input?.userId);
  const holdId = String(input?.holdId || '').trim();
  if (!uid) return { ok: false, error: 'MISSING_USER_ID' };
  if (!holdId) return { ok: false, error: 'MISSING_HOLD_ID' };

  ensureWallet(uid);
  const wallets = readWalletMap();
  const holds = readHoldsMap();
  const hold = holds[holdId];
  if (!hold || typeof hold !== 'object') return { ok: false, error: 'HOLD_NOT_FOUND' };
  if (String(hold.userId || '').trim() !== uid) return { ok: false, error: 'HOLD_USER_MISMATCH' };

  const status = String(hold.status || '').trim();
  if (status === 'confirmed') return { ok: true, holdId, status, wallet: getBalance(uid) };
  if (status === 'refunded') return { ok: false, error: 'HOLD_ALREADY_REFUNDED', wallet: getBalance(uid) };

  const cost = Number(hold.cost ?? 0) || 0;
  const w = wallets[uid];
  const available = Number(w?.available ?? 0) || 0;
  const frozen = Number(w?.frozen ?? 0) || 0;
  if (frozen < cost) return { ok: false, error: 'FROZEN_INCONSISTENT', wallet: getBalance(uid) };

  wallets[uid] = { ...w, available, frozen: frozen - cost, updatedAt: now() };
  holds[holdId] = { ...hold, status: 'confirmed', updatedAt: now() };
  writeWalletMap(wallets);
  writeHoldsMap(holds);

  return { ok: true, holdId, status: 'confirmed', wallet: getBalance(uid) };
};

const settleHold = (input) => {
  const uid = normalizeUserId(input?.userId);
  const holdId = String(input?.holdId || '').trim();
  const actualCostRaw = Number.parseInt(String(input?.actualCost ?? 0), 10);
  const actualCost = Number.isFinite(actualCostRaw) && actualCostRaw >= 0 ? actualCostRaw : 0;
  if (!uid) return { ok: false, error: 'MISSING_USER_ID' };
  if (!holdId) return { ok: false, error: 'MISSING_HOLD_ID' };

  ensureWallet(uid);
  const wallets = readWalletMap();
  const holds = readHoldsMap();
  const hold = holds[holdId];
  if (!hold || typeof hold !== 'object') return { ok: false, error: 'HOLD_NOT_FOUND' };
  if (String(hold.userId || '').trim() !== uid) return { ok: false, error: 'HOLD_USER_MISMATCH' };

  const status = String(hold.status || '').trim();
  if (status === 'confirmed') return { ok: true, holdId, status, wallet: getBalance(uid) };
  if (status === 'refunded') return { ok: false, error: 'HOLD_ALREADY_REFUNDED', wallet: getBalance(uid) };

  const frozenCost = Number(hold.cost ?? 0) || 0;
  const charged = Math.min(frozenCost, Math.max(0, actualCost));
  const refund = Math.max(0, frozenCost - charged);

  const w = wallets[uid];
  const available = Number(w?.available ?? 0) || 0;
  const frozen = Number(w?.frozen ?? 0) || 0;
  if (frozen < frozenCost) return { ok: false, error: 'FROZEN_INCONSISTENT', wallet: getBalance(uid) };

  wallets[uid] = { ...w, available: available + refund, frozen: frozen - frozenCost, updatedAt: now() };
  holds[holdId] = { ...hold, status: 'confirmed', cost: charged, updatedAt: now() };
  writeWalletMap(wallets);
  writeHoldsMap(holds);

  return { ok: true, holdId, status: 'confirmed', wallet: getBalance(uid), charged, refunded: refund };
};

const refundHold = (input) => {
  const uid = normalizeUserId(input?.userId);
  const holdId = String(input?.holdId || '').trim();
  if (!uid) return { ok: false, error: 'MISSING_USER_ID' };
  if (!holdId) return { ok: false, error: 'MISSING_HOLD_ID' };

  ensureWallet(uid);
  const wallets = readWalletMap();
  const holds = readHoldsMap();
  const hold = holds[holdId];
  if (!hold || typeof hold !== 'object') return { ok: false, error: 'HOLD_NOT_FOUND' };
  if (String(hold.userId || '').trim() !== uid) return { ok: false, error: 'HOLD_USER_MISMATCH' };

  const status = String(hold.status || '').trim();
  if (status === 'refunded') return { ok: true, holdId, status, wallet: getBalance(uid) };
  if (status === 'confirmed') return { ok: false, error: 'HOLD_ALREADY_CONFIRMED', wallet: getBalance(uid) };

  const cost = Number(hold.cost ?? 0) || 0;
  const w = wallets[uid];
  const available = Number(w?.available ?? 0) || 0;
  const frozen = Number(w?.frozen ?? 0) || 0;
  if (frozen < cost) return { ok: false, error: 'FROZEN_INCONSISTENT', wallet: getBalance(uid) };

  wallets[uid] = { ...w, available: available + cost, frozen: frozen - cost, updatedAt: now() };
  holds[holdId] = { ...hold, status: 'refunded', updatedAt: now() };
  writeWalletMap(wallets);
  writeHoldsMap(holds);

  return { ok: true, holdId, status: 'refunded', wallet: getBalance(uid) };
};

const grantCredits = (input) => {
  const uid = normalizeUserId(input?.userId);
  const credits = Number.parseInt(String(input?.credits ?? 0), 10);
  if (!uid) return { ok: false, error: 'MISSING_USER_ID' };
  if (!Number.isFinite(credits) || credits <= 0) return { ok: false, error: 'INVALID_CREDITS' };

  ensureWallet(uid);
  const wallets = readWalletMap();
  const w = wallets[uid];
  const available = Number(w?.available ?? 0) || 0;
  const frozen = Number(w?.frozen ?? 0) || 0;
  wallets[uid] = { ...w, available: available + credits, frozen, updatedAt: now() };
  writeWalletMap(wallets);
  return { ok: true, wallet: getBalance(uid) };
};

const checkinCredits = (input) => {
  const uid = normalizeUserId(input?.userId);
  const credits = Number.parseInt(String(input?.credits ?? 0), 10);
  if (!uid) return { ok: false, error: 'MISSING_USER_ID' };
  if (!Number.isFinite(credits) || credits <= 0) return { ok: false, error: 'INVALID_CREDITS' };

  ensureWallet(uid);
  const wallets = readWalletMap();
  const w = wallets[uid] || {};
  const today = getTodayKey();
  const last = typeof w.lastCheckinDay === 'string' ? w.lastCheckinDay.trim() : '';
  if (today && last === today) {
    return { ok: true, alreadyCheckedIn: true, creditsAdded: 0, wallet: getBalance(uid) };
  }

  const available = Number(w?.available ?? 0) || 0;
  const frozen = Number(w?.frozen ?? 0) || 0;
  wallets[uid] = { ...w, available: available + credits, frozen, lastCheckinDay: today || last, updatedAt: now() };
  writeWalletMap(wallets);
  return { ok: true, alreadyCheckedIn: false, creditsAdded: credits, wallet: getBalance(uid) };
};

const applyAfdianOrder = (input) => {
  const uid = normalizeUserId(input?.userId);
  const afdianOrderId = String(input?.afdianOrderId || '').trim();
  const packageIdRaw = String(input?.packageId || '').trim().toLowerCase();
  const packageId =
    packageIdRaw === 'starter' ||
    packageIdRaw === 'standard' ||
    packageIdRaw === 'pro' ||
    packageIdRaw === 'ultimate'
      ? packageIdRaw
      : '';
  const credits = Number.parseInt(String(input?.credits ?? 0), 10);
  if (!uid) return { ok: false, error: 'MISSING_USER_ID' };
  if (uid.startsWith('guest_')) return { ok: false, error: 'GUEST_NOT_ALLOWED' };
  if (!afdianOrderId) return { ok: false, error: 'MISSING_AFDIAN_ORDER_ID' };
  if (!Number.isFinite(credits) || credits <= 0) return { ok: false, error: 'INVALID_CREDITS' };
  const maxPerOrder = (() => {
    const v = Number.parseInt(String(process.env.CREDITS_MAX_GRANT_PER_ORDER || '100000'), 10);
    return Number.isFinite(v) && v > 0 ? v : 100000;
  })();
  if (credits > maxPerOrder) return { ok: false, error: 'CREDITS_TOO_LARGE' };

  const orders = readOrdersMap();
  if (orders[afdianOrderId]) {
    return { ok: true, alreadyProcessed: true, wallet: getBalance(uid) };
  }

  const granted = grantCredits({ userId: uid, credits });
  if (!granted.ok) return granted;

  orders[afdianOrderId] = {
    afdianOrderId,
    userId: uid,
    credits,
    ...(packageId ? { packageId } : {}),
    createdAt: now()
  };
  writeOrdersMap(orders);
  return { ok: true, alreadyProcessed: false, wallet: getBalance(uid) };
};

const mergeWallet = (fromUserId, toUserId) => {
  const from = normalizeUserId(fromUserId);
  const to = normalizeUserId(toUserId);
  if (!from || !to || from === to) return { ok: false, error: 'INVALID_USERS' };

  ensureWallet(from);
  ensureWallet(to);
  const wallets = readWalletMap();
  const a = wallets[from];
  const b = wallets[to];
  const aAvail = Number(a?.available ?? 0) || 0;
  const aFrozen = Number(a?.frozen ?? 0) || 0;
  const bAvail = Number(b?.available ?? 0) || 0;
  const bFrozen = Number(b?.frozen ?? 0) || 0;

  wallets[to] = { ...b, available: bAvail + aAvail, frozen: bFrozen + aFrozen, updatedAt: now() };
  delete wallets[from];
  writeWalletMap(wallets);

  const holds = readHoldsMap();
  for (const holdId of Object.keys(holds)) {
    const h = holds[holdId];
    if (!h || typeof h !== 'object') continue;
    if (String(h.userId || '').trim() === from) holds[holdId] = { ...h, userId: to, updatedAt: now() };
  }
  writeHoldsMap(holds);

  return { ok: true, wallet: getBalance(to) };
};

const getOrders = (userId) => {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  const orders = readOrdersMap();
  return Object.values(orders)
    .filter((o) => String(o.userId || '').trim() === uid)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

const getHolds = (userId, opts) => {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  const limitRaw = Number.parseInt(String(opts?.limit ?? ''), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;
  const holds = readHoldsMap();
  return Object.values(holds)
    .filter((h) => String(h?.userId || '').trim() === uid)
    .sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0))
    .slice(0, limit);
};

module.exports = {
  ensureWallet,
  getBalance,
  freezeCredits,
  confirmHold,
  settleHold,
  refundHold,
  grantCredits,
  checkinCredits,
  applyAfdianOrder,
  mergeWallet,
  getOrders,
  getHolds
};

