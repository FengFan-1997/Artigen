const installHfRoutes = (app, deps) => {
  const rateLimit = deps?.rateLimit;
  const fetchWithTimeout = deps?.fetchWithTimeout;
  const HF_API_BASES = Array.isArray(deps?.HF_API_BASES) ? deps.HF_API_BASES : [];
  const HF_PROXY_RATE_MAX = deps?.HF_PROXY_RATE_MAX;
  const HF_PROXY_RATE_WINDOW_MS = deps?.HF_PROXY_RATE_WINDOW_MS;
  const proxyHuggingFace = deps?.proxyHuggingFace;
  const proxyLive2DCubismCore = deps?.proxyLive2DCubismCore;

  const hfListCache = new Map();
  const HF_LIST_TTL_MS = 10 * 60 * 1000;

  app.all(
    '/api/hf/:owner/:repo/resolve/:ref/*rest',
    rateLimit('hf_proxy', { max: HF_PROXY_RATE_MAX, windowMs: HF_PROXY_RATE_WINDOW_MS }),
    proxyHuggingFace
  );

  app.all('/api/live2d-core/live2dcubismcore.min.js', proxyLive2DCubismCore);

  app.get('/api/hf-list/:owner/:repo', rateLimit('hf_list', { max: 60, windowMs: 60 * 1000 }), async (req, res) => {
    const owner = req.params.owner;
    const repo = req.params.repo;
    const ref = typeof req.query.ref === 'string' && req.query.ref ? req.query.ref : 'main';
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';
    const ext = typeof req.query.ext === 'string' ? req.query.ext : 'vrm';

    const cacheKey = `${owner}/${repo}@${ref}|${prefix}|${ext}`;
    const now = Date.now();
    const cached = hfListCache.get(cacheKey);
    if (cached && now - cached.ts < HF_LIST_TTL_MS) {
      res.json(cached.data);
      return;
    }

    try {
      const urls = HF_API_BASES.map((base) => {
        const trimmed = String(base || '').trim().replace(/\/+$/, '');
        return `${trimmed}/api/models/${owner}/${repo}`;
      }).filter(Boolean);

      let json = null;
      let lastStatus = 502;
      for (const url of urls) {
        try {
          const upstream = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' }, 12000);
          lastStatus = upstream.status;
          if (!upstream.ok) continue;
          json = await upstream.json();
          break;
        } catch {
          json = null;
        }
      }

      if (!json) {
        res.status(lastStatus || 502).json({ error: 'Failed to fetch HuggingFace model metadata' });
        return;
      }
      const siblings = Array.isArray(json?.siblings) ? json.siblings : [];
      const filenames = siblings
        .map((x) => x?.rfilename)
        .filter((x) => typeof x === 'string');

      const normalizedPrefix = (prefix || '').replace(/^\/+/, '').replace(/\/+$/, '');
      const prefixWithSlash = normalizedPrefix ? `${normalizedPrefix}/` : '';
      const suffix = ext ? `.${String(ext).replace(/^\./, '').toLowerCase()}` : '';

      const items = filenames
        .filter((p) => {
          if (prefixWithSlash && !p.startsWith(prefixWithSlash)) return false;
          if (suffix && !p.toLowerCase().endsWith(suffix)) return false;
          return true;
        })
        .sort((a, b) => a.localeCompare(b));

      const data = { owner, repo, ref, prefix: normalizedPrefix, ext: suffix, items };
      hfListCache.set(cacheKey, { ts: now, data });
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: 'Failed to fetch HuggingFace model metadata', detail: String(e) });
    }
  });
};

module.exports = { installHfRoutes };

