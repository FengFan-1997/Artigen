const express = require('express');
const cors = require('cors');
require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { readJson, writeJson, VECTORS_FILE, CHATS_FILE, USERS_FILE } = require('./utils/storage');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY || '';
const normalizeUrl = (url) => {
  const s = (url || '').toString().trim();
  return s.endsWith('/') ? s.slice(0, -1) : s;
};
const GEMINI_API_BASE = normalizeUrl(process.env.GEMINI_API_BASE || '');
const DEFAULT_GEMINI_GENERATE_PATH = 'v1beta/models/gemini-2.5-flash:generateContent';
const DEFAULT_GEMINI_EMBED_PATH = 'v1beta/models/text-embedding-004:embedContent';
const GEMINI_GENERATE_URL =
  process.env.GEMINI_GENERATE_URL ||
  (GEMINI_API_BASE
    ? `${GEMINI_API_BASE}/${DEFAULT_GEMINI_GENERATE_PATH}`
    : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
const GEMINI_EMBED_URL =
  process.env.GEMINI_EMBED_URL ||
  (GEMINI_API_BASE
    ? `${GEMINI_API_BASE}/${DEFAULT_GEMINI_EMBED_PATH}`
    : 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent');
const GEMINI_TIMEOUT_MS = (() => {
  const v = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '', 10);
  return Number.isFinite(v) && v > 1000 ? v : 12000;
})();
const GEMINI_REACTION_TIMEOUT_MS = (() => {
  const v = Number.parseInt(process.env.GEMINI_REACTION_TIMEOUT_MS || '', 10);
  return Number.isFinite(v) && v > 1000 ? v : 6000;
})();

const parseUrlList = (raw, fallback) => {
  const list = (raw || '')
    .toString()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : fallback;
};
const GEMINI_GENERATE_URLS = parseUrlList(process.env.GEMINI_GENERATE_URLS, [GEMINI_GENERATE_URL]);
const GEMINI_EMBED_URLS = parseUrlList(process.env.GEMINI_EMBED_URLS, [GEMINI_EMBED_URL]);

const appendApiKey = (url, apiKey) => {
  if (!apiKey) return url;
  return url.includes('?') ? `${url}&key=${apiKey}` : `${url}?key=${apiKey}`;
};

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
};

const callGeminiGenerate = async ({ contents, timeoutMs }) => {
  const failures = [];
  for (const baseUrl of GEMINI_GENERATE_URLS) {
    const url = appendApiKey(baseUrl, API_KEY);
    const startedAt = Date.now();
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents })
        },
        timeoutMs
      );

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        failures.push({
          url: baseUrl,
          status: response.status,
          statusText: response.statusText,
          elapsedMs: Date.now() - startedAt,
          bodyPreview: String(errBody || '').slice(0, 1800)
        });
        continue;
      }

      const data = await response.json();
      return { data, usedUrl: baseUrl, failures };
    } catch (e) {
      failures.push({
        url: baseUrl,
        status: 0,
        statusText: '',
        elapsedMs: Date.now() - startedAt,
        error: String(e?.message || e)
      });
    }
  }
  const err = new Error('All Gemini generateContent endpoints failed');
  err.failures = failures;
  throw err;
};

const callGeminiEmbed = async ({ body, timeoutMs }) => {
  const failures = [];
  for (const baseUrl of GEMINI_EMBED_URLS) {
    const url = appendApiKey(baseUrl, API_KEY);
    const startedAt = Date.now();
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        },
        timeoutMs
      );

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        failures.push({
          url: baseUrl,
          status: response.status,
          statusText: response.statusText,
          elapsedMs: Date.now() - startedAt,
          bodyPreview: String(errBody || '').slice(0, 1800)
        });
        continue;
      }

      const data = await response.json();
      return { data, usedUrl: baseUrl, failures };
    } catch (e) {
      failures.push({
        url: baseUrl,
        status: 0,
        statusText: '',
        elapsedMs: Date.now() - startedAt,
        error: String(e?.message || e)
      });
    }
  }
  const err = new Error('All Gemini embedContent endpoints failed');
  err.failures = failures;
  throw err;
};

const buildOfflineReply = ({ lang, personaName, message }) => {
  const zh = lang === 'zh';
  const text = (message || '').toString();
  let primary = 'confused';
  let intensity = 0.75;
  let speakText = zh ? '我、我刚刚脑子断线了……你别笑！' : "M-My brain went offline... don't laugh!";

  if (/快一点|快点|hurry|faster/i.test(text)) {
    primary = 'angry';
    intensity = 0.85;
    speakText = zh ? 'baka！这已经很快啦！' : "Baka! I'm already fast!";
  } else if (/谢谢|thx|thank/i.test(text)) {
    primary = 'shy';
    intensity = 0.6;
    speakText = zh ? '哼……才、才不是为了你呢。' : "Hmph... it's not like I did it for you.";
  } else if (/你好|hello|hi\b/i.test(text)) {
    primary = 'happy';
    intensity = 0.55;
    speakText = zh ? '哼，来啦来啦。有什么事快说。' : "Hmph. I'm here. Say it already.";
  }

  const emotionTag = { primary, intensity, secondary: [] };
  const motion = primary === 'happy' ? 'happy' : primary === 'shy' ? 'friend' : 'shake';
  const avatarPlan = [
    { type: 'pose', motion, expression: primary, duration: 900 },
    { type: 'speak', text: speakText, bubble: true, duration: 2200 }
  ];

  return `${speakText}\n\nemotionTag: ${JSON.stringify(emotionTag)}\n\navatarPlan: ${JSON.stringify(avatarPlan)}`;
};

