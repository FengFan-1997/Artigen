const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');
const {
  callSiliconFlowChat,
  callSiliconFlowImageGenerate
} = require('../lib/ai-providers');
const {
  createConfiguredGenerationProvider
} = require('./generation-provider');
const {
  normalizeGeneratedImageAspectRatio
} = require('./ai-design-service');
const {
  GENERATION_IMAGE_MODEL,
  PRODUCT_REFERENCE_PROFILE_ID,
  STANDARD_PROFILE_ID,
  assertGenerationProfile
} = require('./generation-profiles');
const {
  downloadProviderImage,
  extractProviderImageRefs
} = require('./old-photo-service');

const SAFE_FILENAME = /^[A-Za-z0-9._@+ -]{1,200}\.(?:png|jpe?g|webp)$/i;
const SAFE_REFERENCE_PATH = /^\/tmp\/artigen-workspace\/inputs\/[0-9a-f-]{36}\.(?:png|jpe?g|webp)$/i;
const REFERENCE_ROLES = new Set(['product', 'style', 'scene']);
const REFERENCE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_REFERENCE_BYTES = 40 * 1024 * 1024;

const configuredImageCredits = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const normalizeAgentImageReferences = (value) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 1) {
    throw new ApiError(400, 'AGENT_IMAGE_REFERENCES_INVALID');
  }
  const paths = new Set();
  return value.map((reference) => {
    const path = String(reference?.path || '').trim();
    const role = String(reference?.role || '').trim().toLowerCase();
    const mimeType = String(reference?.mimeType || '').trim().toLowerCase();
    const buffer = reference?.buffer;
    if (!SAFE_REFERENCE_PATH.test(path)) {
      throw new ApiError(403, 'AGENT_IMAGE_REFERENCE_PATH_FORBIDDEN');
    }
    if (!REFERENCE_ROLES.has(role)) {
      throw new ApiError(400, 'AGENT_IMAGE_REFERENCE_ROLE_INVALID');
    }
    if (paths.has(path)) {
      throw new ApiError(400, 'AGENT_IMAGE_REFERENCE_DUPLICATE');
    }
    if (!REFERENCE_MIME_TYPES.has(mimeType)) {
      throw new ApiError(415, 'AGENT_IMAGE_REFERENCE_MIME_UNSUPPORTED');
    }
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_REFERENCE_BYTES) {
      throw new ApiError(buffer?.length ? 413 : 422, 'AGENT_IMAGE_REFERENCE_INVALID');
    }
    paths.add(path);
    return { path, role, mimeType, buffer };
  });
};

const referencePrompt = (prompt, references) => {
  if (!references.length) return prompt;
  return [
    prompt,
    `The single reference image has the ${references[0].role} role.`,
    'Use it only for its declared role and do not invent product facts or label text.'
  ].join('\n');
};

const createAgentImageService = ({
  env = process.env,
  chatGenerate = callSiliconFlowChat,
  provider = createConfiguredGenerationProvider({
    imageGenerate: callSiliconFlowImageGenerate,
    chatGenerate,
    env
  }),
  download = downloadProviderImage,
  normalize = normalizeGeneratedImageAspectRatio
} = {}) => {
  const generate = async ({ prompt, aspectRatio = '1:1', filename, references }) => {
    const normalizedPrompt = String(prompt || '').trim();
    const normalizedFilename = String(filename || '').trim();
    if (normalizedPrompt.length < 3 || normalizedPrompt.length > 4000) {
      throw new ApiError(400, 'AGENT_IMAGE_PROMPT_INVALID');
    }
    if (!SAFE_FILENAME.test(normalizedFilename)) {
      throw new ApiError(400, 'AGENT_IMAGE_FILENAME_INVALID');
    }
    const normalizedReferences = normalizeAgentImageReferences(references);
    const profile = assertGenerationProfile({
      profileId: normalizedReferences.length
        ? PRODUCT_REFERENCE_PROFILE_ID
        : STANDARD_PROFILE_ID,
      aspectRatio,
      env
    });
    const generated = await provider.generateImage({
      prompt: referencePrompt(normalizedPrompt, normalizedReferences),
      profile,
      aspectRatio,
      seed: crypto.randomInt(1, 2_147_483_647),
      images: normalizedReferences.map((reference) => (
        `data:${reference.mimeType};base64,${reference.buffer.toString('base64')}`
      ))
    });
    if (String(generated?.modelUsed || '') !== GENERATION_IMAGE_MODEL) {
      throw new ApiError(502, 'AGENT_IMAGE_MODEL_INVALID');
    }
    const reference = extractProviderImageRefs(generated)[0];
    if (!reference) throw new ApiError(502, 'AGENT_IMAGE_OUTPUT_INVALID');
    const image = await download({ reference, env });
    const normalized = await normalize({
      buffer: image.buffer,
      mimeType: image.mimeType,
      aspectRatio,
      maxPixels: 64 * 1000 * 1000
    });
    const extension = normalized.mimeType === 'image/png'
      ? '.png'
      : normalized.mimeType === 'image/webp'
        ? '.webp'
        : '.jpg';
    return {
      buffer: normalized.buffer,
      mimeType: normalized.mimeType,
      filename: normalizedFilename.replace(/\.(?:png|jpe?g|webp)$/i, extension),
      model: generated.modelUsed,
      costCredits: normalizedReferences.length
        ? configuredImageCredits(env.AGENT_IMAGE_REFERENCE_CREDITS, 12)
        : configuredImageCredits(env.AGENT_IMAGE_CREDITS, 8),
      referenceCount: normalizedReferences.length,
      referenceRoles: normalizedReferences.map((reference) => reference.role)
    };
  };
  return { generate };
};

module.exports = {
  MAX_REFERENCE_BYTES,
  REFERENCE_MIME_TYPES,
  REFERENCE_ROLES,
  SAFE_FILENAME,
  SAFE_REFERENCE_PATH,
  configuredImageCredits,
  normalizeAgentImageReferences,
  createAgentImageService
};
