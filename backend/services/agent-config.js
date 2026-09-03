const crypto = require('node:crypto');

const { ApiError } = require('../lib/api-error');
const { readMacOsKeychainSecret } = require('../lib/local-keychain');

const enabled = (value) => /^(1|true|yes|on)$/i.test(String(value || '').trim());
const normalizedEnvironment = (value) => String(value || '').trim().toLowerCase();
const isProductionIntent = (env = process.env) => (
  ['production', 'prod'].includes(normalizedEnvironment(env.NODE_ENV)) ||
  ['production', 'prod'].includes(normalizedEnvironment(env.APP_ENV))
);
const isTestFixtureRuntime = (env = process.env) => (
  normalizedEnvironment(env.NODE_ENV) === 'test' &&
  ['', 'dev', 'development'].includes(normalizedEnvironment(env.APP_ENV))
);
const isDeployedRuntime = (env = process.env) => {
  const nodeEnvironment = normalizedEnvironment(env.NODE_ENV);
  const appEnvironment = normalizedEnvironment(env.APP_ENV);
  const declaredDeployment = isProductionIntent(env) ||
    ['dev', 'development', 'staging'].includes(nodeEnvironment) ||
    ['dev', 'development', 'staging'].includes(appEnvironment);
  return declaredDeployment && !isTestFixtureRuntime(env);
};
const integer = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  const resolved = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(minimum, Math.min(maximum, resolved));
};

const ACTOR_SAMPLING_PROFILES = Object.freeze({
  'stable-v1': Object.freeze({ id: 'stable-v1', temperature: 0.2, topP: 0.7 }),
  'exploratory-v1': Object.freeze({ id: 'exploratory-v1', temperature: 0.4, topP: 0.8 })
});
const STAGE_MAX_OUTPUT_TOKENS = Object.freeze({
  router: 1200,
  planner: 2048,
  actor: 1024,
  verifier: 2048,
  subagent: 1200,
  final_summary: 800
});

const agentFeatureEnabled = (env = process.env) => enabled(env.AGENT_FEATURE_ENABLED);
const agentWorkerEnabled = (env = process.env) => (
  agentFeatureEnabled(env) && enabled(env.AGENT_WORKER_ENABLED)
);
const SILICONFLOW_AGENT_MODEL = 'Qwen/Qwen3-8B';
const CLOUDFLARE_AGENT_MODEL = '@cf/openai/gpt-oss-120b';
const AGENT_BROWSER_MODE = 'full-approval-v1';
const AGENT_BETA_MODE = 'owner-only-v1';
const AGENT_AUTHENTICATED_MODE = 'authenticated-v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const uuidList = (value, { code, maximum = 100 } = {}) => {
  const entries = String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length > maximum || entries.some((entry) => !UUID_RE.test(entry))) {
    throw new ApiError(500, code);
  }
  return Object.freeze([...new Set(entries)]);
};

const resolveAgentRuntimeAssignment = (config, userId) => {
  if (!config?.runtimeV2Enabled) return Object.freeze({ version: 1, reason: 'disabled' });
  const normalizedUserId = String(userId || '').trim().toLowerCase();
  if (config.runtimeV2CanaryUserIds?.includes(normalizedUserId)) {
    return Object.freeze({ version: 2, reason: 'canary' });
  }
  const rolloutPercent = Number(config.runtimeV2RolloutPercent || 0);
  if (rolloutPercent <= 0) return Object.freeze({ version: 1, reason: 'control' });
  if (rolloutPercent >= 100) return Object.freeze({ version: 2, reason: 'rollout' });
  const bucket = crypto.createHash('sha256')
    .update(`artigen-agent-runtime-v2-rollout-v1:${normalizedUserId}`, 'utf8')
    .digest()
    .readUInt32BE(0) % 100;
  return Object.freeze({
    version: bucket < rolloutPercent ? 2 : 1,
    reason: bucket < rolloutPercent ? 'rollout' : 'control'
  });
};

