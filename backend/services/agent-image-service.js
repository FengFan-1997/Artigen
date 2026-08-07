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
  STANDARD_PROFILE_ID,
  assertGenerationProfile
} = require('./generation-profiles');
const {
  downloadProviderImage,
  extractProviderImageRefs
} = require('./old-photo-service');

const SAFE_FILENAME = /^[A-Za-z0-9._@+ -]{1,200}\.(?:png|jpe?g|webp)$/i;

const createAgentImageService = ({
  env = process.env,
  provider = createConfiguredGenerationProvider({
    imageGenerate: callSiliconFlowImageGenerate,
    chatGenerate: callSiliconFlowChat,
    env
  }),
  download = downloadProviderImage
} = {}) => {
  const generate = async ({ prompt, aspectRatio = '1:1', filename }) => {
    const normalizedPrompt = String(prompt || '').trim();
    const normalizedFilename = String(filename || '').trim();
    if (normalizedPrompt.length < 3 || normalizedPrompt.length > 4000) {
      throw new ApiError(400, 'AGENT_IMAGE_PROMPT_INVALID');
    }
    if (!SAFE_FILENAME.test(normalizedFilename)) {
      throw new ApiError(400, 'AGENT_IMAGE_FILENAME_INVALID');
    }
    const profile = assertGenerationProfile({
      profileId: STANDARD_PROFILE_ID,
      aspectRatio,
      env
    });
    const generated = await provider.generateImage({
      prompt: normalizedPrompt,
      profile,
      aspectRatio,
      seed: crypto.randomInt(1, 2_147_483_647),
      images: []
    });
    const reference = extractProviderImageRefs(generated)[0];
    if (!reference) throw new ApiError(502, 'AGENT_IMAGE_OUTPUT_INVALID');
    const image = await download({ reference, env });
    const extension = image.mimeType === 'image/png' ? '.png' : '.jpg';
    return {
      buffer: image.buffer,
      mimeType: image.mimeType,
      filename: normalizedFilename.replace(/\.(?:png|jpe?g|webp)$/i, extension),
      costCredits: Math.max(0, Number(env.AGENT_IMAGE_CREDITS || 8))
    };
  };
  return { generate };
};

module.exports = {
  SAFE_FILENAME,
  createAgentImageService
};
