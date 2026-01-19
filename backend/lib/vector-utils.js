const path = require('path');
const crypto = require('crypto');
const { REPO_ROOT, isPathInside, listFilesRecursively, readTextFileSafe } = require('./fs-utils');
const { callGeminiEmbed, API_KEY } = require('./ai-providers');

const hashText = (text) => {
  try {
    return crypto.createHash('sha1').update(String(text || ''), 'utf8').digest('hex');
  } catch {
    return String(Math.random()).slice(2);
  }
};

const chunkTextByParagraphs = (text, maxChars) => {
  const limit = typeof maxChars === 'number' ? Math.max(240, Math.min(2400, maxChars)) : 900;
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const blocks = raw
    .split(/\n{2,}/g)
    .map((b) => b.trim())
    .filter(Boolean);
  const out = [];
  let cur = '';
  const pushCur = () => {
    const v = cur.trim();
    if (v) out.push(v);
    cur = '';
  };
  for (const b of blocks) {
    if (!cur) {
      if (b.length <= limit) {
        cur = b;
      } else {
        for (let i = 0; i < b.length; i += limit) out.push(b.slice(i, i + limit).trim());
      }
      continue;
    }
    if (cur.length + 2 + b.length <= limit) {
      cur = `${cur}\n\n${b}`;
      continue;
    }
    pushCur();
    if (b.length <= limit) {
      cur = b;
    } else {
      for (let i = 0; i < b.length; i += limit) out.push(b.slice(i, i + limit).trim());
    }
  }
  pushCur();
  return out;
};

const buildDocVectorsFromRoots = (input) => {
  const roots = Array.isArray(input?.roots) ? input.roots : [];
  const lang = input?.lang === 'en' ? 'en' : 'zh';
  const maxFiles = typeof input?.maxFiles === 'number' ? input.maxFiles : 1200;
  const maxBytes = typeof input?.maxBytes === 'number' ? input.maxBytes : 512 * 1024;
  const chunkChars = typeof input?.chunkChars === 'number' ? input.chunkChars : 900;
  const maxChunks = typeof input?.maxChunks === 'number' ? input.maxChunks : 12000;

  const normalizedRoots = roots
    .map((r) => (typeof r === 'string' ? r.trim() : ''))
    .filter(Boolean)
    .map((r) => path.resolve(REPO_ROOT, r))
    .filter((r) => isPathInside(r, REPO_ROOT));

  const mdFiles = [];
  for (const root of normalizedRoots) {
    const hits = listFilesRecursively(
      root,
      (p) => /\.md$/i.test(p),
      { maxFiles }
    );
    mdFiles.push(...hits);
  }

  const files = [];
  for (const f of mdFiles) {
    const rel = path.relative(REPO_ROOT, f);
    if (!rel || rel.startsWith('..')) continue;
    files.push({ abs: f, rel });
  }

  const docs = [];
  const perSourceCounts = new Map();
  for (const file of files) {
    if (docs.length >= maxChunks) break;
    const raw = readTextFileSafe(file.abs, maxBytes);
    const cleaned = (raw || '').trim();
    if (!cleaned) continue;

    const chunks = chunkTextByParagraphs(cleaned, chunkChars).slice(0, Math.max(1, Math.min(80, maxChunks - docs.length)));
    let idx = 0;
    for (const chunk of chunks) {
      const text = String(chunk || '').trim();
      if (!text) continue;
      const id = `doc:${lang}:${file.rel}:${idx}:${hashText(text).slice(0, 10)}`;
      docs.push({
        id,
        text,
        metadata: {
          kind: 'doc',
          lang,
          sourceRel: file.rel,
          chunk: idx,
          hash: hashText(text).slice(0, 16)
        }
      });
      idx += 1;
      if (docs.length >= maxChunks) break;
    }
    perSourceCounts.set(file.rel, idx);
  }

  return { docs, perSourceCounts, roots: normalizedRoots.map((r) => path.relative(REPO_ROOT, r)) };
};

let warnedMissingEmbeddingKey = false;
const getEmbedding = async (text) => {
  try {
    if (!API_KEY) {
      if (!warnedMissingEmbeddingKey) {
        warnedMissingEmbeddingKey = true;
        console.warn('GEMINI_API_KEY is not configured. Skipping embedding.');
      }
      return null;
    }
    const { data } = await callGeminiEmbed({
      timeoutMs: 10000,
      body: {
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] }
      }
    });
    return data?.embedding?.values || null;
  } catch (error) {
    console.error('Error getting embedding:', error);
    return null;
  }
};

const cosineSimilarity = (vecA, vecB) => {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (!denom) return 0;
  return dotProduct / denom;
};

module.exports = {
  hashText,
  chunkTextByParagraphs,
  buildDocVectorsFromRoots,
  getEmbedding,
  cosineSimilarity
};
