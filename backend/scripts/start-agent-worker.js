#!/usr/bin/env node

const path = require('path');
const os = require('node:os');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: false });
const { getPool, isDatabaseConfigured } = require('../db/pool');
const { getAgentConfig, assertAgentRuntimeReady } = require('../services/agent-config');
const { createAgentRunService } = require('../services/agent-run-service');
const { createAgentWorkerService } = require('../services/agent-worker-service');
const { AgentQueueWorker } = require('../services/agent-queue-service');
const { createAgentModelProvider } = require('../services/agent-model-provider');
const { createAgentImageService } = require('../services/agent-image-service');
const {
  callSiliconFlowChat,
  callSiliconFlowImageGenerate
} = require('../lib/ai-providers');
const {
  createModelCallService,
  createProviderScheduler,
  createScheduledChatGenerate,
  createScheduledImageGenerate
} = require('../services/agent-model-runtime-service');
const { createConfiguredGenerationProvider } = require('../services/generation-provider');
const { createAgentSandboxProvider } = require('../services/agent-sandbox-provider');
const { hasAgentPayloadKey } = require('../services/agent-payload-service');
const {
  assertDevRuntimeDatabaseBoundary
} = require('./lib/dev-database-boundary');

const resolveWorkerConcurrency = ({ env = process.env, runtimeReadiness, system = os } = {}) => {
  const requested = Math.max(1, Math.min(2, Number(env.AGENT_WORKER_CONCURRENCY || 1) || 1));
  if (requested === 1) return { concurrency: 1, fallbackReason: null };
  const cpuReady = typeof system.availableParallelism === 'function'
    ? system.availableParallelism() >= 4
    : system.cpus().length >= 4;
  const totalMemoryReady = Number(system.totalmem()) >= 12 * 1024 ** 3;
  const freeMemoryReady = Number(system.freemem()) >= 4 * 1024 ** 3;
  const runtimeReady = runtimeReadiness?.browserReady === true &&
    runtimeReadiness?.egressVerified === true &&
    runtimeReadiness?.desktopRelayReady === true;
  if (!cpuReady) return { concurrency: 1, fallbackReason: 'CPU_CAPACITY' };
  if (!totalMemoryReady || !freeMemoryReady) return { concurrency: 1, fallbackReason: 'MEMORY_CAPACITY' };
  if (!runtimeReady) return { concurrency: 1, fallbackReason: 'RUNTIME_READINESS' };
  return { concurrency: 2, fallbackReason: null };
};

const cleanupProviderSchedulers = async (schedulers = []) => {
  const unique = schedulers.filter((scheduler, index, values) => (
    scheduler && values.indexOf(scheduler) === index
  ));
  return Promise.all(unique.map((scheduler) => scheduler.cleanup()));
};

const resolveImageProviderSchedulers = ({
  config,
  pool,
  env = process.env,
  providerScheduler
} = {}) => {
  if (!config || !providerScheduler) {
    throw new TypeError('AGENT_IMAGE_PROVIDER_SCHEDULERS_REQUIRED');
  }
  const imageTextProviderScheduler = config.modelProvider === 'siliconflow'
    ? providerScheduler
    : createProviderScheduler({
        pool,
        env,
        providerKey: 'siliconflow:Qwen/Qwen3-8B'
      });
  const imageProviderScheduler = createProviderScheduler({
    pool,
    env,
    providerKey: 'siliconflow:Kwai-Kolors/Kolors'
  });
  return { imageTextProviderScheduler, imageProviderScheduler };
};