const assertLoopbackHttpUrl = (value, code) => {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new ApiError(500, code);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '::1'].includes(hostname) ||
    url.username ||
    url.password
  ) {
    throw new ApiError(500, code);
  }
  return url.toString().replace(/\/+$/, '');
};

const assertSiliconFlowUrl = (value) => {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new ApiError(500, 'AGENT_SILICONFLOW_BASE_URL_INVALID');
  }
  if (
    url.protocol !== 'https:' ||
    url.origin !== 'https://api.siliconflow.cn' ||
    url.pathname.replace(/\/+$/, '') !== '/v1' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ApiError(500, 'AGENT_SILICONFLOW_BASE_URL_INVALID');
  }
  return `${url.origin}/v1`;
};

const getAgentConfig = (env = process.env) => {
  const nodeEnvironment = normalizedEnvironment(env.NODE_ENV);
  const production = isProductionIntent(env);
  const runtimeDriver = String(env.AGENT_RUNTIME_DRIVER || 'live').trim().toLowerCase();
  if (!['live', 'fixture'].includes(runtimeDriver)) {
    throw new ApiError(500, 'AGENT_RUNTIME_DRIVER_INVALID');
  }
  // Cloudflare's free GPT-OSS 120B is the default text model for every
  // deployed Agent environment. SiliconFlow remains reserved for images.
  const modelProvider = String(env.AGENT_MODEL_PROVIDER || 'cloudflare').trim().toLowerCase();
  const textModelHardLock = enabled(env.AGENT_TEXT_MODEL_HARD_LOCK);
  const appEnvironment = normalizedEnvironment(env.APP_ENV);
  const deploymentIntent = production ||
    ['production', 'dev', 'development', 'staging', 'prod'].includes(appEnvironment) ||
    ['production', 'prod', 'dev', 'development', 'staging'].includes(nodeEnvironment);
  // Test fixtures remain isolated unless they explicitly carry a production
  // fixture app intent. This keeps NODE_ENV=test + APP_ENV=dev fixtures
  // available, while fail-closing staging/production app intents even when a
  // platform process was accidentally launched with NODE_ENV=test.
  const testFixtureRuntime = isTestFixtureRuntime(env);
  // A deployed app intent must never run with fixture providers, even when
  // the platform happens to start the process with NODE_ENV=test/development.
  // The only exception is an explicitly isolated test fixture (test + empty,
  // dev, or development APP_ENV), which is never considered deployed.
  const fixtureRuntimeAllowed = !deploymentIntent || testFixtureRuntime;
  if (!fixtureRuntimeAllowed && runtimeDriver !== 'live') {
    throw new ApiError(500, 'AGENT_FIXTURE_RUNTIME_FORBIDDEN');
  }
  const deployedTextRuntime = deploymentIntent && !testFixtureRuntime;
  const sandboxProvider = String(env.AGENT_SANDBOX_PROVIDER || 'cua').trim().toLowerCase();
  if (!['openai', 'ollama', 'siliconflow', 'cloudflare'].includes(modelProvider)) {
    throw new ApiError(500, 'AGENT_MODEL_PROVIDER_INVALID');
  }
  if (!['cua', 'fixture'].includes(sandboxProvider)) {
    throw new ApiError(500, 'AGENT_SANDBOX_PROVIDER_INVALID');
  }
  if (!fixtureRuntimeAllowed && sandboxProvider === 'fixture') {
    throw new ApiError(500, 'AGENT_FIXTURE_SANDBOX_FORBIDDEN');
  }
  const sandboxMode = String(env.AGENT_SANDBOX_MODE || 'cloud').trim().toLowerCase();
  if (!['cloud', 'local'].includes(sandboxMode)) {
    throw new ApiError(500, 'AGENT_SANDBOX_MODE_INVALID');
  }
  const sandboxDockerPlatform = String(env.AGENT_CUA_DOCKER_PLATFORM || '').trim().toLowerCase();
  if (sandboxDockerPlatform && !['linux/amd64', 'linux/arm64'].includes(sandboxDockerPlatform)) {
    throw new ApiError(500, 'AGENT_CUA_DOCKER_PLATFORM_INVALID');
  }

  const defaultModelName = modelProvider === 'ollama'
    ? 'qwen3:8b'
    : modelProvider === 'siliconflow'
      ? SILICONFLOW_AGENT_MODEL
      : modelProvider === 'cloudflare'
        ? CLOUDFLARE_AGENT_MODEL
      : 'gpt-5.6';
  const modelName = String(env.AGENT_MODEL_NAME || defaultModelName).trim();
  if (modelProvider === 'siliconflow' && modelName !== SILICONFLOW_AGENT_MODEL) {
    throw new ApiError(500, 'AGENT_SILICONFLOW_MODEL_NOT_ALLOWED');
  }
  if (modelProvider === 'cloudflare' && modelName !== CLOUDFLARE_AGENT_MODEL) {
    throw new ApiError(500, 'AGENT_CLOUDFLARE_MODEL_NOT_ALLOWED');
  }
  // The hard lock is a deployment invariant, not an opt-in safety switch.
  // Unit and historical fixture tests run with NODE_ENV=test; every real
  // environment (including DEV) must use Cloudflare GPT-OSS for text.
  if ((textModelHardLock || deployedTextRuntime) && modelProvider !== 'cloudflare') {
    throw new ApiError(500, 'AGENT_CLOUDFLARE_TEXT_MODEL_REQUIRED');
  }
  const ollamaBaseUrl = assertLoopbackHttpUrl(
    env.AGENT_OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    'AGENT_OLLAMA_BASE_URL_INVALID'
  );
  const siliconFlowBaseUrl = assertSiliconFlowUrl(
    env.AGENT_SILICONFLOW_BASE_URL || env.SILICONFLOW_API_BASE || 'https://api.siliconflow.cn/v1'
  );
  const siliconFlowApiKey = String(
    readMacOsKeychainSecret({
      service: env.SILICONFLOW_KEYCHAIN_SERVICE,
      account: env.SILICONFLOW_KEYCHAIN_ACCOUNT
    }) ||
    env.SILICONFLOW_API_KEY ||
    env.SILICONFLOW_TOKEN ||
    env.SILICONFLOW_KEY ||
    ''
  ).trim();
  const cloudflareAccountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (cloudflareAccountId && !/^[0-9a-f]{32}$/i.test(cloudflareAccountId)) {
    throw new ApiError(500, 'AGENT_CLOUDFLARE_ACCOUNT_ID_INVALID');
  }
  const cloudflareApiToken = String(
    env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_AUTH_TOKEN || ''
  ).trim();
  const cloudflareBaseUrl = cloudflareAccountId
    ? `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/v1`
    : '';
  const cloudflareApiBaseUrl = cloudflareAccountId
    ? `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}`
    : '';
  const cloudflareFreeAccountId = String(
    env.AGENT_CLOUDFLARE_FREE_ACCOUNT_ID || ''
  ).trim();
  if (cloudflareFreeAccountId && !/^[0-9a-f]{32}$/i.test(cloudflareFreeAccountId)) {
    throw new ApiError(500, 'AGENT_CLOUDFLARE_FREE_ACCOUNT_ID_INVALID');
  }
  if (
    enabled(env.AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED) &&
    cloudflareAccountId &&
    cloudflareFreeAccountId !== cloudflareAccountId
  ) {
    throw new ApiError(500, 'AGENT_CLOUDFLARE_FREE_ACCOUNT_MISMATCH');
  }
  const cloudflareFreeAccountAttested = Boolean(
    enabled(env.AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED) &&
    cloudflareAccountId &&
    cloudflareFreeAccountId === cloudflareAccountId
  );
  const publicCapabilities = new Set(String(env.AGENT_PUBLIC_CAPABILITIES || 'files,shell')
    .toLowerCase()
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean));
  const subagentsEnabled = enabled(env.AGENT_SUBAGENTS_ENABLED);
  const runtimeV2Enabled = enabled(env.AGENT_RUNTIME_V2_ENABLED);
  const runtimeV2RolloutPercent = integer(
    env.AGENT_RUNTIME_V2_ROLLOUT_PERCENT,
    0,
    0,
    100
  );
  const runtimeV2CanaryUserIds = uuidList(env.AGENT_RUNTIME_V2_CANARY_USER_IDS, {
    code: 'AGENT_RUNTIME_V2_CANARY_USER_IDS_INVALID'
  });
  const designPlannerV2Enabled = enabled(env.DESIGN_PLANNER_V2_ENABLED);
  const adaptiveReasoningEnabled = enabled(env.AGENT_ADAPTIVE_REASONING_ENABLED);
  const projectMemoryEnabled = enabled(env.AGENT_PROJECT_MEMORY_ENABLED);
  const providerSchedulerEnabled = enabled(env.AGENT_PROVIDER_SCHEDULER_ENABLED);
  const finiteNonNegative = (value, fallback) => {
    const raw = String(value ?? '').trim();
    if (!raw) return fallback;
    const parsed = Number(raw);
    // A configured-but-invalid rate must stay invalid so readiness fails closed;
    // silently replacing it with a default could make billing non-reproducible.
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
  };
  const siliconFlowInputCreditsPerMillion = finiteNonNegative(
    env.AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION,
    0
  );
  const siliconFlowOutputCreditsPerMillion = finiteNonNegative(
    env.AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION,
    0
  );
  const cloudflareInputCreditsPerMillion = finiteNonNegative(
    env.AGENT_CLOUDFLARE_INPUT_CREDITS_PER_MILLION,
    0.35
  );
  const cloudflareOutputCreditsPerMillion = finiteNonNegative(
    env.AGENT_CLOUDFLARE_OUTPUT_CREDITS_PER_MILLION,
    0.75
  );
  const modelPricingSnapshot = Object.freeze({
    provider: modelProvider,
    model: modelName,
    inputCreditsPerMillion: modelProvider === 'cloudflare'
      ? cloudflareInputCreditsPerMillion
      : siliconFlowInputCreditsPerMillion,
    outputCreditsPerMillion: modelProvider === 'cloudflare'
      ? cloudflareOutputCreditsPerMillion
      : siliconFlowOutputCreditsPerMillion
  });
  const actorSamplingProfileName = String(
    env.AGENT_RUNTIME_ACTOR_PROFILE || 'stable-v1'
  ).trim().toLowerCase();
  const actorSamplingProfile = ACTOR_SAMPLING_PROFILES[actorSamplingProfileName];
  if (!actorSamplingProfile) {
    throw new ApiError(500, 'AGENT_RUNTIME_ACTOR_PROFILE_INVALID');
  }
  const browserMode = String(env.AGENT_BROWSER_MODE || 'disabled').trim().toLowerCase();
  if (!['disabled', AGENT_BROWSER_MODE].includes(browserMode)) {
    throw new ApiError(500, 'AGENT_BROWSER_MODE_INVALID');
  }
  const workerId = String(env.AGENT_WORKER_ID || '').trim();
  if (workerId && !/^[A-Za-z0-9._:-]{3,160}$/.test(workerId)) {
    throw new ApiError(500, 'AGENT_WORKER_ID_INVALID');
  }
  const workerRelaySecret = String(
    env.AGENT_WORKER_RELAY_SECRET ||
    readMacOsKeychainSecret({
      service: env.AGENT_WORKER_RELAY_KEYCHAIN_SERVICE,
      account: env.AGENT_WORKER_RELAY_KEYCHAIN_ACCOUNT
    }) ||
    ''
  ).trim();
  const betaMode = String(env.AGENT_BETA_MODE || 'disabled').trim().toLowerCase();
  if (!['disabled', AGENT_BETA_MODE, AGENT_AUTHENTICATED_MODE].includes(betaMode)) {
    throw new ApiError(500, 'AGENT_BETA_MODE_INVALID');
  }
  const betaUserIds = uuidList(env.AGENT_BETA_USER_IDS, {
    code: 'AGENT_BETA_USER_IDS_INVALID'
  });
  const deploymentEnvironment = String(env.APP_ENV || 'development').trim().toLowerCase();

  return Object.freeze({
    enabled: agentFeatureEnabled(env),
    workerEnabled: agentWorkerEnabled(env),
    runtimeDriver,
    modelProvider,
    modelName,
    textModelHardLock,
    ollamaBaseUrl,
    siliconFlowBaseUrl,
    siliconFlowApiKey,
    siliconFlowMaxTokens: integer(env.AGENT_SILICONFLOW_MAX_TOKENS, 4096, 512, 32768),
    siliconFlowThinkingEnabled: enabled(env.AGENT_SILICONFLOW_ENABLE_THINKING),
    siliconFlowRequestsPerMinute: integer(
      env.AGENT_SILICONFLOW_REQUESTS_PER_MINUTE,
      9,
      1,
      60
    ),
    cloudflareAccountId,
    cloudflareApiToken,
    cloudflareBaseUrl,
    cloudflareApiBaseUrl,
    cloudflareFreeAccountId,
    cloudflareFreeAccountAttested,
    cloudflareMaxTokens: integer(env.AGENT_CLOUDFLARE_MAX_TOKENS, 4096, 512, 32768),
    cloudflareRequestsPerMinute: integer(
      env.AGENT_CLOUDFLARE_REQUESTS_PER_MINUTE,
      30,
      1,
      120
    ),
    modelContextTokens: integer(env.AGENT_MODEL_CONTEXT_TOKENS, 16384, 4096, 32768),
    runtimeV2Enabled,
    runtimeV2RolloutPercent,
    runtimeV2CanaryUserIds,
    designPlannerV2Enabled,
    adaptiveReasoningEnabled,
    projectMemoryEnabled,
    providerSchedulerEnabled,
    actorSamplingProfile,
    promptEngineVersion: 'skills-v2',
    checkpointVersion: 4,
    stageMaxOutputTokens: STAGE_MAX_OUTPUT_TOKENS,
    siliconFlowInputCreditsPerMillion,
    siliconFlowOutputCreditsPerMillion,
    cloudflareInputCreditsPerMillion,
    cloudflareOutputCreditsPerMillion,
    modelPricingSnapshot,
    sandboxProvider,
    sandboxMode,
    sandboxDockerPlatform,
    sandboxVersion: String(env.AGENT_SANDBOX_IMAGE_VERSION || 'artigen-agent-linux-2026-07-01').trim(),
    sandboxImageRef: String(env.AGENT_CUA_IMAGE_REF || '').trim(),
    sandboxImageHasToolchain: enabled(env.AGENT_CUA_IMAGE_HAS_TOOLCHAIN),
    sandboxRegion: String(env.AGENT_SANDBOX_REGION || 'us-east-1').trim(),
    sandboxEgressPolicy: String(env.AGENT_SANDBOX_EGRESS_POLICY || '').trim(),
    browserMode,
    publicBrowserEnabled: publicCapabilities.has('browser'),
    publicImageGenerationEnabled: publicCapabilities.has('generate_images'),
    subagentsEnabled,
    publicSubagentsEnabled: subagentsEnabled && publicCapabilities.has('subagents'),
    subagentMaxConcurrent: integer(env.AGENT_SUBAGENT_MAX_CONCURRENT, 3, 1, 3),
    subagentMaxSteps: integer(env.AGENT_SUBAGENT_MAX_STEPS, 20, 1, 20),
    subagentTimeoutMinutes: integer(env.AGENT_SUBAGENT_TIMEOUT_MINUTES, 10, 1, 10),
    subagentSandboxMode: 'shared-v1',
    workerRelayUrl: String(env.AGENT_WORKER_RELAY_URL || '').trim(),
    workerRelaySecret,
    workerId,
    betaMode,
    betaUserIds,
    deploymentEnvironment,
    defaultMaxCredits: integer(env.AGENT_DEFAULT_MAX_CREDITS, 100, 1, 500),
    hardMaxCredits: integer(env.AGENT_HARD_MAX_CREDITS, 500, 1, 500),
    trialCredits: integer(env.AGENT_TRIAL_CREDITS, 0, 0, 500),
    dailyFreeCredits: integer(env.AGENT_DAILY_FREE_CREDITS, 20, 0, 500),
    maxMinutes: integer(env.AGENT_MAX_MINUTES, 45, 1, 45),
    maxSteps: integer(env.AGENT_MAX_STEPS, 120, 1, 120),
    memoryMb: integer(env.AGENT_MEMORY_MB, 4096, 512, 4096),
    diskGb: integer(env.AGENT_DISK_GB, 10, 2, 10),
    cpuCount: integer(env.AGENT_CPU_COUNT, 2, 1, 8),
    retentionDays: integer(env.AGENT_RETENTION_DAYS, 30, 1, 30),
    leaseSeconds: integer(env.AGENT_LEASE_SECONDS, 90, 30, 300),
    approvalMinutes: integer(env.AGENT_APPROVAL_MINUTES, 30, 5, 120),
    queueMaxWaitHours: integer(env.AGENT_QUEUE_MAX_WAIT_HOURS, 24, 1, 168),
    maxQueuedRuns: integer(env.AGENT_MAX_QUEUED_RUNS, 100, 1, 1000),
    openAiApiKey: String(env.OPENAI_API_KEY || '').trim(),
    openAiBaseUrl: String(env.OPENAI_API_BASE || 'https://api.openai.com/v1').trim().replace(/\/+$/, ''),
    cuaApiKey: String(env.CUA_API_KEY || '').trim(),
    cuaPython: String(env.CUA_PYTHON || 'python3').trim(),
    fixtureAllowed: fixtureRuntimeAllowed
  });
};

