const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const { ApiError, sendApiError } = require('../lib/api-error');
const {
  catalogVersion,
  tools,
  assertToolOperation,
  resolveOperationExecution,
  resolveOperationSku,
  isPaidOperation
} = require('../lib/tool-catalog');
const { resolveAuthUser } = require('../lib/auth-utils');
const { getPool, isDatabaseConfigured } = require('../db/pool');
const billing = require('../services/billing-service');
const assets = require('../services/asset-storage');
const assetUploads = require('../services/asset-upload-service');
const fileInspection = require('../services/file-inspection-service');
const generationAnalytics = require('../services/generation-analytics-service');
const {
  createOldPhotoExecutor
} = require('../services/old-photo-service');
const {
  assertAiDesignAvailable,
  createAiDesignExecutor,
  validateAiDesignTask
} = require('../services/ai-design-service');
const { createConfiguredGenerationProvider } = require('../services/generation-provider');
const {
  getInternalGenerationProfile,
  listPublicGenerationProfiles
} = require('../services/generation-profiles');
const { sweepTrashedProjects } = require('../services/creative-project-service');
const {
  assertWorkshopAiAvailable,
  createWorkshopAiExecutor,
  validateWorkshopAiTask
} = require('../services/workshop-ai-service');
const { markProviderDispatched } = require('../services/task-queue-service');
const { createTaskQueue } = require('../services/task-queue-pgboss');
const { hasPayloadKey, resolvePayloadKey } = require('../services/task-payload-service');
const { checkStorage } = require('../services/readiness-service');
const { isProductionIntent } = require('../services/agent-config');

const GLOBAL_MAX_FILES = 50;
const GLOBAL_MAX_FILE_BYTES = 200 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_AUTHORITY_KEYS = new Set([
  'amount',
  'amountcny',
  'chargedcredits',
  'cost',
  'credits',
  'price',
  'quotedcredits',
  'sku'
]);
const IMPLEMENTED_SERVER_TASKS = new Set([
  'ai-design:generate',
  'ai-design:directions',
  'background:ai-scene',
  'id-photo:professional-portrait',
  'ingredient-label:ai-organize-source-text',
  'old-photo:enhance',
  'old-photo:enhance-colorize'
]);
const WORKSHOP_AI_TASKS = new Set([
  'background:ai-scene',
  'id-photo:professional-portrait',
  'ingredient-label:ai-organize-source-text'
]);
let holdSweeper = null;
let assetSweeper = null;
let taskLeaseQueue = null;

const paidFeaturesEnabled = (env = process.env) => {
  return /^(1|true)$/i.test(String(env.PAID_FEATURES_ENABLED || '').trim());
};

const taskWorkersEnabled = (env = process.env) => {
  const configured = String(env.TASK_WORKER_ENABLED ?? '1').trim().toLowerCase();
  return paidFeaturesEnabled(env) && !['0', 'false', 'no', 'off'].includes(configured);
};

const assertPaidFeatureAvailable = ({ paid, enabled, databaseConfigured, authenticated }) => {
  if (!paid) return true;
  if (!enabled) throw new ApiError(503, 'PAID_FEATURES_DISABLED', { retryable: true });
  if (!databaseConfigured) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
  if (!authenticated) throw new ApiError(401, 'LOGIN_REQUIRED');
  return true;
};

const assertUuid = (value, field) => {
  const text = String(value || '').trim();
  if (!UUID_RE.test(text)) throw new ApiError(400, 'INVALID_ID', { field });
  return text;
};

const assertServerTaskImplemented = (tool, operation) => {
  const key = `${String(tool?.id || '').trim()}:${String(operation || '').trim()}`;
  if (!IMPLEMENTED_SERVER_TASKS.has(key)) {
    throw new ApiError(503, 'TOOL_OPERATION_UNAVAILABLE', {
      field: 'operation',
      retryable: false
    });
  }
  return true;
};

const isWorkshopAiTask = (tool, operation) =>
  WORKSHOP_AI_TASKS.has(`${String(tool?.id || '').trim()}:${String(operation || '').trim()}`);

const buildStoredTaskOptions = ({ tool, operation, normalizedOptions }) => {
  if (tool?.id === 'ai-design') {
    return operation === 'generate'
      ? {
          profileId: normalizedOptions.profileId,
          aspectRatio: normalizedOptions.aspectRatio,
          ...(normalizedOptions.referenceRoles?.length
            ? { referenceRoles: normalizedOptions.referenceRoles }
            : {}),
          ...(Number.isInteger(normalizedOptions.seed) ? { seed: normalizedOptions.seed } : {})
        }
      : {
          locale: normalizedOptions.locale,
          hasProductProfile: Boolean(normalizedOptions.productProfile)
        };
  }
  if (isWorkshopAiTask(tool, operation) && tool.id === 'ingredient-label') {
    return {
      productType: normalizedOptions.productType,
      locale: normalizedOptions.locale || 'zh',
      sourceLength: normalizedOptions.sourceText.length,
      sourceSha256: crypto
        .createHash('sha256')
        .update(normalizedOptions.sourceText, 'utf8')
        .digest('hex')
    };
  }
  return normalizedOptions;
};

const containsClientAuthority = (value, depth = 0) => {
  if (depth > 8 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => containsClientAuthority(entry, depth + 1));
  return Object.entries(value).some(([key, entry]) => {
    if (CLIENT_AUTHORITY_KEYS.has(String(key).replace(/[_-]/g, '').toLowerCase())) return true;
    return containsClientAuthority(entry, depth + 1);
  });
};

