const {
  API_KEY,
  SILICONFLOW_API_KEY,
  SILICONFLOW_MODEL,
  SILICONFLOW_MESSAGES_URL,
  SILICONFLOW_CHAT_COMPLETIONS_URL,
  SILICONFLOW_IMAGES_GENERATIONS_URL,
  SILICONFLOW_IMAGE_INPUT_FIELD,
  FIXED_SILICONFLOW_CHAT_MODEL,
  FIXED_SILICONFLOW_IMAGE_MODEL,
  activeTextProvider,
  GEMINI_GENERATE_URLS,
  GEMINI_EMBED_URLS,
  SILICONFLOW_TIMEOUT_MS,
  SILICONFLOW_REACTION_TIMEOUT_MS
} = require('./config');

const { fetchWithTimeout } = require('./fetch-utils');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SILICONFLOW_MIN_INTERVAL_MS = (() => {
  const v = Number.parseInt(String(process.env.SILICONFLOW_MIN_INTERVAL_MS || ''), 10);
  return Number.isFinite(v) && v >= 0 ? v : 6500;
})();

let siliconflowGate = Promise.resolve();
let siliconflowNextAt = 0;
const withSiliconflowRateGate = async (fn) => {
  const chained = siliconflowGate.then(async () => {
    const waitMs = Math.max(0, siliconflowNextAt - Date.now());
    if (waitMs) await sleep(waitMs);
    siliconflowNextAt = Date.now() + SILICONFLOW_MIN_INTERVAL_MS;
    return await fn();
  });
  siliconflowGate = chained.catch(() => undefined);
  return chained;
};

const createSemaphore = (max, maxQueue) => {
  const lim = Number.isFinite(max) && max > 0 ? Math.floor(max) : 4;
  const qMax = Number.isFinite(maxQueue) && maxQueue >= 0 ? Math.floor(maxQueue) : 80;
  let inFlight = 0;
  const queue = [];

  const release = () => {
    inFlight = Math.max(0, inFlight - 1);
    if (inFlight >= lim) return;
    const next = queue.shift();
    if (!next) return;
    inFlight += 1;
    next.resolve(release);
  };

  const acquire = () =>
    new Promise((resolve, reject) => {
      if (inFlight < lim) {
        inFlight += 1;
        resolve(release);
        return;
      }
      if (queue.length >= qMax) {
        const err = new Error('SERVER_BUSY');
        err.code = 'SERVER_BUSY';
        reject(err);
        return;
      }
      queue.push({ resolve, reject });
    });

  const run = async (fn) => {
    const rel = await acquire();
    try {
      return await fn();
    } finally {
      rel();
    }
  };

  const stats = () => ({ inFlight, queued: queue.length, max: lim, maxQueue: qMax });

  return { run, stats };
};

const TEXT_GENERATE_MAX_CONCURRENCY = (() => {
  const v = Number.parseInt(String(process.env.TEXT_GENERATE_MAX_CONCURRENCY || ''), 10);
  return Number.isFinite(v) && v > 0 ? v : 4;
})();
const TEXT_GENERATE_MAX_QUEUE = (() => {
  const v = Number.parseInt(String(process.env.TEXT_GENERATE_MAX_QUEUE || ''), 10);
  return Number.isFinite(v) && v >= 0 ? v : 80;
})();
const textGenerateLimiter = createSemaphore(TEXT_GENERATE_MAX_CONCURRENCY, TEXT_GENERATE_MAX_QUEUE);

