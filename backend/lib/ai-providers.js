const {
  SILICONFLOW_API_KEY,
  SILICONFLOW_CHAT_COMPLETIONS_URL,
  SILICONFLOW_IMAGES_GENERATIONS_URL,
  FIXED_SILICONFLOW_CHAT_MODEL,
  FIXED_CLOUDFLARE_CHAT_MODEL,
  FIXED_SILICONFLOW_IMAGE_MODEL,
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN,
  AGENT_CLOUDFLARE_FREE_ACCOUNT_ID,
  AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED,
  SILICONFLOW_TIMEOUT_MS,
  SILICONFLOW_REACTION_TIMEOUT_MS
} = require('./config');

const { fetchWithTimeout, fetch: siliconFlowFetch } = require('./fetch-utils');
const { isDeployedRuntime } = require('../services/agent-config');

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

let cloudflareGate = Promise.resolve();
let cloudflareNextAt = 0;
const withCloudflareRateGate = async (fn) => {
  const rpm = Math.max(1, Math.min(120, Number.parseInt(String(
    process.env.AGENT_CLOUDFLARE_REQUESTS_PER_MINUTE || '30'
  ), 10) || 30));
  const configuredFloor = Math.max(0, Number.parseInt(String(
    process.env.AGENT_CLOUDFLARE_MIN_INTERVAL_MS || '2000'
  ), 10) || 0);
  const intervalMs = Math.max(configuredFloor, Math.ceil(60_000 / rpm));
  const chained = cloudflareGate.then(async () => {
    const waitMs = Math.max(0, cloudflareNextAt - Date.now());
    if (waitMs) await sleep(waitMs);
    cloudflareNextAt = Date.now() + intervalMs;
    return fn();
  });
  cloudflareGate = chained.catch(() => undefined);
  return chained;
};

const cloudflareFailureCode = (error) => {
  for (const failure of Array.isArray(error?.failures) ? error.failures : []) {
    try {
      const body = JSON.parse(String(failure?.bodyPreview || ''));
      const code = body?.error?.code ?? body?.errors?.[0]?.code ?? body?.code;
      if (code !== undefined && code !== null) return String(code).trim();
    } catch {
      // Provider previews are untrusted and may not be JSON.
    }
  }
  return '';
};

