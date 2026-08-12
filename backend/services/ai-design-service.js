const crypto = require('crypto');
const sharp = require('sharp');
const { z } = require('zod');
const { ApiError } = require('../lib/api-error');
const defaultAssets = require('./asset-storage');
const {
  assetToProviderImage,
  downloadProviderImage,
  extractProviderImageRefs,
  isAbortError,
  throwIfAborted
} = require('./old-photo-service');
const {
  PRODUCT_REFERENCE_PROFILE_ID,
  STANDARD_PROFILE_ID,
  IMAGE_SIZE_BY_ASPECT_RATIO,
  assertGenerationProfile,
  getInternalGenerationProfile,
  isAiDesignTaskV2Enabled
} = require('./generation-profiles');

const MAX_PROMPT_LENGTH = 4000;
const MAX_REFERENCE_IMAGES = 1;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 32 * 1000 * 1000;
const OUTPUT_RETENTION_HOURS = 30 * 24;
const OUTPUT_MIMES = new Set(['image/png', 'image/jpeg']);
const NORMALIZABLE_OUTPUT_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const textField = (max) => z.string().trim().min(1).max(max);
const optionalProfileText = z.string().trim().max(200).optional();
const optionalProfileList = z.array(z.string().trim().min(1).max(80)).max(12).optional();

const productProfileSchema = z.object({
  productName: optionalProfileText,
  productCategory: optionalProfileText,
  material: optionalProfileText,
  sceneType: optionalProfileText,
  lighting: optionalProfileText,
  primaryColor: optionalProfileText,
  brandName: optionalProfileText,
  designElements: optionalProfileList,
  styles: optionalProfileList,
  colors: optionalProfileList
}).strict();

const directionSchema = z.object({
  id: textField(80),
  title: textField(100),
  summary: textField(400),
  prompt: textField(2000)
}).strict();
const referenceRoleSchema = z.enum(['product', 'style', 'scene']);

const directionsOptionsSchema = z.object({
  prompt: textField(MAX_PROMPT_LENGTH),
  locale: z.enum(['zh', 'en']),
  productProfile: productProfileSchema.optional()
}).strict();

const generateOptionsSchema = z.object({
  prompt: textField(MAX_PROMPT_LENGTH),
  profileId: z.enum([STANDARD_PROFILE_ID, PRODUCT_REFERENCE_PROFILE_ID]),
  aspectRatio: textField(12),
  seed: z.number().int().min(0).max(0xffffffff).optional(),
  direction: directionSchema.optional(),
  referenceRoles: z.array(referenceRoleSchema).max(MAX_REFERENCE_IMAGES).optional()
}).strict();

const validationError = (result) => {
  const issue = result.error?.issues?.[0];
  const path = Array.isArray(issue?.path) && issue.path.length
    ? `options.${issue.path.join('.')}`
    : 'options';
  return new ApiError(400, 'INVALID_OPTIONS', { field: path, retryable: false });
};

