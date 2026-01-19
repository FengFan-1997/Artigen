const createLedger = (deps) => {
  const readJson = deps?.readJson;
  const writeJson = deps?.writeJson;
  const USAGE_LEDGER_FILE = deps?.USAGE_LEDGER_FILE;
  const ANALYTICS_EVENTS_FILE = deps?.ANALYTICS_EVENTS_FILE;
  const getClientIp = deps?.getClientIp;

  const USAGE_LEDGER_MAX_ITEMS = (() => {
    const v = Number.parseInt(process.env.USAGE_LEDGER_MAX_ITEMS || '', 10);
    return Number.isFinite(v) && v > 0 ? v : 20000;
  })();
  const ANALYTICS_EVENTS_MAX_ITEMS = (() => {
    const v = Number.parseInt(process.env.ANALYTICS_EVENTS_MAX_ITEMS || '', 10);
    return Number.isFinite(v) && v > 0 ? v : 50000;
  })();
  const USAGE_CREDITS_PER_1K_TOKENS = (() => {
    const v = Number.parseFloat(process.env.USAGE_CREDITS_PER_1K_TOKENS || '');
    return Number.isFinite(v) && v >= 0 ? v : 1;
  })();
  const USAGE_CREDITS_PER_RAG_QUERY = (() => {
    const v = Number.parseFloat(process.env.USAGE_CREDITS_PER_RAG_QUERY || '');
    return Number.isFinite(v) && v >= 0 ? v : 1;
  })();

  const sanitizeLedgerId = (raw, fallback = '') => {
    const s = String(raw || '').trim();
    if (!s) return fallback;
    const safe = s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
    return safe || fallback;
  };

  const sanitizeAnalyticsPayload = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    const entries = Object.entries(raw).slice(0, 40);
    for (const [k, v] of entries) {
      const key = String(k || '').trim().slice(0, 64);
      if (!key) continue;
      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) continue;
        out[key] = s.slice(0, 240);
        continue;
      }
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) continue;
        out[key] = v;
        continue;
      }
      if (typeof v === 'boolean') {
        out[key] = v;
        continue;
      }
      if (Array.isArray(v)) {
        const arr = v
          .slice(0, 20)
          .map((x) => (typeof x === 'string' ? x.trim().slice(0, 120) : null))
          .filter(Boolean);
        if (arr.length) out[key] = arr;
        continue;
      }
    }
    return out;
  };

  const readUsageLedgerStore = () => {
    const data = readJson(USAGE_LEDGER_FILE, { v: 1, items: [] });
    if (!data || typeof data !== 'object') return { v: 1, items: [] };
    const items = Array.isArray(data.items) ? data.items.filter((x) => x && typeof x === 'object') : [];
    return { v: 1, items };
  };

  const readAnalyticsEventsStore = () => {
    const data = readJson(ANALYTICS_EVENTS_FILE, { v: 1, items: [] });
    if (!data || typeof data !== 'object') return { v: 1, items: [] };
    const items = Array.isArray(data.items) ? data.items.filter((x) => x && typeof x === 'object') : [];
    return { v: 1, items };
  };

  const appendAnalyticsEvent = (input) => {
    const store = readAnalyticsEventsStore();
    const items = store.items;
    const ts = typeof input?.ts === 'number' && Number.isFinite(input.ts) ? input.ts : Date.now();
    const eventType = sanitizeLedgerId(input?.eventType, 'event');
    const payload = sanitizeAnalyticsPayload(input?.payload);
    const path = String(input?.path || '').trim().slice(0, 240);
    const location = String(input?.location || '').trim().slice(0, 480);
    const referrer = String(input?.referrer || '').trim().slice(0, 480);
    const userId = sanitizeLedgerId(input?.userId, '');

    const item = {
      id: sanitizeLedgerId(input?.id, `evt_${ts.toString(36)}_${Math.random().toString(16).slice(2, 10)}`),
      ts,
      eventType,
      payload,
      path,
      location,
      referrer,
      userId,
      ip: typeof getClientIp === 'function' ? getClientIp(input?.req || {}) : 'unknown',
      ua:
        input?.req && input.req.headers && typeof input.req.headers['user-agent'] === 'string'
          ? input.req.headers['user-agent'].slice(0, 220)
          : ''
    };

    items.push(item);
    if (items.length > ANALYTICS_EVENTS_MAX_ITEMS) items.splice(0, items.length - ANALYTICS_EVENTS_MAX_ITEMS);
    writeJson(ANALYTICS_EVENTS_FILE, { v: 1, items });
    return item;
  };

  const mergeLedgerItem = (prev, next) => {
    const out = { ...(prev || {}) };
    for (const [k, v] of Object.entries(next || {})) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) continue;
        out[k] = s;
        continue;
      }
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) continue;
        out[k] = v;
        continue;
      }
      if (Array.isArray(v)) {
        if (v.length === 0) continue;
        out[k] = v;
        continue;
      }
      if (typeof v === 'object') {
        if (!v || Object.keys(v).length === 0) continue;
        out[k] = v;
        continue;
      }
      out[k] = v;
    }
    return out;
  };

  const upsertUsageLedgerItem = (input) => {
    const requestId = sanitizeLedgerId(input?.requestId);
    if (!requestId) return { ok: false, error: 'requestId is required' };

    const store = readUsageLedgerStore();
    const items = store.items;
    const idx = items.findIndex((x) => String(x?.requestId || '') === requestId);

    if (idx >= 0) {
      const prev = items[idx];
      const chargedAlready = !!prev?.chargedAt;
      const merged = mergeLedgerItem(prev, { ...input, requestId, updatedAt: Date.now() });
      items[idx] = merged;
      writeJson(USAGE_LEDGER_FILE, { v: 1, items: items.slice(-USAGE_LEDGER_MAX_ITEMS) });
      return { ok: true, existed: true, chargedAlready, item: merged };
    }

    const createdAt = typeof input?.ts === 'number' ? input.ts : Date.now();
    const item = mergeLedgerItem(
      {
        requestId,
        ts: createdAt,
        createdAt,
        updatedAt: createdAt
      },
      input
    );

    items.push(item);
    if (items.length > USAGE_LEDGER_MAX_ITEMS) items.splice(0, items.length - USAGE_LEDGER_MAX_ITEMS);
    writeJson(USAGE_LEDGER_FILE, { v: 1, items });
    return { ok: true, existed: false, chargedAlready: false, item };
  };

  const computeCreditsDelta = (input) => {
    const tokens = Number(input?.tokensTotal || 0);
    const ragUsed = !!input?.ragUsed;
    const creditsFromTokens =
      tokens > 0 ? Math.max(1, Math.ceil((tokens / 1000) * USAGE_CREDITS_PER_1K_TOKENS)) : 0;
    const creditsFromRag = ragUsed ? USAGE_CREDITS_PER_RAG_QUERY : 0;
    return creditsFromTokens + creditsFromRag;
  };

  return {
    sanitizeLedgerId,
    readUsageLedgerStore,
    upsertUsageLedgerItem,
    computeCreditsDelta,
    readAnalyticsEventsStore,
    appendAnalyticsEvent
  };
};

module.exports = { createLedger };