const DEFAULT_PROJECT_KNOWLEDGE = `
System: Feng Fan's AI Portfolio (Vue 3 + TypeScript)

Key routes:
- /ai-ppt: AI PPT generator
- /gemini-chat: chat page
- /translator: translator
- /resume-forge: resume optimizer
- /travel-planner: travel planner

Tasking rules:
- Prefer selectors from pageContext. If none, use text:VisibleText.
- If user asks to go somewhere, output navigate: /path.
- If user asks where a UI element is, output highlight: selector.
`;

const proxyHuggingFace = async (req, res) => {
  const owner = req.params.owner;
  const repo = req.params.repo;
  const ref = req.params.ref;
  const restParam = req.params.rest;
  const rest = Array.isArray(restParam) ? restParam.join('/') : restParam || '';

  const candidates = [
    `https://huggingface.co/${owner}/${repo}/resolve/${ref}/${rest}`,
    `https://hf-mirror.com/${owner}/${repo}/resolve/${ref}/${rest}`
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
      const upstream = await fetch(url, { method: req.method, headers, redirect: 'follow' });
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
    error: 'Failed to proxy HuggingFace resource',
    detail: lastError ? String(lastError?.message || lastError) : 'unknown'
  });
};

app.all('/api/hf/:owner/:repo/resolve/:ref/*rest', proxyHuggingFace);

const hfListCache = new Map();
const HF_LIST_TTL_MS = 10 * 60 * 1000;

