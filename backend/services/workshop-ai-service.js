const crypto = require('crypto');
const { z } = require('zod');
const { ApiError } = require('../lib/api-error');
const {
  buildIngredientLabelPrompt,
  validateIngredientOutputTrace
} = require('../lib/ingredient-source-validator');
const {
  assetToProviderImage,
  extractProviderImageRefs,
  isAbortError,
  throwIfAborted
} = require('./old-photo-service');
const {
  assertOutputAspectRatio,
  persistAiDesignOutput
} = require('./ai-design-service');
const {
  PRODUCT_REFERENCE_PROFILE_ID,
  STANDARD_PROFILE_ID,
  getInternalGenerationProfile
} = require('./generation-profiles');

const PORTRAIT_STYLES = Object.freeze({
  finance: 'Formal finance or legal professional styling, conservative wardrobe, trustworthy studio presence.',
  tech: 'Modern technology founder styling, clean minimal wardrobe, confident and approachable presence.',
  scholar: 'Warm academic or expert styling, calm demeanor, restrained wardrobe and soft studio lighting.',
  creative: 'Tasteful creative-professional styling with distinctive but restrained color and wardrobe.',
  leader: 'Classic executive styling, premium restrained wardrobe, steady leadership presence.'
});

const BACKGROUND_PRESETS = Object.freeze({
  'studio-white': { ratio: '1:1', prompt: 'a seamless white photography studio with a soft natural contact shadow' },
  'studio-dark': { ratio: '1:1', prompt: 'a premium dark photography studio with subtle rim light and a clean floor' },
  'tabletop-wood': { ratio: '1:1', prompt: 'a clean wood tabletop against a light wall with soft natural light' },
  'indoor-sunlight-shadow': { ratio: '1:1', prompt: 'a clean indoor surface with natural window light and restrained leaf shadows' },
  'indoor-wood-counter': { ratio: '1:1', prompt: 'a wood counter against a light tiled wall with soft natural light' },
  'nature-podium-cloud': { ratio: '1:1', prompt: 'a clean blue-sky cloud podium scene with restrained depth and no text' },
  cafe: { ratio: '16:9', prompt: 'a warm cafe scene with soft window light and shallow depth of field' },
  'indoor-table-plant': { ratio: '1:1', prompt: 'a warm living-room round table scene with a softly blurred plant' },
  'neon-city': { ratio: '1:1', prompt: 'a cinematic neon city night scene with restrained bokeh' },
  ocean: { ratio: '16:9', prompt: 'a clean ocean sunset scene with soft golden light' },
  mountains: { ratio: '16:9', prompt: 'a cool misty mountain scene with layered depth' },
  forest: { ratio: '16:9', prompt: 'a fresh forest scene with natural dappled light' },
  'nature-water-surface': { ratio: '16:9', prompt: 'a clear blue water surface scene with subtle ripples and caustics' },
  'nature-beach-soft': { ratio: '16:9', prompt: 'a softly lit beach scene with restrained shallow depth of field' }
});

const PRODUCT_TYPES = ['Food', 'Drug', 'Cosmetic', 'Dietary Supplement'];
const layoutTypes = new Set(['standard', 'drug_facts', 'supplement_facts', 'nutrition_facts']);
const point = z.object({
  x: z.number().finite().min(-0.5).max(0.5),
  y: z.number().finite().min(-0.5).max(0.5)
}).strict();
const portraitSchema = z.object({ style: z.enum(Object.keys(PORTRAIT_STYLES)) }).strict();
const backgroundSchema = z.object({
  mode: z.literal('add'),
  presetId: z.enum(Object.keys(BACKGROUND_PRESETS)),
  subjectScale: z.number().finite().min(0.6).max(1.6).optional(),
  subjectOffset: point.optional()
}).strict();
const ingredientSchema = z.object({
  sourceText: z.string().trim().min(1).max(8000),
  productType: z.enum(PRODUCT_TYPES),
  locale: z.enum(['zh', 'en']).optional()
}).strict();

const validationError = (result) => {
  const issue = result.error?.issues?.[0];
  const path = Array.isArray(issue?.path) && issue.path.length
    ? `options.${issue.path.join('.')}`
    : 'options';
  return new ApiError(400, 'INVALID_OPTIONS', { field: path, retryable: false });
};

const validateWorkshopAiTask = ({ toolId, operation, options, inputCount }) => {
  const key = `${String(toolId || '').trim()}:${String(operation || '').trim()}`;
  const count = Number(inputCount);
  let result;
  if (key === 'id-photo:professional-portrait') {
    if (count !== 1) throw new ApiError(400, 'SINGLE_IMAGE_REQUIRED', { field: 'files' });
    result = portraitSchema.safeParse(options);
  } else if (key === 'background:ai-scene') {
    if (count !== 1) throw new ApiError(400, 'SINGLE_IMAGE_REQUIRED', { field: 'files' });
    result = backgroundSchema.safeParse(options);
  } else if (key === 'ingredient-label:ai-organize-source-text') {
    if (count !== 0) throw new ApiError(400, 'FILES_NOT_ALLOWED', { field: 'files' });
    result = ingredientSchema.safeParse(options);
  } else {
    throw new ApiError(400, 'OPERATION_NOT_SUPPORTED', { field: 'operation' });
  }
  if (!result.success) throw validationError(result);
  return result.data;
};

