#!/usr/bin/env node

const crypto = require('node:crypto');
const { readMacOsKeychainSecret } = require('../lib/local-keychain');

const KEYCHAIN_SERVICE = String(
  process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || 'artigen-agent-dev-worker'
).trim();
if (KEYCHAIN_SERVICE !== 'artigen-agent-dev-worker') {
  console.error('AGENT_DEV_SMOKE_KEYCHAIN_SERVICE_INVALID');
  process.exit(64);
}

const secretNames = [
  'DATABASE_URL',
  'AGENT_PAYLOAD_ENCRYPTION_KEY',
  'SILICONFLOW_API_KEY',
  'AGENT_WORKER_RELAY_SECRET',
  'AGENT_WORKER_RELAY_URL',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY'
];
const missing = [];
for (const name of secretNames) {
  const value = readMacOsKeychainSecret({ service: KEYCHAIN_SERVICE, account: name });
  if (!value) missing.push(name);
  else process.env[name] = value;
}
if (missing.length) {
  console.error(`AGENT_DEV_SMOKE_KEYCHAIN_INCOMPLETE:${missing.join(',')}`);
  process.exit(78);
}

Object.assign(process.env, {
  NODE_ENV: 'production',
  AGENT_FEATURE_ENABLED: 'true',
  AGENT_WORKER_ENABLED: '1',
  AGENT_RUNTIME_DRIVER: 'live',
  AGENT_MODEL_PROVIDER: 'siliconflow',
  AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
  AGENT_SILICONFLOW_BASE_URL: 'https://api.siliconflow.cn/v1',
  AGENT_SILICONFLOW_ENABLE_THINKING: 'false',
  AGENT_SANDBOX_PROVIDER: 'cua',
  AGENT_SANDBOX_MODE: 'local',
  AGENT_CUA_IMAGE_REF: 'artigen/cua-xfce:0.1.15-tools-v2',
  AGENT_CUA_IMAGE_HAS_TOOLCHAIN: 'true',
  AGENT_SANDBOX_EGRESS_POLICY: 'restricted-v1',
  AGENT_BROWSER_MODE: 'full-approval-v1',
  AGENT_WORKER_ID: 'artigen-dev-smoke-publisher',
  AGENT_PUBLIC_CAPABILITIES: 'files,shell,browser,generate_images',
  AGENT_MAX_MINUTES: '45',
  AGENT_MAX_STEPS: '120',
  ASSET_STORAGE_DRIVER: 's3',
  S3_FORCE_PATH_STYLE: '1'
});

