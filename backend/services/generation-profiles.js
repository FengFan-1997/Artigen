const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');

const STANDARD_PROFILE_ID = 'standard-v1';
const PRODUCT_REFERENCE_PROFILE_ID = 'product-reference-v1';
const GENERATION_IMAGE_MODEL = 'Kwai-Kolors/Kolors';
const GENERATION_EDIT_MODEL = 'Qwen/Qwen-Image-Edit-2509';
const GENERATION_DIRECTIONS_MODEL = 'Qwen/Qwen3-8B';
const SUPPORTED_ASPECT_RATIOS = Object.freeze(['1:1', '4:5', '3:4', '16:9', '9:16']);
const IMAGE_SIZE_BY_ASPECT_RATIO = Object.freeze({
  '1:1': '1024x1024',
  '4:5': '960x1200',
  '3:4': '960x1280',
  '16:9': '1280x720',
  '9:16': '720x1280'
});

const enabledValue = (value) => /^(1|true)$/i.test(String(value || '').trim());

const rolloutPercent = (env = process.env) => {
  const raw = String(env.AI_DESIGN_TASK_V2_ROLLOUT_PERCENT ?? '100').trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.floor(parsed))) : 100;
};

const internalRolloutUsers = (env = process.env) => new Set(
  String(env.AI_DESIGN_TASK_V2_INTERNAL_USERS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const generationRolloutBucket = (subject) => {
  const value = String(subject || '').trim();
  if (!value) return null;
  const digest = crypto
    .createHash('sha256')
    .update(`artigen-ai-design-v2-rollout-v1:${value}`, 'utf8')
    .digest();
  return digest.readUInt32BE(0) % 100;
};

const isAiDesignTaskV2Enabled = (env = process.env, subject = '') => {
  if (!enabledValue(env.AI_DESIGN_TASK_V2_ENABLED)) return false;
  const internalUsers = internalRolloutUsers(env);
  const normalizedSubject = String(subject || '').trim();
  if (normalizedSubject && internalUsers.has(normalizedSubject)) return true;
  const percent = rolloutPercent(env);
  // Public capability discovery stays visible while any cohort is enabled;
  // authenticated quote/task endpoints enforce the stable per-user bucket.
  if (!normalizedSubject) return percent > 0 || internalUsers.size > 0;
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  return generationRolloutBucket(normalizedSubject) < percent;
};

const getInternalGenerationProfile = (profileId) => {
  const id = String(profileId || '').trim();
  if (id === STANDARD_PROFILE_ID) {
    return Object.freeze({
      id: STANDARD_PROFILE_ID,
      name: Object.freeze({ zh: '标准生成', en: 'Standard generation' }),
      capabilities: Object.freeze(['text-to-image']),
      maxReferences: 0,
      aspectRatios: SUPPORTED_ASPECT_RATIOS,
      supportsSeed: true,
      imageSizes: IMAGE_SIZE_BY_ASPECT_RATIO,
      internalTextModel: GENERATION_IMAGE_MODEL,
      internalEditModel: '',
      internalDirectionsModel: GENERATION_DIRECTIONS_MODEL
    });
  }
  if (id === PRODUCT_REFERENCE_PROFILE_ID) {
    return Object.freeze({
      id: PRODUCT_REFERENCE_PROFILE_ID,
      name: Object.freeze({ zh: '商品参考生成', en: 'Product reference generation' }),
      capabilities: Object.freeze([
        'reference-guided-generation',
        'product-reference',
        'style-reference',
        'scene-reference'
      ]),
      maxReferences: 3,
      aspectRatios: SUPPORTED_ASPECT_RATIOS,
      supportsSeed: true,
      imageSizes: IMAGE_SIZE_BY_ASPECT_RATIO,
      internalTextModel: '',
      internalEditModel: GENERATION_EDIT_MODEL,
      internalDirectionsModel: GENERATION_DIRECTIONS_MODEL
    });
  }
  return null;
};

const assertGenerationProfile = ({ profileId, aspectRatio, env = process.env }) => {
  const profile = getInternalGenerationProfile(profileId, env);
  if (!profile) {
    throw new ApiError(409, 'MODEL_PROFILE_UNAVAILABLE', {
      field: 'options.profileId',
      retryable: true
    });
  }
  if (!profile.aspectRatios.includes(String(aspectRatio || '').trim())) {
    throw new ApiError(400, 'INVALID_ASPECT_RATIO', {
      field: 'options.aspectRatio',
      retryable: false
    });
  }
  return profile;
};

const toPublicGenerationProfile = (profile, { available }) => ({
  id: profile.id,
  name: { ...profile.name },
  available: Boolean(available),
  capabilities: [...profile.capabilities],
  maxReferences: profile.maxReferences,
  aspectRatios: [...profile.aspectRatios],
  supportsSeed: profile.supportsSeed
});

const listPublicGenerationProfiles = ({
  env = process.env,
  providerAvailable = false,
  subject = ''
} = {}) => {
  const standard = getInternalGenerationProfile(STANDARD_PROFILE_ID, env);
  const reference = getInternalGenerationProfile(PRODUCT_REFERENCE_PROFILE_ID, env);
  const available = isAiDesignTaskV2Enabled(env, subject) && providerAvailable;
  return [standard, reference].map((profile) => toPublicGenerationProfile(profile, { available }));
};

module.exports = {
  GENERATION_DIRECTIONS_MODEL,
  GENERATION_EDIT_MODEL,
  GENERATION_IMAGE_MODEL,
  IMAGE_SIZE_BY_ASPECT_RATIO,
  PRODUCT_REFERENCE_PROFILE_ID,
  STANDARD_PROFILE_ID,
  SUPPORTED_ASPECT_RATIOS,
  assertGenerationProfile,
  generationRolloutBucket,
  getInternalGenerationProfile,
  internalRolloutUsers,
  isAiDesignTaskV2Enabled,
  listPublicGenerationProfiles,
  rolloutPercent,
  toPublicGenerationProfile
};
