const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PassThrough } = require('stream');
const { fetchWithTimeout } = require('./fetch-utils');
const { HF_RESOLVE_BASES, normalizeUrl, parseUrlList } = require('./config');
const { MEMORY_DIR } = require('../utils/storage');

const HF_CACHE_DIR = (() => {
  const raw = String(process.env.HF_CACHE_DIR || '').trim();
  if (raw) return path.resolve(raw);
  return path.join(MEMORY_DIR, 'cache', 'hf');
})();

const HF_CACHE_TTL_MS = (() => {
  const v = Number.parseInt(process.env.HF_CACHE_TTL_MS || '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 7 * 24 * 60 * 60 * 1000;
})();
const HF_CACHE_MAX_BYTES = (() => {
  const v = Number.parseInt(process.env.HF_CACHE_MAX_BYTES || '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 1024 * 1024 * 1024;
})();
const HF_CACHE_MAX_FILES = (() => {
  const v = Number.parseInt(process.env.HF_CACHE_MAX_FILES || '', 10);
  return Number.isFinite(v) && v > 0 ? v : 2000;
})();

const hfProxyNegativeCache = new Map();
const HF_PROXY_NEGATIVE_TTL_MS = (() => {
  const v = Number.parseInt(process.env.HF_PROXY_NEGATIVE_TTL_MS || '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 2 * 60 * 1000;
})();

const hfProxyBaseHealth = new Map();
const HF_PROXY_BASE_COOLDOWN_MS = (() => {
  const v = Number.parseInt(process.env.HF_PROXY_BASE_COOLDOWN_MS || '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 60 * 1000;
})();

const normalizeUpstreamBase = (base) => String(base || '').trim().replace(/\/+$/, '');

const ensureDirSync = (dir) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
};

const hashCacheKey = (key) => crypto.createHash('sha1').update(String(key || '')).digest('hex');

const getCachePaths = (cacheKey, rest) => {
  const hash = hashCacheKey(cacheKey);
  const cleanRest = String(rest || '').split('?')[0].split('#')[0];
  const ext = path.extname(cleanRest || '').slice(0, 12);
  const suffix = ext && /^[a-z0-9.]+$/i.test(ext) ? ext : '';
  return {
    filePath: path.join(HF_CACHE_DIR, `${hash}${suffix}`),
    metaPath: path.join(HF_CACHE_DIR, `${hash}.json`)
  };
};

const readCacheMeta = (metaPath) => {
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    const json = JSON.parse(raw);
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
};

const writeCacheMeta = (metaPath, meta) => {
  try {
    fs.writeFileSync(metaPath, JSON.stringify(meta || {}, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
};

const statSafe = (p) => {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
};

const walkFiles = (rootDir, out = []) => {
  let entries = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(rootDir, ent.name);
    if (ent.isDirectory()) {
      walkFiles(full, out);
    } else if (ent.isFile()) {
      out.push(full);
    }
  }
  return out;
};

let hfCachePruneTimer = null;
const pruneHfCache = () => {
  if (!HF_CACHE_MAX_BYTES && !HF_CACHE_MAX_FILES) return;
  const files = walkFiles(HF_CACHE_DIR, []).filter((p) => !p.endsWith('.tmp'));
  const items = files
    .map((p) => {
      const st = statSafe(p);
      if (!st || !st.isFile()) return null;
      return { path: p, size: Number(st.size || 0), mtimeMs: Number(st.mtimeMs || 0) };
    })
    .filter(Boolean);

  const totalSize = items.reduce((acc, x) => acc + (Number(x.size) || 0), 0);
  const totalFiles = items.length;
  const overBytes = HF_CACHE_MAX_BYTES > 0 && totalSize > HF_CACHE_MAX_BYTES;
  const overFiles = HF_CACHE_MAX_FILES > 0 && totalFiles > HF_CACHE_MAX_FILES;
  if (!overBytes && !overFiles) return;

  items.sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0));
  let curSize = totalSize;
  let curFiles = totalFiles;
  for (const it of items) {
    if (!(HF_CACHE_MAX_BYTES > 0 && curSize > HF_CACHE_MAX_BYTES) && !(HF_CACHE_MAX_FILES > 0 && curFiles > HF_CACHE_MAX_FILES)) break;
    try {
      fs.unlinkSync(it.path);
      curSize -= Number(it.size) || 0;
      curFiles -= 1;
    } catch {}
  }
};

const schedulePruneHfCache = () => {
  if (hfCachePruneTimer) return;
  hfCachePruneTimer = setTimeout(() => {
    hfCachePruneTimer = null;
    try {
      ensureDirSync(HF_CACHE_DIR);
      pruneHfCache();
    } catch {}
  }, 2000);
};

let hfCacheUsageCache = { ts: 0, data: { files: 0, bytes: 0 } };
const getHfCacheUsage = () => {
  const now = Date.now();
  if (now - (hfCacheUsageCache.ts || 0) < 30000) return hfCacheUsageCache.data;
  ensureDirSync(HF_CACHE_DIR);
  const files = walkFiles(HF_CACHE_DIR, []).filter((p) => !p.endsWith('.tmp'));
  let bytes = 0;
  for (const p of files) {
    const st = statSafe(p);
    if (st && st.isFile()) bytes += Number(st.size || 0);
  }
  const data = { files: files.length, bytes };
  hfCacheUsageCache = { ts: now, data };
  return data;
};

const isUpstreamBaseDown = (base) => {
  const key = normalizeUpstreamBase(base);
  const s = hfProxyBaseHealth.get(key);
  if (!s) return false;
  const until = Number(s?.downUntil || 0);
  return until > Date.now();
};

const markUpstreamBaseFailure = (base) => {
  const key = normalizeUpstreamBase(base);
  if (!key) return;
  const cur = hfProxyBaseHealth.get(key) || { failCount: 0, downUntil: 0 };
  const failCount = Math.min(20, (Number(cur.failCount) || 0) + 1);
  const cooldown = HF_PROXY_BASE_COOLDOWN_MS * Math.min(10, failCount);
  const downUntil = Date.now() + cooldown;
  hfProxyBaseHealth.set(key, { failCount, downUntil });
};

const normalizeResolveBasePreference = (raw) => {
  const v = String(raw || '').trim();
  if (!v) return '';
  const lower = v.toLowerCase();
  if (lower === 'mirror' || lower === 'hf-mirror' || lower === 'hf-mirror.com') return 'https://hf-mirror.com';
  if (lower === 'hf' || lower === 'hf.co') return 'https://hf.co';
  if (lower === 'huggingface' || lower === 'huggingface.co') return 'https://huggingface.co';
  if (/^https?:\/\//i.test(v)) return v;
  return '';
};

const pickResolveCandidates = ({ owner, repo, ref, rest, preferBase }) => {
  const list = HF_RESOLVE_BASES.map((raw, index) => {
    const base = normalizeUpstreamBase(raw);
    const down = isUpstreamBaseDown(base);
    return {
      base,
      index,
      down,
      url: base ? `${base}/${owner}/${repo}/resolve/${ref}/${rest}` : ''
    };
  }).filter((x) => x.url);

  const prefer = normalizeUpstreamBase(preferBase);
  const healthy = list
    .filter((x) => !x.down)
    .sort((a, b) => (a.base === prefer ? -1 : b.base === prefer ? 1 : a.index - b.index));
  const down = list
    .filter((x) => x.down)
    .sort((a, b) => (a.base === prefer ? -1 : b.base === prefer ? 1 : a.index - b.index));
  return [...healthy, ...down];
};

const proxyHuggingFace = async (req, res) => {
  const owner = req.params.owner;
  const repo = req.params.repo;
  const ref = req.params.ref;
  const restParam = req.params.rest;
  const rest = Array.isArray(restParam) ? restParam.join('/') : restParam || '';

  const inferContentType = (p) => {
    const raw = (p || '').toString().split('?')[0].split('#')[0];
    const lower = raw.toLowerCase();
    const ext = (lower.split('.').pop() || '').trim();
    if (!ext) return '';
    if (ext === 'json') return 'application/json; charset=utf-8';
    if (ext === 'js') return 'application/javascript; charset=utf-8';
    if (ext === 'css') return 'text/css; charset=utf-8';
    if (ext === 'txt' || ext === 'atlas' || ext === 'vtt') return 'text/plain; charset=utf-8';
    if (ext === 'svg') return 'image/svg+xml';
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'ogg') return 'audio/ogg';
    if (ext === 'm4a') return 'audio/mp4';
    if (ext === 'wasm') return 'application/wasm';
    if (ext === 'glb' || ext === 'vrm') return 'model/gltf-binary';
    if (ext === 'gltf') return 'model/gltf+json';
    return '';
  };

  const cacheKey = `${owner}/${repo}@${ref}/${rest}`;
  if (req.method === 'GET' || req.method === 'HEAD') {
    const cached = hfProxyNegativeCache.get(cacheKey);
    if (cached && cached?.expiresAt > Date.now() && cached?.status) {
      res.status(cached.status);
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.end();
      return;
    }
  }

  const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : '';
  const wantRange = !!rangeHeader;
  const cacheEnabled = HF_CACHE_TTL_MS >= 0 && ensureDirSync(HF_CACHE_DIR);
  const cachePaths = cacheEnabled ? getCachePaths(cacheKey, rest) : null;
  const cacheFileStat = cachePaths ? statSafe(cachePaths.filePath) : null;
  const cacheFresh =
    !!cacheFileStat &&
    cacheFileStat.isFile() &&
    (HF_CACHE_TTL_MS === 0 || Date.now() - Number(cacheFileStat.mtimeMs || 0) <= HF_CACHE_TTL_MS) &&
    Number(cacheFileStat.size || 0) > 0;

  const tryServeFromCache = () => {
    if (!cacheFresh || !cachePaths) return false;
    const meta = readCacheMeta(cachePaths.metaPath);
    const contentType =
      (typeof meta?.contentType === 'string' && meta.contentType.trim() && meta.contentType) ||
      inferContentType(rest) ||
      'application/octet-stream';

    const size = Number(cacheFileStat.size || 0);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Type', contentType);
    if (typeof meta?.etag === 'string' && meta.etag.trim()) res.setHeader('ETag', meta.etag);
    if (typeof meta?.lastModified === 'string' && meta.lastModified.trim())
      res.setHeader('Last-Modified', meta.lastModified);
    res.setHeader('Content-Disposition', 'inline');

    if (wantRange) {
      const m = rangeHeader.match(/bytes\s*=\s*(\d*)\s*-\s*(\d*)/i);
      const startRaw = m ? m[1] : '';
      const endRaw = m ? m[2] : '';
      const start = startRaw ? Number.parseInt(startRaw, 10) : 0;
      const end = endRaw ? Number.parseInt(endRaw, 10) : size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
        res.status(416);
        res.setHeader('Content-Range', `bytes */${size}`);
        res.end();
        return true;
      }

      res.status(206);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Range', `bytes ${start}-${Math.min(end, size - 1)}/${size}`);
      res.setHeader('Content-Length', String(Math.min(end, size - 1) - start + 1));

      if (req.method === 'HEAD') {
        res.end();
        return true;
      }

      fs.createReadStream(cachePaths.filePath, { start, end: Math.min(end, size - 1) }).pipe(res);
      return true;
    }

    res.status(200);
    res.setHeader('Content-Length', String(size));
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }

    fs.createReadStream(cachePaths.filePath).pipe(res);
    return true;
  };

  if (tryServeFromCache()) return;

  const preferBaseRaw = normalizeResolveBasePreference(req.query.base || req.query.preferBase || '');
  const allowedBases = new Set(HF_RESOLVE_BASES.map((b) => normalizeUpstreamBase(b)));
  const preferBaseNormalized = normalizeUpstreamBase(preferBaseRaw);
  const preferBase = preferBaseNormalized && allowedBases.has(preferBaseNormalized) ? preferBaseRaw : '';

  const candidates = pickResolveCandidates({ owner, repo, ref, rest, preferBase });

  const headers = {};
  const forwardKeys = ['range', 'if-none-match', 'if-modified-since', 'accept', 'user-agent', 'accept-encoding'];
  for (const k of forwardKeys) {
    const v = req.headers[k];
    if (typeof v === 'string' && v) headers[k] = v;
  }

  let lastError = null;
  let lastStatus = 0;
  let gotNotFound = false;
  let notFoundCount = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const url = candidate.url;
    const base = candidate.base;
    try {
      if ((req.method === 'GET' || req.method === 'HEAD') && i > 0 && gotNotFound) {
        try {
          const probe = await fetchWithTimeout(
            url,
            { method: 'HEAD', headers, redirect: 'follow', compress: false },
            2500
          );
          if (probe.status === 404 || probe.status === 410) {
            lastStatus = probe.status;
            gotNotFound = true;
            notFoundCount += 1;
            try {
              probe.body?.destroy?.();
            } catch {}
            continue;
          }
          if (probe.status >= 500 || probe.status === 403 || probe.status === 429) {
            lastStatus = probe.status;
            try {
              probe.body?.destroy?.();
            } catch {}
            continue;
          }
          try {
            probe.body?.destroy?.();
          } catch {}
        } catch (e) {
          lastError = e;
          markUpstreamBaseFailure(base);
          continue;
        }
      }

      const timeoutMs = gotNotFound ? 9000 : 12000;
      const upstream = await fetchWithTimeout(
        url,
        { method: req.method, headers, redirect: 'follow', compress: false },
        timeoutMs
      );

      const status = upstream.status;
      lastStatus = status;
      const isOk = status === 200 || status === 206 || status === 304;
      const shouldTryNext =
        !isOk &&
        i < candidates.length - 1 &&
        (status === 404 || status === 410 || status === 403 || status === 429 || status >= 500);

      if (shouldTryNext) {
        if (status === 404 || status === 410) {
          gotNotFound = true;
          notFoundCount += 1;
        }
        try {
          upstream.body?.destroy?.();
        } catch {}
        continue;
      }

      res.status(status);
      let upstreamContentType = '';
      upstream.headers?.forEach((value, key) => {
        if (!key) return;
        const lower = key.toLowerCase();
        if (
          lower === 'transfer-encoding' ||
          lower === 'connection' ||
          lower === 'keep-alive' ||
          lower === 'proxy-authenticate' ||
          lower === 'proxy-authorization' ||
          lower === 'te' ||
          lower === 'trailer' ||
          lower === 'upgrade' ||
          lower === 'content-disposition'
        ) {
          return;
        }
        if (lower === 'content-type') upstreamContentType = value;
        res.setHeader(key, value);
      });

      try {
        const inferred = inferContentType(rest);
        if (inferred) {
          const ct = (upstreamContentType || '').toString().toLowerCase();
          if (!ct || ct.includes('application/octet-stream')) {
            res.setHeader('Content-Type', inferred);
          }
        }
        res.setHeader('Content-Disposition', 'inline');
      } catch {}

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const shouldCache = cacheEnabled && !!cachePaths && req.method === 'GET' && !wantRange && status === 200;

      if (!upstream.body) {
        const buf = await upstream.arrayBuffer();
        const out = Buffer.from(buf);
        if (shouldCache) {
          try {
            const tmp = `${cachePaths.filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            fs.writeFileSync(tmp, out);
            fs.renameSync(tmp, cachePaths.filePath);
            writeCacheMeta(cachePaths.metaPath, {
              key: cacheKey,
              owner,
              repo,
              ref,
              rest,
              cachedAt: Date.now(),
              size: out.length,
              contentType: res.getHeader('Content-Type') || upstreamContentType || '',
              etag: upstream.headers?.get ? upstream.headers.get('etag') : '',
              lastModified: upstream.headers?.get ? upstream.headers.get('last-modified') : ''
            });
            schedulePruneHfCache();
          } catch {}
        }
        res.end(out);
        return;
      }

      if (shouldCache) {
        try {
          const tmp = `${cachePaths.filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const ws = fs.createWriteStream(tmp);
          const tee = new PassThrough();
          tee.pipe(res);
          tee.pipe(ws);
          ws.on('finish', () => {
            try {
              fs.renameSync(tmp, cachePaths.filePath);
              const st = statSafe(cachePaths.filePath);
              writeCacheMeta(cachePaths.metaPath, {
                key: cacheKey,
                owner,
                repo,
                ref,
                rest,
                cachedAt: Date.now(),
                size: st ? Number(st.size || 0) : 0,
                contentType: res.getHeader('Content-Type') || upstreamContentType || '',
                etag: upstream.headers?.get ? upstream.headers.get('etag') : '',
                lastModified: upstream.headers?.get ? upstream.headers.get('last-modified') : ''
              });
              schedulePruneHfCache();
            } catch {}
          });
          ws.on('error', () => {
            try {
              ws.close();
            } catch {}
            try {
              fs.unlinkSync(tmp);
            } catch {}
          });
          upstream.body.pipe(tee);
        } catch {
          upstream.body.pipe(res);
        }
      } else {
        upstream.body.pipe(res);
      }
      return;
    } catch (e) {
      lastError = e;
      markUpstreamBaseFailure(base);
    }
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && (lastStatus === 404 || lastStatus === 410 || notFoundCount)) {
    hfProxyNegativeCache.set(cacheKey, { status: lastStatus || 404, expiresAt: Date.now() + HF_PROXY_NEGATIVE_TTL_MS });
    res.status(lastStatus || 404);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.end();
    return;
  }

  res.status(502).json({
    error: 'Failed to proxy HuggingFace resource',
    status: lastStatus || 0,
    preferBase: preferBase || null,
    triedBases: candidates.map((c) => c.base).filter(Boolean),
    detail: lastError ? String(lastError?.message || lastError) : 'unknown'
  });
};

const proxyLive2DCubismCore = async (req, res) => {
  const candidates = [
    'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
    'https://cdn.jsdelivr.net/npm/live2dcubismcore@1.0.2/live2dcubismcore.min.js'
  ];

  const headers = {};
  const forwardKeys = ['range', 'if-none-match', 'if-modified-since', 'accept'];
  for (const k of forwardKeys) {
    const v = req.headers[k];
    if (typeof v === 'string' && v) headers[k] = v;
  }

  let lastError = null;
  for (const url of candidates) {
    try {
      const upstream = await fetchWithTimeout(
        url,
        { method: req.method, headers, redirect: 'follow', compress: false },
        20000
      );

      res.status(upstream.status);
      upstream.headers?.forEach((value, key) => {
        if (!key) return;
        const lower = key.toLowerCase();
        if (
          lower === 'transfer-encoding' ||
          lower === 'connection' ||
          lower === 'keep-alive' ||
          lower === 'proxy-authenticate' ||
          lower === 'proxy-authorization' ||
          lower === 'te' ||
          lower === 'trailer' ||
          lower === 'upgrade'
        ) {
          return;
        }
        res.setHeader(key, value);
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      if (!upstream.body) {
        const buf = await upstream.arrayBuffer();
        res.end(Buffer.from(buf));
        return;
      }

      upstream.body.pipe(res);
      return;
    } catch (e) {
      lastError = e;
    }
  }

  res.status(502).json({
    error: 'Failed to proxy Live2D Cubism Core',
    detail: lastError ? String(lastError?.message || lastError) : 'unknown'
  });
};

module.exports = {
  proxyHuggingFace,
  proxyLive2DCubismCore,
  getHfCacheUsage,
  hfProxyBaseHealth,
  HF_CACHE_DIR,
  HF_CACHE_TTL_MS,
  HF_CACHE_MAX_BYTES,
  HF_CACHE_MAX_FILES
};
