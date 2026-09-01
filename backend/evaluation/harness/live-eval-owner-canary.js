const crypto = require('node:crypto');

const { canonicalJson, parseVersionedKey } = require('./live-eval-gate');
const { verifySignedFinalReport } = require('./live-eval-final-report');

const OWNER_CANARY_PLAN_VERSION = 'artigen-agent-owner-canary-plan-v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEWED_TEXT_MODELS = new Set([
  'Qwen/Qwen3-8B',
  '@cf/openai/gpt-oss-120b'
]);
const OWNER_CANARY_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'text-only-agent',
    deliverables: Object.freeze([]),
    requiredCapabilities: Object.freeze(['files']),
    expected: Object.freeze({ finalTextSha256: true, artifactCount: 0 })
  }),
  Object.freeze({
    id: 'three-subagents-report',
    deliverables: Object.freeze(['report', 'pdf']),
    requiredCapabilities: Object.freeze(['research', 'browser', 'files', 'shell', 'subagents']),
    expected: Object.freeze({ subagentCount: 3, artifactCount: 2 })
  }),
  Object.freeze({
    id: 'kolors-text-image',
    deliverables: Object.freeze(['image']),
    requiredCapabilities: Object.freeze(['files', 'generate_images']),
    expected: Object.freeze({ referenceCount: 0, imageCount: 1 })
  }),
  Object.freeze({
    id: 'kolors-reference-image',
    deliverables: Object.freeze(['image']),
    requiredCapabilities: Object.freeze(['files', 'generate_images']),
    expected: Object.freeze({ referenceCount: 1, imageCount: 1 })
  })
]);

const isSha = (value) => /^[a-f0-9]{40}$/i.test(String(value || ''));

const assertDeployment = (name, deployment, commitSha) => {
  if (
    !deployment ||
    !String(deployment.id || '').trim() ||
    String(deployment.commitSha || '').toLowerCase() !== commitSha ||
    !['live', 'success', 'online'].includes(String(deployment.status || '').toLowerCase())
  ) {
    throw new Error(`AGENT_OWNER_CANARY_DEPLOYMENT_INVALID:${name}`);
  }
};

const assertOwnerCanaryPreflight = ({
  signedFinalReport,
  reportKeyMaterial,
  ownerUserId,
  runtime,
  deployments,
  probes
} = {}) => {
  const normalizedOwner = String(ownerUserId || '').trim().toLowerCase();
  if (!UUID_RE.test(normalizedOwner)) throw new TypeError('AGENT_OWNER_CANARY_USER_INVALID');
  const commitSha = String(signedFinalReport?.commitSha || '').toLowerCase();
  if (!isSha(commitSha)) throw new TypeError('AGENT_OWNER_CANARY_SHA_INVALID');
  const verifiedReport = verifySignedFinalReport({
    report: signedFinalReport,
    keyMaterial: reportKeyMaterial,
    expectedCommitSha: commitSha
  });
  const canaryUsers = [...new Set((runtime?.canaryUserIds || []).map((entry) => (
    String(entry || '').trim().toLowerCase()
  )).filter(Boolean))];
  if (
    runtime?.runtimeV2Enabled !== true ||
    Number(runtime?.rolloutPercent) !== 0 ||
    canaryUsers.length !== 1 ||
    canaryUsers[0] !== normalizedOwner ||
    !REVIEWED_TEXT_MODELS.has(runtime?.textModel) ||
    runtime?.imageModel !== 'Kwai-Kolors/Kolors' ||
    verifiedReport.modelLocks.text !== runtime.textModel ||
    verifiedReport.modelLocks.image !== runtime.imageModel
  ) {
    throw new Error('AGENT_OWNER_CANARY_RUNTIME_CONFIG_INVALID');
  }
  for (const name of ['render', 'vercel', 'worker']) {
    assertDeployment(name, deployments?.[name], commitSha);
  }
  if (
    probes?.meta?.ok !== true ||
    String(probes.meta.gitSha || '').toLowerCase() !== commitSha ||
    probes?.readyz?.ok !== true
  ) {
    throw new Error('AGENT_OWNER_CANARY_APPLICATION_NOT_READY');
  }
  const status = probes?.agentStatus?.status;
  if (
    probes?.agentStatus?.ok !== true ||
    status?.workerOnline !== true ||
    Number(status?.queueDepth) !== 0 ||
    status?.runtimeV2Enabled !== true ||
    Number(status?.runtimeV2RolloutPercent) !== 0 ||
    status?.runtimeV2CanaryConfigured !== true ||
    status?.subagentsEnabled !== true ||
    Number(status?.subagentMaxConcurrent) !== 3 ||
    status?.imageGenerationPublicEnabled !== true ||
    status?.providerScheduler?.ready !== true ||
    status?.durability?.leaseEpochReady !== true ||
    status?.durability?.modelReceiptsReady !== true ||
    status?.durability?.toolReceiptsReady !== true ||
    status?.durability?.budgetReservationsReady !== true ||
    status?.durability?.pricingReady !== true ||
    status?.runtimeProfile?.model !== runtime.textModel ||
    Number(status?.runtimeProfile?.checkpointVersion) !== 4
  ) {
    throw new Error('AGENT_OWNER_CANARY_AGENT_NOT_READY');
  }
  return Object.freeze({
    ownerUserId: normalizedOwner,
    commitSha,
    finalReportSha256: verifiedReport.reportSha256
  });
};

