const rateBucketStore = new Map();

const getClientIp = (req) => {
  const normalizeIp = (raw) => {
    let ip = String(raw || '').trim();
    if (!ip) return '';
    ip = ip.replace(/^\[|\]$/g, '');
    const m = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    if (m) ip = m[1];
    return ip;
  };
  const isPrivateIp = (raw) => {
    const ip = normalizeIp(raw).toLowerCase();
    if (!ip) return true;
    if (ip === 'unknown') return true;
    if (ip === '::1') return true;
    if (ip.startsWith('fe80:')) return true;
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      const parts = ip.split('.').map((x) => Number.parseInt(x, 10));
      if (parts.some((x) => !Number.isFinite(x) || x < 0 || x > 255)) return true;
      const [a, b] = parts;
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 192 && b === 168) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      return false;
    }
    return false;
  };

  const trustProxy = (() => {
    try {
      if (req?.app && typeof req.app.get === 'function') return !!req.app.get('trust proxy');
    } catch { }
    return false;
  })();

  const remoteIp = normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress || '');

  if (trustProxy) {
    const xf = req?.headers?.['x-forwarded-for'];
    const xffFirst =
      typeof xf === 'string'
        ? xf.split(',')[0].trim()
        : Array.isArray(xf) && xf.length
          ? String(xf[0] || '').trim()
          : '';
    const xffIp = normalizeIp(xffFirst);
    if (xffIp && isPrivateIp(remoteIp)) return xffIp;
    if (remoteIp) return remoteIp;
  }

  const ip = normalizeIp(typeof req?.ip === 'string' ? req.ip : '');
  return ip || remoteIp || 'unknown';
};

const getRateLimitStats = () => {
  const tagMap = new Map();
  for (const key of rateBucketStore.keys()) {
    const s = String(key || '');
    const tag = s.includes('|') ? s.split('|')[0] : s;
    if (!tag) continue;
    tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
  }

  const topTags = Array.from(tagMap.entries())
    .map(([tag, buckets]) => ({ tag, buckets }))
    .sort((a, b) => b.buckets - a.buckets)
    .slice(0, 12);

  return {
    totalBuckets: rateBucketStore.size,
    topTags,
    updatedAt: Date.now()
  };
};

const consumeRateToken = (key, maxTokens, windowMs, cost = 1) => {
  const now = Date.now();
  const cap = Math.max(1, Number(maxTokens) || 1);
  const window = Math.max(1000, Number(windowMs) || 1000);
  const refillPerMs = cap / window;

  const cur = rateBucketStore.get(key) || { tokens: cap, last: now };
  const elapsed = Math.max(0, now - (Number(cur.last) || now));
  const tokens = Math.min(cap, (Number(cur.tokens) || 0) + elapsed * refillPerMs);
  const nextTokens = tokens - (Number(cost) || 1);
  const ok = nextTokens >= 0;
  rateBucketStore.set(key, { tokens: ok ? nextTokens : tokens, last: now });

  if (rateBucketStore.size > 4000) {
    let removed = 0;
    for (const [k, v] of rateBucketStore) {
      const last = Number(v?.last) || 0;
      if (now - last > window * 4) {
        rateBucketStore.delete(k);
        removed += 1;
      }
      if (removed > 300) break;
    }
  }

  const retryAfterMs = ok ? 0 : Math.ceil((0 - nextTokens) / refillPerMs);
  return { ok, retryAfterMs };
};

const rateLimit = (tag, opts) => {
  const max = Number(opts?.max || 30);
  const windowMs = Number(opts?.windowMs || 60000);
  const cost = Number(opts?.cost || 1);
  return (req, res, next) => {
    const ip = getClientIp(req);
    const key = `${tag}|${ip}`;
    const result = consumeRateToken(key, max, windowMs, cost);
    if (result.ok) return next();
    const retryAfterSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    res.status(429);
    res.setHeader('Retry-After', String(retryAfterSec));
    const requestId =
      (req && req.body && typeof req.body === 'object' && typeof req.body.requestId === 'string' && req.body.requestId) ||
      (res && res.locals && typeof res.locals.requestId === 'string' ? res.locals.requestId : '');
    res.json({ error: 'RATE_LIMITED', retryAfterSec, ...(requestId ? { requestId } : {}) });
  };
};

module.exports = { getClientIp, rateLimit, consumeRateToken, getRateLimitStats };
