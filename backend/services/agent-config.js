const { ApiError } = require('../lib/api-error');
const { readMacOsKeychainSecret } = require('../lib/local-keychain');

const enabled = (value) => /^(1|true|yes|on)$/i.test(String(value || '').trim());
const integer = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  const resolved = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(minimum, Math.min(maximum, resolved));
};

const agentFeatureEnabled = (env = process.env) => enabled(env.AGENT_FEATURE_ENABLED);
const agentWorkerEnabled = (env = process.env) => (
  agentFeatureEnabled(env) && enabled(env.AGENT_WORKER_ENABLED)
);
const SILICONFLOW_AGENT_MODEL = 'Qwen/Qwen3-8B';
const AGENT_BROWSER_MODE = 'full-approval-v1';
const AGENT_BETA_MODE = 'owner-only-v1';
const AGENT_AUTHENTICATED_MODE = 'authenticated-v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const production = String(env.NODE_ENV || '').trim() === 'production';
  const runtimeDriver = String(env.AGENT_RUNTIME_DRIVER || 'live').trim().toLowerCase();
  if (!['live', 'fixture'].includes(runtimeDriver)) {
    throw new ApiError(500, 'AGENT_RUNTIME_DRIVER_INVALID');
  }
  if (production && runtimeDriver !== 'live') {
    throw new ApiError(500, 'AGENT_FIXTURE_RUNTIME_FORBIDDEN');
  }

  const modelProvider = String(env.AGENT_MODEL_PROVIDER || 'openai').trim().toLowerCase();
  const sandboxProvider = String(env.AGENT_SANDBOX_PROVIDER || 'cua').trim().toLowerCase();
  if (!['openai', 'ollama', 'siliconflow'].includes(modelProvider)) {
    throw new ApiError(500, 'AGENT_MODEL_PROVIDER_INVALID');
  }
  if (!['cua', 'fixture'].includes(sandboxProvider)) {
    throw new ApiError(500, 'AGENT_SANDBOX_PROVIDER_INVALID');
  }
  if (production && sandboxProvider === 'fixture') {
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
      : 'gpt-5.6';
  const modelName = String(env.AGENT_MODEL_NAME || defaultModelName).trim();
  if (modelProvider === 'siliconflow' && modelName !== SILICONFLOW_AGENT_MODEL) {
    throw new ApiError(500, 'AGENT_SILICONFLOW_MODEL_NOT_ALLOWED');
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
  const publicCapabilities = new Set(String(env.AGENT_PUBLIC_CAPABILITIES || 'files,shell')
    .toLowerCase()
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean));
  const subagentsEnabled = enabled(env.AGENT_SUBAGENTS_ENABLED);
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
  const betaUserEntries = String(env.AGENT_BETA_USER_IDS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (betaUserEntries.length > 100 || betaUserEntries.some((entry) => !UUID_RE.test(entry))) {
    throw new ApiError(500, 'AGENT_BETA_USER_IDS_INVALID');
  }
  const betaUserIds = Object.freeze([...new Set(betaUserEntries)]);
  const deploymentEnvironment = String(env.APP_ENV || 'development').trim().toLowerCase();

  return Object.freeze({
    enabled: agentFeatureEnabled(env),
    workerEnabled: agentWorkerEnabled(env),
    runtimeDriver,
    modelProvider,
    modelName,
    codingModelName: String(env.AGENT_CODING_MODEL_NAME || 'gpt-5.6-sol').trim(),
    ollamaBaseUrl,
    siliconFlowBaseUrl,
    siliconFlowApiKey,
    siliconFlowMaxTokens: integer(env.AGENT_SILICONFLOW_MAX_TOKENS, 4096, 512, 32768),
    siliconFlowThinkingEnabled: enabled(env.AGENT_SILICONFLOW_ENABLE_THINKING),
    modelContextTokens: integer(env.AGENT_MODEL_CONTEXT_TOKENS, 16384, 4096, 32768),
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
    fixtureAllowed: !production
  });
};

const assertAgentRuntimeReady = (env = process.env) => {
  const config = getAgentConfig(env);
  if (!config.enabled) throw new ApiError(404, 'AGENT_FEATURE_DISABLED');
  if (config.runtimeDriver === 'fixture') return config;
  if (config.modelProvider === 'openai' && !config.openAiApiKey) {
    throw new ApiError(503, 'AGENT_MODEL_NOT_CONFIGURED', { retryable: false });
  }
  if (config.modelProvider === 'siliconflow' && !config.siliconFlowApiKey) {
    throw new ApiError(503, 'AGENT_MODEL_NOT_CONFIGURED', { retryable: false });
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
    String(env.NODE_ENV || '').trim() === 'production' &&
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
    String(env.NODE_ENV || '').trim() === 'production' &&
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
  assertLoopbackHttpUrl,
  assertSiliconFlowUrl,
  assertAgentRuntimeReady,
  getAgentConfig,
  AGENT_BETA_MODE,
  AGENT_BROWSER_MODE,
  SILICONFLOW_AGENT_MODEL
};