const createSignedOwnerCanaryPlan = ({
  signedFinalReport,
  reportKeyMaterial,
  ownerUserId,
  runtime,
  deployments,
  probes,
  createdAt = new Date(),
  expiresAt = new Date(new Date(createdAt).getTime() + 2 * 60 * 60 * 1000)
} = {}) => {
  const preflight = assertOwnerCanaryPreflight({
    signedFinalReport,
    reportKeyMaterial,
    ownerUserId,
    runtime,
    deployments,
    probes
  });
  const created = new Date(createdAt);
  const expires = new Date(expiresAt);
  if (
    !Number.isFinite(created.getTime()) ||
    !Number.isFinite(expires.getTime()) ||
    expires <= created ||
    expires.getTime() - created.getTime() > 2 * 60 * 60 * 1000
  ) {
    throw new TypeError('AGENT_OWNER_CANARY_PLAN_EXPIRY_INVALID');
  }
  const payload = {
    version: OWNER_CANARY_PLAN_VERSION,
    ownerUserId: preflight.ownerUserId,
    commitSha: preflight.commitSha,
    finalReportSha256: preflight.finalReportSha256,
    createdAt: created.toISOString(),
    expiresAt: expires.toISOString(),
    publicRolloutPercent: 0,
    maxCreditsPerRun: 50,
    scenarios: OWNER_CANARY_SCENARIOS.map((scenario) => ({
      ...scenario,
      idempotencyKey: `owner-canary:${preflight.commitSha}:${scenario.id}`
    })),
    deployments: Object.fromEntries(['render', 'vercel', 'worker'].map((name) => [
      name,
      {
        id: String(deployments[name].id),
        status: String(deployments[name].status).toLowerCase(),
        commitSha: preflight.commitSha
      }
    ]))
  };
  const key = parseVersionedKey(reportKeyMaterial, 'AGENT_LIVE_EVAL_REPORT_KEY_INVALID');
  const signature = crypto.createHmac('sha256', key).update(canonicalJson(payload)).digest('hex');
  return Object.freeze({
    ...payload,
    signature: Object.freeze({ algorithm: 'hmac-sha256', value: signature })
  });
};

const verifySignedOwnerCanaryPlan = ({
  plan,
  reportKeyMaterial,
  expectedCommitSha,
  expectedOwnerUserId,
  now = new Date()
} = {}) => {
  if (
    plan?.version !== OWNER_CANARY_PLAN_VERSION ||
    plan?.publicRolloutPercent !== 0 ||
    String(plan.commitSha || '').toLowerCase() !== String(expectedCommitSha || '').toLowerCase() ||
    String(plan.ownerUserId || '').toLowerCase() !== String(expectedOwnerUserId || '').toLowerCase() ||
    !Array.isArray(plan.scenarios) ||
    plan.scenarios.length !== OWNER_CANARY_SCENARIOS.length ||
    plan.scenarios.some((scenario, index) => scenario.id !== OWNER_CANARY_SCENARIOS[index].id)
  ) {
    throw new Error('AGENT_OWNER_CANARY_PLAN_MISMATCH');
  }
  const current = new Date(now).getTime();
  if (
    !Number.isFinite(current) ||
    current < new Date(plan.createdAt).getTime() ||
    current >= new Date(plan.expiresAt).getTime()
  ) {
    throw new Error('AGENT_OWNER_CANARY_PLAN_EXPIRED');
  }
  const { signature, ...payload } = plan;
  const key = parseVersionedKey(reportKeyMaterial, 'AGENT_LIVE_EVAL_REPORT_KEY_INVALID');
  const expected = crypto.createHmac('sha256', key).update(canonicalJson(payload)).digest();
  const actual = Buffer.from(String(signature?.value || ''), 'hex');
  if (
    signature?.algorithm !== 'hmac-sha256' ||
    actual.length !== expected.length ||
    !crypto.timingSafeEqual(actual, expected)
  ) {
    throw new Error('AGENT_OWNER_CANARY_PLAN_SIGNATURE_INVALID');
  }
  return Object.freeze({
    commitSha: plan.commitSha,
    ownerUserId: plan.ownerUserId,
    scenarios: plan.scenarios.map((scenario) => scenario.id)
  });
};

module.exports = {
  OWNER_CANARY_PLAN_VERSION,
  OWNER_CANARY_SCENARIOS,
  assertOwnerCanaryPreflight,
  createSignedOwnerCanaryPlan,
  verifySignedOwnerCanaryPlan
};
