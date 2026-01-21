const installSystemRoutes = (app, deps) => {
  const NODE_ENV = deps?.NODE_ENV;
  const isProd = !!deps?.isProd;
  const requireLlmProvider = !!deps?.requireLlmProvider;
  const API_KEY = deps?.API_KEY;
  const SILICONFLOW_API_KEY = deps?.SILICONFLOW_API_KEY;
  const activeTextProvider = deps?.activeTextProvider;
  const imgCredits = deps?.imgCredits;
  const VECTORS_FILE = deps?.VECTORS_FILE;
  const readJson = deps?.readJson;
  const fs = deps?.fs;
  const path = deps?.path;
  const HF_RESOLVE_BASES = Array.isArray(deps?.HF_RESOLVE_BASES) ? deps.HF_RESOLVE_BASES : [];
  const HF_API_BASES = Array.isArray(deps?.HF_API_BASES) ? deps.HF_API_BASES : [];
  const hfProxyBaseHealth = deps?.hfProxyBaseHealth;
  const normalizeUpstreamBase = deps?.normalizeUpstreamBase;
  const HF_CACHE_DIR = deps?.HF_CACHE_DIR;
  const HF_CACHE_TTL_MS = deps?.HF_CACHE_TTL_MS;
  const HF_CACHE_MAX_BYTES = deps?.HF_CACHE_MAX_BYTES;
  const HF_CACHE_MAX_FILES = deps?.HF_CACHE_MAX_FILES;
  const getHfCacheUsage = deps?.getHfCacheUsage;
  const buildModeDocIndex = deps?.buildModeDocIndex;
  const callGeminiGenerate = deps?.callGeminiGenerate;
  const callSiliconFlowChat = deps?.callSiliconFlowChat;
  const callTextGenerate = deps?.callTextGenerate;
  const GEMINI_GENERATE_URLS = deps?.GEMINI_GENERATE_URLS;
  const GEMINI_EMBED_URLS = deps?.GEMINI_EMBED_URLS;
  const GEMINI_TIMEOUT_MS = deps?.GEMINI_TIMEOUT_MS;
  const GEMINI_REACTION_TIMEOUT_MS = deps?.GEMINI_REACTION_TIMEOUT_MS;
  const SILICONFLOW_API_BASE = deps?.SILICONFLOW_API_BASE;
  const SILICONFLOW_MODEL = deps?.SILICONFLOW_MODEL;
  const MODEDOC_ROOT = deps?.MODEDOC_ROOT;
  const getClientIp = deps?.getClientIp;
  const normalizeEmail = deps?.normalizeEmail;
  const canUseTestLoginCode = deps?.canUseTestLoginCode;
  const MEMORY_DIR = deps?.MEMORY_DIR;

  const listRegisteredRoutes = (appInstance) => {
    try {
      const router = appInstance?.router || appInstance?._router;
      const stack = Array.isArray(router?.stack) ? router.stack : [];
      const routes = [];
      for (const layer of stack) {
        const route = layer?.route;
        const routePath = route?.path;
        const methodsObj = route?.methods;
        if (!routePath || !methodsObj || typeof methodsObj !== 'object') continue;
        const methods = Object.keys(methodsObj)
          .filter((k) => !!methodsObj[k])
          .map((m) => m.toUpperCase());
        routes.push({ path: routePath, methods });
      }
      return routes;
    } catch {
      return [];
    }
  };

  const isWritableDir = (dirPath) => {
    try {
      const p = path.resolve(String(dirPath || '').trim());
      fs.mkdirSync(p, { recursive: true });
      const testFile = path.join(
        p,
        `.write_test_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}.tmp`
      );
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return { ok: true, path: p };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  };

  const isLocalRequest = (req) => {
    const ip = typeof getClientIp === 'function' ? getClientIp(req) : '';
    return (
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip.startsWith('127.') ||
      ip === '::ffff:127.0.0.1' ||
      ip.startsWith('::ffff:127.') ||
      ip === '::ffff:7f00:1' ||
      ip === 'localhost'
    );
  };

  const isDebugRoutesEnabled = (req) => {
    const raw = String(process.env.DEBUG_ROUTES || '').trim().toLowerCase();
    if (raw === '1' || raw === 'true') return true;
    return !isProd && isLocalRequest(req);
  };

  app.get(['/healthz', '/readyz'], (req, res) => {
    const hasGeminiKey = !!API_KEY;
    const hasSiliconflowKey = !!SILICONFLOW_API_KEY;
    const hasProvider = hasGeminiKey || hasSiliconflowKey;
    const ok = requireLlmProvider ? hasProvider : true;
    res.status(ok ? 200 : 503).json({
      ok,
      nodeEnv: NODE_ENV,
      uptimeSec: Math.floor(process.uptime()),
      provider: activeTextProvider,
      hasProvider,
      rid: String(res.locals.requestId || '')
    });
  });

  app.get('/api/meta', (req, res) => {
    res.json({
      ok: true,
      nodeEnv: NODE_ENV,
      uptimeSec: Math.floor(process.uptime()),
      provider: activeTextProvider,
      rid: String(res.locals.requestId || ''),
      gitSha:
        String(
          process.env.GIT_SHA ||
          process.env.VERCEL_GIT_COMMIT_SHA ||
          process.env.RAILWAY_GIT_COMMIT_SHA ||
          ''
        ).trim() || null
    });
  });

  app.get('/api/health', async (req, res) => {
    const probe = String(req.query.probe || '').trim() === '1';
    const hasApiKey = !!API_KEY;
    const hasSiliconflowKey = !!SILICONFLOW_API_KEY;
    const proxyUrl =
      process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';

    const hfBases = HF_RESOLVE_BASES.map((b) => (typeof normalizeUpstreamBase === 'function' ? normalizeUpstreamBase(b) : ''))
      .filter(Boolean);
    const hfHealth = hfBases.map((b) => {
      const s = typeof hfProxyBaseHealth?.get === 'function' ? hfProxyBaseHealth.get(b) : null;
      const downUntil = Number(s?.downUntil || 0);
      return {
        base: b,
        failCount: Number(s?.failCount || 0),
        downUntil: downUntil || 0,
        down: downUntil > Date.now()
      };
    });

    const result = {
      ok: true,
      serverTime: Date.now(),
      hasApiKey,
      textProvider: activeTextProvider,
      hf: {
        resolveBases: HF_RESOLVE_BASES,
        apiBases: HF_API_BASES,
        baseHealth: hfHealth,
        cache: {
          dir: HF_CACHE_DIR,
          ttlMs: HF_CACHE_TTL_MS,
          maxBytes: HF_CACHE_MAX_BYTES,
          maxFiles: HF_CACHE_MAX_FILES,
          usage: typeof getHfCacheUsage === 'function' ? getHfCacheUsage() : null
        }
      },
      gemini: {
        generateUrls: GEMINI_GENERATE_URLS,
        embedUrls: GEMINI_EMBED_URLS,
        timeoutMs: GEMINI_TIMEOUT_MS,
        reactionTimeoutMs: GEMINI_REACTION_TIMEOUT_MS,
        proxyConfigured: !!proxyUrl,
        lastProbe: null
      },
      siliconflow: {
        baseUrl: SILICONFLOW_API_BASE,
        model: SILICONFLOW_MODEL,
        hasApiKey: hasSiliconflowKey,
        lastProbe: null
      },
      rag: {
        vectorsFile: VECTORS_FILE,
        exists: false,
        sizeBytes: 0,
        totalVectors: 0,
        withEmbedding: 0,
        embeddingNull: 0,
        sources: 0
      },
      modedoc: {
        root: typeof MODEDOC_ROOT === 'function' ? MODEDOC_ROOT() : MODEDOC_ROOT,
        indexed: false,
        countZh: 0,
        countEn: 0
      },
      storage: {
        memoryDir: '',
        writable: false
      }
    };

    try {
      if (fs.existsSync(VECTORS_FILE)) {
        result.rag.exists = true;
        const st = fs.statSync(VECTORS_FILE);
        result.rag.sizeBytes = Number(st?.size || 0);
        const vectors0 = typeof readJson === 'function' ? readJson(VECTORS_FILE, []) : [];
        const vectors = Array.isArray(vectors0) ? vectors0 : [];
        result.rag.totalVectors = vectors.length;
        let withEmbedding = 0;
        let embeddingNull = 0;
        const sources = new Set();
        for (const v of vectors) {
          const emb = v?.embedding;
          if (Array.isArray(emb) && emb.length > 0) withEmbedding += 1;
          else embeddingNull += 1;
          const meta = v?.metadata && typeof v.metadata === 'object' ? v.metadata : null;
          const src =
            typeof meta?.sourceRel === 'string'
              ? meta.sourceRel
              : typeof meta?.source === 'string'
                ? meta.source
                : '';
          if (src && String(src).trim()) sources.add(String(src).trim());
        }
        result.rag.withEmbedding = withEmbedding;
        result.rag.embeddingNull = embeddingNull;
        result.rag.sources = sources.size;
      }
    } catch { }

    try {
      if (typeof buildModeDocIndex === 'function') {
        const idx = buildModeDocIndex();
        result.modedoc.indexed = true;
        result.modedoc.countZh = idx?.zh?.size || 0;
        result.modedoc.countEn = idx?.en?.size || 0;
      }
    } catch { }

    try {
      const check = isWritableDir(MEMORY_DIR);
      result.storage.memoryDir = MEMORY_DIR;
      result.storage.writable = !!check.ok;
      if (!check.ok) result.storage.error = check.error;
    } catch (e) {
      result.storage.memoryDir = '';
      result.storage.writable = false;
      result.storage.error = String(e?.message || e);
    }

    if (probe) {
      const startedAt = Date.now();
      if (activeTextProvider === 'gemini' && hasApiKey) {
        try {
          const { usedUrl, failures } = await callGeminiGenerate({
            timeoutMs: 5000,
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }]
          });
          result.gemini.lastProbe = {
            ok: true,
            usedUrl,
            elapsedMs: Date.now() - startedAt,
            failures: Array.isArray(failures) ? failures.slice(0, 3) : []
          };
        } catch (e) {
          result.gemini.lastProbe = {
            ok: false,
            elapsedMs: Date.now() - startedAt,
            error: String(e?.message || e),
            failures: Array.isArray(e?.failures) ? e.failures.slice(0, 3) : []
          };
        }
      } else if (hasSiliconflowKey) {
        try {
          const { usedUrl, failures } = await callSiliconFlowChat({
            timeoutMs: 5000,
            messages: [{ role: 'user', content: 'ping' }],
            maxTokens: 32
          });
          result.siliconflow.lastProbe = {
            ok: true,
            usedUrl,
            elapsedMs: Date.now() - startedAt,
            failures: Array.isArray(failures) ? failures.slice(0, 3) : []
          };
        } catch (e) {
          result.siliconflow.lastProbe = {
            ok: false,
            elapsedMs: Date.now() - startedAt,
            error: String(e?.message || e),
            failures: Array.isArray(e?.failures) ? e.failures.slice(0, 3) : []
          };
        }
      }
    }

    res.json(result);
  });

  app.post('/api/generate', async (req, res) => {
    const requestId = String(res.locals.requestId || req.body.requestId || '');
    const prompt = String(req.body.prompt || '').trim();
    const timeoutMs = Number(req.body.timeoutMs) || 0;
    const modelRaw = String(req.body.model || '').trim();
    const userId = String(req.body.userId || '').trim();
    const purpose = String(req.body.purpose || '').trim();
    const costRaw = Number.parseInt(String(req.body.cost ?? ''), 10);
    const cost = Number.isFinite(costRaw) && costRaw > 0 ? costRaw : 0;

    if (!prompt) {
      return res.status(400).json({ error: 'EMPTY_PROMPT', requestId });
    }

    try {
      if (typeof callTextGenerate !== 'function') {
        throw new Error('callTextGenerate is not available');
      }

      const isAllowedTextModel = (raw) => {
        const k = String(raw || '')
          .trim()
          .toLowerCase();
        return k === 'qwen' || k === 'qwen/qwen3-8b' || k === 'qwen3-8b';
      };

      const hold = (() => {
        try {
          if (!cost) return null;
          if (!userId) return { ok: false, error: 'MISSING_USER_ID' };
          if (!imgCredits || typeof imgCredits.freezeCredits !== 'function') return null;
          return imgCredits.freezeCredits({
            userId,
            cost,
            requestId,
            reason: purpose || 'generate'
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

      const contents = [{ role: 'user', parts: [{ text: prompt }] }];
      let result = null;
      try {
        result = await callTextGenerate({
          contents,
          timeoutMs: timeoutMs || 60000,
          ...(isAllowedTextModel(modelRaw) ? { model: modelRaw } : {})
        });
      } catch (e) {
        if (hold?.holdId && imgCredits && typeof imgCredits.refundHold === 'function') {
          try {
            imgCredits.refundHold({ userId, holdId: hold.holdId });
          } catch { }
        }
        throw e;
      }

      if (!result.text && !result.error) {
        if (hold?.holdId && imgCredits && typeof imgCredits.refundHold === 'function') {
          try {
            imgCredits.refundHold({ userId, holdId: hold.holdId });
          } catch { }
        }
        return res.status(500).json({ error: 'EMPTY_RESPONSE', requestId });
      }

      if (hold?.holdId && imgCredits && typeof imgCredits.settleHold === 'function') {
        try {
          imgCredits.settleHold({ userId, holdId: hold.holdId, actualCost: cost });
        } catch { }
      }

      res.json({
        candidates: [{
          content: {
            parts: [{ text: result.text }]
          }
        }],
        usageMetadata: result.usage ? {
          promptTokenCount: result.usage.promptTokens,
          candidatesTokenCount: result.usage.completionTokens,
          totalTokenCount: result.usage.totalTokens
        } : undefined,
        requestId
      });
    } catch (e) {
      const msg = String(e?.message || e);
      const code = String(e?.code || '').trim();
      const status =
        code === 'SERVER_BUSY'
          ? 503
          : code === 'MISSING_SILICONFLOW_API_KEY'
            ? 503
            : 500;
      console.error('[API][Generate] Error:', msg);
      const debugFailures =
        !isProd && isLocalRequest(req) && Array.isArray(e?.failures) ? e.failures.slice(0, 4) : undefined;
      res.status(status).json({ error: code || msg, requestId, ...(debugFailures ? { debugFailures } : {}) });
    }
  });

  app.get('/api/_debug/routes', (req, res) => {
    if (!isDebugRoutesEnabled(req)) return res.status(404).json({ error: 'Not Found' });
    const routes = listRegisteredRoutes(app);
    const hasImg2img = routes.some(
      (r) => r && r.path === '/api/img2img' && Array.isArray(r.methods) && r.methods.includes('POST')
    );
    res.json({ ok: true, hasImg2img, routes });
  });

  app.get('/api/_debug/storage', (req, res) => {
    if (!isDebugRoutesEnabled(req)) return res.status(404).json({ error: 'Not Found' });
    const check = isWritableDir(MEMORY_DIR);
    res.json({
      ok: true,
      memoryDir: MEMORY_DIR,
      writable: !!check.ok,
      ...(check.ok ? {} : { error: check.error }),
      nodeEnv: String(process.env.NODE_ENV || '').trim()
    });
  });

  app.get('/api/_debug/ip', (req, res) => {
    const ip = typeof getClientIp === 'function' ? getClientIp(req) : '';
    if (!isLocalRequest(req)) return res.status(404).json({ error: 'Not Found' });
    res.json({
      ok: true,
      ip,
      reqIp: typeof req.ip === 'string' ? req.ip : '',
      xf: req.headers['x-forwarded-for'] || null
    });
  });

  app.post('/api/_debug/login-test', (req, res) => {
    if (!isDebugRoutesEnabled(req)) return res.status(404).json({ error: 'Not Found' });
    const body = req.body || {};
    const email = typeof normalizeEmail === 'function' ? normalizeEmail(body.email) : '';
    const code = String(body.code || '').trim();
    const expected = String(process.env.LOGIN_TEST_CODE || '123456').trim() || '123456';
    const ip = typeof getClientIp === 'function' ? getClientIp(req) : '';
    res.json({
      ok: true,
      ip,
      nodeEnv: String(process.env.NODE_ENV || ''),
      email,
      code,
      expected,
      canUse: typeof canUseTestLoginCode === 'function' ? canUseTestLoginCode(req, code, email) : false
    });
  });
};

module.exports = { installSystemRoutes };