const appendApiKey = (url, apiKey) => {
  if (!apiKey) return url;
  return url.includes('?') ? `${url}&key=${apiKey}` : `${url}?key=${apiKey}`;
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

const callSiliconFlowChat = async ({ messages, timeoutMs, maxTokens, model }) => {
  if (!SILICONFLOW_API_KEY) {
    const err = new Error('MISSING_SILICONFLOW_API_KEY');
    err.code = 'MISSING_SILICONFLOW_API_KEY';
    throw err;
  }

  return await withSiliconflowRateGate(async () => {
    const startedAt = Date.now();
    const resolvedModel = String(model || '').trim() || SILICONFLOW_MODEL;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SILICONFLOW_API_KEY}`
    };

    const tryUrls = [SILICONFLOW_MESSAGES_URL, SILICONFLOW_CHAT_COMPLETIONS_URL];
    const failures = [];

    const isRpmLimit = (raw) => {
      const s = String(raw || '').toLowerCase();
      return s.includes('rpm limit exceeded') || s.includes('identity verification');
    };

    for (const url of tryUrls) {
      try {
        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: resolvedModel,
              messages,
              max_tokens: typeof maxTokens === 'number' ? maxTokens : undefined
            })
          },
          timeoutMs
        );

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          failures.push({
            url,
            status: response.status,
            statusText: response.statusText,
            elapsedMs: Date.now() - startedAt,
            bodyPreview: String(errBody || '').slice(0, 1800)
          });
          continue;
        }

        const data = await response.json();
        const usageRaw = data?.usage || data?.data?.usage || null;
        const usage =
          usageRaw && typeof usageRaw === 'object'
            ? {
              promptTokens:
                Number(
                  usageRaw.prompt_tokens ??
                  usageRaw.promptTokens ??
                  usageRaw.input_tokens ??
                  usageRaw.inputTokens ??
                  0
                ) || 0,
              completionTokens:
                Number(
                  usageRaw.completion_tokens ??
                  usageRaw.completionTokens ??
                  usageRaw.output_tokens ??
                  usageRaw.outputTokens ??
                  0
                ) || 0,
              totalTokens: Number(usageRaw.total_tokens ?? usageRaw.totalTokens ?? 0) || 0
            }
            : null;

        const openaiText = data?.choices?.[0]?.message?.content;
        if (typeof openaiText === 'string' && openaiText.trim()) {
          return { text: openaiText, usedUrl: url, failures, usage, model: resolvedModel };
        }

        const messageText =
          data?.content?.[0]?.text ||
          data?.message?.content ||
          data?.data?.choices?.[0]?.message?.content ||
          '';
        if (typeof messageText === 'string' && messageText.trim()) {
          return { text: messageText, usedUrl: url, failures, usage, model: resolvedModel };
        }

        failures.push({
          url,
          status: 200,
          statusText: 'OK',
          elapsedMs: Date.now() - startedAt,
          bodyPreview: String(JSON.stringify(data) || '').slice(0, 1800)
        });
      } catch (e) {
        failures.push({
          url,
          status: 0,
          statusText: '',
          elapsedMs: Date.now() - startedAt,
          error: String(e?.message || e)
        });
      }
    }

    if (failures.length && failures.every((f) => Number(f?.status || 0) === 403 && isRpmLimit(f?.bodyPreview))) {
      const err = new Error('SILICONFLOW_RPM_LIMIT');
      err.code = 'SILICONFLOW_RPM_LIMIT';
      err.failures = failures;
      throw err;
    }

    const err = new Error('All SiliconFlow endpoints failed');
    err.failures = failures;
    throw err;
  });
};

const toSiliconflowImage = (v) => {
  if (!v) return '';
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return '';
    if (s.startsWith('data:')) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[a-z0-9+/=\s]+$/i.test(s) && s.length >= 32) return s;
    return '';
  }
  if (typeof v === 'object') {
    const mimeType = String(v.mimeType || '').trim() || 'image/png';
    const dataBase64 = String(v.dataBase64 || '').trim();
    if (!dataBase64) return '';
    return `data:${mimeType};base64,${dataBase64}`;
  }
  return '';
};

const callSiliconFlowImageGenerate = async ({
  prompt,
  negativePrompt,
  params,
  images,
  timeoutMs,
  model,
  signal
}) => {
  if (!SILICONFLOW_API_KEY) {
    const err = new Error('MISSING_SILICONFLOW_API_KEY');
    err.code = 'MISSING_SILICONFLOW_API_KEY';
    throw err;
  }

  const startedAt = Date.now();
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SILICONFLOW_API_KEY}`
  };

  const p = String(prompt || '').trim();
  if (!p) {
    const err = new Error('EMPTY_PROMPT');
    err.code = 'EMPTY_PROMPT';
    throw err;
  }

  const imgs = Array.isArray(images) ? images.map(toSiliconflowImage).filter(Boolean).slice(0, 3) : [];
  const preferredModel = String(model || '').trim();
  const modelCandidates = [
    ...(preferredModel ? [preferredModel] : []),
    ...(FIXED_SILICONFLOW_IMAGE_MODEL && FIXED_SILICONFLOW_IMAGE_MODEL !== preferredModel
      ? [FIXED_SILICONFLOW_IMAGE_MODEL]
      : [])
  ];

  const isModelNotFound = (raw) => {
    const s = String(raw || '').toLowerCase();
    if (!s) return false;
    return s.includes('model') && (s.includes('not exist') || s.includes('not found') || s.includes('invalid'));
  };

  const buildBody = (model) => {
    const m = String(model || '').trim();
    const isQwenEdit = /(^|\/)qwen-image-edit/i.test(m);
    const body = {
      model: m,
      batch_size: 1,
      prompt: p,
      negative_prompt: String(negativePrompt || '').trim() || undefined,
      image_size: String(params?.imageSize || '').trim() || '1024x1024',
      num_inference_steps:
        typeof params?.steps === 'number' && Number.isFinite(params.steps) ? params.steps : undefined,
      seed:
        typeof params?.seed === 'number' && Number.isFinite(params.seed) ? Math.trunc(params.seed) : undefined
    };
    if (!isQwenEdit) {
      body.guidance_scale =
        typeof params?.guidanceScale === 'number' && Number.isFinite(params.guidanceScale)
          ? params.guidanceScale
          : undefined;
    }

    if (imgs[0]) body[SILICONFLOW_IMAGE_INPUT_FIELD] = imgs[0];
    if (imgs[1]) body.image2 = imgs[1];
    if (imgs[2]) body.image3 = imgs[2];
    return body;
  };

  let lastErr = null;
  for (const modelName of modelCandidates) {
    const body = buildBody(modelName);
    const response = await fetchWithTimeout(
      SILICONFLOW_IMAGES_GENERATIONS_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      },
      timeoutMs,
      signal
    );

    const raw = await response.text().catch(() => '');
    if (!response.ok) {
      const err = new Error(`SILICONFLOW_IMAGE_${response.status}`);
      err.code = `SILICONFLOW_IMAGE_${response.status}`;
      err.status = response.status;
      err.bodyPreview = String(raw || '').slice(0, 1800);
      err.elapsedMs = Date.now() - startedAt;
      err.modelTried = String(modelName || '').trim();
      lastErr = err;
      if (
        response.status === 400 &&
        !imgs.length &&
        /image-edit/i.test(String(modelName || '')) &&
        modelName !== modelCandidates[modelCandidates.length - 1]
      ) {
        continue;
      }
      if (
        response.status === 400 &&
        isModelNotFound(raw) &&
        modelName !== modelCandidates[modelCandidates.length - 1]
      ) {
        continue;
      }
      throw err;
    }

    const data = raw ? JSON.parse(raw) : null;
    return { data, elapsedMs: Date.now() - startedAt, modelUsed: String(modelName || '').trim() };
  }

  throw lastErr || new Error('SILICONFLOW_IMAGE_500');
};

