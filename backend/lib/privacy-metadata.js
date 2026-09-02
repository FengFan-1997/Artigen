const crypto = require('crypto');

const MAX_COUNT = 1_000_000_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KNOWN_CATEGORIES = new Set([
  'ok', 'empty', 'error', 'failed', 'success', 'cancelled', 'unknown', 'queued', 'running',
  'event', 'generate', 'generation', 'image', 'img2img', 'ingredient_label', 'tool_task',
  'aidesign', 'aidesign_quick', 'aidesign_generate', 'aidesign_semantic', 'aidesign_directions',
  'aidesign_deep_analysis', 'aidesign_final', 'aidesign_deep_generate', 'agentimg_directions',
  'agentimg_final', 'agentimg_ingredient_label', 'ai_lab', 'ai_image_workshop', 'ai_design',
  'ai_background', 'ai_id_photo', 'id_photo', 'ai_old_photo', 'old_photo', 'ai_ingredient_list',
  'site_analytics', 'frontend', 'web', 'workshop', 'editor', 'api', 'legacy', 'local', 'cloud',
  'compact', 'standard', 'detailed', 'single_column', 'two_column', 'grid'
]);
const KNOWN_ANALYTICS_LABELS = new Set([
  ...KNOWN_CATEGORIES,
  'funnel', 'conversion', 'navigation', 'page_view', 'ui_click', 'tools_click',
  'tools_chip_click', 'tools_conversion', 'ai_generate_click', 'ai_generate_request',
  'ai_generate_success', 'ai_generate_fail', 'ai_generate_abort', 'pay_create_order_start',
  'pay_create_order_success', 'pay_create_order_fail', 'image_batch', 'image-batch', 'privacy_redaction',
  'video_frames', 'pdf_images', 'pdf_text_word', 'document_pdf', 'video_gif', 'favicon_ico',
  'resize', 'rotate', 'crop', 'filter', 'watermark', 'webp', 'jpeg', 'pdf', 'img2pdf', 'pdf2word',
  'word2pdf', 'txt2pdf', 'gif', 'ico', 'starter', 'standard', 'pro', 'ultimate', 'test',
  'zh', 'en', 'desktop', 'mobile', 'tablet', 'organic', 'search', 'link'
]);
const SAFE_QUERY_KEYS = new Set(['lang', 'tool', 'operation', 'mode', 'utm_source', 'utm_medium']);
const SAFE_PATH_SEGMENTS = new Set([
  'api', 'artigen', 'ai', 'tools', 'editor', 'image-workshop', 'market', 'account', 'login',
  'console', 'dashboard', 'usage', 'audit', 'results', 'legal', 'privacy', 'terms', 'health',
  'collection', 'event', 'events', 'assets', 'tool-tasks', 'images', 'history'
]);
const SAFE_PAYLOAD_KEYS = new Map([
  ['category', 'category'], ['toolid', 'toolId'], ['packageid', 'packageId'],
  ['operation', 'operation'], ['status', 'status'], ['code', 'code'], ['target', 'target'],
  ['pagepath', 'pagePath'], ['path', 'path'], ['route', 'route'], ['source', 'source'],
  ['mode', 'mode'], ['format', 'format'], ['count', 'count'], ['durationms', 'durationMs'],
  ['width', 'width'], ['height', 'height'], ['quality', 'quality'], ['scale', 'scale'],
  ['success', 'success'], ['local', 'local'], ['cloud', 'cloud'], ['viewport', 'viewport']
]);

const serializeMetadata = (value) => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value ?? '');
  }
};

const hashMetadata = (value, namespace = 'content') => {
  const raw = serializeMetadata(value);
  if (!raw || raw === 'null') return '';
  return crypto
    .createHash('sha256')
    .update(`${namespace}\0${raw}`, 'utf8')
    .digest('hex');
};

const contentMetadata = (value, prefix) => {
  const raw = value == null ? '' : serializeMetadata(value);
  if (!raw) return {};
  return {
    [`${prefix}Len`]: raw.length,
    [`${prefix}Hash`]: hashMetadata(raw, prefix)
  };
};

const clampNumber = (value, min = 0, max = MAX_COUNT) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, number));
};

const normalizeCategory = (value, fallback = '') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return normalized || fallback;
};

const categoryMetadata = (value, key, fallback = '') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback ? { [key]: fallback } : {};
  const normalized = normalizeCategory(raw);
  const category = KNOWN_CATEGORIES.has(normalized) ? normalized : (fallback || 'other');
  return {
    [key]: category,
    ...(category === normalized && raw.length <= 64 ? {} : {
      [`${key}Hash`]: hashMetadata(raw, key)
    })
  };
};