const rejectClientAuthority = (value) => {
  if (containsClientAuthority(value)) {
    throw new ApiError(400, 'CLIENT_PRICE_NOT_ALLOWED', { field: 'options' });
  }
};

const validateOldPhotoOptions = (options) => {
  const input = options && typeof options === 'object' ? options : {};
  if (Object.keys(input).some((key) => key !== 'seed' && key !== 'denoise')) {
    throw new ApiError(400, 'INVALID_OPTIONS', { field: 'options' });
  }
  if (
    Object.prototype.hasOwnProperty.call(input, 'seed') &&
    (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff)
  ) {
    throw new ApiError(400, 'INVALID_OPTIONS', { field: 'options.seed' });
  }
  if (
    Object.prototype.hasOwnProperty.call(input, 'denoise') &&
    typeof input.denoise !== 'boolean'
  ) {
    throw new ApiError(400, 'INVALID_OPTIONS', { field: 'options.denoise' });
  }
  return input;
};

const createRequestAbortController = (req, res) => {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  const onResponseClose = () => {
    if (!res.writableFinished) abort();
  };
  const cleanup = () => {
    req.removeListener('aborted', abort);
    res.removeListener('close', onResponseClose);
    res.removeListener('finish', cleanup);
  };
  req.once('aborted', abort);
  res.once('close', onResponseClose);
  res.once('finish', cleanup);
  if (req.aborted) abort();
  return controller;
};

const parseJsonField = (value, field, fallback) => {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'INVALID_JSON_FIELD', { field });
  }
};

const cleanupUpload = async (parsed) => {
  if (!parsed?.tempDir) return;
  await fs.promises.rm(parsed.tempDir, { recursive: true, force: true }).catch(() => {});
};

const inspectUploadedFile = async ({
  tempPath,
  declaredMime,
  maxBytes,
  maxPixels,
  allowedMimeTypes
}) => {
  const inspected = await fileInspection.inspectFile({
    tempPath,
    declaredMime,
    maxBytes: Number(maxBytes || GLOBAL_MAX_FILE_BYTES),
    maxPixels,
    allowedMimeTypes
  });
  return {
    byteSize: inspected.byteSize,
    mimeType: inspected.mimeType,
    width: inspected.width,
    height: inspected.height,
    sha256Hex: inspected.sha256.toString('hex')
  };
};

const parseMultipartRequest = async (req, limits = {}) => {
  const contentType = String(req.headers?.['content-type'] || '');
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new ApiError(415, 'MULTIPART_REQUIRED');
  }
  let Busboy;
  try {
    Busboy = require('busboy');
  } catch {
    throw new ApiError(503, 'MULTIPART_NOT_AVAILABLE', { retryable: true });
  }

  const fields = Object.create(null);
  const files = [];
  const writes = [];
  const maxFiles = Math.max(1, Math.min(GLOBAL_MAX_FILES, Number(limits.maxFiles || GLOBAL_MAX_FILES)));
  const maxFileBytes = Math.max(
    1,
    Math.min(GLOBAL_MAX_FILE_BYTES, Number(limits.maxFileBytes || GLOBAL_MAX_FILE_BYTES))
  );
  const maxRequestBytes = maxFiles * maxFileBytes + 2 * 1024 * 1024;
  const declaredLength = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxRequestBytes) {
    throw new ApiError(413, 'REQUEST_TOO_LARGE');
  }
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-task-'));

  try {
    await new Promise((resolve, reject) => {
      let parser;
      let failed = false;
      const onRequestAborted = () => {
        try {
          if (parser) req.unpipe(parser);
          if (typeof parser?.destroy === 'function') parser.destroy();
        } catch {}
        fail(new ApiError(499, 'REQUEST_ABORTED'));
      };
      const cleanupRequest = () => req.removeListener('aborted', onRequestAborted);
      const fail = (error) => {
        if (failed) return;
        failed = true;
        cleanupRequest();
        try {
          if (parser) req.unpipe(parser);
          if (typeof parser?.destroy === 'function') parser.destroy();
        } catch {}
        reject(error);
      };
      req.once('aborted', onRequestAborted);
      try {
        parser = Busboy({
          headers: req.headers,
          limits: {
            fields: 30,
            fieldSize: 1024 * 1024,
            files: maxFiles,
            fileSize: maxFileBytes,
            parts: maxFiles + 30
          }
        });
      } catch {
        fail(new ApiError(400, 'INVALID_MULTIPART'));
        return;
      }

      parser.on('field', (name, value, info) => {
        if (info?.valueTruncated) return fail(new ApiError(413, 'FIELD_TOO_LARGE', { field: name }));
        const key = String(name || '').trim();
        if (!key || Object.prototype.hasOwnProperty.call(fields, key)) {
          return fail(new ApiError(400, 'DUPLICATE_FIELD', { field: key || 'multipart' }));
        }
        fields[key] = value;
      });
      parser.on('file', (fieldName, stream, info) => {
        const tempPath = path.join(tempDir, crypto.randomUUID());
        const record = {
          fieldName: String(fieldName || '').slice(0, 80),
          declaredMime: String(info?.mimeType || 'application/octet-stream'),
          tempPath,
          truncated: false,
          byteSize: 0
        };
        files.push(record);
        stream.on('data', (chunk) => {
          record.byteSize += Buffer.byteLength(chunk);
        });
        stream.on('limit', () => {
          record.truncated = true;
        });
        writes.push(
          pipeline(stream, fs.createWriteStream(tempPath, { flags: 'wx' })).catch((error) => {
            throw new ApiError(400, 'UPLOAD_FAILED', { details: { code: error.code || 'STREAM_ERROR' } });
          })
        );
      });
      parser.on('filesLimit', () => fail(new ApiError(413, 'TOO_MANY_FILES', { field: 'files' })));
      parser.on('fieldsLimit', () => fail(new ApiError(413, 'TOO_MANY_FIELDS')));
      parser.on('partsLimit', () => fail(new ApiError(413, 'TOO_MANY_PARTS')));
      parser.on('error', () => fail(new ApiError(400, 'INVALID_MULTIPART')));
      parser.on('finish', async () => {
        if (failed) return;
        try {
          await Promise.all(writes);
          if (files.some((file) => file.truncated)) {
            return fail(new ApiError(413, 'FILE_TOO_LARGE', { field: 'files' }));
          }
          cleanupRequest();
          resolve();
        } catch (error) {
          fail(error);
        }
      });
      req.pipe(parser);
    });
    return { fields, files, tempDir };
  } catch (error) {
    await Promise.allSettled(writes);
    await cleanupUpload({ tempDir });
    throw error;
  }
};