const validateAiDesignTask = ({ operation, options, inputCount = 0, env = process.env }) => {
  const normalizedOperation = String(operation || '').trim();
  const count = Number(inputCount);
  if (!Number.isInteger(count) || count < 0) {
    throw new ApiError(400, 'INVALID_INPUT_ASSETS', { field: 'inputAssets' });
  }
  if (normalizedOperation === 'directions') {
    if (count !== 0) {
      throw new ApiError(400, 'DIRECTIONS_DOES_NOT_ACCEPT_IMAGES', { field: 'inputAssets' });
    }
    const parsed = directionsOptionsSchema.safeParse(options);
    if (!parsed.success) throw validationError(parsed);
    return parsed.data;
  }
  if (normalizedOperation === 'generate') {
    if (count > MAX_REFERENCE_IMAGES) {
      throw new ApiError(413, 'TOO_MANY_FILES', { field: 'inputAssets' });
    }
    const parsed = generateOptionsSchema.safeParse(options);
    if (!parsed.success) {
      const aspectIssue = parsed.error.issues.find((issue) => issue.path?.[0] === 'aspectRatio');
      const profileIssue = parsed.error.issues.find((issue) => issue.path?.[0] === 'profileId');
      if (profileIssue) {
        throw new ApiError(409, 'MODEL_PROFILE_UNAVAILABLE', {
          field: 'options.profileId',
          retryable: true
        });
      }
      if (aspectIssue) {
        throw new ApiError(400, 'INVALID_ASPECT_RATIO', {
          field: 'options.aspectRatio',
          retryable: false
        });
      }
      throw validationError(parsed);
    }
    const profile = assertGenerationProfile({
      profileId: parsed.data.profileId,
      aspectRatio: parsed.data.aspectRatio,
      env
    });
    if (count > profile.maxReferences) {
      throw new ApiError(400, 'REFERENCE_IMAGES_NOT_SUPPORTED', {
        field: 'inputAssets',
        retryable: false
      });
    }
    if (profile.id === PRODUCT_REFERENCE_PROFILE_ID && count === 0) {
      throw new ApiError(400, 'REFERENCE_IMAGE_REQUIRED', {
        field: 'inputAssets',
        retryable: false
      });
    }
    const referenceRoles = parsed.data.referenceRoles ||
      ['product', 'style', 'scene'].slice(0, count);
    if (
      referenceRoles.length !== count ||
      new Set(referenceRoles).size !== referenceRoles.length
    ) {
      throw new ApiError(400, 'INVALID_REFERENCE_ROLES', {
        field: 'options.referenceRoles',
        retryable: false
      });
    }
    return { ...parsed.data, referenceRoles };
  }
  throw new ApiError(400, 'OPERATION_NOT_SUPPORTED', { field: 'operation' });
};

const assertAiDesignAvailable = ({ provider, env = process.env, subject = '' }) => {
  if (!isAiDesignTaskV2Enabled(env, subject) || !provider?.available) {
    throw new ApiError(503, 'MODEL_PROFILE_UNAVAILABLE', { retryable: true });
  }
  return true;
};

const deriveTaskSeed = (taskId) => {
  const digest = crypto.createHash('sha256').update(String(taskId || ''), 'utf8').digest();
  return digest.readUInt32BE(0);
};

const buildGenerationPrompt = ({ prompt, direction, referenceRoles = [], aspectRatio }) => {
  const parts = [
    'Create one polished commerce or creator-ready visual that follows the supplied request.',
    `User request: ${prompt}`,
    `Compose the final canvas at the exact ${aspectRatio} aspect ratio.`
  ];
  if (direction) {
    parts.push(`Selected visual direction: ${direction.title}. ${direction.summary}. ${direction.prompt}`);
  }
  if (referenceRoles.length > 0) {
    const roleLabels = {
      product: 'product identity reference',
      style: 'visual style reference',
      scene: 'scene reference'
    };
    parts.push(
      `Reference image order is semantic: ${referenceRoles.map((role) => roleLabels[role]).join(', ')}.`,
      'Use each reference only for its named role and as supplied visual evidence. Preserve product identity, geometry, material, visible logo, and visible label text. Do not invent or rewrite product facts.'
    );
  }
  parts.push('Return only the image; do not add an explanatory caption, mock watermark, or unintended border.');
  return parts.join(' ');
};

const persistAiDesignOutput = async ({
  reference,
  ownerUserId,
  taskId,
  expiresAt,
  aspectRatio,
  signal,
  assetService = defaultAssets,
  download = downloadProviderImage
}) => {
  const downloaded = await download({ reference, signal });
  throwIfAborted(signal);
  if (!OUTPUT_MIMES.has(String(downloaded?.mimeType || '').toLowerCase())) {
    throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
  }
  const normalized = await normalizeGeneratedImageAspectRatio({
    buffer: downloaded.buffer,
    mimeType: downloaded.mimeType,
    aspectRatio,
    maxPixels: MAX_IMAGE_PIXELS
  });
  const asset = await assetService.storeAsset({
    ownerUserId,
    buffer: normalized.buffer,
    declaredMime: normalized.mimeType,
    maxBytes: MAX_IMAGE_BYTES,
    maxPixels: MAX_IMAGE_PIXELS,
    expiresAt,
    retentionClass: 'generated-output',
    metadata: { source: 'ai-design-result', taskId }
  });
  throwIfAborted(signal);
  return { ...asset, persisted: true, verified: true };
};

