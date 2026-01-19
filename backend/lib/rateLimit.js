const rateBucketStore = new Map();

const getClientIp = (req) => {
  const xf = req?.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  if (Array.isArray(xf) && xf.length) return String(xf[0] || '').trim();
  const ip = typeof req?.ip === 'string' ? req.ip.trim() : '';
  return ip || 'unknown';
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
    res.json({ error: 'Too Many Requests', retryAfterSec });
  };
};

module.exports = { getClientIp, rateLimit, consumeRateToken };