const normalizeCloudflareFailure = (error) => {
  const providerCode = cloudflareFailureCode(error);
  const code = providerCode === '3036'
    ? 'AGENT_CLOUDFLARE_FREE_QUOTA_EXHAUSTED'
    : providerCode === '5035'
      ? 'AGENT_CLOUDFLARE_PAID_MODEL_FORBIDDEN'
      : '';
  if (!code) return error;
  const normalized = new Error(code);
  normalized.code = code;
  normalized.retryable = false;
  normalized.status = Number(error?.failures?.[0]?.status || 0) || undefined;
  normalized.providerCode = providerCode;
  return normalized;
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
    next.cleanup();
    inFlight += 1;
    next.resolve(release);
  };

  const acquire = (signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        const error = new Error('ABORT_ERR');
        error.name = 'AbortError';
        error.code = 'ABORT_ERR';
        reject(error);
        return;
      }
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
      const entry = { resolve, reject, cleanup: () => {} };
      const onAbort = () => {
        const index = queue.indexOf(entry);
        if (index >= 0) queue.splice(index, 1);
        const error = new Error('ABORT_ERR');
        error.name = 'AbortError';
        error.code = 'ABORT_ERR';
        reject(error);
      };
      entry.cleanup = () => signal?.removeEventListener('abort', onAbort);
      signal?.addEventListener('abort', onAbort, { once: true });
      queue.push(entry);
    });

  const run = async (fn, signal) => {
    const rel = await acquire(signal);
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

const IMAGE_GENERATE_MAX_CONCURRENCY = (() => {
  const v = Number.parseInt(String(process.env.IMAGE_GENERATE_MAX_CONCURRENCY || ''), 10);
  return Number.isFinite(v) && v > 0 ? v : 2;
})();
const IMAGE_GENERATE_MAX_QUEUE = (() => {
  const v = Number.parseInt(String(process.env.IMAGE_GENERATE_MAX_QUEUE || ''), 10);
  return Number.isFinite(v) && v >= 0 ? v : 40;
})();
const imageGenerateLimiter = createSemaphore(IMAGE_GENERATE_MAX_CONCURRENCY, IMAGE_GENERATE_MAX_QUEUE);

const callSiliconFlowChat = async ({
  messages,
  timeoutMs,
  maxTokens,
  model,
  enableThinking,
  responseFormat,
  temperature,
  topP,
  topK,
  minP,
  signal,
  skipRateGate = false,
  credential = SILICONFLOW_API_KEY,
  chatUrl = SILICONFLOW_CHAT_COMPLETIONS_URL,
  fetcher = fetchWithTimeout,
  allowedModel = FIXED_SILICONFLOW_CHAT_MODEL,
  includeThinking = true,
  providerName = 'SiliconFlow',
  missingCredentialCode = 'MISSING_SILICONFLOW_API_KEY',
  rateGate = withSiliconflowRateGate,
  fetchImpl = siliconFlowFetch
}) => {
  if (!credential) {
    const err = new Error(missingCredentialCode);
    err.code = missingCredentialCode;
    throw err;
  }

  const invoke = async () => {
    const startedAt = Date.now();
    const requestedModel = String(model || '').trim();
    const resolvedModel = requestedModel || allowedModel;
    if (resolvedModel !== allowedModel) {
      const err = new Error('MODEL_NOT_ALLOWED');
      err.code = 'MODEL_NOT_ALLOWED';
      throw err;
    }
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credential}`
    };

    // SiliconFlow's supported OpenAI-compatible chat endpoint is /chat/completions.
    // The legacy /messages probe could consume the whole request timeout before the
    // supported endpoint was attempted.
    const tryUrls = [chatUrl];
    const failures = [];

    const isRpmLimit = (raw) => {
      const s = String(raw || '').toLowerCase();
      return s.includes('rpm limit exceeded') || s.includes('identity verification');
    };

    for (const url of tryUrls) {
      try {
        const response = await fetcher(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: resolvedModel,
              messages,
              max_tokens: typeof maxTokens === 'number' ? maxTokens : undefined,
              enable_thinking: includeThinking && typeof enableThinking === 'boolean'
                ? enableThinking
                : undefined,
              response_format: responseFormat === 'json_object'
                ? { type: 'json_object' }
                : undefined,
              temperature: typeof temperature === 'number' ? temperature : undefined,
              top_p: typeof topP === 'number' ? topP : undefined,
              top_k: typeof topK === 'number' ? topK : undefined,
              min_p: typeof minP === 'number' ? minP : undefined
            })
          },
          timeoutMs,
          signal,
          fetchImpl
        );

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          failures.push({
            url,
            status: response.status,
            statusText: response.statusText,
            elapsedMs: Date.now() - startedAt,
            retryAfter: String(response.headers?.get?.('retry-after') || ''),
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
        if (signal?.aborted || e?.name === 'AbortError' || e?.code === 'ABORT_ERR') throw e;
        failures.push({
          url,
          status: 0,
          statusText: '',
          elapsedMs: Date.now() - startedAt,
          error: String(e?.message || e)
        });
      }
    }

    if (
      providerName === 'SiliconFlow' &&
      failures.length &&
      failures.every((f) => Number(f?.status || 0) === 403 && isRpmLimit(f?.bodyPreview))
    ) {
      const err = new Error('SILICONFLOW_RPM_LIMIT');
      err.code = 'SILICONFLOW_RPM_LIMIT';
      err.failures = failures;
      err.retryAfter = failures.find((failure) => failure.retryAfter)?.retryAfter || '';
      throw err;
    }

    const err = new Error(`All ${providerName} endpoints failed`);
    err.failures = failures;
    err.retryAfter = failures.find((failure) => failure.retryAfter)?.retryAfter || '';
    throw err;
  };
  return skipRateGate ? invoke() : rateGate(invoke);
};

const callCloudflareChat = async (input = {}) => {
  const accountId = String(
    input.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || CLOUDFLARE_ACCOUNT_ID || ''
  ).trim();
  if (!/^[0-9a-f]{32}$/i.test(accountId)) {
    const error = new Error('CLOUDFLARE_ACCOUNT_ID_INVALID');
    error.code = 'CLOUDFLARE_ACCOUNT_ID_INVALID';
    throw error;
  }
  const attestedAccountId = String(
    input.freeAccountId || process.env.AGENT_CLOUDFLARE_FREE_ACCOUNT_ID ||
      AGENT_CLOUDFLARE_FREE_ACCOUNT_ID || ''
  ).trim();
  const freeAccountAttested = input.freeAccountAttested ??
    process.env.AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED ??
    AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED;
  if (
    !/^(1|true|yes|on)$/i.test(String(freeAccountAttested || '')) ||
    attestedAccountId !== accountId
  ) {
    const error = new Error('AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED');
    error.code = 'AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED';
    throw error;
  }
  const model = '@cf/openai/gpt-oss-120b';
  try {
    return await callSiliconFlowChat({
      ...input,
      model: input.model || model,
      minP: undefined,
      credential: input.credential || process.env.CLOUDFLARE_API_TOKEN ||
        process.env.CLOUDFLARE_AUTH_TOKEN || CLOUDFLARE_API_TOKEN || '',
      chatUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
      allowedModel: model,
      includeThinking: false,
      providerName: 'Cloudflare',
      missingCredentialCode: 'MISSING_CLOUDFLARE_API_TOKEN',
      rateGate: withCloudflareRateGate
    });
  } catch (error) {
    throw normalizeCloudflareFailure(error);
  }
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
  signal,
  credential = SILICONFLOW_API_KEY,
  imageUrl = SILICONFLOW_IMAGES_GENERATIONS_URL,
  fetcher = fetchWithTimeout,
  env = process.env
}) => {
  return await imageGenerateLimiter.run(async () => {
    if (!credential) {
      const err = new Error('MISSING_SILICONFLOW_API_KEY');
      err.code = 'MISSING_SILICONFLOW_API_KEY';
      throw err;
    }

    const startedAt = Date.now();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credential}`
    };

    const p = String(prompt || '').trim();
    if (!p) {
      const err = new Error('EMPTY_PROMPT');
      err.code = 'EMPTY_PROMPT';
      throw err;
    }

    const imageInputs = Array.isArray(images) ? images : [];
    if (imageInputs.length > 1) {
      const err = new Error('REFERENCE_IMAGES_NOT_SUPPORTED');
      err.code = 'REFERENCE_IMAGES_NOT_SUPPORTED';
      throw err;
    }
    const imgs = imageInputs.map(toSiliconflowImage).filter(Boolean);
    if (imgs.length !== imageInputs.length) {
      const err = new Error('INVALID_REFERENCE_IMAGE');
      err.code = 'INVALID_REFERENCE_IMAGE';
      throw err;
    }
    const preferredModel = String(model || '').trim();
    if (preferredModel && preferredModel !== FIXED_SILICONFLOW_IMAGE_MODEL) {
      const err = new Error('MODEL_NOT_ALLOWED');
      err.code = 'MODEL_NOT_ALLOWED';
      throw err;
    }
    const resolvedModel = preferredModel || FIXED_SILICONFLOW_IMAGE_MODEL;
    if (isDeployedRuntime(env)) {
      let parsedImageUrl;
      try {
        parsedImageUrl = new URL(String(imageUrl || '').trim());
      } catch {
        parsedImageUrl = null;
      }
      if (
        !parsedImageUrl ||
        parsedImageUrl.protocol !== 'https:' ||
        parsedImageUrl.origin !== 'https://api.siliconflow.cn' ||
        parsedImageUrl.pathname.replace(/\/+$/, '') !== '/v1/images/generations' ||
        parsedImageUrl.username ||
        parsedImageUrl.password ||
        parsedImageUrl.search ||
        parsedImageUrl.hash
      ) {
        const err = new Error('PROVIDER_ENDPOINT_INVALID');
        err.code = 'PROVIDER_ENDPOINT_INVALID';
        throw err;
      }
    }
    const modelCandidates = [resolvedModel];

    const isModelNotFound = (raw) => {
      const s = String(raw || '').toLowerCase();
      if (!s) return false;
      return s.includes('model') && (s.includes('not exist') || s.includes('not found') || s.includes('invalid'));
    };
    const isRpmLimit = (raw) => {
      const s = String(raw || '').toLowerCase();
      return s.includes('rpm limit exceeded') || s.includes('identity verification');
    };

    const buildBody = (model) => {
      const m = String(model || '').trim();
      const body = {
        model: m,
        batch_size: 1,
        prompt: p,
        negative_prompt: String(negativePrompt || '').trim() || undefined,
        num_inference_steps:
          typeof params?.steps === 'number' && Number.isFinite(params.steps) ? params.steps : undefined,
        seed:
          typeof params?.seed === 'number' && Number.isFinite(params.seed) ? Math.trunc(params.seed) : undefined
      };
      body.image_size = String(params?.imageSize || '').trim() || '1024x1024';
      body.guidance_scale =
        typeof params?.guidanceScale === 'number' && Number.isFinite(params.guidanceScale)
          ? params.guidanceScale
          : undefined;
      if (imgs[0]) body.image = imgs[0];
      return body;
    };

    let lastErr = null;
    for (const modelName of modelCandidates) {
      const body = buildBody(modelName);
      const response = await fetcher(
        imageUrl,
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
        if (response.status === 403 && isRpmLimit(raw)) {
          const err = new Error('SILICONFLOW_RPM_LIMIT');
          err.code = 'SILICONFLOW_RPM_LIMIT';
          err.status = 429;
          err.retryAfter = String(response.headers?.get?.('retry-after') || '');
          err.bodyPreview = String(raw || '').slice(0, 1800);
          err.elapsedMs = Date.now() - startedAt;
          err.modelTried = String(modelName || '').trim();
          lastErr = err;
          throw err;
        }
        const err = new Error(`SILICONFLOW_IMAGE_${response.status}`);
        err.code = `SILICONFLOW_IMAGE_${response.status}`;
        err.status = response.status;
        err.retryAfter = String(response.headers?.get?.('retry-after') || '');
        err.bodyPreview = String(raw || '').slice(0, 1800);
        err.elapsedMs = Date.now() - startedAt;
        err.modelTried = String(modelName || '').trim();
        lastErr = err;
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
  }, signal);
};