const opaqueReference = (value, prefix = 'ref') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (UUID_RE.test(raw)) return raw.toLowerCase();
  const safePrefix = normalizeCategory(prefix, 'ref').replace(/[^a-z0-9_]/g, '_').slice(0, 20);
  if (new RegExp(`^${safePrefix}_[0-9a-f]{24}$`, 'i').test(raw)) return raw.toLowerCase();
  return `${safePrefix}_${hashMetadata(raw, safePrefix).slice(0, 24)}`;
};

const classifyProvider = (value) => {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('siliconflow')) return 'siliconflow';
  if (raw.includes('cloudflare')) return 'cloudflare';
  if (raw.includes('gemini') || raw.includes('google')) return 'gemini';
  if (raw.includes('openai')) return 'openai';
  if (raw.includes('local') || raw.includes('browser')) return 'local';
  if (raw.includes('text')) return 'text';
  return raw ? 'other' : '';
};

const classifyModel = (value) => {
  const raw = String(value || '').toLowerCase();
  const families = ['gpt-oss', 'cloudflare', 'gemini', 'qwen', 'flux', 'kolors', 'stable-diffusion', 'sdxl', 'deepseek'];
  return families.find((family) => raw.includes(family)) || (raw ? 'other' : '');
};

const classifyUserAgent = (value) => {
  const ua = String(value || '').toLowerCase();
  if (!ua) return '';
  if (/bot|crawler|spider|slurp/.test(ua)) return 'bot';
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobile|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
};

const networkMetadata = ({ ip, ua } = {}) => ({
  ...(ip ? { ipHash: hashMetadata(String(ip), 'ip') } : {}),
  ...(ua ? { deviceCategory: classifyUserAgent(ua) } : {})
});

const preservedNetworkMetadata = (entry) => {
  const ipHash = String(entry?.ipHash || '').trim().toLowerCase();
  const deviceCategory = normalizeCategory(entry?.deviceCategory);
  return {
    ...networkMetadata({ ip: entry?.ip, ua: entry?.ua }),
    ...(/^[0-9a-f]{64}$/.test(ipHash) ? { ipHash } : {}),
    ...(['bot', 'tablet', 'mobile', 'desktop'].includes(deviceCategory) ? { deviceCategory } : {})
  };
};

const normalizeAnalyticsKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const isSensitiveKey = (value) => {
  const key = normalizeAnalyticsKey(value);
  return !key || key === 'auth' || key === 'authorization' || key === 'code' || key === 'otp' ||
    key === 'sig' || key.startsWith('img') || key.startsWith('image') || key.includes('token') ||
    key.includes('signature') || key.endsWith('uri') || key.endsWith('url') ||
    key.endsWith('password') || key.endsWith('secret') || key.endsWith('credential') ||
    key.endsWith('apikey') || ['content', 'dataurl', 'file', 'filename', 'filepath', 'input',
      'message', 'output', 'prompt', 'rawtext', 'reason', 'selector', 'src', 'text', 'usertext']
      .includes(key);
};

const sanitizeAnalyticsUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw || /^(?:data|blob|javascript):/i.test(raw)) return '';
  try {
    const url = new URL(raw, 'https://analytics.invalid');
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    let path = url.pathname.startsWith('/') ? url.pathname : `/${url.pathname}`;
    if (/\/files\//i.test(path)) path = '/files/:asset';
    path = path
      .split('/')
      .map((part) => {
        if (!part) return '';
        if (UUID_RE.test(part) || /^[0-9a-f]{24,}$/i.test(part)) return ':id';
        if (/\.[a-z0-9]{2,8}$/i.test(part)) return ':file';
        return SAFE_PATH_SEGMENTS.has(part.toLowerCase()) ? part.toLowerCase() : ':segment';
      })
      .join('/');
    const query = new URLSearchParams();
    for (const [key, paramValue] of url.searchParams.entries()) {
      const normalizedKey = normalizeCategory(key);
      const normalizedValue = normalizeCategory(paramValue);
      if (!SAFE_QUERY_KEYS.has(normalizedKey) || !KNOWN_ANALYTICS_LABELS.has(normalizedValue)) continue;
      query.append(normalizedKey, normalizedValue);
    }
    return `${path || '/'}${query.size ? `?${query.toString()}` : ''}`;
  } catch {
    return '';
  }
};

