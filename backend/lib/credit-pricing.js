const parseConfiguredCost = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const normalizeOperationKey = (raw) => {
  const key = String(raw || '').trim().toLowerCase();
  return key ? key.replace(/[\s/-]+/g, '_') : '';
};

const isPaidAiUserId = (userId) => {
  const value = String(userId || '').trim();
  return Boolean(value) && !value.startsWith('guest_');
};

const resolveCreditsCosts = (env = process.env) => {
  const generate = parseConfiguredCost(env.CREDITS_COST_GENERATE, 10);
  const img2img = parseConfiguredCost(
    env.CREDITS_COST_IMG2IMG || env.CREDITS_COST_IMAGE || env.CREDITS_COST_GENERATE,
    10
  );
  return {
    generate,
    img2img,
    aidesignQuick: parseConfiguredCost(env.CREDITS_COST_AIDESIGN_QUICK, 10),
    aidesignSemantic: parseConfiguredCost(env.CREDITS_COST_AIDESIGN_SEMANTIC, 5),
    aidesignFinal: parseConfiguredCost(env.CREDITS_COST_AIDESIGN_FINAL, 10),
    aiLab: parseConfiguredCost(env.CREDITS_COST_AI_LAB, 5),
    aiImageWorkshop: parseConfiguredCost(env.CREDITS_COST_AI_IMAGE_WORKSHOP, 5),
    aiBackground: parseConfiguredCost(env.CREDITS_COST_AI_BACKGROUND, 5),
    aiIdPhoto: parseConfiguredCost(env.CREDITS_COST_AI_ID_PHOTO, 5),
    aiOldPhoto: parseConfiguredCost(env.CREDITS_COST_AI_OLD_PHOTO, 5),
    aiIngredientList: parseConfiguredCost(env.CREDITS_COST_AI_INGREDIENT_LIST, 10)
  };
};

const resolveKnownOperationCost = (operation, costs) => {
  const key = normalizeOperationKey(operation);
  if (key === 'aidesign_quick' || key === 'aidesign_generate' || key === 'aidesign') {
    return costs.aidesignQuick;
  }
  if (
    key === 'aidesign_semantic' ||
    key === 'aidesign_directions' ||
    key === 'aidesign_deep_analysis' ||
    key === 'agentimg_directions'
  ) {
    return costs.aidesignSemantic;
  }
  if (
    key === 'aidesign_final' ||
    key === 'aidesign_deep_generate' ||
    key === 'agentimg_final'
  ) {
    return costs.aidesignFinal;
  }
  if (key === 'agentimg_ingredient_label' || key === 'ingredient_label') {
    return costs.aiIngredientList;
  }
  if (key === 'ai_lab') return costs.aiLab;
  if (key === 'ai_image_workshop') return costs.aiImageWorkshop;
  if (key === 'ai_design') return costs.aidesignQuick;
  if (key === 'ai_background') return costs.aiBackground;
  if (key === 'ai_id_photo' || key === 'id_photo') return costs.aiIdPhoto;
  if (key === 'ai_old_photo' || key === 'old_photo') return costs.aiOldPhoto;
  if (key === 'ai_ingredient_list') return costs.aiIngredientList;
  if (key === 'generate') return costs.generate;
  if (key === 'img2img') return costs.img2img;
  return null;
};

/**
 * Resolve a charge from server-owned configuration only. Extra input properties
 * (including a client supplied `cost`) are deliberately ignored.
 */
const resolveServerCreditCost = (input = {}) => {
  const endpoint = normalizeOperationKey(input.endpoint);
  const costs = resolveCreditsCosts(input.env || process.env);
  const knownCost = resolveKnownOperationCost(input.operation, costs);
  if (knownCost !== null) return knownCost;
  return endpoint === 'img2img' ? costs.img2img : costs.generate;
};

module.exports = {
  normalizeOperationKey,
  isPaidAiUserId,
  resolveCreditsCosts,
  resolveKnownOperationCost,
  resolveServerCreditCost
};