const { getPool } = require('../db/pool');
const { createAgentRunService, TERMINAL_STATUSES } = require('../services/agent-run-service');
const { AgentQueuePublisher } = require('../services/agent-queue-service');
const assets = require('../services/asset-storage');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const readBody = async (body, maximumBytes) => {
  const chunks = [];
  let byteSize = 0;
  for await (const rawChunk of assets.toReadable(body)) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    byteSize += chunk.length;
    if (byteSize > maximumBytes) throw new Error('AGENT_DEV_SMOKE_ARTIFACT_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const selectSmokeUser = async (pool) => {
  const explicitUserId = String(process.env.ARTIGEN_SMOKE_USER_ID || '').trim();
  if (explicitUserId) {
    const result = await pool.query(
        `SELECT id FROM users
          WHERE id=$1 AND status='active'
            AND (email IS NOT NULL OR phone IS NOT NULL OR EXISTS (
              SELECT 1 FROM user_identities identity WHERE identity.user_id=users.id
            ))`,
        [explicitUserId]
      );
    if (!result.rowCount) throw new Error('AGENT_DEV_SMOKE_USER_UNAVAILABLE');
    return result.rows[0].id;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (email,display_name,status)
       VALUES ('agent-smoke@dev.artigen.invalid','Agent DEV Smoke','active')
       ON CONFLICT (email) DO UPDATE
         SET status='active',updated_at=now()
       RETURNING id`
    );
    const userId = result.rows[0].id;
    const active = await client.query(
      `SELECT 1 FROM agent_runs
        WHERE user_id=$1
          AND status IN ('draft','queued','provisioning','running','waiting_user','paused','verifying')
        LIMIT 1`,
      [userId]
    );
    if (active.rowCount) throw new Error('AGENT_DEV_SMOKE_USER_BUSY');
    await client.query(
      `INSERT INTO wallets (user_id,available_credits,frozen_credits)
       VALUES ($1,0,0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    await client.query('COMMIT');
    return userId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const assertRemoteReadiness = async ({ pool, runService }) => {
  const migration = await pool.query(
    `SELECT COALESCE(max(name),'') AS name FROM pgmigrations`
  );
  const migrationName = String(migration.rows[0]?.name || '');
  if (!migrationName.startsWith('020_')) {
    throw new Error(`AGENT_DEV_SMOKE_MIGRATION_NOT_READY:${migrationName || 'none'}`);
  }
  const status = await runService.getServiceStatus();
  const ready = status.enabled && status.workerOnline && status.browserReady &&
    status.egressVerified && status.desktopRelayReady && status.browserPublicEnabled;
  if (!ready) {
    throw new Error(`AGENT_DEV_SMOKE_RUNTIME_NOT_READY:${JSON.stringify({
      enabled: status.enabled,
      workerOnline: status.workerOnline,
      browserReady: status.browserReady,
      egressVerified: status.egressVerified,
      desktopRelayReady: status.desktopRelayReady,
      browserPublicEnabled: status.browserPublicEnabled
    })}`);
  }
  return status;
};

const main = async () => {
  const pool = getPool();
  const queuePublisher = new AgentQueuePublisher({ env: process.env });
  const runService = createAgentRunService({ pool, env: process.env, queuePublisher });
  let runId = '';
  try {
    const status = await assertRemoteReadiness({ pool, runService });
    const userId = await selectSmokeUser(pool);
    const timestamp = new Date().toISOString();
    const objective = [
      '访问 https://example.com/ 并通过浏览器读取页面标题和正文。',
      '在 /tmp/artigen-workspace 创建 artigen-dev-smoke.md，写一份简短中文验证报告，',
      `报告必须包含验证时间 ${timestamp}、页面标题、正文摘要和来源链接。`,
      '然后运行 artigen-report-pdf，把 Markdown 转成 /tmp/artigen-workspace/artigen-dev-smoke.pdf。',
      '重新检查两个文件；将 Markdown 以 editable/text/markdown 声明，将 PDF 以 pdf/application/pdf 声明，',
      '两个交付物的 sources 都填写标题 Example Domain 和 URL https://example.com/。',
      '不要填写表单、不要登录，也不要执行任何会改变外部状态的操作。'
    ].join('');
    const created = await runService.createRun({
      userId,
      objective,
      assetIds: [],
      maxCredits: 20,
      capabilities: {
        research: true,
        browser: true,
        files: true,
        shell: true
      },
      browserConfig: {
        allowedOrigins: ['https://example.com'],
        persistSession: false
      },
      deliverables: ['report'],
      idempotencyKey: `dev-smoke-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
    });
    runId = created.runId;
    console.log(JSON.stringify({
      event: 'run.created',
      runId,
      workerOnline: status.workerOnline,
      browserReady: status.browserReady,
      egressVerified: status.egressVerified,
      desktopRelayReady: status.desktopRelayReady
    }));

    const deadline = Date.now() + 45 * 60 * 1000;
    let lastStatus = '';
    let run;
    while (Date.now() < deadline) {
      run = await runService.getRun({ userId, runId });
      if (run.status !== lastStatus) {
        lastStatus = run.status;
        console.log(JSON.stringify({ event: 'run.status', runId, status: run.status }));
      }
      if (TERMINAL_STATUSES.has(run.status)) break;
      if (run.status === 'waiting_user') {
        throw new Error('AGENT_DEV_SMOKE_UNEXPECTED_USER_APPROVAL');
      }
      await sleep(2000);
    }
    if (!run || !TERMINAL_STATUSES.has(run.status)) {
      throw new Error('AGENT_DEV_SMOKE_TIMEOUT');
    }
    if (run.status !== 'succeeded') {
      throw new Error(`AGENT_DEV_SMOKE_RUN_FAILED:${run.error?.code || run.status}`);
    }
    if (!Array.isArray(run.artifacts) || run.artifacts.length < 2) {
      throw new Error('AGENT_DEV_SMOKE_ARTIFACTS_MISSING');
    }

    const verified = [];
    for (const artifact of run.artifacts) {
      if (artifact.verificationStatus !== 'passed' || !artifact.assetId) {
        throw new Error(`AGENT_DEV_SMOKE_ARTIFACT_UNVERIFIED:${artifact.filename}`);
      }
      const opened = await assets.openAsset({
        assetId: artifact.assetId,
        ownerUserId: userId,
        pool
      });
      if (opened.record.storage_driver !== 's3') {
        throw new Error(`AGENT_DEV_SMOKE_STORAGE_NOT_SHARED:${opened.record.storage_driver}`);
      }
      const buffer = await readBody(opened.body, 40 * 1024 * 1024);
      const digest = crypto.createHash('sha256').update(buffer).digest('hex');
      if (digest !== artifact.sha256 || buffer.length !== artifact.byteSize) {
        throw new Error(`AGENT_DEV_SMOKE_ARTIFACT_DIGEST_MISMATCH:${artifact.filename}`);
      }
      verified.push({
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        byteSize: artifact.byteSize,
        storageDriver: opened.record.storage_driver,
        verificationStatus: artifact.verificationStatus
      });
    }

    console.log(JSON.stringify({
      event: 'smoke.succeeded',
      runId,
      status: run.status,
      model: run.model?.name || 'Qwen/Qwen3-8B',
      artifacts: verified
    }));
  } finally {
    await queuePublisher.stop().catch(() => {});
    await pool.end().catch(() => {});
  }
};

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'smoke.failed',
    code: String(error?.code || error?.message || 'AGENT_DEV_SMOKE_FAILED')
  }));
  process.exitCode = 1;
});