const sanitizeAnalyticsPayload = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [keyRaw, value] of Object.entries(raw).slice(0, 50)) {
    const normalizedKey = normalizeAnalyticsKey(keyRaw);
    const key = SAFE_PAYLOAD_KEYS.get(normalizedKey);
    if (!key || isSensitiveKey(keyRaw)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = Math.max(-MAX_COUNT, Math.min(MAX_COUNT, value));
      continue;
    }
    if (typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (typeof value !== 'string') continue;
    if (/Hash$/.test(key) && /^[0-9a-f]{64}$/i.test(value)) {
      out[key] = value.toLowerCase();
      continue;
    }
    const normalized = normalizeCategory(value);
    if (KNOWN_ANALYTICS_LABELS.has(normalized)) {
      out[key] = normalized;
      continue;
    }
    if (/path|location|referrer|href/i.test(key)) {
      const path = sanitizeAnalyticsUrl(value);
      if (path) out[key] = path;
      continue;
    }
    out[`${key}Hash`] = hashMetadata(value, `analytics:${key}`);
  }
  return out;
};

const sanitizeAnalyticsEvent = (entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const ts = clampNumber(entry.ts, 0, Number.MAX_SAFE_INTEGER) || Date.now();
  const eventType = normalizeCategory(entry.eventType, 'event');
  const knownEventType = KNOWN_ANALYTICS_LABELS.has(eventType);
  const existingEventTypeHash = String(entry.eventTypeHash || '').trim().toLowerCase();
  const path = sanitizeAnalyticsUrl(entry.path);
  const location = sanitizeAnalyticsUrl(entry.location);
  const referrer = sanitizeAnalyticsUrl(entry.referrer);
  const trafficSource = normalizeCategory(entry.trafficSource);
  return {
    id: opaqueReference(entry.id || `analytics:${ts}`, 'event'),
    ts,
    eventType: knownEventType ? eventType : 'event',
    ...(/^[0-9a-f]{64}$/.test(existingEventTypeHash)
      ? { eventTypeHash: existingEventTypeHash }
      : !knownEventType && entry.eventType
        ? { eventTypeHash: hashMetadata(entry.eventType, 'eventType') }
        : {}),
    payload: sanitizeAnalyticsPayload(entry.payload),
    ...(path ? { path } : {}),
    ...(location ? { location } : {}),
    ...(referrer ? { referrer } : {}),
    ...(entry.userId ? { userId: opaqueReference(entry.userId, 'user') } : {}),
    ...(entry.requestId || entry.requestRef ? { requestRef: opaqueReference(entry.requestId || entry.requestRef, 'request') } : {}),
    ...(entry.sessionId || entry.sessionRef ? { sessionRef: opaqueReference(entry.sessionId || entry.sessionRef, 'session') } : {}),
    ...(entry.projectId || entry.projectRef ? { projectRef: opaqueReference(entry.projectId || entry.projectRef, 'project') } : {}),
    ...(KNOWN_ANALYTICS_LABELS.has(trafficSource) ? { trafficSource } : {}),
    ...preservedNetworkMetadata(entry)
  };
};

const sanitizeErrorCategory = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (/CANCEL|ABORT/.test(upper)) return 'cancelled';
  if (/TIMEOUT/.test(upper)) return 'timeout';
  if (/RATE|429/.test(upper)) return 'rate_limited';
  if (/AUTH|LOGIN|UNAUTHORIZED|FORBIDDEN|401|403/.test(upper)) return 'auth';
  if (/CREDIT|BALANCE|PAYMENT/.test(upper)) return 'billing';
  if (/PERSIST|STORAGE|WRITE|EXPORT/.test(upper)) return 'storage';
  if (/EMPTY|INVALID|INPUT|MIME|SIZE/.test(upper)) return 'input';
  if (/PROVIDER|UPSTREAM|NETWORK|SERVER|BUSY|50[0234]/.test(upper)) return 'upstream';
  return 'other';
};

const sanitizeTimings = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  const allowed = new Set(['total', 'total_ms', 'queue', 'queue_ms', 'inference', 'inference_ms', 'download', 'download_ms']);
  for (const [key, value] of Object.entries(raw).slice(0, 20)) {
    const safeKey = normalizeCategory(key).replace(/[:.-]/g, '_');
    const safeValue = clampNumber(value, 0, 86_400_000);
    if (allowed.has(safeKey) && safeValue !== undefined) out[safeKey] = safeValue;
  }
  return Object.keys(out).length ? out : undefined;
};

