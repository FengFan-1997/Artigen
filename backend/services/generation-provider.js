const zlib = require('zlib');
const { ApiError } = require('../lib/api-error');
const {
  GENERATION_DIRECTIONS_MODEL,
  GENERATION_IMAGE_MODEL
} = require('./generation-profiles');

const PLACEHOLDER_SECRET_RE = /^(?:<.*>|changeme|replace_me|your[_-].*|placeholder.*)$/i;

const configuredSecret = (value) => {
  const secret = String(value || '').trim();
  return Boolean(secret && !PLACEHOLDER_SECRET_RE.test(secret));
};

const providerError = (code, status = 502, retryable = false) => {
  return new ApiError(status, code, { retryable });
};

const isAbortError = (error, signal) => Boolean(
  signal?.aborted || error?.code === 'TASK_CANCELLED'
);

const mapProviderError = (error, signal) => {
  if (isAbortError(error, signal)) {
    const aborted = new Error('TASK_CANCELLED');
    aborted.name = 'AbortError';
    aborted.code = 'TASK_CANCELLED';
    return aborted;
  }
  if (error instanceof ApiError) return error;
  const code = String(error?.code || error?.message || '').trim().toUpperCase();
  const preview = String(error?.bodyPreview || '').toLowerCase();
  const status = Number(error?.status || 0);
  // Cloudflare's free-tier terminal responses carry HTTP statuses that would
  // otherwise be normalized into generic retryable errors. Preserve the
  // provider-specific fail-closed codes before broad status handling.
  if (code === 'AGENT_CLOUDFLARE_FREE_QUOTA_EXHAUSTED') {
    return providerError(code, status === 403 ? 403 : 429, false);
  }
  if (code === 'AGENT_CLOUDFLARE_PAID_MODEL_FORBIDDEN') {
    return providerError(code, status >= 400 && status < 500 ? status : 403, false);
  }
  if (
    code.includes('CONTENT_POLICY') ||
    code.includes('SAFETY') ||
    /content\s*(?:policy|moderation)|safety|nsfw|inappropriate/.test(preview)
  ) {
    return providerError('CONTENT_POLICY_REJECTED', 422, false);
  }
  if (
    code.includes('TIMEOUT') ||
    error?.name === 'AbortError' ||
    code === 'ABORT_ERR' ||
    status === 408 || status === 504
  ) {
    return providerError('PROVIDER_TIMEOUT', 504, true);
  }
  if (status === 429) {
    return new ApiError(429, 'PROVIDER_RATE_LIMITED', {
      retryable: true,
      details: {
        retryAfter: String(error?.retryAfter || '')
      }
    });
  }
  if (
    code.includes('MISSING_SILICONFLOW_API_KEY') ||
    code.includes('MODEL_NOT_FOUND') ||
    (status === 400 && /model.*(?:not exist|not found|invalid)/.test(preview))
  ) {
    return providerError('MODEL_PROFILE_UNAVAILABLE', 503, true);
  }
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return providerError('PROVIDER_REJECTED', status, false);
  }
  return providerError('PROVIDER_FAILED', 502, true);
};

const cleanDirectionText = (value, maxLength) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text && text.length <= maxLength ? text : '';
};

const parseDirectionsResponse = (raw) => {
  const source = String(raw || '').trim();
  if (!source) throw providerError('OUTPUT_INVALID');
  const unfenced = source
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const arrayStart = unfenced.indexOf('[');
  const arrayEnd = unfenced.lastIndexOf(']');
  const objectStart = unfenced.indexOf('{');
  const objectEnd = unfenced.lastIndexOf('}');
  let candidate = unfenced;
  if (arrayStart >= 0 && arrayEnd > arrayStart && (objectStart < 0 || arrayStart < objectStart)) {
    candidate = unfenced.slice(arrayStart, arrayEnd + 1);
  } else if (objectStart >= 0 && objectEnd > objectStart) {
    candidate = unfenced.slice(objectStart, objectEnd + 1);
  }
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw providerError('OUTPUT_INVALID');
  }
  const directions = Array.isArray(parsed) ? parsed : parsed?.directions;
  if (!Array.isArray(directions) || directions.length !== 4) {
    throw providerError('OUTPUT_INVALID');
  }
  const normalized = directions.map((direction, index) => {
    if (!direction || typeof direction !== 'object' || Array.isArray(direction)) {
      throw providerError('OUTPUT_INVALID');
    }
    const title = cleanDirectionText(direction.title, 100);
    const summary = cleanDirectionText(direction.summary, 400);
    const prompt = cleanDirectionText(direction.prompt, 2000);
    if (!title || !summary || !prompt) throw providerError('OUTPUT_INVALID');
    return { id: `direction-${index + 1}`, title, summary, prompt };
  });
  return normalized;
};

