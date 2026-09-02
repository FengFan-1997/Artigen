'use strict';

const DEV_CLOUDFLARE_MODEL = '@cf/openai/gpt-oss-120b';
const DEV_SILICONFLOW_MODEL = 'Qwen/Qwen3-8B';

const resolveAgentSmokeModelProfile = ({ env = process.env, production = false } = {}) => {
  // GPT-OSS is the only text model used by deployed Agent environments.
  // SiliconFlow remains an image-only provider; the legacy branch is kept
  // solely so historical deterministic fixtures can still describe old runs.
  const requestedProvider = String(env.AGENT_MODEL_PROVIDER || 'cloudflare').trim().toLowerCase();
  const runtimeEnvironment = String(env.NODE_ENV || '').trim().toLowerCase();
  const fixtureOnly = runtimeEnvironment === 'test' ||
    String(env.AGENT_RUNTIME_DRIVER || '').trim().toLowerCase() === 'fixture';
  if (requestedProvider === 'siliconflow' && !fixtureOnly && !production) {
    const error = new Error('AGENT_CLOUDFLARE_TEXT_MODEL_REQUIRED');
    error.code = 'AGENT_CLOUDFLARE_TEXT_MODEL_REQUIRED';
    throw error;
  }
  const provider = requestedProvider;
  const model = String(
    env.AGENT_MODEL_NAME || (
      provider === 'cloudflare' ? DEV_CLOUDFLARE_MODEL : DEV_SILICONFLOW_MODEL
    )
  ).trim();
  if (
    (provider === 'cloudflare' && model !== DEV_CLOUDFLARE_MODEL) ||
    (provider === 'siliconflow' && model !== DEV_SILICONFLOW_MODEL) ||
    !['cloudflare', 'siliconflow'].includes(provider)
  ) {
    const error = new Error('AGENT_SMOKE_MODEL_PROFILE_INVALID');
    error.code = 'AGENT_SMOKE_MODEL_PROFILE_INVALID';
    throw error;
  }
  if (production && provider !== 'cloudflare') {
    const error = new Error('AGENT_PRODUCTION_MODEL_PROFILE_INVALID');
    error.code = 'AGENT_PRODUCTION_MODEL_PROFILE_INVALID';
    throw error;
  }
  return Object.freeze({
    provider,
    model,
    expected: Object.freeze({ provider, model }),
    requiredKeychainSecrets: Object.freeze(
      provider === 'cloudflare'
        ? ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']
        : ['SILICONFLOW_API_KEY']
    )
  });
};

const applyAgentSmokeModelProfile = (env, profile) => {
  if (!env || !profile) throw new TypeError('AGENT_SMOKE_MODEL_PROFILE_REQUIRED');
  env.AGENT_MODEL_PROVIDER = profile.provider;
  env.AGENT_MODEL_NAME = profile.model;
  if (profile.provider === 'cloudflare') {
    const attested = /^(1|true|yes|on)$/i.test(
      String(env.AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED || '')
    );
    if (!attested) {
      const error = new Error('AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED');
      error.code = 'AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED';
      throw error;
    }
    const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const freeAccountId = String(env.AGENT_CLOUDFLARE_FREE_ACCOUNT_ID || '').trim();
    if (!/^[0-9a-f]{32}$/i.test(accountId) ||
        !/^[0-9a-f]{32}$/i.test(freeAccountId) ||
        freeAccountId.toLowerCase() !== accountId.toLowerCase()) {
      const error = new Error('AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED');
      error.code = 'AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED';
      throw error;
    }
  } else {
    env.AGENT_SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
  }
  return env;
};

module.exports = {
  DEV_CLOUDFLARE_MODEL,
  DEV_SILICONFLOW_MODEL,
  applyAgentSmokeModelProfile,
  resolveAgentSmokeModelProfile
};