const sanitizeParameters = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const numericKeys = new Set(['width', 'height', 'steps', 'guidanceScale', 'seed', 'quality', 'scale']);
  const out = {};
  for (const key of numericKeys) {
    const value = clampNumber(raw[key], key === 'seed' ? -MAX_COUNT : 0, MAX_COUNT);
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
};

const collectAssetReferences = (entry, fields, prefix) => {
  const refs = [];
  const seen = new Set();
  const add = (value) => {
    const ref = opaqueReference(value, 'asset');
    if (!ref || seen.has(ref)) return;
    seen.add(ref);
    refs.push(ref);
  };
  for (const field of fields) {
    const value = entry?.[field];
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 100)) {
        if (typeof item === 'string') add(item);
        else if (item && typeof item === 'object') add(item.assetId || item.sourceAssetId || item.id || item.url || item.uri);
      }
    } else if (typeof value === 'string') {
      add(value);
    } else if (value && typeof value === 'object') {
      add(value.assetId || value.sourceAssetId || value.id || value.url || value.uri);
    }
  }
  return refs.length ? { [`${prefix}AssetIds`]: refs, [`${prefix}AssetCount`]: refs.length } : {};
};

const sanitizePersistSummary = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const attempted = clampNumber(raw.attempted);
  const persisted = clampNumber(raw.persisted);
  const failed = clampNumber(raw.failed);
  const out = {
    ...(attempted !== undefined ? { attempted } : {}),
    ...(persisted !== undefined ? { persisted } : {}),
    ...(failed !== undefined ? { failed } : {})
  };
  const failures = Array.isArray(raw.failures)
    ? raw.failures.slice(0, 12).map((item) => ({
      category: sanitizeErrorCategory(item?.error),
      count: clampNumber(item?.count) || 0
    })).filter((item) => item.category && item.count > 0)
    : [];
  if (failures.length) out.failures = failures;
  return Object.keys(out).length ? out : undefined;
};

const sanitizeCommonHistoryEntry = (entry, prefix) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const ts = clampNumber(entry.ts ?? entry.timestamp, 0, Number.MAX_SAFE_INTEGER) || Date.now();
  const provider = classifyProvider(entry.provider);
  const modelFamily = classifyModel(entry.modelFamily || entry.model);
  const statusRaw = normalizeCategory(entry.status, 'unknown');
  const status = ['ok', 'empty', 'error', 'failed', 'success', 'cancelled', 'queued', 'running']
    .includes(statusRaw) ? statusRaw : 'unknown';
  const existingError = normalizeCategory(entry.errorCategory);
  const errorCategory = ['cancelled', 'timeout', 'rate_limited', 'auth', 'billing', 'storage', 'input', 'upstream', 'other']
    .includes(existingError) ? existingError : sanitizeErrorCategory(entry.error || entry.errorCode);
  const parameters = sanitizeParameters(entry.params || entry.parameters);
  const timings = sanitizeTimings(entry.timings);
  const persist = sanitizePersistSummary(entry.persist);
  const seed = clampNumber(entry.seed, -MAX_COUNT, MAX_COUNT);
  return {
    id: opaqueReference(entry.id || `${prefix}:${ts}`, prefix),
    ts,
    ...(provider ? { provider } : {}),
    ...(modelFamily ? { modelFamily } : {}),
    status,
    ...(errorCategory ? { errorCategory } : {}),
    ...(parameters ? { parameters } : {}),
    ...(timings ? { timings } : {}),
    ...(persist ? { persist } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...preservedNetworkMetadata(entry),
    ...contentMetadata(entry.prompt, 'prompt'),
    ...contentMetadata(entry.negativePrompt, 'negativePrompt'),
    ...contentMetadata(entry.userText, 'userText'),
    ...contentMetadata(entry.aiText ?? entry.output, 'output'),
    ...contentMetadata(entry.initialInput ?? entry.input, 'input'),
    ...contentMetadata(entry.pageContext, 'pageContext')
  };
};

const copyNumericMetadata = (out, entry) => {
  const fields = [
    'cost', 'creditsDelta', 'creditsPlanned', 'durationMs', 'tokensIn', 'tokensOut',
    'tokensTotal', 'promptLen', 'negativePromptLen', 'userTextLen', 'outputLen',
    'inputLen', 'initialInputLen', 'pageContextLen', 'imageCount', 'inputImageCount', 'sectionCount'
  ];
  for (const key of fields) {
    const value = clampNumber(entry?.[key], key === 'creditsDelta' ? -MAX_COUNT : 0, MAX_COUNT);
    if (value !== undefined) out[key] = value;
  }
};