const parseJsonObjectResponse = (raw) => {
  const source = String(raw || '').trim();
  if (!source) throw providerError('OUTPUT_INVALID');
  const unfenced = source
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw providerError('OUTPUT_INVALID');
  try {
    const parsed = JSON.parse(unfenced.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw providerError('OUTPUT_INVALID');
    }
    return parsed;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw providerError('OUTPUT_INVALID');
  }
};

const productProfileText = (profile) => {
  if (!profile || typeof profile !== 'object') return '{}';
  return JSON.stringify(profile);
};

const buildDirectionsMessages = ({ prompt, locale, productProfile }) => {
  const language = locale === 'zh' ? 'Simplified Chinese' : 'English';
  return [
    {
      role: 'system',
      content: [
        'You are an e-commerce art director.',
        `Return JSON only in ${language}.`,
        'Return exactly {"directions":[{"title":"...","summary":"...","prompt":"..."}]} with exactly four items.',
        'Each direction must be visually distinct and directly usable as an image-generation prompt.',
        'Treat every product fact as closed-world data: use only facts supplied by the user.',
        'Never invent ingredients, specifications, certifications, logos, brand claims, prices, or product features.',
        'Do not include markdown or commentary outside the JSON.'
      ].join(' ')
    },
    {
      role: 'user',
      content: `REQUEST:\n${prompt}\n\nPRODUCT_PROFILE_JSON:\n${productProfileText(productProfile)}`
    }
  ];
};

const positiveTimeout = (value, fallback, minimum) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
};

