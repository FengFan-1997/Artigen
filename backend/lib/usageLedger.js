const {
  sanitizeAnalyticsEvent,
  sanitizeUsageLedgerEntry
} = require('./privacy-metadata');

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

  const sanitizeLedgerId = (raw, fallback = '') => {
    const s = String(raw || '').trim();
    if (!s) return fallback;
    const safe = s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
    return safe || fallback;
  };

  const normalizeAnalyticsKey = (raw) => String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const sensitiveQueryKey = (raw) => {
    const key = normalizeAnalyticsKey(raw);
    return key === 'auth' || key === 'authorization' || key === 'code' || key === 'otp' ||
      key === 'sig' || key.startsWith('img') || key.startsWith('image') ||
      key.includes('token') || key.includes('signature') || key.endsWith('sig') ||
      key.endsWith('uri') || key.endsWith('url') || key.endsWith('password') ||
      key.endsWith('secret') || key.endsWith('credential') || key.endsWith('apikey');
  };

  const rawContentKeys = new Set([
    'content', 'dataurl', 'error', 'eventlabel', 'file', 'filename', 'filepath',
    'image', 'imageurl', 'img', 'imgurl', 'input', 'message', 'output',
    'placeholder', 'prompt', 'rawtext', 'reason', 'selector', 'src', 'targettext',
    'text', 'usertext'
  ]);

  const dropAnalyticsKey = (raw) => {
    const key = normalizeAnalyticsKey(raw);
    return !key || sensitiveQueryKey(key) || rawContentKeys.has(key) ||
      key.startsWith('image') || key.startsWith('img');
  };

  const looksLikeUrl = (raw) => {
    const value = String(raw || '').trim();
    return /^(?:https?:)?\/\//i.test(value) || /^\//.test(value) ||
      /^(?:data|blob|javascript):/i.test(value);
  };

  const sanitizeAnalyticsUrl = (raw) => {
    const value = String(raw || '').trim();
    if (!value || /^(?:data|blob|javascript):/i.test(value)) return '';
    try {
      const url = new URL(value, 'https://analytics.invalid');
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      const params = new URLSearchParams();
      for (const [key, paramValue] of url.searchParams.entries()) {
        if (sensitiveQueryKey(key) || looksLikeUrl(paramValue)) continue;
        params.append(key, String(paramValue || '').slice(0, 160));
      }
      const path = url.pathname.startsWith('/') ? url.pathname : `/${url.pathname}`;
      const query = params.toString();
      return `${path || '/'}${query ? `?${query}` : ''}`;
    } catch {
      return '';
    }
  };

  const scrubAnalyticsString = (raw) => String(raw || '')
    .replace(/([?&])([^=&#\s]+)=([^&#\s]*)/g, (match, _prefix, key) =>
      sensitiveQueryKey(key) ? '' : match
    )
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => sanitizeAnalyticsUrl(url))
    .replace(/\?&/g, '?')
    .replace(/&&+/g, '&')
    .replace(/[?&]+$/g, '')
    .slice(0, 240);

  const sanitizeAnalyticsPayload = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    const entries = Object.entries(raw).slice(0, 40);
    for (const [k, v] of entries) {
      const key = String(k || '').trim().slice(0, 64);
      if (dropAnalyticsKey(key)) continue;
      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) continue;
        if (normalizeAnalyticsKey(key) === 'target' && !/^[a-z0-9][a-z0-9:_-]{0,119}$/i.test(s)) {
          continue;
        }
        const cleaned = looksLikeUrl(s) ? sanitizeAnalyticsUrl(s) : scrubAnalyticsString(s);
        if (cleaned) out[key] = cleaned;
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
          .map((x) => (
            typeof x === 'string' && /^[a-z0-9][a-z0-9:_.-]{0,79}$/i.test(x.trim())
              ? x.trim()
              : null
          ))
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
    const items = Array.isArray(data.items)
      ? data.items.map(sanitizeUsageLedgerEntry).filter(Boolean)
      : [];
    if (Array.isArray(data.items) && JSON.stringify(data.items) !== JSON.stringify(items)) {
      writeJson(USAGE_LEDGER_FILE, { v: 1, items });
    }
    return { v: 1, items };
  };

  const readAnalyticsEventsStore = () => {
    const data = readJson(ANALYTICS_EVENTS_FILE, { v: 1, items: [] });
    if (!data || typeof data !== 'object') return { v: 1, items: [] };
    const items = Array.isArray(data.items)
      ? data.items.map(sanitizeAnalyticsEvent).filter(Boolean)
      : [];
    if (Array.isArray(data.items) && JSON.stringify(data.items) !== JSON.stringify(items)) {
      writeJson(ANALYTICS_EVENTS_FILE, { v: 1, items });
    }
    return { v: 1, items };
  };

  const parseUrl = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return null;
    try {
      return new URL(s);
    } catch {
      return null;
    }
  };

  const normalizeHost = (raw) => String(raw || '').trim().toLowerCase();

  const classifyTraffic = (input) => {
    const location = String(input?.location || '').trim();
    const referrer = String(input?.referrer || '').trim();

    const locUrl = parseUrl(location);
    const refUrl = parseUrl(referrer);
    const locHost = normalizeHost(locUrl?.hostname || '');
    const refHost = normalizeHost(refUrl?.hostname || '');

    const searchHosts = [
      'google.com',
      'bing.com',
      'yahoo.com',
      'duckduckgo.com',
      'baidu.com',
      'sogou.com',
      'so.com',
      'yandex.com',
      'naver.com',
      'sm.cn'
    ];
    const isSearchHost = (h) =>
      !!h && searchHosts.some((x) => h === x || h.endsWith(`.${x}`));

    const utmMedium = (() => {
      try {
        const m = locUrl?.searchParams?.get('utm_medium');
        return typeof m === 'string' ? m.trim().toLowerCase() : '';
      } catch {
        return '';
      }
    })();

    const utmSource = (() => {
      try {
        const m = locUrl?.searchParams?.get('utm_source');
        return typeof m === 'string' ? m.trim().toLowerCase() : '';
      } catch {
        return '';
      }
    })();

    const utmCampaign = (() => {
      try {
        const m = locUrl?.searchParams?.get('utm_campaign');
        return typeof m === 'string' ? m.trim().slice(0, 120) : '';
      } catch {
        return '';
      }
    })();

    const source = (() => {
      if (refHost && isSearchHost(refHost)) return 'search';
      if (utmMedium === 'search' || utmMedium === 'organic') return 'search';
      if (utmSource && (utmSource === 'google' || utmSource === 'bing' || utmSource === 'baidu'))
        return 'search';
      if (refHost && locHost && refHost !== locHost) return 'link';
      if (refHost && !locHost) return isSearchHost(refHost) ? 'search' : 'link';
      return 'organic';
    })();

    const searchEngine = source === 'search' ? (refHost || utmSource || '').slice(0, 120) : '';

    return {
      trafficSource: source,
      ...(refHost ? { trafficRefHost: refHost.slice(0, 180) } : {}),
      ...(searchEngine ? { trafficSearchEngine: searchEngine } : {}),
      ...(utmMedium ? { trafficUtmMedium: utmMedium.slice(0, 120) } : {}),
      ...(utmSource ? { trafficUtmSource: utmSource.slice(0, 120) } : {}),
      ...(utmCampaign ? { trafficUtmCampaign: utmCampaign } : {})
    };
  };

  const appendAnalyticsEvent = (input) => {
    const store = readAnalyticsEventsStore();
    const items = store.items;
    const ts = typeof input?.ts === 'number' && Number.isFinite(input.ts) ? input.ts : Date.now();
    const eventType = sanitizeLedgerId(input?.eventType, 'event');
    const payload = sanitizeAnalyticsPayload(input?.payload);
    const path = sanitizeAnalyticsUrl(input?.path);
    const location = sanitizeAnalyticsUrl(input?.location);
    const referrer = sanitizeAnalyticsUrl(input?.referrer);
    const userId = sanitizeLedgerId(input?.userId, '');
    const requestId = sanitizeLedgerId(input?.requestId, '');
    const sessionId = sanitizeLedgerId(input?.sessionId, '');
    const projectId = sanitizeLedgerId(input?.projectId, '');
    const requestSource = sanitizeLedgerId(input?.requestSource, '');
    const traffic = classifyTraffic({ location, referrer, payload });

    const item = sanitizeAnalyticsEvent({
      id: sanitizeLedgerId(input?.id, `evt_${ts.toString(36)}_${Math.random().toString(16).slice(2, 10)}`),
      ts,
      eventType,
      payload,
      path,
      location,
      referrer,
      userId,
      ...traffic,
      ...(requestId ? { requestId } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(requestSource ? { requestSource } : {}),
      ip: typeof getClientIp === 'function' ? getClientIp(input?.req || {}) : 'unknown',
      ua:
        input?.req && input.req.headers && typeof input.req.headers['user-agent'] === 'string'
          ? input.req.headers['user-agent'].slice(0, 220)
          : ''
    });

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
        out[k] = s.length > 480 ? s.slice(0, 480) : s;
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
    if (!sanitizeLedgerId(input?.requestId)) return { ok: false, error: 'requestId is required' };
    const normalizedInput = (() => {
      const x = input && typeof input === 'object' ? { ...input } : {};
      if (!x.errorCode && typeof x.error === 'string' && x.error.trim()) x.errorCode = x.error.trim();
      if (!x.durationMs && typeof x.duration === 'number' && Number.isFinite(x.duration)) x.durationMs = x.duration;
      if (
        !x.creditsDelta &&
        typeof x.credits === 'number' &&
        Number.isFinite(x.credits) &&
        x.credits !== 0
      )
        x.creditsDelta = x.credits;
      if (!x.tokensTotal) {
        const ti = Number(x.tokensIn || 0) || 0;
        const to = Number(x.tokensOut || 0) || 0;
        const tt = Number(x.tokensTotal || 0) || 0;
        if (!tt && (ti || to)) x.tokensTotal = ti + to;
      }
      return sanitizeUsageLedgerEntry(x) || {};
    })();

    const requestId = sanitizeLedgerId(normalizedInput?.requestId);
    if (!requestId) return { ok: false, error: 'requestId is required' };

    const store = readUsageLedgerStore();
    const items = store.items;
    const idx = items.findIndex((x) => String(x?.requestId || '') === requestId);

    if (idx >= 0) {
      const prev = items[idx];
      const chargedAlready = !!prev?.chargedAt;
      const merged = mergeLedgerItem(prev, { ...normalizedInput, requestId, updatedAt: Date.now() });
      items[idx] = merged;
      writeJson(USAGE_LEDGER_FILE, { v: 1, items: items.slice(-USAGE_LEDGER_MAX_ITEMS) });
      return { ok: true, existed: true, chargedAlready, item: merged };
    }

    const createdAt = typeof normalizedInput?.ts === 'number' ? normalizedInput.ts : Date.now();
    const item = mergeLedgerItem(
      {
        requestId,
        ts: createdAt,
        createdAt,
        updatedAt: createdAt
      },
      normalizedInput
    );

    items.push(item);
    if (items.length > USAGE_LEDGER_MAX_ITEMS) items.splice(0, items.length - USAGE_LEDGER_MAX_ITEMS);
    writeJson(USAGE_LEDGER_FILE, { v: 1, items });
    return { ok: true, existed: false, chargedAlready: false, item };
  };

  const computeCreditsDelta = (input) => {
    const tokens = Number(input?.tokensTotal || 0);
    return tokens > 0 ? Math.max(1, Math.ceil((tokens / 1000) * USAGE_CREDITS_PER_1K_TOKENS)) : 0;
  };

  return {
    sanitizeLedgerId,
    sanitizeAnalyticsPayload,
    sanitizeAnalyticsUrl,
    readUsageLedgerStore,
    upsertUsageLedgerItem,
    computeCreditsDelta,
    readAnalyticsEventsStore,
    appendAnalyticsEvent
  };
};

module.exports = { createLedger };