const copyHashMetadata = (out, entry) => {
  for (const key of ['promptHash', 'negativePromptHash', 'userTextHash', 'outputHash', 'inputHash', 'initialInputHash', 'pageContextHash']) {
    const value = String(entry?.[key] || '').trim().toLowerCase();
    if (/^[0-9a-f]{8,64}$/.test(value)) out[key] = value;
  }
};

const copyCategoryHashes = (out, entry) => {
  for (const key of ['typeHash', 'purposeHash', 'productTypeHash', 'layoutTypeHash', 'kindHash', 'bizHash', 'requestSourceHash']) {
    const value = String(entry?.[key] || '').trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(value)) out[key] = value;
  }
};

const sanitizeImageHistoryEntry = (entry) => {
  const out = sanitizeCommonHistoryEntry(entry, 'history');
  if (!out) return null;
  Object.assign(out, categoryMetadata(entry.type, 'type', 'image'));
  Object.assign(out, categoryMetadata(entry.purpose || entry.biz, 'purpose'));
  Object.assign(out, categoryMetadata(entry.productType, 'productType'));
  copyNumericMetadata(out, entry);
  copyHashMetadata(out, entry);
  copyCategoryHashes(out, entry);
  Object.assign(out, categoryMetadata(entry.layoutType, 'layoutType'));
  if (Array.isArray(entry.sectionTitles)) out.sectionCount = Math.min(entry.sectionTitles.length, 1000);
  Object.assign(out, collectAssetReferences(entry, ['assetId', 'assets', 'images', 'image', 'url', 'outputAssetIds'], 'output'));
  Object.assign(out, collectAssetReferences(entry, ['sourceAssetId', 'inputAssets', 'inputImages', 'refImages', 'inputAssetIds'], 'input'));
  if (!out.outputAssetCount) {
    const count = clampNumber(entry.imageCount ?? (Array.isArray(entry.images) ? entry.images.length : undefined));
    if (count !== undefined) out.outputAssetCount = count;
  }
  if (!out.inputAssetCount) {
    const count = clampNumber(entry.inputImageCount ?? (Array.isArray(entry.inputImages) ? entry.inputImages.length : undefined));
    if (count !== undefined) out.inputAssetCount = count;
  }
  return out;
};

const sanitizeAuditHistoryEntry = (entry) => {
  const out = sanitizeCommonHistoryEntry(entry, 'audit');
  if (!out) return null;
  Object.assign(out, categoryMetadata(entry.kind, 'kind', 'event'));
  Object.assign(out, categoryMetadata(entry.biz || entry.purpose || entry.trigger, 'biz'));
  copyNumericMetadata(out, entry);
  copyHashMetadata(out, entry);
  copyCategoryHashes(out, entry);
  if (Object.prototype.hasOwnProperty.call(entry, 'deepMode')) out.deepMode = !!entry.deepMode;
  if (entry.sessionId || entry.sessionRef) out.sessionRef = opaqueReference(entry.sessionId || entry.sessionRef, 'session');
  if (entry.projectId || entry.projectRef) out.projectRef = opaqueReference(entry.projectId || entry.projectRef, 'project');
  if (entry.requestSource) Object.assign(out, categoryMetadata(entry.requestSource, 'requestSource'));
  Object.assign(out, collectAssetReferences(entry, ['assetId', 'assets', 'images', 'image', 'url', 'outputAssetIds'], 'output'));
  Object.assign(out, collectAssetReferences(entry, ['sourceAssetId', 'inputAssets', 'inputImages', 'refImages', 'inputAssetIds'], 'input'));
  return out;
};

