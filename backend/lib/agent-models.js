'use strict';

/**
 * Runtime model contract. Keep this module dependency-free so production,
 * harnesses and maintenance scripts cannot silently drift to another model.
 */
const TEXT_MODEL = '@cf/openai/gpt-oss-120b';
const IMAGE_MODEL = 'Kwai-Kolors/Kolors';
// Historical fixture-only text model. It must never be selected by a
// deployed runtime; keeping the value centralized lets old replay fixtures
// remain readable without reintroducing a production model fork.
const LEGACY_SILICONFLOW_TEXT_MODEL = 'Qwen/Qwen3-8B';

const assertTextModel = (model) => {
  if (String(model || '').trim() !== TEXT_MODEL) {
    const error = new Error('AGENT_TEXT_MODEL_NOT_ALLOWED');
    error.code = 'AGENT_TEXT_MODEL_NOT_ALLOWED';
    throw error;
  }
  return TEXT_MODEL;
};

const assertImageModel = (model) => {
  if (String(model || '').trim() !== IMAGE_MODEL) {
    const error = new Error('AGENT_IMAGE_MODEL_NOT_ALLOWED');
    error.code = 'AGENT_IMAGE_MODEL_NOT_ALLOWED';
    throw error;
  }
  return IMAGE_MODEL;
};

module.exports = {
  TEXT_MODEL,
  IMAGE_MODEL,
  LEGACY_SILICONFLOW_TEXT_MODEL,
  assertTextModel,
  assertImageModel
};