const main = async () => {
  const config = getAgentConfig(process.env);
  if (!config.workerEnabled) throw new Error('AGENT_WORKER_DISABLED');
  if (!isDatabaseConfigured()) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!hasAgentPayloadKey(process.env)) throw new Error('AGENT_PAYLOAD_KEY_MISSING');
  assertAgentRuntimeReady(process.env);

  const pool = getPool();
  await assertDevRuntimeDatabaseBoundary({
    runtimeUrl: process.env.DATABASE_URL,
    env: process.env,
    pool
  });
  const runService = createAgentRunService({ pool, env: process.env });
  const providerScheduler = createProviderScheduler({
    pool,
    env: process.env,
    providerKey: `${config.modelProvider}:${config.modelName}`
  });
  const modelCallService = createModelCallService({
    pool,
    retentionDays: config.retentionDays
  });
  const model = createAgentModelProvider({
    env: process.env,
    providerScheduler,
    modelCallService
  });
  // Image traffic has a distinct quota and must never share the text model's
  // scheduler (the text provider may be Cloudflare or Qwen). Keeping the
  // canonical Kolors key here also makes Render, Worker and harness drain
  // accounting comparable.
  const {
    imageTextProviderScheduler,
    imageProviderScheduler
  } = resolveImageProviderSchedulers({
    config,
    pool,
    env: process.env,
    providerScheduler
  });
  const scheduledSiliconFlowChat = createScheduledChatGenerate({
    scheduler: imageTextProviderScheduler,
    chatGenerate: callSiliconFlowChat,
    defaultPriority: 'actor'
  });
  const scheduledSiliconFlowImageGenerate = createScheduledImageGenerate({
    scheduler: imageProviderScheduler,
    imageGenerate: callSiliconFlowImageGenerate,
    defaultPriority: 'actor'
  });
  const imageService = createAgentImageService({
    env: process.env,
    chatGenerate: scheduledSiliconFlowChat,
    provider: createConfiguredGenerationProvider({
      imageGenerate: scheduledSiliconFlowImageGenerate,
      chatGenerate: scheduledSiliconFlowChat,
      env: process.env
    })
  });
  const sandbox = createAgentSandboxProvider({ env: process.env });
  await model.probe();
  const runtimeReadiness = await sandbox.probe();
  const workerCapacity = resolveWorkerConcurrency({ env: process.env, runtimeReadiness });
  process.env.AGENT_WORKER_CONCURRENCY = String(workerCapacity.concurrency);
  if (workerCapacity.fallbackReason) {
    console.warn(`AGENT_WORKER_CONCURRENCY_FALLBACK:${workerCapacity.fallbackReason}:1`);
  }
  const workerService = createAgentWorkerService({
    pool,
    runService,
    env: process.env,
    model,
    modelCallService,
    imageService,
    sandbox,
    runtimeReadiness
  });
  const queue = new AgentQueueWorker({
    pool,
    workerService,
    env: process.env
  });
  await workerService.startInfrastructure();
  await queue.start();
  const cleanupRuntimeRecords = async () => {
    await Promise.all([
      cleanupProviderSchedulers([
        providerScheduler,
        imageTextProviderScheduler,
        imageProviderScheduler
      ]),
      modelCallService.cleanupExpired({ limit: 1000 })
    ]).catch((error) => {
      console.warn(`AGENT_RUNTIME_CLEANUP_FAILED:${error?.code || error?.message || 'unknown'}`);
    });
  };
  await cleanupRuntimeRecords();
  const cleanupTimer = setInterval(() => void cleanupRuntimeRecords(), 60 * 60 * 1000);
  cleanupTimer.unref?.();
  console.log(`Artigen Agent worker started: ${workerService.workerId}`);

  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    clearInterval(cleanupTimer);
    console.log(`Artigen Agent worker stopping: ${signal}`);
    await queue.stop().catch((error) => {
      console.error('Agent queue shutdown failed', error?.message || error);
    });
    await workerService.stopInfrastructure().catch((error) => {
      console.error('Agent desktop relay shutdown failed', error?.message || error);
    });
    await pool.end().catch(() => {});
    process.exitCode = 0;
  };
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`Artigen Agent worker failed: ${error?.code || error?.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  resolveWorkerConcurrency,
  cleanupProviderSchedulers,
  resolveImageProviderSchedulers
};