const workshopAiEnabled = (env = process.env) =>
  /^(1|true)$/i.test(String(env.WORKSHOP_AI_TASK_V2_ENABLED || '').trim());

const assertWorkshopAiAvailable = ({ provider, env = process.env }) => {
  if (!workshopAiEnabled(env) || !provider?.available) {
    throw new ApiError(503, 'TOOL_OPERATION_UNAVAILABLE', { retryable: false });
  }
  return true;
};

const buildPortraitPrompt = (style) => [
  'Create one realistic professional portrait from this exact reference person.',
  'Preserve identity, facial geometry, skin tone, age cues, hairline, visible accessories, and distinguishing features.',
  'Do not face-swap, beautify excessively, change ethnicity, invent text, add a watermark, or add another person.',
  'Use a front-facing or slight three-quarter head-and-shoulders composition on a clean neutral studio background.',
  'Keep natural skin texture, restrained retouching, accurate anatomy, sharp eyes, and soft even studio lighting.',
  PORTRAIT_STYLES[style]
].join(' ');

const positionPhrase = ({ subjectScale = 1, subjectOffset = { x: 0, y: 0 } }) => {
  const horizontal = subjectOffset.x < -0.08 ? 'left of center' : subjectOffset.x > 0.08 ? 'right of center' : 'centered horizontally';
  const vertical = subjectOffset.y < -0.08 ? 'slightly high in frame' : subjectOffset.y > 0.08 ? 'slightly low in frame' : 'centered vertically';
  const size = subjectScale < 0.9 ? 'with generous surrounding space' : subjectScale > 1.1 ? 'prominent in frame' : 'at a balanced scale';
  return `${horizontal}, ${vertical}, ${size}`;
};

const buildBackgroundPrompt = (options) => [
  'Create one realistic scene edit from this exact reference image.',
  'Keep the primary subject unchanged: preserve identity, geometry, material, color, visible logo, and visible label text.',
  'Do not add, remove, duplicate, crop, or redesign the subject. Do not invent text, a watermark, or extra foreground objects.',
  `Place the preserved subject ${positionPhrase(options)}.`,
  `Add this server-approved background scene: ${BACKGROUND_PRESETS[options.presetId].prompt}.`,
  'Match contact shadows, perspective, depth of field, reflections, and lighting so the composite looks physically coherent.'
].join(' ');

const ingredientMessages = (options) => [{
  role: 'system',
  content: 'Return JSON only. Follow the closed-world source rules exactly; any invented fact makes the output invalid.'
}, {
  role: 'user',
  content: buildIngredientLabelPrompt({
    userText: options.sourceText,
    productType: options.productType
  })
}];

const normalizeIngredientOutput = (output, sourceText) => {
  if (!output || typeof output !== 'object' || !Array.isArray(output.sections) || !output.sections.length) {
    throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
  }
  const layoutType = layoutTypes.has(String(output.layoutType || '').trim())
    ? String(output.layoutType).trim()
    : 'standard';
  const normalized = { layoutType, sections: output.sections };
  const trace = validateIngredientOutputTrace(normalized, sourceText);
  if (!trace.ok) {
    throw new ApiError(422, trace.code || 'INGREDIENT_SOURCE_MISMATCH', {
      retryable: false
    });
  }
  return normalized;
};

const taskSeed = (taskId) => crypto
  .createHash('sha256')
  .update(`workshop-ai:${String(taskId || '')}`)
  .digest()
  .readUInt32BE(0);

const normalizeFailure = (error, signal) => {
  if (signal?.reason?.code === 'TASK_LEASE_LOST') return 'TASK_LEASE_LOST';
  if (isAbortError(error, signal)) return 'TASK_CANCELLED';
  const code = String(error?.code || error?.message || '').trim().toUpperCase();
  const allowed = new Set([
    'CONTENT_POLICY_REJECTED',
    'INGREDIENT_SOURCE_MISMATCH',
    'INVALID_INGREDIENT_OUTPUT',
    'MODEL_PROFILE_UNAVAILABLE',
    'AGENT_CLOUDFLARE_FREE_QUOTA_EXHAUSTED',
    'AGENT_CLOUDFLARE_PAID_MODEL_FORBIDDEN',
    'OUTPUT_INVALID',
    'OUTPUT_PERSIST_FAILED',
    'PROVIDER_TIMEOUT',
    'TASK_PAYLOAD_KEY_MISSING',
    'TOOL_OPERATION_UNAVAILABLE'
  ]);
  return allowed.has(code) ? code : 'WORKSHOP_AI_FAILED';
};