const createSiliconFlowGenerationProvider = ({
  imageGenerate,
  chatGenerate,
  env = process.env,
  configured,
  fetcher = globalThis.fetch
} = {}) => {
  const imageCredential = String(
    env.SILICONFLOW_API_KEY || env.SILICONFLOW_TOKEN || env.SILICONFLOW_KEY || ''
  ).trim();
  // Deployed environments default to the free Cloudflare text runtime even
  // when the optional provider variable is omitted. Test fixtures may omit it
  // to exercise the legacy SiliconFlow image-only adapter explicitly.
  const appEnvironment = String(env.APP_ENV || '').trim().toLowerCase();
  const nodeEnvironment = String(env.NODE_ENV || '').trim().toLowerCase();
  const deploymentIntent = ['production', 'prod', 'dev', 'development', 'staging'].includes(nodeEnvironment) ||
    ['production', 'prod', 'dev', 'development', 'staging'].includes(appEnvironment);
  // Only the explicitly local fixture environments may exercise the legacy
  // SiliconFlow text adapter.  Keep this rule in sync with the configured
  // provider wrapper so direct tool-task construction cannot bypass the
  // deployment hard lock when NODE_ENV=test is paired with staging or
  // production deployment intent.
  const testFixtureRuntime = nodeEnvironment === 'test' &&
    ['', 'dev', 'development'].includes(appEnvironment);
  const deployedTextRuntime = deploymentIntent && !testFixtureRuntime;
  const configuredProvider = String(
    env.AGENT_MODEL_PROVIDER || (deployedTextRuntime ? 'cloudflare' : '')
  ).trim().toLowerCase();
  const cloudflareText = configuredProvider === 'cloudflare';
  const forbiddenDeployedTextProvider = deployedTextRuntime && configuredProvider !== 'cloudflare';
  const cloudflareFreeAccountId = String(env.AGENT_CLOUDFLARE_FREE_ACCOUNT_ID || '').trim();
  const cloudflareAccountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const cloudflareFreeAccountAttested = /^(1|true|yes|on)$/i.test(
    String(env.AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED || '')
  ) && /^[0-9a-f]{32}$/i.test(cloudflareAccountId) &&
    cloudflareFreeAccountId === cloudflareAccountId;
  const textCredential = cloudflareText
    ? String(env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_AUTH_TOKEN || '').trim()
    : imageCredential;
  const hasCredential = typeof configured === 'boolean'
    ? configured
    : configuredSecret(textCredential) && configuredSecret(imageCredential);
  const available = Boolean(
    hasCredential && imageGenerate && chatGenerate &&
    (!cloudflareText || cloudflareFreeAccountAttested) &&
    !forbiddenDeployedTextProvider
  );
  const assertAvailable = () => {
    if (forbiddenDeployedTextProvider) {
      throw providerError('AGENT_CLOUDFLARE_TEXT_MODEL_REQUIRED', 503, false);
    }
    if (cloudflareText && !cloudflareFreeAccountAttested) {
      throw providerError('AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED', 503, false);
    }
    if (!available) throw providerError('MODEL_PROFILE_UNAVAILABLE', 503, true);
  };
  return Object.freeze({
    // The adapter remains the image-generation boundary, but its text side is
    // Cloudflare when the deployment selects the free GPT-OSS profile.
    kind: cloudflareText ? 'cloudflare-hybrid' : 'siliconflow',
    available,
    async checkAvailability({ profile } = {}) {
      if (forbiddenDeployedTextProvider) {
        return { ok: false, code: 'AGENT_CLOUDFLARE_TEXT_MODEL_REQUIRED' };
      }
      if (cloudflareText && !cloudflareFreeAccountAttested) {
        return { ok: false, code: 'AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED' };
      }
      assertAvailable();
      if (typeof fetcher !== 'function') {
        return { ok: false, code: 'PROVIDER_HEALTHCHECK_UNAVAILABLE' };
      }
      let endpoint;
      try {
        const base = new URL(String(
          cloudflareText
            ? `https://api.cloudflare.com/client/v4/accounts/${String(env.CLOUDFLARE_ACCOUNT_ID || '').trim()}`
            : (env.SILICONFLOW_API_BASE || 'https://api.siliconflow.cn/v1')
        ).trim());
        if (
          cloudflareText &&
          !/^[0-9a-f]{32}$/i.test(String(env.CLOUDFLARE_ACCOUNT_ID || '').trim())
        ) {
          return { ok: false, code: 'PROVIDER_ENDPOINT_INVALID' };
        }
        if (
          !cloudflareText &&
          deployedTextRuntime &&
          (base.origin !== 'https://api.siliconflow.cn' || base.pathname.replace(/\/+$/, '') !== '/v1')
        ) {
          return { ok: false, code: 'PROVIDER_ENDPOINT_INVALID' };
        }
        if (cloudflareText) {
          endpoint = new URL(`${base.pathname.replace(/\/+$/, '')}/ai/models/search`, base.origin);
          endpoint.searchParams.set('search', GENERATION_DIRECTIONS_MODEL);
        } else {
          endpoint = new URL(`${base.pathname.replace(/\/+$/, '')}/models`, base.origin);
        }
      } catch {
        return { ok: false, code: 'PROVIDER_ENDPOINT_INVALID' };
      }
      const controller = new AbortController();
      const timeoutMs = positiveTimeout(env.PROVIDER_HEALTHCHECK_TIMEOUT_MS, 8_000, 2_000);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      timeout.unref?.();
      try {
        const response = await fetcher(endpoint.toString(), {
          method: 'GET',
          redirect: 'error',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${textCredential}`
          },
          signal: controller.signal
        });
        if ([401, 403].includes(Number(response?.status || 0))) {
          return { ok: false, code: 'PROVIDER_CREDENTIAL_INVALID' };
        }
        if (!response?.ok) return { ok: false, code: 'PROVIDER_UNAVAILABLE' };
        const body = await response.json().catch(() => null);
        const modelIds = new Set(
          Array.isArray(body?.data)
            ? body.data.map((item) => String(item?.id || '').trim()).filter(Boolean)
            : Array.isArray(body?.result)
              ? body.result.map((item) => String(item?.id || item?.name || item?.model || '').trim()).filter(Boolean)
              : []
        );
        const requiredTextModels = cloudflareText
          ? [GENERATION_DIRECTIONS_MODEL]
          : [GENERATION_DIRECTIONS_MODEL, GENERATION_IMAGE_MODEL];
        if (!modelIds.size || requiredTextModels.some((model) => !modelIds.has(model))) {
          return { ok: false, code: 'MODEL_PROFILE_UNAVAILABLE' };
        }
        if (cloudflareText) {
          // Image generation remains on SiliconFlow/Kolors. Probe that model
          // separately so a healthy text endpoint cannot mask an unavailable
          // image provider.
          const imageBase = new URL(String(
            env.SILICONFLOW_API_BASE || 'https://api.siliconflow.cn/v1'
          ).trim());
          if (
            deployedTextRuntime &&
            (imageBase.origin !== 'https://api.siliconflow.cn' || imageBase.pathname.replace(/\/+$/, '') !== '/v1')
          ) {
            return { ok: false, code: 'PROVIDER_ENDPOINT_INVALID' };
          }
          const imageResponse = await fetcher(
            new URL(`${imageBase.pathname.replace(/\/+$/, '')}/models`, imageBase.origin).toString(),
            {
              method: 'GET',
              redirect: 'error',
              headers: {
                accept: 'application/json',
                authorization: `Bearer ${imageCredential}`
              },
              signal: controller.signal
            }
          );
          if ([401, 403].includes(Number(imageResponse?.status || 0))) {
            return { ok: false, code: 'PROVIDER_CREDENTIAL_INVALID' };
          }
          if (!imageResponse?.ok) return { ok: false, code: 'PROVIDER_UNAVAILABLE' };
          const imageBody = await imageResponse.json().catch(() => null);
          const imageIds = new Set(
            Array.isArray(imageBody?.data)
              ? imageBody.data.map((item) => String(item?.id || '').trim()).filter(Boolean)
              : []
          );
          if (!imageIds.has(GENERATION_IMAGE_MODEL)) {
            return { ok: false, code: 'MODEL_PROFILE_UNAVAILABLE' };
          }
        }
        return { ok: true, kind: cloudflareText ? 'cloudflare-hybrid' : 'siliconflow', profile: profile?.id || null };
      } catch {
        return { ok: false, code: 'PROVIDER_UNAVAILABLE' };
      } finally {
        clearTimeout(timeout);
      }
    },
    async generateDirections({ prompt, locale, productProfile, profile, signal }) {
      assertAvailable();
      if (profile?.internalDirectionsModel !== GENERATION_DIRECTIONS_MODEL) {
        throw providerError('MODEL_PROFILE_UNAVAILABLE', 503, false);
      }
      try {
        const response = await chatGenerate({
          messages: buildDirectionsMessages({ prompt, locale, productProfile }),
          timeoutMs: positiveTimeout(env.AI_DIRECTIONS_TIMEOUT_MS, 120_000, 5_000),
          maxTokens: 1800,
          model: profile.internalDirectionsModel,
          enableThinking: false,
          signal
        });
        return parseDirectionsResponse(response?.text);
      } catch (error) {
        throw mapProviderError(error, signal);
      }
    },
    async generateImage({ prompt, profile, aspectRatio, seed, images, signal, runId, runtimeVersion }) {
      assertAvailable();
      const references = Array.isArray(images) ? images.filter(Boolean) : [];
      if (references.length > Number(profile?.maxReferences || 0)) {
        throw providerError('REFERENCE_IMAGES_NOT_SUPPORTED', 400, false);
      }
      const model = references.length ? profile?.internalEditModel : profile?.internalTextModel;
      if (model !== GENERATION_IMAGE_MODEL) {
        throw providerError('MODEL_PROFILE_UNAVAILABLE', 503, false);
      }
      try {
        return await imageGenerate({
          prompt,
          negativePrompt: [
            'low quality, blurry, distorted product, duplicate product, altered logo,',
            'misspelled text, invented label text, watermark, unintended border'
          ].join(' '),
          params: {
            imageSize: profile.imageSizes[aspectRatio],
            seed
          },
          images: references,
          timeoutMs: positiveTimeout(env.AI_IMAGE_TIMEOUT_MS, 120_000, 10_000),
          model,
          runId: runId || null,
          runtimeVersion: Number(runtimeVersion) === 2 ? 2 : 1,
          allowModelFallback: false,
          signal
        });
      } catch (error) {
        throw mapProviderError(error, signal);
      }
    },
    async organizeIngredientSource({ messages, profile, signal }) {
      assertAvailable();
      try {
        const response = await chatGenerate({
          messages,
          timeoutMs: positiveTimeout(env.AI_INGREDIENT_TIMEOUT_MS, 120_000, 5_000),
          maxTokens: 2200,
          model: profile.internalDirectionsModel,
          enableThinking: false,
          signal
        });
        return parseJsonObjectResponse(response?.text);
      } catch (error) {
        throw mapProviderError(error, signal);
      }
    }
  });
};

let crcTable;
const getCrcTable = () => {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    crcTable[index] = value >>> 0;
  }
  return crcTable;
};

const crc32 = (buffer) => {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
};

const MOCK_SIZE_BY_RATIO = Object.freeze({
  '1:1': [16, 16],
  '4:5': [16, 20],
  '3:4': [15, 20],
  '16:9': [32, 18],
  '9:16': [18, 32]
});

const createMockPngDataUrl = (aspectRatio) => {
  const [width, height] = MOCK_SIZE_BY_RATIO[aspectRatio] || MOCK_SIZE_BY_RATIO['1:1'];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 4;
      row[offset] = 11;
      row[offset + 1] = 13;
      row[offset + 2] = 14;
      row[offset + 3] = 255;
    }
    rows.push(row);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
};

const createContractMockGenerationProvider = () => Object.freeze({
  kind: 'contract-mock',
  available: true,
  async generateDirections({ locale }) {
    const zh = locale === 'zh';
    return Array.from({ length: 4 }, (_, index) => ({
      id: `direction-${index + 1}`,
      title: zh ? `视觉方向 ${index + 1}` : `Visual direction ${index + 1}`,
      summary: zh ? '契约测试用的受控视觉方向。' : 'A controlled visual direction for contract testing.',
      prompt: zh
        ? `保持用户提供的商品事实，创建第 ${index + 1} 个电商视觉方向。`
        : `Preserve supplied product facts and create e-commerce visual direction ${index + 1}.`
    }));
  },
  async generateImage({ aspectRatio, seed }) {
    return {
      data: {
        images: [{ url: createMockPngDataUrl(aspectRatio) }],
        seed
      },
      modelUsed: 'contract-mock'
    };
  },
  async organizeIngredientSource({ sourceText, productType }) {
    const layoutType = productType === 'Drug'
      ? 'drug_facts'
      : productType === 'Dietary Supplement'
        ? 'supplement_facts'
        : 'standard';
    return {
      layoutType,
      sections: [{ title: 'SOURCE TEXT', content: [String(sourceText || '').trim()] }]
    };
  }
});

const createConfiguredGenerationProvider = ({
  imageGenerate,
  chatGenerate,
  env = process.env,
  configured,
  fetcher
} = {}) => {
  // Contract mocks are for isolated test fixtures only.  APP_ENV is part of
  // the deployment boundary as well: a development-mode process pointed at a
  // production/dev deployment must never silently expose the mock provider.
  const nodeEnv = String(env.NODE_ENV || 'development').trim().toLowerCase();
  const appEnv = String(env.APP_ENV || '').trim().toLowerCase();
  const deployedEnvironment = ['production', 'prod', 'dev', 'development', 'staging'].includes(nodeEnv) ||
    ['production', 'prod', 'dev', 'development', 'staging'].includes(appEnv);
  const useMock = nodeEnv !== 'production' && !deployedEnvironment &&
    /^(1|true)$/i.test(String(env.AI_GENERATION_CONTRACT_MOCK || '').trim());
  if (useMock) return createContractMockGenerationProvider();
  return createSiliconFlowGenerationProvider({
    imageGenerate,
    chatGenerate,
    env,
    configured,
    fetcher
  });
};

module.exports = {
  buildDirectionsMessages,
  configuredSecret,
  createConfiguredGenerationProvider,
  createContractMockGenerationProvider,
  createMockPngDataUrl,
  createSiliconFlowGenerationProvider,
  mapProviderError,
  parseDirectionsResponse,
  parseJsonObjectResponse
};