const assertAgentRuntimeReady = (env = process.env) => {
  const config = getAgentConfig(env);
  if (!config.enabled) throw new ApiError(404, 'AGENT_FEATURE_DISABLED');
  const runtimeV2ModelReady = (
    config.modelProvider === 'siliconflow' && config.modelName === SILICONFLOW_AGENT_MODEL
  ) || (
    config.modelProvider === 'cloudflare' && config.modelName === CLOUDFLARE_AGENT_MODEL
  );
  if (
    (config.runtimeV2Enabled || config.designPlannerV2Enabled ||
      config.adaptiveReasoningEnabled || config.projectMemoryEnabled) &&
    !runtimeV2ModelReady
  ) {
    throw new ApiError(503, 'AGENT_RUNTIME_V2_MODEL_NOT_READY', { retryable: false });
  }
  if (config.runtimeV2Enabled && config.modelContextTokens < 16_384) {
    throw new ApiError(503, 'AGENT_RUNTIME_V2_CONTEXT_NOT_READY', { retryable: false });
  }
  if (config.runtimeV2Enabled && (
    (config.modelProvider === 'siliconflow' && (
      !(config.siliconFlowInputCreditsPerMillion > 0) ||
      !(config.siliconFlowOutputCreditsPerMillion > 0)
    )) ||
    (config.modelProvider === 'cloudflare' && (
      !(config.cloudflareInputCreditsPerMillion > 0) ||
      !(config.cloudflareOutputCreditsPerMillion > 0)
    ))
  )) {
    throw new ApiError(503, 'AGENT_RUNTIME_V2_PRICING_NOT_READY', { retryable: false });
  }
  if (config.runtimeDriver === 'fixture') return config;
  if (config.modelProvider === 'openai' && !config.openAiApiKey) {
    throw new ApiError(503, 'AGENT_MODEL_NOT_CONFIGURED', { retryable: false });
  }
  if (config.modelProvider === 'siliconflow' && !config.siliconFlowApiKey) {
    throw new ApiError(503, 'AGENT_MODEL_NOT_CONFIGURED', { retryable: false });
  }
  if (
    config.modelProvider === 'cloudflare' &&
    (!config.cloudflareAccountId || !config.cloudflareApiToken)
  ) {
    throw new ApiError(503, 'AGENT_MODEL_NOT_CONFIGURED', { retryable: false });
  }
  if (config.modelProvider === 'cloudflare' && !config.cloudflareFreeAccountAttested) {
    throw new ApiError(503, 'AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED', { retryable: false });
  }
  if (config.publicImageGenerationEnabled && !config.siliconFlowApiKey) {
    throw new ApiError(503, 'AGENT_IMAGE_MODEL_NOT_CONFIGURED', { retryable: false });
  }
  if (
    config.sandboxProvider === 'cua' &&
    config.sandboxMode === 'cloud' &&
    !config.cuaApiKey
  ) {
    throw new ApiError(503, 'AGENT_SANDBOX_NOT_CONFIGURED', { retryable: false });
  }
  if (
    config.sandboxProvider === 'cua' &&
    config.sandboxMode === 'local' &&
    (!config.sandboxImageRef || !config.sandboxImageHasToolchain)
  ) {
    throw new ApiError(503, 'AGENT_SANDBOX_IMAGE_NOT_READY', { retryable: false });
  }
  if (
    ['production', 'prod'].includes(config.deploymentEnvironment) &&
    (
      ![AGENT_BETA_MODE, AGENT_AUTHENTICATED_MODE].includes(config.betaMode) ||
      (config.betaMode === AGENT_BETA_MODE && config.betaUserIds.length === 0)
    )
  ) {
    throw new ApiError(503, 'AGENT_BETA_ACCESS_NOT_CONFIGURED', {
      retryable: false
    });
  }
  if (
    isProductionIntent(env) &&
    config.sandboxProvider === 'cua' &&
    config.sandboxMode === 'cloud' &&
    !config.sandboxImageRef
  ) {
    throw new ApiError(503, 'AGENT_SANDBOX_IMAGE_NOT_PINNED', { retryable: false });
  }
  if (
    config.publicBrowserEnabled &&
    config.browserMode !== AGENT_BROWSER_MODE
  ) {
    throw new ApiError(503, 'AGENT_BROWSER_MODE_NOT_READY', { retryable: false });
  }
  if (
    config.publicBrowserEnabled &&
    config.sandboxProvider === 'cua' &&
    config.sandboxEgressPolicy !== 'restricted-v1'
  ) {
    throw new ApiError(503, 'AGENT_SANDBOX_EGRESS_POLICY_UNATTESTED', {
      retryable: false
    });
  }
  if (
    isProductionIntent(env) &&
    config.publicBrowserEnabled &&
    (
      Buffer.byteLength(config.workerRelaySecret, 'utf8') < 32 ||
      !config.workerRelayUrl ||
      !config.workerId
    )
  ) {
    throw new ApiError(503, 'AGENT_DESKTOP_RELAY_NOT_CONFIGURED', { retryable: false });
  }
  return config;
};

module.exports = {
  AGENT_AUTHENTICATED_MODE,
  agentFeatureEnabled,
  agentWorkerEnabled,
  isProductionIntent,
  isDeployedRuntime,
  isTestFixtureRuntime,
  assertLoopbackHttpUrl,
  assertSiliconFlowUrl,
  assertAgentRuntimeReady,
  getAgentConfig,
  resolveAgentRuntimeAssignment,
  AGENT_BETA_MODE,
  AGENT_BROWSER_MODE,
  CLOUDFLARE_AGENT_MODEL,
  SILICONFLOW_AGENT_MODEL,
  STAGE_MAX_OUTPUT_TOKENS
};