const callTextGenerate = async ({ contents, timeoutMs, reactionMode, model, noFallback }) => {
  const canGemini = !!API_KEY;
  const canSiliconflow = !!SILICONFLOW_API_KEY;
  const sfTimeoutMs = Math.max(
    Math.max(1000, Number(timeoutMs || 0) || 0),
    reactionMode ? SILICONFLOW_REACTION_TIMEOUT_MS : SILICONFLOW_TIMEOUT_MS
  );

  const toSiliconflowMessages = () => {
    const messages = [];
    for (const c of contents || []) {
      const roleRaw = String(c?.role || '').toLowerCase();
      const role = roleRaw === 'model' ? 'assistant' : roleRaw === 'user' ? 'user' : 'user';
      const text = c?.parts?.[0]?.text;
      if (typeof text === 'string' && text.trim()) {
        messages.push({ role, content: text });
      }
    }
    return messages;
  };

  const runSiliconflow = async () => {
    const preferredModel = String(model || '').trim();
    const resolvedModel = preferredModel || FIXED_SILICONFLOW_CHAT_MODEL || SILICONFLOW_MODEL;
    const { text, usage, model: modelUsed, usedUrl } = await callSiliconFlowChat({
      messages: toSiliconflowMessages(),
      timeoutMs: sfTimeoutMs,
      maxTokens: reactionMode ? 512 : 2048,
      model: resolvedModel
    });
    return { text, provider: 'siliconflow', usage, model: modelUsed, usedUrl };
  };

  const runGemini = async () => {
    const { data, usedUrl } = await callGeminiGenerate({ contents, timeoutMs });
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usageRaw = data?.usageMetadata;
    const usage =
      usageRaw && typeof usageRaw === 'object'
        ? {
          promptTokens: Number(usageRaw.promptTokenCount ?? 0) || 0,
          completionTokens: Number(usageRaw.candidatesTokenCount ?? 0) || 0,
          totalTokens: Number(usageRaw.totalTokenCount ?? 0) || 0
        }
        : null;
    const model = (() => {
      const u = String(usedUrl || '').trim();
      const m = u.match(/\/models\/([^:/?]+)(?::|\?|$)/i);
      return m ? String(m[1] || '').trim() : 'gemini';
    })();
    return { text, provider: 'gemini', usage, model, usedUrl };
  };

  const isRetryableSf = (e) => {
    const failures = Array.isArray(e?.failures) ? e.failures : [];
    return failures.some((f) => {
      const s = Number(f?.status || 0);
      return s === 0 || s === 403 || s === 429 || s === 502 || s === 503 || s === 504;
    });
  };

  return await textGenerateLimiter.run(async () => {
    if (activeTextProvider === 'siliconflow' && canSiliconflow) {
      try {
        return await runSiliconflow();
      } catch (e0) {
        let err = e0;
        if (isRetryableSf(err)) {
          try {
            await sleep(250 + Math.floor(Math.random() * 250));
            return await runSiliconflow();
          } catch (e1) {
            err = e1;
          }
        }
        if (String(err?.code || '') === 'SILICONFLOW_RPM_LIMIT') {
          try {
            await sleep(10000 + Math.floor(Math.random() * 2000));
            return await runSiliconflow();
          } catch (e2) {
            err = e2;
          }
        }
        if (canGemini && !noFallback) return await runGemini();
        throw err;
      }
    }

    if (canGemini) {
      try {
        return await runGemini();
      } catch (e) {
        if (canSiliconflow) return await runSiliconflow();
        throw e;
      }
    }

    if (canSiliconflow) return await runSiliconflow();

    return { text: '', provider: 'offline', usage: null, model: 'offline', usedUrl: '' };
  });
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

module.exports = {
  callGeminiGenerate,
  callSiliconFlowChat,
  callSiliconFlowImageGenerate,
  callTextGenerate,
  callGeminiEmbed
};
