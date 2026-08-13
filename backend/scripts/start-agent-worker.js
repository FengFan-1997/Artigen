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
const { createAgentSandboxProvider } = require('../services/agent-sandbox-provider');
const { hasAgentPayloadKey } = require('../services/agent-payload-service');

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

const main = async () => {
  const config = getAgentConfig(process.env);
  if (!config.workerEnabled) throw new Error('AGENT_WORKER_DISABLED');
  if (!isDatabaseConfigured()) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!hasAgentPayloadKey(process.env)) throw new Error('AGENT_PAYLOAD_KEY_MISSING');
  assertAgentRuntimeReady(process.env);

  const pool = getPool();
  const runService = createAgentRunService({ pool, env: process.env });
  const model = createAgentModelProvider({ env: process.env });
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
  console.log(`Artigen Agent worker started: ${workerService.workerId}`);

  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
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

module.exports = { resolveWorkerConcurrency };