const resolveDatabaseUserId = async (legacyUserId, pool = getPool()) => {
  const client = await pool.connect();
  try {
    return await billing.resolveUserId(client, legacyUserId);
  } finally {
    client.release();
  }
};

const requireAuthenticatedUser = (req) => {
  const auth = resolveAuthUser(req);
  if (!auth.ok) throw new ApiError(auth.status || 401, auth.error || 'LOGIN_REQUIRED');
  return auth;
};

const optionalAuthenticatedUser = (req) => {
  const auth = resolveAuthUser(req);
  return auth.ok ? auth : null;
};

const assertServerInfrastructure = ({ tool, operation, auth }) => {
  const paid = isPaidOperation(tool, operation);
  assertPaidFeatureAvailable({
    paid,
    enabled: paidFeaturesEnabled(),
    databaseConfigured: isDatabaseConfigured(),
    authenticated: Boolean(auth?.ok)
  });
  if (!isDatabaseConfigured()) {
    throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
  }
  if (!auth?.ok) throw new ApiError(401, 'LOGIN_REQUIRED');
  return { paid };
};

const assertProductionAiDesignStorageReady = async ({
  tool,
  operation,
  env = process.env,
  adapter
}) => {
  if (
    !isProductionIntent(env) ||
    String(tool?.id || '').trim() !== 'ai-design' ||
    !isPaidOperation(tool, operation)
  ) {
    return true;
  }
  let resolvedAdapter = adapter;
  if (!resolvedAdapter) {
    try {
      resolvedAdapter = assets.getAssetAdapter();
    } catch {
      resolvedAdapter = null;
    }
  }
  const storage = await checkStorage(resolvedAdapter, { requireShared: true });
  if (!storage.ok) {
    throw new ApiError(503, storage.code || 'ASSET_STORAGE_UNAVAILABLE', {
      retryable: true,
      ...(storage.driver ? { details: { driver: storage.driver } } : {})
    });
  }
  return storage;
};

const validateTaskFields = (fields) => {
  const directAuthority = Object.keys(fields || {}).some((key) =>
    CLIENT_AUTHORITY_KEYS.has(String(key).replace(/[_-]/g, '').toLowerCase())
  );
  if (directAuthority) throw new ApiError(400, 'CLIENT_PRICE_NOT_ALLOWED');
  const options = parseJsonField(fields.options, 'options', {});
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new ApiError(400, 'INVALID_OPTIONS', { field: 'options' });
  }
  rejectClientAuthority(options);
  const inputAssetIds = parseJsonField(fields.inputAssets, 'inputAssets', []);
  if (!Array.isArray(inputAssetIds)) {
    throw new ApiError(400, 'INVALID_INPUT_ASSETS', { field: 'inputAssets' });
  }
  const normalizedAssetIds = inputAssetIds.map((id) => assertUuid(id, 'inputAssets'));
  const quoteId = String(fields.quoteId || '').trim();
  const projectId = String(fields.projectId || '').trim();
  const parentVersionId = String(fields.parentVersionId || '').trim();
  return {
    toolId: String(fields.toolId || '').trim(),
    operation: String(fields.operation || '').trim(),
    options,
    inputAssetIds: normalizedAssetIds,
    quoteId: quoteId ? assertUuid(quoteId, 'quoteId') : null,
    projectId: projectId ? assertUuid(projectId, 'projectId') : null,
    parentVersionId: parentVersionId
      ? assertUuid(parentVersionId, 'parentVersionId')
      : null
  };
};