const ratioValue = (aspectRatio) => {
  const [width, height] = String(aspectRatio || '').split(':').map(Number);
  return width > 0 && height > 0 ? width / height : 0;
};

const normalizeGeneratedImageAspectRatio = async ({
  buffer,
  mimeType,
  aspectRatio,
  maxPixels = MAX_IMAGE_PIXELS,
  tolerance = 0.005
}) => {
  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  if (!Buffer.isBuffer(buffer) || !buffer.length || !NORMALIZABLE_OUTPUT_MIMES.has(normalizedMime)) {
    throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
  }
  const targetSize = String(IMAGE_SIZE_BY_ASPECT_RATIO[aspectRatio] || '').trim();
  if (!targetSize) {
    if (!aspectRatio) return { buffer, mimeType: normalizedMime, transformed: false };
    throw new ApiError(400, 'INVALID_ASPECT_RATIO', {
      field: 'aspectRatio',
      retryable: false
    });
  }
  const [targetWidth, targetHeight] = targetSize.split('x').map(Number);
  let metadata;
  try {
    metadata = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: Math.max(1, Number(maxPixels || MAX_IMAGE_PIXELS))
    }).metadata();
  } catch {
    throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
  }
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  const expected = targetWidth / targetHeight;
  const actual = width / height;
  if (!width || !height || !Number.isFinite(actual)) {
    throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
  }
  if (Math.abs(actual - expected) / expected <= tolerance) {
    return { buffer, mimeType: normalizedMime, width, height, transformed: false };
  }
  try {
    let pipeline = sharp(buffer, {
      failOn: 'error',
      limitInputPixels: Math.max(1, Number(maxPixels || MAX_IMAGE_PIXELS))
    }).rotate().resize(targetWidth, targetHeight, {
      fit: 'cover',
      position: 'centre'
    });
    if (normalizedMime === 'image/png') pipeline = pipeline.png({ compressionLevel: 9 });
    else if (normalizedMime === 'image/webp') pipeline = pipeline.webp({ quality: 95 });
    else pipeline = pipeline.jpeg({ quality: 95, mozjpeg: true });
    const output = await pipeline.toBuffer({ resolveWithObject: true });
    if (
      !output.data.length ||
      Number(output.info.width) !== targetWidth ||
      Number(output.info.height) !== targetHeight
    ) {
      throw new Error('invalid normalized image');
    }
    return {
      buffer: output.data,
      mimeType: normalizedMime,
      width: targetWidth,
      height: targetHeight,
      transformed: true,
      sourceWidth: width,
      sourceHeight: height
    };
  } catch {
    throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
  }
};

const assertOutputAspectRatio = (output, aspectRatio, tolerance = 0.035) => {
  const expected = ratioValue(aspectRatio);
  const actual = Number(output?.width || 0) / Number(output?.height || 0);
  if (!expected || !Number.isFinite(actual) || actual <= 0) {
    throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
  }
  if (Math.abs(actual - expected) / expected > tolerance) {
    throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
  }
  return true;
};

const normalizeDirections = (directions) => {
  const parsed = z.array(directionSchema).length(4).safeParse(directions);
  if (!parsed.success) throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
  const ids = new Set(parsed.data.map((direction) => direction.id));
  if (ids.size !== 4) throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
  return parsed.data;
};

const normalizeAiDesignFailure = (error, signal) => {
  if (signal?.reason?.code === 'TASK_LEASE_LOST') return 'TASK_LEASE_LOST';
  const raw = String(error?.code || error?.message || '').trim().toUpperCase();
  const allowed = new Set([
    'CONTENT_POLICY_REJECTED',
    'INVALID_ASPECT_RATIO',
    'MODEL_PROFILE_UNAVAILABLE',
    'OUTPUT_INVALID',
    'OUTPUT_PERSIST_FAILED',
    'PROVIDER_TIMEOUT',
    'TASK_LEASE_LOST',
    'TASK_PAYLOAD_KEY_MISSING'
  ]);
  if (allowed.has(raw)) return raw;
  if (signal?.aborted || raw === 'TASK_CANCELLED') return 'TASK_CANCELLED';
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') return 'PROVIDER_TIMEOUT';
  if (isAbortError(error, signal)) return 'TASK_CANCELLED';
  return 'AI_DESIGN_FAILED';
};