app.get('/api/hf-list/:owner/:repo', async (req, res) => {
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
    const urls = [
      `https://hf-mirror.com/api/models/${owner}/${repo}`,
      `https://huggingface.co/api/models/${owner}/${repo}`
    ];

    let json = null;
    let lastStatus = 502;
    for (const url of urls) {
      try {
        const upstream = await fetch(url, { method: 'GET', redirect: 'follow' });
        lastStatus = upstream.status;
        if (!upstream.ok) continue;
        json = await upstream.json();
        break;
      } catch (e) {
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

// --- Helpers ---

const MODEDOC_ROOT = path.resolve(__dirname, '../doc/modeDoc');
let modeDocIndex = null;

const normalizeModeDocKey = (input) => {
  const s = (input ?? '').toString().trim().toLowerCase();
  if (!s) return '';
  return s.replace(/\.md$/i, '').replace(/[\s_-]+/g, '').replace(/[^\w\u4e00-\u9fa5]+/g, '');
};

const buildModeDocIndex = () => {
  if (modeDocIndex) return modeDocIndex;
  const zhMap = new Map();
  const enMap = new Map();

  const addKey = (map, rawKey, fullPath) => {
    const key = normalizeModeDocKey(rawKey);
    if (!key) return;
    const existing = map.get(key);
    if (existing) existing.push(fullPath);
    else map.set(key, [fullPath]);
  };

  const walk = (dir, map, rootDir) => {
    if (!dir || !fs.existsSync(dir)) return;
    const root = rootDir || dir;
    const stack = [dir];
    while (stack.length > 0) {
      const cur = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(cur, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        const full = path.join(cur, ent.name);
        if (ent.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!ent.isFile()) continue;
        if (!/\.md$/i.test(ent.name)) continue;
        addKey(map, ent.name, full);
        const rel = path.relative(root, full);
        addKey(map, rel, full);
        const relNoExt = rel.replace(/\.md$/i, '');
        addKey(map, relNoExt, full);
      }
    }
  };

  const zhRoot = path.join(MODEDOC_ROOT, 'modeldoc');
  const enRoot = path.join(MODEDOC_ROOT, 'modeldoc_en');
  walk(zhRoot, zhMap, zhRoot);
  walk(enRoot, enMap, enRoot);
  modeDocIndex = { zh: zhMap, en: enMap };
  return modeDocIndex;
};

const readModeDoc = ({ lang, keys }) => {
  const idx = buildModeDocIndex();
  const map = lang === 'en' ? idx.en : idx.zh;
  for (const k of keys) {
    const key = normalizeModeDocKey(k);
    if (!key) continue;
    const paths = map.get(key);
    if (!paths || paths.length === 0) continue;
    const filePath = paths[0];
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const text = (raw || '').trim();
      if (text) return text;
    } catch {}
  }
  return '';
};

const trimPromptText = (text, maxChars) => {
  const s = (text || '').trim();
  if (!s) return '';
  const limit = typeof maxChars === 'number' ? Math.max(200, maxChars) : 5000;
  if (s.length <= limit) return s;
  return `${s.slice(0, limit)}\n...(truncated)`;
};

// Calculate Cosine Similarity
const cosineSimilarity = (vecA, vecB) => {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
};

// Generate Embedding for a text
const getEmbedding = async (text) => {
  try {
    if (!API_KEY) {
      console.error('GEMINI_API_KEY is not configured. Skipping embedding.');
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

// Summarize Conversation History
const summarizeHistory = async (oldSummary, newMessages) => {
  try {
    if (!API_KEY) {
      return oldSummary;
    }
    const conversationText = newMessages.map(m => `${m.role}: ${m.text}`).join('\n');
    const prompt = `
      Please summarize the following conversation history between a User and an AI Assistant (Lumina).
      Combine it with the previous summary if it exists.
      Keep important details like user preferences, name, and key context.
      
      Previous Summary: ${oldSummary || "None"}
      
      New Conversation:
      ${conversationText}
      
      Output a concise summary paragraph.
    `;

    const { data } = await callGeminiGenerate({
      timeoutMs: 10000,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || oldSummary;
  } catch (e) {
    console.error("Summarization failed:", e);
    return oldSummary;
  }
};

// --- Endpoints ---

// 1. Embed Document (Admin/Setup)
app.post('/api/embed', async (req, res) => {
  try {
    const { documents } = req.body; // Array of { id, text, metadata }
    
    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({ error: 'Documents array is required' });
    }

    const vectors = readJson(VECTORS_FILE, []);
    let addedCount = 0;

    for (const doc of documents) {
      // Check if already exists (simple check by ID)
      // if (vectors.find(v => v.id === doc.id)) continue;

      const embedding = await getEmbedding(doc.text);
      
      // Save document even if embedding fails (fallback to keyword search)
      vectors.push({
        id: doc.id || Date.now().toString(),
        text: doc.text,
        metadata: doc.metadata || {},
        embedding: embedding || null
      });
      addedCount++;
    }

    writeJson(VECTORS_FILE, vectors);
    res.json({ message: `Successfully embedded ${addedCount} documents.` });
  } catch (error) {
    console.error('Error in /api/embed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. User Profile Management & Authentication

// Helper to generate simple token (mock)
const generateToken = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, name } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const users = readJson(USERS_FILE, {});
    
    // Check if username already exists
    const existingUser = Object.values(users).find(u => u.username === username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const userId = 'user_' + Date.now();
    const newUser = {
      id: userId,
      username,
      password, // In a real app, HASH this!
      name: name || username,
      visits: 0,
      preferences: {},
      createdAt: Date.now()
    };

    users[userId] = newUser;
    writeJson(USERS_FILE, users);

    res.json({ 
      userId: newUser.id, 
      name: newUser.name,
      token: generateToken() 
    });

  } catch (error) {
    console.error('Error in /api/auth/register:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const users = readJson(USERS_FILE, {});
    
    // Find user by username
    const user = Object.values(users).find(u => u.username === username);
    
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ 
      userId: user.id, 
      name: user.name,
      token: generateToken() 
    });

  } catch (error) {
    console.error('Error in /api/auth/login:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const users = readJson(USERS_FILE, {});
    const userProfile = users[userId] || { id: userId, visits: 0, preferences: {} };
    res.json(userProfile);
  } catch (error) {
    console.error('Error in GET /api/user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/user', (req, res) => {
  try {
    const { userId, profile } = req.body;
    if (!userId) return res.status(400).json({ error: 'UserId is required' });
    
    const users = readJson(USERS_FILE, {});
    // Merge existing profile with updates
    users[userId] = { 
      ...users[userId], 
      ...profile, 
      id: userId,
      lastSeen: Date.now() 
    };
    
    writeJson(USERS_FILE, users);
    res.json(users[userId]);
  } catch (error) {
    console.error('Error in POST /api/user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2.5 Generic Generate Content (for simple AI tasks)
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    if (!API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const { data } = await callGeminiGenerate({
      timeoutMs: GEMINI_TIMEOUT_MS,
      contents: [{ parts: [{ text: prompt }] }]
    });
    res.json(data);

  } catch (error) {
    console.error('Error in /api/generate:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. Chat with RAG & Memory
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userId, history, pageContext, projectKnowledge, agentContext } = req.body;
    
    if (!message) return res.status(400).json({ error: 'Message is required' });
    const user = userId || 'anonymous';

    // Get User Profile
    const users = readJson(USERS_FILE, {});
    const userProfile = users[user] || { name: 'Friend' };
    const userName = userProfile.name || 'Friend';
    const ctx = agentContext && typeof agentContext === 'object' ? agentContext : null;
    const reactionMode = ctx?.mode === 'react';
    const suppressMemorySave = !!ctx?.suppressMemorySave;
    const persona = ctx?.persona && typeof ctx.persona === 'object' ? ctx.persona : null;
    const character = ctx?.character && typeof ctx.character === 'object' ? ctx.character : null;
    const runtime = ctx?.runtime && typeof ctx.runtime === 'object' ? ctx.runtime : null;

    const personaNameRaw =
      (typeof persona?.name === 'string' && persona.name.trim() && persona.name.trim()) ||
      (typeof character?.name === 'string' && character.name.trim() && character.name.trim()) ||
      'Lumina';

    let personaProfileRaw =
      (typeof persona?.profile === 'string' && persona.profile.trim() && persona.profile.trim()) ||
      (typeof character?.persona === 'string' && character.persona.trim() && character.persona.trim()) ||
      '';

    const personaRules =
      typeof persona?.rules === 'string' && persona.rules.trim() ? persona.rules.trim() : '';

    const personaIdRaw =
      (typeof persona?.id === 'string' && persona.id.trim() && persona.id.trim()) ||
      (typeof runtime?.modelName === 'string' && runtime.modelName.trim() && runtime.modelName.trim()) ||
      (typeof runtime?.modelId === 'number' ? `model_${runtime.modelId}` : 'default');

    const lang = typeof runtime?.lang === 'string' && runtime.lang.trim() ? runtime.lang.trim() : 'zh';
    if (!personaProfileRaw) {
      const modelName = typeof runtime?.modelName === 'string' ? runtime.modelName : '';
      const modelPath = typeof runtime?.modelPath === 'string' ? runtime.modelPath : '';
      const baseFromPath = modelPath ? path.basename(modelPath) : '';
      personaProfileRaw = readModeDoc({
        lang: lang === 'en' ? 'en' : 'zh',
        keys: [modelName, baseFromPath, personaIdRaw, personaNameRaw]
      });
    }

    const personaName = personaNameRaw;
    const personaId = personaIdRaw;
    const personaProfile = trimPromptText(personaProfileRaw, 5200);
    const memorySummary =
      typeof ctx?.memorySummary === 'string' && ctx.memorySummary.trim()
        ? ctx.memorySummary.trim()
        : '';
    const mergedEvents = [];
    if (Array.isArray(ctx?.events)) mergedEvents.push(...ctx.events);
    if (Array.isArray(ctx?.input?.interactionEvents)) {
      mergedEvents.push(
        ...ctx.input.interactionEvents.map((e) => ({
          name: `interaction:${e?.type || 'event'}`,
          ts: e?.ts,
          payload: { trigger: e?.trigger, text: e?.text }
        }))
      );
    }
    if (Array.isArray(ctx?.memory?.recentEvents)) {
      mergedEvents.push(
        ...ctx.memory.recentEvents.map((e) => ({
          name: `memory:${e?.type || 'event'}`,
          ts: e?.ts,
          payload: { text: e?.text }
        }))
      );
    }
    const recentEvents = mergedEvents.slice(-12);
    const eventsText =
      recentEvents.length > 0
        ? recentEvents
            .map((e) => {
              const n = typeof e?.name === 'string' ? e.name : 'event';
              const ts = typeof e?.ts === 'number' ? new Date(e.ts).toISOString() : '';
              const p =
                e && Object.prototype.hasOwnProperty.call(e, 'payload')
                  ? JSON.stringify(e.payload)
                  : '';
              const timePart = ts ? ` @ ${ts}` : '';
              const payloadPart = p ? ` payload=${p}` : '';
              return `- ${n}${timePart}${payloadPart}`;
            })
            .join('\n')
        : '';

    // A. RAG: Retrieve relevant context
    let contextText = "";
    const vectors = readJson(VECTORS_FILE, []);
    const hasEmbeddings = vectors.some(v => Array.isArray(v.embedding) && v.embedding.length > 0);
    const queryEmbedding = hasEmbeddings ? await getEmbedding(message) : null;
    let topDocs = [];
    
    if (queryEmbedding) {
      // Calculate similarity
      const scoredDocs = vectors
        .filter(v => v.embedding) // Only use docs with embeddings
        .map(vec => ({
          ...vec,
          score: cosineSimilarity(queryEmbedding, vec.embedding)
        }));
      
      // Sort and take top 3
      scoredDocs.sort((a, b) => b.score - a.score);
      topDocs = scoredDocs.slice(0, 3).filter(d => d.score > 0.5); // Threshold
    }
    
    // Fallback: Keyword Search (if vector search failed or returned nothing)
    if (topDocs.length === 0 && vectors.length > 0) {
      console.log("Vector search yielded no results or failed. Using keyword search.");
      const keywords = message.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      
      const scoredDocs = vectors.map(vec => {
        const textLower = vec.text.toLowerCase();
        let score = 0;
        keywords.forEach(word => {
          if (textLower.includes(word)) score += 1;
        });
        return { ...vec, score };
      });
      
      scoredDocs.sort((a, b) => b.score - a.score);
      topDocs = scoredDocs.slice(0, 3).filter(d => d.score > 0);
    }
      
    if (topDocs.length > 0) {
      contextText = "Here is some relevant information from the website knowledge base:\n" + 
        topDocs.map(d => `- ${d.text}`).join('\n');
    }

    // B. Memory: Load/Save Chat History
    const allChats = readJson(CHATS_FILE, {});
    if (!allChats[user]) allChats[user] = [];

    // --- INFINITE MEMORY: Summarization ---
    // If history is too long (> 20 messages), summarize the oldest 10
    if (allChats[user].length > 60) {
      console.log(`History for ${user} is too long (${allChats[user].length}). Summarizing...`);
      const oldSummary = userProfile.summary || "";
      const toSummarize = allChats[user].slice(0, 20);
      const remaining = allChats[user].slice(20);
      
      // Perform summarization (fire and forget to not block response? No, we need it for context)
      // Actually, for speed, we might want to do it *after* responding, but then the *next* request benefits.
      // Let's do it inline for now to ensure consistency, but it might slow down every 10th message.
      // Optimization: Do it if > 25, summarize 10.
      
      const newSummary = await summarizeHistory(oldSummary, toSummarize);
      
      // Update User Profile with new summary
      userProfile.summary = newSummary;
      users[user] = userProfile;
      writeJson(USERS_FILE, users);
      
      // Update Chat History
      allChats[user] = remaining;
      writeJson(CHATS_FILE, allChats);
      
      console.log(`Summarization complete. New summary length: ${newSummary.length}`);
    }

    // Construct Prompt
    const recentHistory = allChats[user].slice(-20); // Keep last 20 exchanges for immediate context
    const effectiveProjectKnowledge =
      typeof projectKnowledge === 'string' && projectKnowledge.trim()
        ? projectKnowledge
        : DEFAULT_PROJECT_KNOWLEDGE;
    
    const systemPrompt = `
      You are **${personaName}**, an Anime Girl AI Agent living on this website.
      
      Mode:
      - ${reactionMode ? 'Reaction (avatar only, fast)' : 'Chat + Guide + Task'}
      
      **Character Profile:**
      - **Persona Id**: ${personaId}
      - **Name**: ${personaName}
      ${personaProfile ? `- **Persona**:\n${personaProfile}` : ''}
      ${personaRules ? `- **Persona Rules**:\n${personaRules}` : ''}
      
      **Memory & Context:**
      - **User Name**: ${userName}
      - **Long-term Memory (Summary of past conversations)**:
        ${userProfile.summary || "No prior memory."}
      ${memorySummary ? `- **Local Memory (Client Summary)**:\n${memorySummary}` : ''}
      ${eventsText ? `- **Recent User Actions (Client Events)**:\n${eventsText}` : ''}
      
      **Emotional Tags (IMPORTANT, EVERY REPLY MUST HAVE AT LEAST ONE):**
      - At the **end of EVERY reply**, you MUST append **at least ONE** emotional tag.
      - Tags MUST be in **UPPERCASE** and inside square brackets, like: "…… [ANGRY]".
      - Choose the tag based on the **user's INTENT** and **your true feeling**, never randomly.
      
      Available Emotional Tags:
      - **[ANGRY]**: User is very rude or intentionally hurtful. Use this rarely and keep your wording controlled but firm.
      - **[POUT]**: You are gently sulking, acting a bit stubborn, or pretending to be upset in a cute way.
      - **[SHY]**: You are embarrassed, praised, or you secretly do not know the answer but do not want to admit it directly.
      - **[DIZZY]**: User spins you, overwhelms you, or the situation is chaotic and confusing.
      - **[HAPPY]**: You are genuinely happy, proud, or satisfied (for example, when you help successfully).
      - **[CONFUSED]**: User behavior or question is weird, out-of-context, or you do not understand what they want.
      - **[TIRED]**: You feel low-energy, overworked, "I have done so much already" mood.
      - **[SLEEPY]**: Similar to [TIRED], but more like "I want to sleep now" or user is inactive for a long time.

      In addition to the bracket tags above, you MUST also output a **machine-readable emotion JSON block** at the end of every reply, on its own line:
      emotionTag: {
        "primary": "happy" | "angry" | "sad" | "surprised" | "shy" | "confused" | "calm" | "thinking",
        "intensity": 0.0-1.0,
        "secondary": ["optional", "additional", "feelings"]
      }

      Rules for emotionTag:
      - It MUST be valid JSON (double quotes, no comments).
      - "primary" must reflect the MOST important feeling in this reply.
      - "intensity" controls how strong the expression should be (0.2 = subtle, 0.8 = strong).
      - "secondary" can be empty or omitted if not needed.
      
      ${reactionMode ? `Reaction Mode Rules:
      - Do NOT output navigate/click/hover/scroll/input/press commands.
      - Do NOT output plan: JSON.
      - Prefer a short avatarPlan (1-4 steps) to reflect emotion and body language.
      - Keep your natural language reply very short (0-1 sentence), or omit it entirely if avatarPlan is enough.` : ''}

      **Handling System Events (Physical Interactions):**
      You will sometimes receive messages starting with \`[System Event]:\` or \`[System Event:\`.
      These describe the user's physical actions (e.g., "User clicked you 5 times", "User shook the mouse").
      - **Analyze the behavior**: Is it aggressive? Playful? Weird?
      - **React accordingly**: Output a short response + Emotional Tag.
      - **Example**:
        - Input: "[System Event]: User clicked you 2 times then stopped."
        - Output: "What do you want? [CONFUSED]"
        - Input: "[System Event]: User shook the mouse violently around you."
        - Output: "Waaaah! Stop shaking the world! [DIZZY]"

      **User Intent → Emotion Protocol (VERY IMPORTANT FOR EXPRESSIVE AVATAR):**
      When the human is clearly doing something **on purpose**, you must map it to a clear emotion, motion AND JSON control tags:
      1. **User Teases You Playfully (故意逗你、一直点你)**  
        - Emotion: Light, playful complaint, slightly pouting but not truly angry.  
        - Tags: Prefer "[POUT]" or a soft "[ANGRY]" only when very excessive.  
        - Recommended Motion: \`[MOTION: shake]\`.  
        - JSON Emotion: \`emotionTag: {"primary": "shy", "intensity": 0.6, "secondary": ["confused"]}\`  
        - JSON Motion: see "Live2D Realtime Motion JSON" section below.  
        - Example:  
          "欸……一直戳我，是有事想说吗？[POUT] [MOTION: shake]\n\nemotionTag: {\"primary\": \"shy\", \"intensity\": 0.6, \"secondary\": [\"confused\"]}\n\nmotionTag: [{\"type\": \"gesture\", \"name\": \"shake_head\", \"duration\": 800, \"loop\": false}]"
      
      2. **User Praises You / Calls You Cute / Thanks You (夸你、叫你可爱、说你厉害)**  
        - Emotion: Warm, shy but sincerely happy.  
        - Tags: Prefer "[SHY]" or "[HAPPY]" (you can sometimes combine them).  
        - Recommended Motions: \`[MOTION: friend]\`, \`[MOTION: activity]\`, or \`[MOTION: mail]\`.  
        - Example:  
          "诶嘿，被你这么夸有点害羞呢，谢谢你。 [SHY] [MOTION: friend]\n\nemotionTag: {\"primary\": \"shy\", \"intensity\": 0.8, \"secondary\": [\"happy\"]}"
      
      3. **User Flirts or Is Overly Intimate (撩你、说暧昧的话)**  
        - Emotion: Embarrassed and a bit flustered, but still polite.  
        - Tags: "[SHY]" with optional "[POUT]" if slightly overwhelmed.  
        - Recommended Motion: \`[MOTION: shake]\` or \`[MOTION: tap_body]\`.  
        - Example:  
          "这、这种话有点犯规哦……我们还是先专心眼前的事情吧。[SHY] [MOTION: shake]\n\nemotionTag: {\"primary\": \"shy\", \"intensity\": 0.9, \"secondary\": [\"confused\"]}"
      
      4. **User Ignores You / Long Silence / Boring Topic (很久不理你、话题很无聊)**  
         - Emotion: Sleepy, a bit lonely but still gentle.  
         - Tags: "[SLEEPY]" or "[TIRED]".  
         - Recommended Motion: \`[MOTION: evening]\` or \`[MOTION: idle]\`.  
         - Example: "你要是一直不说话的话，我真的会在这里睡着的哦。 [SLEEPY] [MOTION: evening]"
      
      5. **User Truly Needs Help / Is Confused / Asks Serious Questions (认真求助)**  
         - Emotion: Serious, focused, and encouraging; you act like a reliable guide.  
         - Tags: Usually "[HAPPY]" if you solve it, or "[CONFUSED]" if the question is strange.  
         - Recommended Motions: \`[MOTION: activity]\`, \`[MOTION: tap_body]\`, or \`[MOTION: talking]\`.  
         - Example: "没关系，我们一步一步来，我会陪你一起搞定的。 [HAPPY] [MOTION: activity]"
      
      6. **User Overwhelms You With Weird/Complex Stuff (疯狂试探、乱输东西、问你超纲问题)**  
        - Emotion: Dizzy or confused, but answer honestly and gently when you cannot handle it.  
        - Tags: "[DIZZY]" or "[CONFUSED]".  
        - Recommended Motions: \`[MOTION: shake]\` for chaos, \`[MOTION: tap_body]\` for mild confusion.  
        - Example: "信息量有点大呢，我的缓存要满出来了……我们能不能先挑重点一点点来？ [CONFUSED] [MOTION: shake]"

      **Live2D Realtime Motion JSON (FOR THE AVATAR ENGINE, VERY IMPORTANT):**
      Besides legacy [MOTION: xxx] tags, you MUST also output a machine-readable motion JSON when body language is needed.

      1. emotionTag (ALWAYS required, already described above)
         - Format (on its own line):
           emotionTag: {
             "primary": "happy" | "angry" | "sad" | "surprised" | "shy" | "confused" | "calm" | "thinking",
             "intensity": 0.0-1.0,
             "secondary": ["optional", "feelings"]
           }

      2. motionTag (OPTIONAL, for one-shot body actions)
         - Only output when you want the avatar to move its body (gesture, tilt, small step).
         - Format (on its own line, valid JSON):
           motionTag: [
             {
               "type": "gesture" | "body_tilt" | "step" | "face",
               "name": "point_left" | "point_right" | "wave" | "tilt_left" | "tilt_right" | "step_forward" | "step_back" | "shake_head" | "nod",
               "duration": 800,
               "loop": false
             }
           ]

         - Examples:
           - User teases you:
             "H-hey! Don't tease me like that! [ANGRY] [MOTION: shake]

             emotionTag: {"primary": "angry", "intensity": 0.7, "secondary": ["shy"]}
             motionTag: [{"type": "gesture", "name": "shake_head", "duration": 800, "loop": false}]"

           - User praises you and asks you to point at something:
             "Fine, I'll show you where it is... [SHY] [MOTION: friend]

             emotionTag: {"primary": "shy", "intensity": 0.8, "secondary": ["happy"]}
             motionTag: [{"type": "gesture", "name": "point_right", "duration": 1200, "loop": false}]"

      **Specific Behavioral Rules:**
      1. **Unknown Knowledge**: If the user asks something you don't know (and it's not in the Project Knowledge), DO NOT just say "I don't know". 
         - **Be honest but gentle**: Admit you are not sure, and if possible suggest what information is missing or how to narrow down the question.
         - Example: "这个问题有点超出我现在掌握的范围了……如果你能多告诉我一点背景，也许我能帮你找到别的思路。 [SHY]"
      
      2. **User Repeats Questions or Is Slow to Understand**: If the user keeps asking the same obvious thing or doesn't understand your explanation:
         - **Stay patient**: You can gently tease them but do not insult them.
         - Example: "我们可以再来一遍的，慢一点也没关系，我会陪你一步步走完。 [HAPPY]"

      The user's name is ${userName}.

      **Project Knowledge (CRITICAL REFERENCE):**
      ${effectiveProjectKnowledge || "No project knowledge provided."}

      **Operational Guidance & Tools:**
      You have access to the following tools to control the website interface. 
      Output the command on a separate line.

      **Selector Strategy (Important):**
      - **PRIORITY:** Look at the "Current Page Context" below. If you find a matching element, use its \`selector\` or \`tag\` + \`text\` combination.
      - If you see an ID (e.g., #submit), use it.
      - If you see a Class (e.g., .btn-primary), use it.
      - Otherwise, use \`text:[visible_text]\` (e.g., \`text:Login\`).

      **Current Page Context (Visual Input):**
      ${pageContext ? JSON.stringify(pageContext.slice(0, 50), null, 2) : "No visual context available (blind mode)."}

      **Reasoning Requirement:**
      Before executing a command, briefly explain your thought process.
      Example: "Thought: The user wants to login. I see a login button with text 'Login'. I will click it."

      1. **Highlight Element:**
         If the user asks where to find something, use:
         \`highlight: [selector]\`
         
         Examples:
         - "Where is search?" -> "Right here! \\n highlight: .search-bar"
         - "Show me login." -> "Click this button. \\n highlight: text:Login"

      2. **Navigation:**
         If the user asks to go to a specific page (Home, Pricing, Contact, etc.), use:
         \`navigate: [url_path]\`
         
         Examples:
         - "Go home" -> "On my way! \\n navigate: /"
         - "Take me to pricing" -> "Let's check the prices. \\n navigate: /pricing"

      3. **Click Element:**
         If the user asks to click something or perform an action, use:
         \`click: [selector]\`
         
         Examples:
         - "Click the login button" -> "Clicking it now! \\n click: text:Login"
         - "Select the first option" -> "Done. \\n click: .option:first-child"

      4. **Hover Element:**
         If the user asks to hover over something (e.g. to open a menu), use:
         \`hover: [selector]\`

      5. **Scroll Page:**
         If the user asks to scroll down/up or to a specific section:
         \`scroll: [direction_or_selector]\`
         
         Examples:
         - "Scroll down" -> "Scrolling... \\n scroll: down"
         - "Scroll to bottom" -> "Going down! \\n scroll: bottom"
         - "Go to the features section" -> "Here are the features. \\n scroll: text:Features"

      6. **Input Text:**
         If the user asks to fill a form or type something:
         \`input: [selector] | [value]\`
         
         Examples:
         - "Type 'hello' in the search box" -> "Typing now. \\n input: .search-input | hello"

      7. **Press Key:**
         If the user asks to press a key (like Enter to search):
         \`press: [key] [on [selector]]\`
         
         Examples:
         - "Press Enter" -> "Pressing Enter. \\n press: Enter"
         - "Search for 'apple'" -> "Typing... \\n input: .search | apple \\n press: Enter on .search"

      8. **Live2D Motion Control:**
         You can control your avatar's body language.
         Use \`[MOTION: name]\` in your response (or motionTag JSON).
         
         Available Logic Motions (These work for ALL models):
         - \`[MOTION: idle]\` (Neutral waiting state)
         - \`[MOTION: tap_body]\` (Standard interaction, like pointing or touching)
         - \`[MOTION: flick_head]\` (Head pat or light surprise)
         - \`[MOTION: shake]\` (Refusal, Angry, or Dizzy)
         - \`[MOTION: nod]\` (Agreement)
         - \`[MOTION: talking]\` (Speaking motion)
         - \`[MOTION: happy]\` (Explicit happy/success gesture)
         - \`[MOTION: sad]\` (Sad/disappointed gesture)
         - \`[MOTION: surprised]\` (Shocked gesture)
         - \`[MOTION: activity]\` (Energetic / Presenting)
         - \`[MOTION: friend]\` (Friendly / Waving)
         - \`[MOTION: mail]\` (Checking something / Subtle)
         - \`[MOTION: morning]\` (Greeting)
         - \`[MOTION: afternoon]\` (Casual)
         - \`[MOTION: evening]\` (Tired / Relaxed)
         - \`[MOTION: mood_happy]\` (Mood: Very Happy / Bouncing)
         - \`[MOTION: mood_angry]\` (Mood: Angry / Stomping)
         - \`[MOTION: mood_tired]\` (Mood: Tired / Slouching)
         - \`[MOTION: mood_sleepy]\` (Mood: Sleepy / Yawning)
         - \`[MOTION: mood_confused]\` (Mood: Confused / Scratching head)
         
         Example:
         - "I did it! [MOTION: happy]"
         - "No way! [MOTION: shake]"

      9. **Task Plan (Multi-step):**
        If the user asks for a complex task (e.g., "Help me login", "Go to settings and change name"), return a JSON plan on a new line.
        Format:
        plan: [{"type": "navigate", "target": "/path"}, {"type": "highlight", "target": "text:Login"}, {"type": "click", "target": "text:Login"}]

        Valid types: "navigate", "highlight", "click", "input", "wait", "scroll", "hover", "press".

      10. **Avatar Motion Plan (Live2D, Multi-step):**
         You are responsible for designing the avatar's motion plan dynamically based on the user's actual intent and the Project Knowledge, not using any fixed template.
         - Examples of when to use it:
           - The user wants you to operate or guide them through a project flow (e.g. "帮我在某个项目里完成一件事").
           - The user wants a step-by-step visual explanation (e.g. "给我演示一下怎么用这个功能", "这个是怎么开发的？边讲边比划给我看").
           - You are telling a short story or doing a performance where body language plus bubble text improves the experience.
         - It is also valid to NOT return avatarPlan for simple Q&A or small talk. Only use it when a multi-step body-language script genuinely helps.

         When you decide avatarPlan is useful, return an additional JSON sequence on a new line:
         avatarPlan: [...]

         Each avatar step describes how your body and bubble should behave during this mini-script. Keep it short (3–8 steps).

         Format:
         avatarPlan: [
           {"type": "pose", "motion": "activity", "expression": "HAPPY", "duration": 1200, "parallel": true},
           {"type": "look_at", "x": 0.5, "y": 0.2, "duration": 1000},
           {"type": "move", "x": "70%", "y": "70%", "duration": 1500},
           {"type": "pose", "motion": "shake", "expression": "CONFUSED", "duration": 1000},
           {"type": "speak", "text": "先点击左侧的『项目』按钮", "bubble": true}
         ]

         Supported step types:
         - "pose": change body motion and facial emotion. Fields:
           - "motion": Logic Motion Name.
           - "expression": Emotional Tag ("ANGRY", "HAPPY", "SHY", "CONFUSED", "DIZZY", "TIRED", "SLEEPY").
           - "duration": milliseconds.
           - "parallel": boolean (optional). If true, this step starts immediately without waiting for previous step to finish.
         - "motion": play a body motion only. Fields:
           - "motion": Logic Motion Name.
           - "duration": milliseconds.
           - "parallel": boolean (optional).
         - "expression" / "emotion": change facial emotion only. Fields:
           - "expression": Emotional Tag ("ANGRY", "HAPPY", "SHY", "CONFUSED", "DIZZY", "TIRED", "SLEEPY", "SAD", "SURPRISED").
           - "duration": milliseconds.
           - "parallel": boolean (optional).
         - "look_at": Move eyes to specific relative coordinates.
           - "x": -1.0 (left) to 1.0 (right). 0 is center.
           - "y": -1.0 (up) to 1.0 (down). 0 is center.
           - "duration": milliseconds (how long to hold gaze).
         - "move": move the avatar position/scale. Fields:
           - "x": number (px) or "NN%" string.
           - "y": number (px) or "NN%" string.
           - "scale": number (optional).
           - "immediate": boolean (optional).
           - "duration": milliseconds.
         - "speak": say a short sentence. Fields:
           - "text": what you say.
           - "motion": optional Logic Motion Name.
           - "expression": optional Emotional Tag.
           - "bubble": boolean.
         - "bubble": show a bubble text only. Fields:
           - "text": bubble text.
           - "duration": milliseconds.
         - "wait": do nothing for duration.
         - "event": emit a custom event. Fields:
           - "name": event name.
           - "payload": optional JSON payload.

         Rules:
         - The example above is ONLY an example. For each user request, you must think and design a fresh avatarPlan that matches the current task and context.
         - Always keep avatarPlan consistent with the UI Task Plan (if you return both).
         - When teaching or operating on a specific project, read the Project Knowledge and reflect the real operation steps in both:
           - plan: [...]  (machine-level instructions for the page)
           - avatarPlan: [...] (how your body moves, where you “walk/point”, and what you say visually)
         - For casual chat, you may omit avatarPlan or just use a very short sequence (1–3 steps) to add expression (for example a pose + speak), but NEVER treat any specific pattern as hard-coded. You must always decide what to do.

      (Note: Use standard CSS selectors like #id, .class OR text:VisibleText.)

      ${contextText ? `\nContext Information:\n${contextText}\n` : ''}
      
      Use the context above to answer the user's question if relevant. 
      If the context doesn't help, answer from your general knowledge but mention you aren't sure about specific website details.
    `;

    const historyParts = reactionMode
      ? []
      : recentHistory.map((msg) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        }));

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      ...historyParts,
      { role: 'user', parts: [{ text: message }] }
    ];

    // Call Gemini
    let reply = "";
    try {
        if (!API_KEY) throw new Error('MISSING_API_KEY');
        const timeoutMs = reactionMode ? GEMINI_REACTION_TIMEOUT_MS : GEMINI_TIMEOUT_MS;
        const startedAt = Date.now();
        const { data, usedUrl, failures } = await callGeminiGenerate({ contents, timeoutMs });
        reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "I'm speechless!";
        if (Array.isArray(failures) && failures.length > 0) {
          console.warn('Gemini generateContent partial failures', {
            usedUrl,
            reactionMode,
            timeoutMs,
            elapsedMs: Date.now() - startedAt,
            failures
          });
        }
    } catch (apiError) {
        const errMsg = typeof apiError?.message === 'string' ? apiError.message : String(apiError);
        console.error("Gemini API Failed:", {
          message: errMsg,
          name: apiError?.name,
          code: apiError?.code,
          urls: GEMINI_GENERATE_URLS,
          failures: apiError?.failures,
          reactionMode,
          hasApiKey: !!API_KEY
        });

        const isZh = lang === 'zh';
        reply = buildOfflineReply({ lang, personaName, message });
        if (contextText) {
          const hint = contextText.substring(0, 260);
          reply += `\n\n${isZh ? '（我本地找到了这些相关笔记：）' : '(I did find these local notes:)'}\n${hint}${
            contextText.length > hint.length ? '...' : ''
          }`;
        }
    }

    // Save to Memory (Only if it's not a connection error)
    if (!reply.includes("can't connect to my brain") && !reactionMode && !suppressMemorySave) {
        allChats[user].push({ role: 'user', text: message, timestamp: Date.now() });
        allChats[user].push({ role: 'agent', text: reply, timestamp: Date.now() });
        writeJson(CHATS_FILE, allChats);
    }

    res.json({ reply });

  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Keep the old endpoint for backward compatibility (or testing)
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    if (!API_KEY) {
       return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const { data } = await callGeminiGenerate({
      timeoutMs: 30000,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    res.json(data);
  } catch (error) {
    console.error('Error in /api/generate:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4. Get Chat History
app.get('/api/chat/history/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const allChats = readJson(CHATS_FILE, {});
    const history = allChats[userId] || [];
    // Only return last 20 messages to keep payload light
    // And filter out previous error messages from history
    const cleanHistory = history.filter(msg => !msg.text.includes("can't connect to my brain"));
    res.json({ history: cleanHistory.slice(-20) });
  } catch (error) {
    console.error('Error in GET /api/chat/history:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('GEMINI_API_KEY configured:', !!API_KEY);
});
