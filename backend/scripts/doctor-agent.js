#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const { getPool, isDatabaseConfigured } = require('../db/pool');
const { getAgentConfig, assertAgentRuntimeReady } = require('../services/agent-config');
const { createAgentModelProvider } = require('../services/agent-model-provider');
const { hasAgentPayloadKey } = require('../services/agent-payload-service');
const { createAgentSandboxProvider } = require('../services/agent-sandbox-provider');

const REQUIRED_TABLES = Object.freeze([
  'agent_runs',
  'agent_model_checkpoints',
  'agent_approvals',
  'agent_artifacts',
  'agent_trial_usage',
  'agent_worker_heartbeats',
  'agent_desktop_tickets'
]);
const REQUIRED_MIGRATION = '020_agent_secure_browser_relay';
const dockerDesktopBin = '/Applications/Docker.app/Contents/Resources/bin';

const checked = async (name, operation) => {
  try {
    const detail = await operation();
    return { name, ok: true, ...(detail || {}) };
  } catch (error) {
    return {
      name,
      ok: false,
      code: String(error?.code || error?.message || 'CHECK_FAILED').slice(0, 120)
    };
  }
};

const freeDiskGb = () => {
  const stats = fs.statfsSync(path.resolve(__dirname, '..'), { bigint: true });
  return Number(stats.bavail * stats.bsize) / (1024 ** 3);
};

const dockerImageCached = (image) => spawnSync('docker', ['image', 'inspect', image], {
  env: {
    ...process.env,
    PATH: [
      process.env.PATH || '',
      process.platform === 'darwin' ? dockerDesktopBin : ''
    ].filter(Boolean).join(path.delimiter)
  },
  stdio: 'ignore',
  timeout: 10_000
}).status === 0;

const main = async () => {
  const config = getAgentConfig(process.env);
  const report = {
    ok: false,
    profile: {
      enabled: config.enabled,
      workerEnabled: config.workerEnabled,
      modelProvider: config.modelProvider,
      modelName: config.modelName,
      modelBase: config.modelProvider === 'ollama'
        ? config.ollamaBaseUrl
        : config.modelProvider === 'siliconflow'
          ? config.siliconFlowBaseUrl
          : config.modelProvider === 'cloudflare'
            ? config.cloudflareBaseUrl
          : 'configured-cloud-provider',
      sandboxProvider: config.sandboxProvider,
      sandboxMode: config.sandboxMode,
      dockerPlatform: config.sandboxDockerPlatform || null,
      concurrency: Number(process.env.AGENT_WORKER_CONCURRENCY || 1)
    },
    checks: []
  };

  report.checks.push(await checked('configuration', async () => {
    assertAgentRuntimeReady(process.env);
    if (!config.workerEnabled) throw new Error('AGENT_WORKER_DISABLED');
    if (!hasAgentPayloadKey(process.env)) throw new Error('AGENT_PAYLOAD_KEY_MISSING');
    return { keyConfigured: true };
  }));

  let pool = null;
  report.checks.push(await checked('database', async () => {
    if (!isDatabaseConfigured()) throw new Error('DATABASE_NOT_CONFIGURED');
    pool = getPool();
    const tables = await pool.query(
      `SELECT table_name, to_regclass('public.' || table_name) IS NOT NULL AS present
         FROM unnest($1::text[]) AS table_name`,
      [REQUIRED_TABLES]
    );
    const missing = tables.rows.filter((row) => !row.present).map((row) => row.table_name);
    const migration = await pool.query(
      'SELECT EXISTS (SELECT 1 FROM pgmigrations WHERE name=$1) AS applied',
      [REQUIRED_MIGRATION]
    );
    if (missing.length || !migration.rows[0]?.applied) {
      const error = new Error('DATABASE_MIGRATION_REQUIRED');
      error.code = 'DATABASE_MIGRATION_REQUIRED';
      throw error;
    }
    const database = await pool.query('SELECT current_database() AS name');
    return {
      database: database.rows[0]?.name || 'configured',
      migration: REQUIRED_MIGRATION,
      tables: REQUIRED_TABLES.length
    };
  }));

  report.checks.push(await checked('model', async () => {
    await createAgentModelProvider({ env: process.env }).probe();
    return { provider: config.modelProvider, model: config.modelName };
  }));

  report.checks.push(await checked('sandbox', async () => {
    const result = await createAgentSandboxProvider({ env: process.env }).probe();
    return {
      provider: config.sandboxProvider,
      mode: config.sandboxMode,
      runtime: result.runtime || null,
      imageId: result.imageId || null,
      toolchain: result.toolchain || null,
      egressVerified: result.egressVerified === true
    };
  }));

  if (config.sandboxMode === 'local') {
    report.checks.push(await checked('local-capacity', async () => {
      const image = config.sandboxImageRef;
      const imageCached = image ? dockerImageCached(image) : false;
      const availableGb = freeDiskGb();
      const defaultMinimum = image ? 25 : 15;
      const requestedMinimum = Number(
        process.env.AGENT_LOCAL_MIN_FREE_GB || defaultMinimum
      );
      const minimumGb = image && imageCached
        ? 5
        : Math.max(10, requestedMinimum || defaultMinimum);
      if (availableGb < minimumGb) {
        const error = new Error('AGENT_LOCAL_DISK_INSUFFICIENT');
        error.code = 'AGENT_LOCAL_DISK_INSUFFICIENT';
        throw error;
      }
      return {
        availableGb: Number(availableGb.toFixed(1)),
        minimumGb,
        imageCached,
        imageHasToolchain: config.sandboxImageHasToolchain,
        image: image || 'cua:linux-container'
      };
    }));
  }

  if (pool) {
    report.worker = await checked('worker-heartbeat', async () => {
      const result = await pool.query(
        `SELECT status, model_provider, model_name, sandbox_mode, concurrency,
                browser_ready,egress_verified,desktop_relay_ready,sandbox_image_ref,
                last_seen_at > clock_timestamp() - interval '45 seconds' AS fresh
           FROM agent_worker_heartbeats
          ORDER BY last_seen_at DESC
          LIMIT 1`
      );
      const row = result.rows[0];
      return row ? {
        status: row.status,
        fresh: row.fresh,
        modelProvider: row.model_provider,
        modelName: row.model_name,
        sandboxMode: row.sandbox_mode,
        concurrency: row.concurrency,
        browserReady: row.browser_ready === true,
        egressVerified: row.egress_verified === true,
        desktopRelayReady: row.desktop_relay_ready === true,
        sandboxImageRef: row.sandbox_image_ref || null
      } : { status: 'never-started', fresh: false };
    });
  }

  report.ok = report.checks.every((entry) => entry.ok);
  console.log(JSON.stringify(report, null, 2));
  if (pool) await pool.end();
  if (!report.ok) process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, code: error?.code || error?.message || 'AGENT_DOCTOR_FAILED' }));
  process.exitCode = 1;
});
