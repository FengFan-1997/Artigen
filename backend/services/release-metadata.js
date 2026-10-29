const packageVersion = require('../../package.json').version;
const policy = require('../config/release-capability-policy.json');

const enabled = (value) => /^(1|true|yes|on)$/i.test(String(value || '').trim());

const { normalizeEnvironment, selectedPolicy, publicSignupEnabled } = require('./signup-policy');
const { paymentsEnabled } = require('./payment-config');

const resolveGitSha = (env = process.env) => {
  const value = env.RENDER_GIT_COMMIT ||
    env.VERCEL_GIT_COMMIT_SHA ||
    env.RAILWAY_GIT_COMMIT_SHA ||
    env.GIT_SHA ||
    '';
  return String(value).trim() || null;
};

const buildReleaseMetadata = ({ env = process.env, appEnv, nodeEnv } = {}) => {
  const environment = normalizeEnvironment({
    appEnv: appEnv || env.APP_ENV,
    nodeEnv: nodeEnv || env.NODE_ENV
  });
  const effectiveEnv = { ...env, APP_ENV: environment };
  const selected = selectedPolicy(effectiveEnv);
  // Configuration is observable; readiness is a separate dependency check.
  // Never hide a live experimental flag behind the intended release policy.
  const paid = /^(1|true)$/i.test(String(env.PAID_FEATURES_ENABLED || '').trim());
  const agent = enabled(env.AGENT_FEATURE_ENABLED);
  const capabilities = {
    auth: true,
    projects: true,
    generation: enabled(env.DESIGN_CONVERSATION_ENABLED) || agent ||
      (paid && (enabled(env.AI_DESIGN_TASK_V2_ENABLED) || enabled(env.WORKSHOP_AI_TASK_V2_ENABLED))),
    fileUpload: paid || agent || enabled(env.DESIGN_CONVERSATION_ENABLED),
    artifactDownload: true,
    publicSignup: publicSignupEnabled(effectiveEnv),
    selfServePayments: paymentsEnabled(env),
    agentRuntimeV2: agent && enabled(env.AGENT_RUNTIME_V2_ENABLED),
    agentSubagents: agent && enabled(env.AGENT_SUBAGENTS_ENABLED),
    providerScheduler: agent && enabled(env.AGENT_PROVIDER_SCHEDULER_ENABLED)
  };
  const violations = Object.keys(capabilities).filter((name) =>
    capabilities[name] && selected.capabilities[name] === false);

  return Object.freeze({
    version: String(env.ARTIGEN_RELEASE_VERSION || env.RELEASE_VERSION || packageVersion).trim(),
    gitSha: resolveGitSha(env),
    environment,
    releasePolicy: {
      name: selected.name,
      schemaVersion: policy.schemaVersion,
      allowedCapabilities: { ...selected.capabilities },
      violations
    },
    capabilitySemantics: 'configured-not-readiness',
    capabilities: Object.freeze(capabilities)
  });
};

module.exports = {
  buildReleaseMetadata,
  normalizeEnvironment,
  resolveGitSha
};
