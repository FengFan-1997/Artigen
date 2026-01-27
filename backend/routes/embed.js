const { VECTORS_FILE, readJson, writeJson } = require('../utils/storage');
const { rateLimit } = require('../lib/rateLimit');
const { getEmbedding, buildDocVectorsFromRoots } = require('../lib/vector-utils');
const { API_KEY } = require('../lib/config');
const { assertAdmin } = require('../lib/auth-utils');

const isProd = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

const clampInt = (n, min, max) => {
  const v = Number.parseInt(String(n || ''), 10);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
};

const installEmbedRoutes = (app) => {
  const EMBED_RATE_MAX = (() => {
    const v = Number.parseInt(String(process.env.EMBED_RATE_MAX || ''), 10);
    return Number.isFinite(v) && v > 0 ? v : 15;
  })();
  const EMBED_RATE_WINDOW_MS = (() => {
    const v = Number.parseInt(String(process.env.EMBED_RATE_WINDOW_MS || ''), 10);
    return Number.isFinite(v) && v > 0 ? v : 60 * 1000;
  })();

  const requireAdminIfProd = (req, res, next) => {
    if (!isProd) return next();
    if (typeof assertAdmin !== 'function') return res.status(501).json({ error: 'ADMIN_NOT_CONFIGURED' });
    if (!assertAdmin(req, res)) return;
    return next();
  };

  app.post('/api/embed', rateLimit('embed', { max: EMBED_RATE_MAX, windowMs: EMBED_RATE_WINDOW_MS }), requireAdminIfProd, async (req, res) => {
    try {
      const { documents } = req.body || {}; // Array of { id, text, metadata }
      
      if (!documents || !Array.isArray(documents)) {
        return res.status(400).json({ error: 'Documents array is required' });
      }

      const vectors0 = readJson(VECTORS_FILE, []);
      const vectors = Array.isArray(vectors0) ? vectors0 : [];
      const byId = new Map();
      for (const v of vectors) {
        const id = typeof v?.id === 'string' ? v.id.trim() : '';
        if (!id) continue;
        byId.set(id, v);
      }

      const maxDocs = clampInt(req?.body?.maxDocs, 1, 10000);
      const docs = documents.slice(0, maxDocs);
      const maxEmbed = Object.prototype.hasOwnProperty.call(req.body || {}, 'maxEmbed')
        ? clampInt(req?.body?.maxEmbed, 0, 2000)
        : !!API_KEY
          ? Math.min(2000, docs.length)
          : 0;

      let upserted = 0;
      let embeddedAttempted = 0;
      let embeddingFailed = 0;

      for (const doc of docs) {
        const id = String(doc?.id || '').trim() || Date.now().toString();
        const text = String(doc?.text || '').trim();
        if (!text) continue;

        const existing = byId.get(id);
        const existingEmbedding = existing && Array.isArray(existing.embedding) ? existing.embedding : null;
        const shouldEmbed =
          !!API_KEY &&
          embeddedAttempted < maxEmbed &&
          !(Array.isArray(existingEmbedding) && existingEmbedding.length > 0);

        let embedding = Array.isArray(existingEmbedding) && existingEmbedding.length > 0 ? existingEmbedding : null;
        if (shouldEmbed) {
          embeddedAttempted += 1;
          const e = await getEmbedding(text);
          if (!e) embeddingFailed += 1;
          embedding = e || null;
        }

        byId.set(id, {
          id,
          text,
          metadata: doc?.metadata && typeof doc.metadata === 'object' ? doc.metadata : {},
          embedding
        });
        upserted += 1;
      }

      writeJson(VECTORS_FILE, Array.from(byId.values()));
      res.json({
        ok: true,
        message: `Successfully embedded ${upserted} documents.`,
        counts: {
          upserted,
          embeddingAttempted: embeddedAttempted,
          embeddingFailed
        }
      });
    } catch (error) {
      console.error('Error in /api/embed:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/embed/fs', rateLimit('embed_fs', { max: 3, windowMs: 60 * 1000 }), requireAdminIfProd, async (req, res) => {
    try {
      const lang = req?.body?.lang === 'en' ? 'en' : 'zh';
      const rootsRaw = Array.isArray(req?.body?.roots) ? req.body.roots : null;
      const pathRaw = typeof req?.body?.path === 'string' ? req.body.path : '';
      const pathRoot = pathRaw && String(pathRaw).trim() ? [String(pathRaw).trim()] : null;
      const roots = rootsRaw && rootsRaw.length ? rootsRaw : pathRoot && pathRoot.length ? pathRoot : ['doc/read/docs'];
      const chunkChars = typeof req?.body?.chunkChars === 'number' ? req.body.chunkChars : 900;
      const maxFiles = typeof req?.body?.maxFiles === 'number' ? req.body.maxFiles : 1200;
      const maxChunks = typeof req?.body?.maxChunks === 'number' ? req.body.maxChunks : 12000;
      const maxBytes = typeof req?.body?.maxBytes === 'number' ? req.body.maxBytes : 512 * 1024;
      const maxEmbed = Object.prototype.hasOwnProperty.call(req.body || {}, 'maxEmbed')
        ? clampInt(req?.body?.maxEmbed, 0, 2000)
        : !!API_KEY
          ? 40
          : 0;

      const startedAt = Date.now();
      const built = buildDocVectorsFromRoots({ roots, lang, chunkChars, maxFiles, maxChunks, maxBytes });
      if (!built?.roots || built.roots.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'No valid roots inside repository',
          requestedRoots: roots
        });
      }
      const vectors0 = readJson(VECTORS_FILE, []);
      const vectors = Array.isArray(vectors0) ? vectors0 : [];

      const touchedSources = new Set();
      for (const d of built.docs) {
        const s = d?.metadata?.sourceRel;
        if (typeof s === 'string' && s.trim()) touchedSources.add(s.trim());
      }

      const kept = vectors.filter((v) => {
        const meta = v?.metadata && typeof v.metadata === 'object' ? v.metadata : null;
        if (!meta) return true;
        const kind = typeof meta.kind === 'string' ? meta.kind : '';
        const sourceRel = typeof meta.sourceRel === 'string' ? meta.sourceRel : '';
        if (kind !== 'doc' || !sourceRel) return true;
        return !touchedSources.has(sourceRel);
      });

      const byId = new Map();
      for (const v of kept) {
        const id = typeof v?.id === 'string' ? v.id : '';
        if (!id) continue;
        byId.set(id, v);
      }

      let embeddedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let embeddingAttempted = 0;
      let embeddingSucceeded = 0;
      const embedBudget = !!API_KEY ? maxEmbed : 0;
      for (const doc of built.docs) {
        const text = String(doc?.text || '').trim();
        if (!text) continue;
        const id = typeof doc?.id === 'string' ? doc.id : '';
        if (!id) continue;
        if (byId.has(id)) {
          skippedCount += 1;
          continue;
        }
        let embedding = null;
        if (embedBudget > 0 && embeddingAttempted < embedBudget) {
          embeddingAttempted += 1;
          const e = await getEmbedding(text);
          if (!e) failedCount += 1;
          else embeddingSucceeded += 1;
          embedding = e || null;
        }
        byId.set(id, {
          id,
          text,
          metadata: doc.metadata || {},
          embedding: embedding || null
        });
        embeddedCount += 1;
        if (embeddedCount >= maxChunks) break;
      }

      const next = Array.from(byId.values());
      writeJson(VECTORS_FILE, next);

      res.json({
        ok: true,
        lang,
        roots: built.roots,
        sources: Array.from(touchedSources),
        counts: {
          sources: touchedSources.size,
          documents: built.docs.length,
          embedded: embeddedCount,
          skipped: skippedCount,
          embeddingAttempted,
          embeddingSucceeded,
          embeddingFailed: failedCount,
          totalVectors: next.length
        },
        elapsedMs: Date.now() - startedAt
      });
    } catch (error) {
      const msg = typeof error?.message === 'string' ? error.message : String(error);
      console.error('Error in /api/embed/fs:', msg);
      res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
  });
};

module.exports = {
  installEmbedRoutes
};