const sanitizeUsageLedgerEntry = (entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const ts = clampNumber(entry.ts ?? entry.createdAt, 0, Number.MAX_SAFE_INTEGER) || Date.now();
  const out = {
    requestId: opaqueReference(entry.requestId || `usage:${ts}`, 'request'),
    ts,
    createdAt: clampNumber(entry.createdAt, 0, Number.MAX_SAFE_INTEGER) || ts,
    updatedAt: clampNumber(entry.updatedAt, 0, Number.MAX_SAFE_INTEGER) || ts,
    ...(entry.userId ? { userId: String(entry.userId).trim().slice(0, 160) } : {}),
    ...(classifyProvider(entry.provider) ? { provider: classifyProvider(entry.provider) } : {}),
    ...(classifyModel(entry.model || entry.modelFamily) ? { model: classifyModel(entry.model || entry.modelFamily) } : {}),
    ...(entry.usedUrl || entry.endpointRef ? {
      endpointRef: opaqueReference(entry.usedUrl || entry.endpointRef, 'endpoint')
    } : {}),
    ...(entry.sessionId || entry.sessionRef ? {
      sessionRef: opaqueReference(entry.sessionId || entry.sessionRef, 'session')
    } : {}),
    ...(entry.projectId || entry.projectRef ? {
      projectRef: opaqueReference(entry.projectId || entry.projectRef, 'project')
    } : {}),
    ...categoryMetadata(entry.trigger, 'trigger', 'other'),
    ...categoryMetadata(entry.requestSource, 'requestSource'),
    ...preservedNetworkMetadata(entry),
    ...contentMetadata(entry.plan?.userText, 'userText'),
    ...contentMetadata(entry.plan?.initialInput, 'initialInput'),
    ...contentMetadata(entry.plan, 'plan')
  };
  copyNumericMetadata(out, entry);
  copyHashMetadata(out, entry);
  for (const key of ['initialInputLen', 'planLen']) {
    const value = clampNumber(entry[key]);
    if (value !== undefined) out[key] = value;
  }
  for (const key of ['initialInputHash', 'planHash']) {
    const value = String(entry[key] || '').trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(value)) out[key] = value;
  }
  const statusRaw = normalizeCategory(entry.status, 'unknown');
  out.status = ['ok', 'empty', 'error', 'failed', 'success', 'cancelled', 'queued', 'running']
    .includes(statusRaw) ? statusRaw : 'unknown';
  const existingError = normalizeCategory(entry.errorCategory);
  const errorCategory = ['cancelled', 'timeout', 'rate_limited', 'auth', 'billing', 'storage', 'input', 'upstream', 'other']
    .includes(existingError) ? existingError : sanitizeErrorCategory(entry.errorCode || entry.error);
  if (errorCategory) out.errorCategory = errorCategory;
  const persist = sanitizePersistSummary(entry.persist);
  if (persist) out.persist = persist;
  const seed = clampNumber(entry.seed, -MAX_COUNT, MAX_COUNT);
  if (seed !== undefined) out.seed = seed;
  if (Object.prototype.hasOwnProperty.call(entry, 'deepMode')) out.deepMode = !!entry.deepMode;
  if (Object.prototype.hasOwnProperty.call(entry, 'ragUsed')) out.ragUsed = !!entry.ragUsed;
  const chargedAt = clampNumber(entry.chargedAt, 0, Number.MAX_SAFE_INTEGER);
  if (chargedAt !== undefined) out.chargedAt = chargedAt;
  return out;
};

const sanitizeUserHistoryMemory = (memory) => {
  const source = memory && typeof memory === 'object' && !Array.isArray(memory) ? memory : {};
  const imageHistory = Array.isArray(source.image_history)
    ? source.image_history.map(sanitizeImageHistoryEntry).filter(Boolean)
    : [];
  const auditHistory = Array.isArray(source.audit_history)
    ? source.audit_history.map(sanitizeAuditHistoryEntry).filter(Boolean)
    : [];
  const originalImage = Array.isArray(source.image_history) ? source.image_history : [];
  const originalAudit = Array.isArray(source.audit_history) ? source.audit_history : [];
  const changed = JSON.stringify(originalImage) !== JSON.stringify(imageHistory) ||
    JSON.stringify(originalAudit) !== JSON.stringify(auditHistory);
  return {
    memory: {
      ...source,
      ...(originalImage.length || imageHistory.length ? { image_history: imageHistory } : {}),
      ...(originalAudit.length || auditHistory.length ? { audit_history: auditHistory } : {})
    },
    changed
  };
};

module.exports = {
  categoryMetadata,
  classifyModel,
  classifyProvider,
  classifyUserAgent,
  contentMetadata,
  hashMetadata,
  networkMetadata,
  normalizeCategory,
  opaqueReference,
  sanitizeAuditHistoryEntry,
  sanitizeAnalyticsEvent,
  sanitizeAnalyticsPayload,
  sanitizeAnalyticsUrl,
  sanitizeErrorCategory,
  sanitizeImageHistoryEntry,
  sanitizeUserHistoryMemory,
  sanitizeUsageLedgerEntry
};