const installToolTaskRoutes = (app, deps = {}) => {
  const runtimeEnv = deps.env || process.env;
  const uploadService = deps.assetUploadService || assetUploads;
  const createDirectUploadAdapter = () => deps.assetAdapter || new assets.S3AssetAdapter(runtimeEnv);
  const sweepExpiredUploadSessions = async () => {
    if (!uploadService.directAssetUploadsEnabled(runtimeEnv, deps.assetAdapter)) {
      return { claimed: 0, cleaned: 0, failed: 0 };
    }
    return uploadService.sweepExpiredUploadSessions({
      ...(deps.pool ? { pool: deps.pool } : {}),
      adapter: createDirectUploadAdapter(),
      env: runtimeEnv
    });
  };
  const rateLimit = typeof deps.rateLimit === 'function'
    ? deps.rateLimit
    : () => (_req, _res, next) => next();
  const apiLimiter = rateLimit('tool_tasks_v2', {
    max: Number.parseInt(process.env.TOOL_TASK_RATE_MAX || '120', 10) || 120,
    windowMs: 60 * 1000
  });
  const createTaskLimiter = rateLimit('tool_tasks_create_v2', {
    max: Number.parseInt(process.env.TOOL_TASK_CREATE_RATE_MAX || '12', 10) || 12,
    windowMs: 60 * 1000
  });
  const transferLimiter = rateLimit('editor_transfers_v2', {
    max: Number.parseInt(process.env.EDITOR_TRANSFER_RATE_MAX || '3', 10) || 3,
    windowMs: 60 * 1000
  });
  const generationProvider = deps.generationProvider || createConfiguredGenerationProvider({
    imageGenerate: deps.callSiliconFlowImageGenerate,
    chatGenerate: deps.callSiliconFlowChat,
    env: runtimeEnv
  });
  const markDispatched = (input) => markProviderDispatched({
    ...input,
    ...(deps.pool ? { pool: deps.pool } : {})
  });
  const oldPhotoExecutor = deps.oldPhotoExecutor || createOldPhotoExecutor({
    provider: deps.callSiliconFlowImageGenerate,
    markRunning: billing.markTaskRunning,
    markProviderDispatched: markDispatched,
    settleTask: billing.settleTask,
    releaseTask: billing.releaseTask
  });
  const aiDesignExecutor = deps.aiDesignExecutor || createAiDesignExecutor({
    provider: generationProvider,
    markRunning: billing.markTaskRunning,
    markProviderDispatched: markDispatched,
    settleTask: billing.settleTask,
    releaseTask: billing.releaseTask,
    getTask: billing.getTask,
    deleteOutputAsset: assets.deleteOwnedAssetNow,
    env: runtimeEnv
  });
  const workshopAiExecutor = deps.workshopAiExecutor || createWorkshopAiExecutor({
    provider: generationProvider,
    markRunning: billing.markTaskRunning,
    markProviderDispatched: markDispatched,
    settleTask: billing.settleTask,
    releaseTask: billing.releaseTask,
    getTask: billing.getTask,
    deleteOutputAsset: assets.deleteOwnedAssetNow,
    env: runtimeEnv
  });
  const databaseAvailable = Boolean(deps.pool) || isDatabaseConfigured();
  const startWorkers = taskWorkersEnabled(runtimeEnv);
  const queue = startWorkers && (deps.taskQueue || taskLeaseQueue || (databaseAvailable
    ? createTaskQueue({
        ...(deps.pool ? { pool: deps.pool } : {}),
        releaseTask: billing.releaseTask,
        requestTaskCancellation: billing.requestTaskCancellation,
        cancelTask: billing.cancelTask,
        env: runtimeEnv
      })
    : null));
  if (queue) {
    queue.register('old-photo', 'enhance', (input) => oldPhotoExecutor({
      ...input,
      sourceAssetId: input.inputAssetIds[0],
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }));
    queue.register('old-photo', 'enhance-colorize', (input) => oldPhotoExecutor({
      ...input,
      sourceAssetId: input.inputAssetIds[0],
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }));
    queue.register('ai-design', 'generate', aiDesignExecutor, { payloadRequired: true });
    queue.register('ai-design', 'directions', aiDesignExecutor, { payloadRequired: true });
    queue.register('id-photo', 'professional-portrait', workshopAiExecutor, { payloadRequired: true });
    queue.register('background', 'ai-scene', workshopAiExecutor, { payloadRequired: true });
    queue.register(
      'ingredient-label',
      'ai-organize-source-text',
      workshopAiExecutor,
      { payloadRequired: true }
    );
    if (typeof queue.registerMaintenance === 'function') {
      queue.registerMaintenance({
        releaseExpiredHolds: billing.releaseExpiredHolds,
        sweepExpiredAssets: assets.sweepExpiredAssets,
        sweepOrphanedFileAssets: assets.sweepOrphanedFileAssets,
        sweepExpiredUploadSessions,
        sweepTrashedProjects
      });
    }
  }
  if (!deps.taskQueue && queue) taskLeaseQueue = queue;
  if (queue && deps.enableTaskQueue !== false && databaseAvailable && startWorkers) {
    queue.start().catch((error) => {
      console.error('Task lease queue failed to start', error?.code || error?.message || error);
    });
  }
  if (
    startWorkers &&
    !queue?.managesMaintenance &&
    !holdSweeper &&
    deps.enableHoldSweeper !== false
  ) {
    holdSweeper = setInterval(() => {
      if (!isDatabaseConfigured()) return;
      billing.releaseExpiredHolds().catch((error) => {
        console.error('Expired credit hold sweep failed', error?.code || error?.message || error);
      });
    }, 60 * 1000);
    if (typeof holdSweeper.unref === 'function') holdSweeper.unref();
  }
  if (
    startWorkers &&
    !queue?.managesMaintenance &&
    !assetSweeper &&
    deps.enableAssetSweeper !== false
  ) {
    const intervalMs = Math.max(
      60 * 1000,
      Math.min(60 * 60 * 1000, Number(process.env.ASSET_GC_INTERVAL_MS || 5 * 60 * 1000))
    );
    assetSweeper = setInterval(() => {
      if (!isDatabaseConfigured()) return;
      assets.sweepExpiredAssets().then(async (summary) => {
        if (summary.failed) {
          console.error('Expired asset sweep completed with failures', summary.failed);
        }
        await assets.sweepOrphanedFileAssets();
        await sweepExpiredUploadSessions();
        await sweepTrashedProjects();
      }).catch((error) => {
        console.error('Expired asset sweep failed', error?.code || error?.message || error);
      });
    }, intervalMs);
    if (typeof assetSweeper.unref === 'function') assetSweeper.unref();
  }
  const asyncRoute = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (res.headersSent) {
        if (typeof res.destroy === 'function') res.destroy(error);
        return;
      }
      sendApiError(res, error);
    }
  };

  app.get('/api/tools/catalog', apiLimiter, (_req, res) => {
    res.json({ ok: true, version: catalogVersion, tools });
  });

  app.get('/api/generation/models', apiLimiter, asyncRoute(async (req, res) => {
    const auth = optionalAuthenticatedUser(req);
    const subject = auth
      ? await resolveDatabaseUserId(auth.dbUserId || auth.userId)
      : '';
    res.json({
      ok: true,
      models: listPublicGenerationProfiles({
        providerAvailable: generationProvider.available && hasPayloadKey(deps.env || process.env),
        env: deps.env || process.env,
        subject
      })
    });
  }));

  app.post('/api/tool-tasks/quote', apiLimiter, asyncRoute(async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (containsClientAuthority(body)) throw new ApiError(400, 'CLIENT_PRICE_NOT_ALLOWED');
    const checked = assertToolOperation(body.toolId, body.operation);
    if (!checked.ok) throw new ApiError(checked.code === 'TOOL_NOT_FOUND' ? 404 : 400, checked.code, { field: checked.field });
    if (resolveOperationExecution(checked.tool, checked.operation) === 'local') {
      throw new ApiError(409, 'LOCAL_EXECUTION_REQUIRED', {
        details: { toolId: checked.tool.id, operation: checked.operation }
      });
    }
    assertServerTaskImplemented(checked.tool, checked.operation);
    const auth = optionalAuthenticatedUser(req);
    const infrastructure = assertServerInfrastructure({
      tool: checked.tool,
      operation: checked.operation,
      auth
    });
    if (checked.tool.id === 'ai-design') {
      await assertProductionAiDesignStorageReady({
        tool: checked.tool,
        operation: checked.operation,
        env: deps.env || process.env,
        adapter: deps.assetAdapter
      });
      const cohortUserId = await resolveDatabaseUserId(auth.dbUserId || auth.userId);
      assertAiDesignAvailable({
        provider: generationProvider,
        env: deps.env || process.env,
        subject: cohortUserId
      });
      resolvePayloadKey(deps.env || process.env);
    }
    if (isWorkshopAiTask(checked.tool, checked.operation)) {
      assertWorkshopAiAvailable({
        provider: generationProvider,
        env: deps.env || process.env
      });
      resolvePayloadKey(deps.env || process.env);
    }
    if (!infrastructure.paid) {
      return res.json({
        ok: true,
        quote: { quoteId: null, sku: null, credits: 0, expiresAt: null }
      });
    }
    const quoteOptions = body.options && typeof body.options === 'object' && !Array.isArray(body.options)
      ? body.options
      : {};
    if (checked.tool.id === 'ai-design' && checked.operation === 'generate') {
      const profileId = String(quoteOptions.profileId || '').trim();
      if (!getInternalGenerationProfile(profileId, deps.env || process.env)) {
        throw new ApiError(409, 'MODEL_PROFILE_UNAVAILABLE', {
          field: 'options.profileId',
          retryable: true
        });
      }
    }
    const quote = await billing.createQuote({
      userId: auth.dbUserId || auth.userId,
      sku: resolveOperationSku(checked.tool, checked.operation, quoteOptions)
    });
    return res.json({ ok: true, quote });
  }));

  app.post('/api/tool-tasks', createTaskLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const auth = requireAuthenticatedUser(req);
    // Every currently implemented server executor is paid. Reject before
    // consuming multipart bytes when billing is intentionally unavailable.
    assertPaidFeatureAvailable({
      paid: true,
      enabled: paidFeaturesEnabled(),
      databaseConfigured: true,
      authenticated: true
    });
    const idempotencyKey = billing.requireIdempotencyKey(req.headers?.['idempotency-key']);
    const parsed = await parseMultipartRequest(req, {
      maxFiles: 3,
      maxFileBytes: 40 * 1024 * 1024
    });
    try {
      const input = validateTaskFields(parsed.fields);
      const checked = assertToolOperation(input.toolId, input.operation);
      if (!checked.ok) throw new ApiError(checked.code === 'TOOL_NOT_FOUND' ? 404 : 400, checked.code, { field: checked.field });
      if (resolveOperationExecution(checked.tool, checked.operation) === 'local') {
        throw new ApiError(409, 'LOCAL_EXECUTION_REQUIRED', {
          details: { toolId: checked.tool.id, operation: checked.operation }
        });
      }
      assertServerTaskImplemented(checked.tool, checked.operation);
      assertServerInfrastructure({ tool: checked.tool, operation: checked.operation, auth });
      if (checked.tool.id === 'ai-design') {
        await assertProductionAiDesignStorageReady({
          tool: checked.tool,
          operation: checked.operation,
          env: deps.env || process.env,
          adapter: deps.assetAdapter
        });
      }
      const dbUserId = await resolveDatabaseUserId(auth.dbUserId || auth.userId);
      if (checked.tool.id === 'ai-design') {
        assertAiDesignAvailable({
          provider: generationProvider,
          env: deps.env || process.env,
          subject: dbUserId
        });
        resolvePayloadKey(deps.env || process.env);
      }
      if (isWorkshopAiTask(checked.tool, checked.operation)) {
        assertWorkshopAiAvailable({
          provider: generationProvider,
          env: deps.env || process.env
        });
        resolvePayloadKey(deps.env || process.env);
      }
      const limits = checked.tool.limits || {};
      const maxFiles = Math.max(0, Number(limits.maxFiles || 0));
      if (parsed.files.length + input.inputAssetIds.length > maxFiles) {
        throw new ApiError(413, 'TOO_MANY_FILES', { field: 'files' });
      }
      let normalizedOptions = input.options;
      if (checked.tool.id === 'old-photo') {
        if (parsed.files.length + input.inputAssetIds.length !== 1) {
          throw new ApiError(400, 'SINGLE_IMAGE_REQUIRED', { field: 'files' });
        }
        normalizedOptions = validateOldPhotoOptions(input.options);
      }
      if (checked.tool.id === 'ai-design') {
        normalizedOptions = validateAiDesignTask({
          operation: checked.operation,
          options: input.options,
          inputCount: parsed.files.length + input.inputAssetIds.length,
          env: deps.env || process.env
        });
      }
      if (isWorkshopAiTask(checked.tool, checked.operation)) {
        normalizedOptions = validateWorkshopAiTask({
          toolId: checked.tool.id,
          operation: checked.operation,
          options: input.options,
          inputCount: parsed.files.length + input.inputAssetIds.length
        });
      }
      const existingAssets = [];
      for (const assetId of input.inputAssetIds) {
        const existingAsset = await assets.getAssetRecord({ assetId, ownerUserId: dbUserId });
        existingAssets.push(existingAsset);
        if (
          ['old-photo', 'ai-design', 'id-photo', 'background'].includes(checked.tool.id) &&
          !['image/png', 'image/jpeg', 'image/webp'].includes(String(existingAsset.mime_type || '').toLowerCase())
        ) {
          throw new ApiError(415, 'UNSUPPORTED_INPUT_TYPE', { field: 'inputAssets' });
        }
        if (Number(existingAsset.byte_size || 0) > Number(limits.maxFileBytes || GLOBAL_MAX_FILE_BYTES)) {
          throw new ApiError(413, 'FILE_TOO_LARGE', { field: 'inputAssets' });
        }
        const pixels = Number(existingAsset.width || 0) * Number(existingAsset.height || 0);
        if (
          Number(limits.maxPixels || 0) > 0 &&
          String(existingAsset.mime_type || '').startsWith('image/') &&
          (!existingAsset.width || !existingAsset.height)
        ) {
          throw new ApiError(422, 'IMAGE_DIMENSIONS_UNAVAILABLE', { field: 'inputAssets' });
        }
        if (Number(limits.maxPixels || 0) > 0 && pixels > Number(limits.maxPixels)) {
          throw new ApiError(413, 'PIXEL_LIMIT_EXCEEDED', { field: 'inputAssets' });
        }
      }
      const retentionHours = Math.max(1, Number(checked.tool.privacy?.retentionHours || 1));
      const expiresAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000);
      const allowedMimeTypes = ['old-photo', 'ai-design', 'id-photo', 'background'].includes(checked.tool.id)
        ? ['image/png', 'image/jpeg', 'image/webp']
        : undefined;
      const inspectedUploads = [];
      for (const file of parsed.files) {
        inspectedUploads.push(await inspectUploadedFile({
          tempPath: file.tempPath,
          declaredMime: file.declaredMime,
          maxBytes: Number(limits.maxFileBytes || GLOBAL_MAX_FILE_BYTES),
          maxPixels: Number(limits.maxPixels || 0),
          allowedMimeTypes
        }));
      }
      const requestIdentity = [
        ...existingAssets.map((asset) => ({
          sha256: Buffer.isBuffer(asset.sha256) ? asset.sha256.toString('hex') : String(asset.sha256 || ''),
          mimeType: String(asset.mime_type || ''),
          byteSize: Number(asset.byte_size || 0)
        })),
        ...inspectedUploads.map((asset) => ({
          sha256: asset.sha256Hex,
          mimeType: asset.mimeType,
          byteSize: asset.byteSize
        }))
      ];
      const storedOptions = buildStoredTaskOptions({
        tool: checked.tool,
        operation: checked.operation,
        normalizedOptions
      });
      const reservation = await billing.createTaskWithHold({
        userId: auth.dbUserId || auth.userId,
        toolId: checked.tool.id,
        operation: checked.operation,
        options: normalizedOptions,
        storedOptions,
        ...((checked.tool.id === 'ai-design' || isWorkshopAiTask(checked.tool, checked.operation))
          ? {
              taskPayload: { options: normalizedOptions },
              payloadTtlMinutes: 60
            }
          : {}),
        inputAssetIds: input.inputAssetIds,
        inputRetentionHours: retentionHours,
        projectId: input.projectId,
        parentVersionId: input.parentVersionId,
        projectVersionPayload: checked.tool.id === 'ai-design' && checked.operation === 'generate'
          ? {
              prompt: normalizedOptions.prompt,
              direction: normalizedOptions.direction || null
            }
          : null,
        requestIdentity,
        deferInputAssets: parsed.files.length > 0,
        quoteId: input.quoteId,
        sku: isPaidOperation(checked.tool, checked.operation, normalizedOptions)
          ? resolveOperationSku(checked.tool, checked.operation, normalizedOptions)
          : null,
        idempotencyKey
      });
      let task = reservation;
      const uploaded = [];
      if (reservation.inputPreparationRequired) {
        try {
          for (const file of parsed.files) {
            uploaded.push(await assets.storeAsset({
              ownerUserId: dbUserId,
              tempPath: file.tempPath,
              declaredMime: file.declaredMime,
              maxBytes: Number(limits.maxFileBytes || GLOBAL_MAX_FILE_BYTES),
              maxPixels: Number(limits.maxPixels || 0),
              retentionClass: 'temporary-input',
              allowedMimeTypes,
              expiresAt,
              metadata: {
                source: 'tool-task',
                toolId: checked.tool.id,
                operation: checked.operation,
                field: file.fieldName
              }
            }));
          }
          task = await billing.finalizeTaskInputs({
            userId: auth.dbUserId || auth.userId,
            taskId: reservation.taskId,
            inputAssetIds: uploaded.map((asset) => asset.assetId),
            startPosition: input.inputAssetIds.length,
            inputRetentionHours: retentionHours
          });
        } catch (error) {
          await billing.releaseTask({
            taskId: reservation.taskId,
            errorCode: 'INPUT_PERSIST_FAILED',
            onlyIfInputsPending: true
          }).catch((releaseError) => {
            console.error(
              'Input reservation release failed',
              reservation.taskId,
              releaseError?.code || releaseError?.message || releaseError
            );
          });
          // Do not immediately delete partially persisted inputs here. Assets
          // are content-addressed and may already be reused by another task or
          // retained output. Their bounded temporary-input TTL lets the normal
          // PostgreSQL GC remove true orphans without racing another request.
          throw error;
        }
      }
      const taskActivated = parsed.files.length > 0
        ? Boolean(task.inputPreparationCompleted)
        : !task.replayed;
      if (checked.tool.id === 'ai-design' && task.status === 'queued' && taskActivated) {
        await generationAnalytics.recordGenerationTaskEvent({
          ...(deps.pool ? { pool: deps.pool } : {}),
          eventType: 'task_queued',
          actorUserId: dbUserId,
          projectId: task.projectId,
          taskId: task.taskId,
          quoteId: input.quoteId,
          operation: checked.operation,
          status: 'queued',
          properties: { source: 'server', status: 'queued' }
        }).catch((error) => {
          console.error('Generation queued event failed', task.taskId, error?.code || error?.message || error);
        });
      }
      if (task.status === 'queued' && taskActivated) {
        if (!queue) throw new ApiError(503, 'TASK_RUNNER_NOT_CONFIGURED', { retryable: true });
        await queue.notify(task.taskId).catch((error) => {
          // LISTEN/NOTIFY is only a latency optimization. The durable poller
          // will still claim this committed task after a notification failure.
          console.error('Task queue notification failed', task.taskId, error?.code || error?.message || error);
        });
      }
      return res.status(202).json({ ok: true, task });
    } finally {
      await cleanupUpload(parsed);
    }
  }));

  app.post('/api/asset-uploads', createTaskLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const auth = requireAuthenticatedUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const checked = assertToolOperation(body.toolId, body.operation);
    if (!checked.ok) {
      throw new ApiError(checked.code === 'TOOL_NOT_FOUND' ? 404 : 400, checked.code, {
        field: checked.field
      });
    }
    if (resolveOperationExecution(checked.tool, checked.operation) !== 'server') {
      throw new ApiError(409, 'LOCAL_EXECUTION_REQUIRED', {
        details: { toolId: checked.tool.id, operation: checked.operation }
      });
    }
    assertServerTaskImplemented(checked.tool, checked.operation);
    if (Number(checked.tool.limits?.maxFiles || 0) < 1) {
      throw new ApiError(409, 'TOOL_INPUT_UPLOAD_NOT_ALLOWED');
    }
    const ownerUserId = await resolveDatabaseUserId(auth.dbUserId || auth.userId);
    const upload = await uploadService.createAssetUploadSession({
      ...(deps.pool ? { pool: deps.pool } : {}),
      adapter: createDirectUploadAdapter(),
      env: runtimeEnv,
      ownerUserId,
      idempotencyKey: req.headers?.['idempotency-key'] || body.idempotencyKey,
      toolId: checked.tool.id,
      operation: checked.operation,
      declaredMime: body.mimeType,
      declaredSize: body.size,
      maxBytes: Number(checked.tool.limits?.maxFileBytes || GLOBAL_MAX_FILE_BYTES),
      maxPixels: Number(checked.tool.limits?.maxPixels || 0),
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      retentionHours: Math.max(1, Number(checked.tool.privacy?.retentionHours || 1))
    });
    return res.status(201).json({ ok: true, upload });
  }));

  app.get('/api/asset-uploads/:id/parts', apiLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const auth = requireAuthenticatedUser(req);
    const ownerUserId = await resolveDatabaseUserId(auth.dbUserId || auth.userId);
    const parts = await uploadService.listUploadedParts({
      ...(deps.pool ? { pool: deps.pool } : {}),
      adapter: createDirectUploadAdapter(),
      env: runtimeEnv,
      ownerUserId,
      sessionId: assertUuid(req.params.id, 'id')
    });
    return res.json({ ok: true, parts });
  }));

  app.post('/api/asset-uploads/:id/parts/:part/sign', apiLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const auth = requireAuthenticatedUser(req);
    const ownerUserId = await resolveDatabaseUserId(auth.dbUserId || auth.userId);
    const signed = await uploadService.signUploadPart({
      ...(deps.pool ? { pool: deps.pool } : {}),
      adapter: createDirectUploadAdapter(),
      env: runtimeEnv,
      ownerUserId,
      sessionId: assertUuid(req.params.id, 'id'),
      partNumber: req.params.part
    });
    return res.json({ ok: true, ...signed });
  }));

  app.post('/api/asset-uploads/:id/complete', createTaskLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const auth = requireAuthenticatedUser(req);
    const ownerUserId = await resolveDatabaseUserId(auth.dbUserId || auth.userId);
    const asset = await uploadService.completeAssetUpload({
      ...(deps.pool ? { pool: deps.pool } : {}),
      adapter: createDirectUploadAdapter(),
      env: runtimeEnv,
      ownerUserId,
      sessionId: assertUuid(req.params.id, 'id'),
      parts: req.body?.parts
    });
    return res.json({ ok: true, asset });
  }));

  app.delete('/api/asset-uploads/:id', apiLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const auth = requireAuthenticatedUser(req);
    const ownerUserId = await resolveDatabaseUserId(auth.dbUserId || auth.userId);
    const upload = await uploadService.cancelAssetUpload({
      ...(deps.pool ? { pool: deps.pool } : {}),
      adapter: createDirectUploadAdapter(),
      env: runtimeEnv,
      ownerUserId,
      sessionId: assertUuid(req.params.id, 'id')
    });
    return res.json({ ok: true, upload });
  }));

  app.get('/api/tool-tasks/:taskId', apiLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const auth = requireAuthenticatedUser(req);
    const taskId = assertUuid(req.params.taskId, 'taskId');
    const task = await billing.getTask({ userId: auth.dbUserId || auth.userId, taskId });
    return res.json({ ok: true, task });
  }));

  app.delete('/api/tool-tasks/:taskId', apiLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const auth = requireAuthenticatedUser(req);
    const taskId = assertUuid(req.params.taskId, 'taskId');
    if (!queue) throw new ApiError(503, 'TASK_RUNNER_NOT_CONFIGURED', { retryable: true });
    const task = await queue.requestCancel({
      userId: auth.dbUserId || auth.userId,
      taskId
    });
    return res.json({ ok: true, task });
  }));

  app.get('/api/assets/:assetId', apiLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const assetId = assertUuid(req.params.assetId, 'assetId');
    const auth = optionalAuthenticatedUser(req);
    const ownerUserId = auth
      ? await resolveDatabaseUserId(auth.dbUserId || auth.userId)
      : null;
    const opened = await assets.openAsset({ assetId, ownerUserId });
    res.status(200);
    res.setHeader('Content-Type', opened.record.mime_type);
    res.setHeader('Content-Length', String(opened.record.byte_size));
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    await pipeline(assets.toReadable(opened.body), res);
  }));

  app.delete('/api/assets/:assetId', apiLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const auth = requireAuthenticatedUser(req);
    const assetId = assertUuid(req.params.assetId, 'assetId');
    const ownerUserId = await resolveDatabaseUserId(auth.dbUserId || auth.userId);
    const deleted = await assets.deleteOwnedAssetNow({ assetId, ownerUserId });
    return res.json({ ok: true, ...deleted });
  }));

  app.post('/api/editor/transfers', transferLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    // Local editing never needs this endpoint. Requiring an account prevents
    // the compatibility transfer bridge from becoming anonymous file hosting.
    const auth = requireAuthenticatedUser(req);
    const ownerUserId = await resolveDatabaseUserId(auth.dbUserId || auth.userId);
    const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
    let assetId = '';
    let parsed = null;
    try {
      if (contentType.startsWith('multipart/form-data;')) {
        parsed = await parseMultipartRequest(req, { maxFiles: 1, maxFileBytes: 40 * 1024 * 1024 });
        if (parsed.files.length !== 1) throw new ApiError(400, 'SINGLE_FILE_REQUIRED', { field: 'files' });
        const stored = await assets.storeAsset({
          ownerUserId,
          tempPath: parsed.files[0].tempPath,
          declaredMime: parsed.files[0].declaredMime,
          maxBytes: 40 * 1024 * 1024,
          maxPixels: 32 * 1000 * 1000,
          retentionClass: 'editor-transfer',
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          metadata: { source: 'editor-transfer' }
        });
        assetId = stored.assetId;
      } else if (contentType.startsWith('application/json')) {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        assetId = assertUuid(body.assetId, 'assetId');
      } else {
        throw new ApiError(415, 'UNSUPPORTED_CONTENT_TYPE');
      }
      const transfer = await assets.createEditorTransfer({
        assetId,
        ownerUserId,
        ttlMinutes: 30
      });
      return res.status(201).json({
        ok: true,
        ...transfer,
        assetUrl: `/api/assets/${encodeURIComponent(assetId)}`
      });
    } finally {
      await cleanupUpload(parsed);
    }
  }));

  app.post('/api/editor/transfers/:transferId/consume', transferLimiter, asyncRoute(async (req, res) => {
    if (!isDatabaseConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const auth = requireAuthenticatedUser(req);
    const ownerUserId = await resolveDatabaseUserId(auth.dbUserId || auth.userId);
    const transfer = await assets.consumeEditorTransfer({
      transferId: assertUuid(req.params.transferId, 'transferId'),
      ownerUserId
    });
    return res.json({ ok: true, transfer });
  }));
};

module.exports = {
  assertPaidFeatureAvailable,
  assertProductionAiDesignStorageReady,
  assertServerTaskImplemented,
  buildStoredTaskOptions,
  cleanupUpload,
  containsClientAuthority,
  createRequestAbortController,
  inspectUploadedFile,
  installToolTaskRoutes,
  paidFeaturesEnabled,
  parseMultipartRequest,
  rejectClientAuthority,
  taskWorkersEnabled,
  validateOldPhotoOptions,
  validateTaskFields
};