const createWorkshopAiExecutor = ({
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
}) => async ({
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
    const toolId = operation === 'professional-portrait'
      ? 'id-photo'
      : operation === 'ai-scene'
        ? 'background'
        : 'ingredient-label';
    const normalized = validateWorkshopAiTask({
      toolId,
      operation,
      options,
      inputCount: inputAssetIds.length
    });
    assertWorkshopAiAvailable({ provider, env });
    throwIfAborted(signal);
    await markRunning({ taskId, leaseOwner });
    throwIfAborted(signal);
    const profile = getInternalGenerationProfile(
      operation === 'ai-organize-source-text'
        ? STANDARD_PROFILE_ID
        : PRODUCT_REFERENCE_PROFILE_ID,
      env
    );

    if (operation === 'ai-organize-source-text') {
      await markProviderDispatched({ taskId, leaseOwner });
      throwIfAborted(signal);
      const providerStartedAt = Date.now();
      const organized = normalizeIngredientOutput(await provider.organizeIngredientSource({
        messages: ingredientMessages(normalized),
        sourceText: normalized.sourceText,
        productType: normalized.productType,
        profile,
        signal
      }), normalized.sourceText);
      const providerMs = Date.now() - providerStartedAt;
      throwIfAborted(signal);
      const data = {
        ...organized,
        productType: normalized.productType,
        sourceTrace: { verified: true }
      };
      const task = await settleTask({
        taskId,
        leaseOwner,
        outputAssetIds: [],
        allowEmptyAssets: true,
        result: {
          assets: [],
          data,
          warnings: [{
            code: 'NO_COMPLIANCE_CONCLUSION',
            messageKey: 'warnings.no_compliance_conclusion'
          }]
        }
      });
      return { ok: true, task, data, outputs: [], providerMs, persistMs: 0 };
    }

    const loaded = await loadInputAsset({
      assetId: inputAssetIds[0],
      ownerUserId,
      signal
    });
    throwIfAborted(signal);
    const aspectRatio = operation === 'professional-portrait'
      ? '3:4'
      : BACKGROUND_PRESETS[normalized.presetId].ratio;
    const prompt = operation === 'professional-portrait'
      ? buildPortraitPrompt(normalized.style)
      : buildBackgroundPrompt(normalized);
    await markProviderDispatched({ taskId, leaseOwner });
    throwIfAborted(signal);
    const providerStartedAt = Date.now();
    const response = await provider.generateImage({
      prompt,
      profile,
      aspectRatio,
      seed: taskSeed(taskId),
      images: [loaded.image],
      signal
    });
    const providerMs = Date.now() - providerStartedAt;
    throwIfAborted(signal);
    const reference = extractProviderImageRefs(response)[0];
    if (!reference) throw new ApiError(502, 'OUTPUT_INVALID', { retryable: true });
    const persistStartedAt = Date.now();
    const output = await persistOutput({
      reference,
      ownerUserId,
      taskId,
      aspectRatio,
      expiresAt: outputExpiresAt instanceof Date
        ? outputExpiresAt
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      signal
    });
    persistedOutput = output;
    const persistMs = Date.now() - persistStartedAt;
    if (!output?.assetId || output.persisted !== true || output.verified !== true) {
      throw new ApiError(502, 'OUTPUT_PERSIST_FAILED', { retryable: true });
    }
    assertOutputAspectRatio(output, aspectRatio);
    throwIfAborted(signal);
    const data = operation === 'professional-portrait'
      ? { style: normalized.style, aspectRatio }
      : {
          mode: normalized.mode,
          presetId: normalized.presetId,
          aspectRatio,
          subjectScale: normalized.subjectScale ?? 1,
          subjectOffset: normalized.subjectOffset ?? { x: 0, y: 0 }
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
    return { ok: true, task, data, outputs: [output], providerMs, persistMs };
  } catch (error) {
    const code = normalizeFailure(error, signal);
    const cancelled = code === 'TASK_CANCELLED';
    let released = null;
    if (code !== 'TASK_LEASE_LOST') {
      released = await releaseTask({
        taskId,
        leaseOwner,
        terminalStatus: cancelled ? 'cancelled' : 'failed',
        errorCode: code
      }).catch(() => null);
    }
    if (persistedOutput?.assetId && typeof getTask === 'function' && typeof deleteOutputAsset === 'function') {
      try {
        const latest = await getTask({ userId: ownerUserId, taskId });
        if (latest?.status !== 'success') {
          await deleteOutputAsset({ assetId: persistedOutput.assetId, ownerUserId });
        }
      } catch {
        // Ambiguous settlement: keep the bounded output until normal retention GC.
      }
    }
    return { ok: false, cancelled, error: code, released };
  }
};

module.exports = {
  BACKGROUND_PRESETS,
  PORTRAIT_STYLES,
  assertWorkshopAiAvailable,
  buildBackgroundPrompt,
  buildPortraitPrompt,
  createWorkshopAiExecutor,
  normalizeIngredientOutput,
  normalizeFailure,
  validateWorkshopAiTask,
  workshopAiEnabled
};