const configuredProviderCostMinor = (operation, env = process.env, profileId = '') => {
  const key = operation === 'directions'
    ? 'AI_DESIGN_DIRECTIONS_COST_MINOR'
    : profileId === PRODUCT_REFERENCE_PROFILE_ID
      ? 'AI_DESIGN_REFERENCE_COST_MINOR'
      : 'AI_DESIGN_GENERATE_COST_MINOR';
  const value = Number(env[key]);
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(1_000_000_000, value) : null;
};

const createAiDesignExecutor = ({
  provider,
  loadInputAsset = assetToProviderImage,
  persistOutput = persistAiDesignOutput,
  markRunning,
  markProviderDispatched,
  settleTask,
  releaseTask,
  getTask,
  deleteOutputAsset,
  env = process.env
}) => {
  return async ({
    taskId,
    ownerUserId,
    operation,
    options = {},
    inputAssetIds = [],
    outputExpiresAt,
    leaseOwner,
    signal
  }) => {
    let persistedOutput = null;
    try {
      const normalizedOptions = validateAiDesignTask({
        operation,
        options,
        inputCount: inputAssetIds.length,
        env
      });
      assertAiDesignAvailable({ provider, env, subject: ownerUserId });
      throwIfAborted(signal);
      if (typeof markRunning !== 'function') {
        throw new ApiError(503, 'TASK_RUNNER_NOT_CONFIGURED', { retryable: true });
      }
      await markRunning({ taskId, leaseOwner });
      throwIfAborted(signal);
      const profile = getInternalGenerationProfile(
        operation === 'generate' ? normalizedOptions.profileId : STANDARD_PROFILE_ID,
        env
      );

      if (operation === 'directions') {
        if (typeof markProviderDispatched !== 'function') {
          throw new ApiError(503, 'TASK_RUNNER_NOT_CONFIGURED', { retryable: true });
        }
        await markProviderDispatched({ taskId, leaseOwner });
        throwIfAborted(signal);
        const providerStartedAt = Date.now();
        const directions = normalizeDirections(await provider.generateDirections({
          ...normalizedOptions,
          profile,
          signal
        }));
        const providerMs = Date.now() - providerStartedAt;
        throwIfAborted(signal);
        if (typeof settleTask !== 'function') {
          throw new ApiError(503, 'TASK_RUNNER_NOT_CONFIGURED', { retryable: true });
        }
        const task = await settleTask({
          taskId,
          leaseOwner,
          outputAssetIds: [],
          allowEmptyAssets: true,
          result: {
            assets: [],
            data: { directions },
            warnings: []
          }
        });
        return {
          ok: true,
          task,
          data: { directions },
          outputs: [],
          providerMs,
          persistMs: 0,
          providerCostMinor: configuredProviderCostMinor(operation, env)
        };
      }

      const inputs = [];
      for (const assetId of inputAssetIds) {
        const loaded = await loadInputAsset({
          assetId,
          ownerUserId,
          signal
        });
        throwIfAborted(signal);
        if (!loaded?.image) throw new ApiError(415, 'UNSUPPORTED_INPUT_TYPE');
        inputs.push(loaded.image);
      }
      const seed = Number.isInteger(normalizedOptions.seed)
        ? normalizedOptions.seed
        : deriveTaskSeed(taskId);
      if (typeof markProviderDispatched !== 'function') {
        throw new ApiError(503, 'TASK_RUNNER_NOT_CONFIGURED', { retryable: true });
      }
      await markProviderDispatched({ taskId, leaseOwner });
      throwIfAborted(signal);
      const providerStartedAt = Date.now();
      const providerResponse = await provider.generateImage({
        prompt: buildGenerationPrompt({
          prompt: normalizedOptions.prompt,
          direction: normalizedOptions.direction,
          referenceRoles: normalizedOptions.referenceRoles,
          aspectRatio: normalizedOptions.aspectRatio
        }),
        profile,
        aspectRatio: normalizedOptions.aspectRatio,
        seed,
        images: inputs,
        signal
      });
      const providerMs = Date.now() - providerStartedAt;
      throwIfAborted(signal);
      const reference = extractProviderImageRefs(providerResponse)[0];
      if (!reference) throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
      const expiresAt = outputExpiresAt instanceof Date
        ? outputExpiresAt
        : new Date(Date.now() + OUTPUT_RETENTION_HOURS * 60 * 60 * 1000);
      const persistStartedAt = Date.now();
      const output = await persistOutput({
        reference,
        ownerUserId,
        taskId,
        expiresAt,
        aspectRatio: normalizedOptions.aspectRatio,
        signal
      });
      persistedOutput = output;
      const persistMs = Date.now() - persistStartedAt;
      if (!output?.assetId || output.persisted !== true || output.verified !== true) {
        throw new ApiError(502, 'OUTPUT_PERSIST_FAILED', { retryable: true });
      }
      assertOutputAspectRatio(output, normalizedOptions.aspectRatio);
      throwIfAborted(signal);
      if (typeof settleTask !== 'function') {
        throw new ApiError(503, 'TASK_RUNNER_NOT_CONFIGURED', { retryable: true });
      }
      const data = {
        profileId: profile.id,
        aspectRatio: normalizedOptions.aspectRatio,
        seed
      };
      const task = await settleTask({
        taskId,
        leaseOwner,
        outputAssetIds: [output.assetId],
        result: {
          assets: [{
            assetId: output.assetId,
            mimeType: output.mimeType,
            byteSize: output.byteSize,
            width: output.width,
            height: output.height
          }],
          data,
          warnings: []
        }
      });
      return {
        ok: true,
        task,
        data,
        outputs: [output],
        providerMs,
        persistMs,
        providerCostMinor: configuredProviderCostMinor(operation, env, profile.id)
      };
    } catch (error) {
      const code = normalizeAiDesignFailure(error, signal);
      const cancelled = code === 'TASK_CANCELLED';
      let released = null;
      let releaseError = null;
      if (code !== 'TASK_LEASE_LOST') {
        try {
          if (typeof releaseTask !== 'function') {
            throw new ApiError(503, 'TASK_RUNNER_NOT_CONFIGURED', { retryable: true });
          }
          released = await releaseTask({
            taskId,
            leaseOwner,
            terminalStatus: cancelled ? 'cancelled' : 'failed',
            errorCode: code
          });
        } catch (refundFailure) {
          releaseError = String(refundFailure?.code || refundFailure?.message || 'RELEASE_FAILED');
        }
      }
      if (
        persistedOutput?.assetId &&
        typeof getTask === 'function' &&
        typeof deleteOutputAsset === 'function'
      ) {
        try {
          const latest = await getTask({ userId: ownerUserId, taskId });
          if (latest?.status !== 'success') {
            await deleteOutputAsset({
              assetId: persistedOutput.assetId,
              ownerUserId
            });
          }
        } catch (cleanupError) {
          // Do not delete on an ambiguous database read: the settlement may
          // have committed even if its response was lost. Normal retention GC
          // remains the safe fallback for an unconfirmed orphan.
          console.error(
            'AI design output cleanup deferred',
            taskId,
            cleanupError?.code || cleanupError?.message || cleanupError
          );
        }
      }
      return {
        ok: false,
        cancelled,
        error: code,
        released,
        ...(releaseError ? { releaseError } : {})
      };
    }
  };
};

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_PROMPT_LENGTH,
  MAX_REFERENCE_IMAGES,
  OUTPUT_RETENTION_HOURS,
  assertAiDesignAvailable,
  assertOutputAspectRatio,
  buildGenerationPrompt,
  configuredProviderCostMinor,
  createAiDesignExecutor,
  deriveTaskSeed,
  normalizeAiDesignFailure,
  normalizeDirections,
  normalizeGeneratedImageAspectRatio,
  persistAiDesignOutput,
  validateAiDesignTask
};