const callTextGenerate = async ({
  contents,
  timeoutMs,
  reactionMode,
  model = FIXED_CLOUDFLARE_CHAT_MODEL,
  chatGenerate = callCloudflareChat,
  providerName = 'cloudflare',
  // Server-side wrappers may resolve credentials from macOS Keychain rather
  // than process.env.  Let the caller attest readiness without leaking the
  // credential itself; legacy callers continue to use env-based detection.
  providerReady
}) => {
  const requestedProvider = String(providerName || '').trim().toLowerCase();
  const canSiliconflow = requestedProvider === 'siliconflow' && (
    providerReady === undefined ? Boolean(SILICONFLOW_API_KEY) : providerReady === true
  );
  const cloudflareText = String(providerName || '').trim().toLowerCase() === 'cloudflare' ||
    String(model || '').trim() === '@cf/openai/gpt-oss-120b';
  const canCloudflare = cloudflareText && (
    providerReady === undefined
      ? Boolean(process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AUTH_TOKEN || CLOUDFLARE_API_TOKEN)
      : providerReady === true
  );
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
    const cloudflareText = String(providerName || '').trim().toLowerCase() === 'cloudflare' ||
      String(preferredModel || '').trim() === '@cf/openai/gpt-oss-120b';
    const resolvedModel = preferredModel || (cloudflareText
      ? '@cf/openai/gpt-oss-120b'
      : FIXED_SILICONFLOW_CHAT_MODEL);
    const { text, usage, model: modelUsed, usedUrl } = await chatGenerate({
      messages: toSiliconflowMessages(),
      timeoutMs: sfTimeoutMs,
      maxTokens: reactionMode ? 512 : 2048,
      model: resolvedModel,
      enableThinking: false
    });
    return {
      text,
      provider: cloudflareText ? 'cloudflare' : 'siliconflow',
      usage,
      model: modelUsed,
      usedUrl
    };
  };

  const isRetryableSf = (e) => {
    const failures = Array.isArray(e?.failures) ? e.failures : [];
    return failures.some((f) => {
      const s = Number(f?.status || 0);
      return s === 0 || s === 403 || s === 429 || s === 502 || s === 503 || s === 504;
    });
  };

  return await textGenerateLimiter.run(async () => {
    if (cloudflareText && providerReady === false) {
      const error = new Error('AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED');
      error.code = 'AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED';
      error.status = 503;
      error.retryable = false;
      throw error;
    }
    if (canSiliconflow || canCloudflare) {
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
        throw err;
      }
    }

    return { text: '', provider: 'offline', usage: null, model: 'offline', usedUrl: '' };
  });
};

module.exports = {
  callCloudflareChat,
  callSiliconFlowChat,
  callSiliconFlowImageGenerate,
  callTextGenerate,
  createSemaphore
};
