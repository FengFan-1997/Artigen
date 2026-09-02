#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { readMacOsKeychainSecret } = require('../lib/local-keychain');
const {
  applyAgentSmokeModelProfile,
  resolveAgentSmokeModelProfile
} = require('./lib/agent-dev-model-profile');

const KEYCHAIN_SERVICE = String(
  process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || 'artigen-agent-dev-worker'
).trim();
if (KEYCHAIN_SERVICE !== 'artigen-agent-dev-worker') {
  console.error('AGENT_DEV_SUBAGENT_SMOKE_KEYCHAIN_SERVICE_INVALID');
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
if (String(process.env.AGENT_MODEL_PROVIDER || 'cloudflare').trim().toLowerCase() === 'cloudflare') {
  secretNames.push(
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_API_TOKEN',
    'AGENT_CLOUDFLARE_FREE_ACCOUNT_ID',
    'AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED'
  );
}
const missing = [];
for (const name of secretNames) {
  const value = readMacOsKeychainSecret({ service: KEYCHAIN_SERVICE, account: name });
  if (!value) missing.push(name);
  else process.env[name] = value;
}
if (missing.length) {
  console.error(`AGENT_DEV_SUBAGENT_SMOKE_KEYCHAIN_INCOMPLETE:${missing.join(',')}`);
  process.exit(78);
}

const smokeModelProfile = resolveAgentSmokeModelProfile({ env: process.env, production: false });

Object.assign(process.env, {
  NODE_ENV: 'production',
  APP_ENV: 'dev',
  AGENT_FEATURE_ENABLED: 'true',
  AGENT_WORKER_ENABLED: '1',
  AGENT_RUNTIME_DRIVER: 'live',
  AGENT_MODEL_PROVIDER: smokeModelProfile.provider,
  AGENT_MODEL_NAME: smokeModelProfile.model,
  AGENT_SILICONFLOW_BASE_URL: 'https://api.siliconflow.cn/v1',
  AGENT_SILICONFLOW_ENABLE_THINKING: 'false',
  AGENT_SANDBOX_PROVIDER: 'cua',
  AGENT_SANDBOX_MODE: 'local',
  AGENT_CUA_IMAGE_REF: 'artigen/cua-xfce:0.1.15-tools-v2',
  AGENT_CUA_IMAGE_HAS_TOOLCHAIN: 'true',
  AGENT_SANDBOX_EGRESS_POLICY: 'restricted-v1',
  AGENT_BROWSER_MODE: 'full-approval-v1',
  AGENT_WORKER_ID: 'artigen-dev-subagent-smoke-publisher',
  AGENT_PUBLIC_CAPABILITIES: 'files,shell,browser,generate_images,subagents',
  AGENT_SUBAGENTS_ENABLED: 'true',
  AGENT_SUBAGENT_MAX_CONCURRENT: '3',
  AGENT_SUBAGENT_MAX_STEPS: '20',
  AGENT_SUBAGENT_TIMEOUT_MINUTES: '10',
  AGENT_BETA_MODE: 'authenticated-v1',
  AGENT_MAX_MINUTES: '45',
  AGENT_MAX_STEPS: '120',
  ASSET_STORAGE_DRIVER: 's3',
  S3_FORCE_PATH_STYLE: '1'
});
applyAgentSmokeModelProfile(process.env, smokeModelProfile);

const { getPool } = require('../db/pool');
const { createAgentRunService, TERMINAL_STATUSES } = require('../services/agent-run-service');
const { AgentQueuePublisher } = require('../services/agent-queue-service');
const assets = require('../services/asset-storage');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const selectSmokeUser = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (email,display_name,status)
       VALUES ('agent-subagent-hardening-smoke@dev.artigen.invalid',
               'Agent Subagent Hardening Smoke','active')
       ON CONFLICT (email) DO UPDATE SET status='active',updated_at=now()
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
    if (active.rowCount) throw new Error('AGENT_DEV_SUBAGENT_SMOKE_USER_BUSY');
    await client.query(
      `INSERT INTO wallets (user_id,available_credits,frozen_credits)
       VALUES ($1,0,0) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    await client.query(
      `UPDATE wallets
          SET available_credits=GREATEST(available_credits,200),updated_at=now()
        WHERE user_id=$1`,
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

const objectiveFor = ({ label, cancelOne }) => {
  const timestamp = new Date().toISOString();
  return [
    `这是 ${label} 的真实 Cloudflare GPT-OSS 子 Agent 验收，验证时间 ${timestamp}。`,
    '父 Agent 必须先发布具体计划，然后调用且只调用一次 delegate_tasks，恰好创建三个独立子 Agent：',
    '每个子任务 objective 都必须明确写入这份离线材料：标题是 Example Domain；正文说明该域名用于文档示例，无需事先协调或许可；页面提供 More information 链接。',
    '每个子任务都必须明确禁止访问 URL、获取网页、curl、wget 或任何网络命令，只能分析上述已提供材料。',
    'research 负责离线整理已提供事实与来源使用边界并写 research.md；',
    'analysis 负责离线分析上述材料的信息层级、可访问性与风险并写 analysis.md；',
    'drafting 负责根据上述材料离线起草执行建议并写 drafting.md。',
    '三个任务的 inputPaths 都必须是空数组；子 Agent 必须各自用 update_plan 与 sandbox_shell 创建并验证文件。',
    cancelOne
      ? '验收程序会单独取消其中一个子 Agent。不得再次委派，也不得因此终止父任务；应明确记录取消边界，并继续合并其余两个已验证结果。'
      : '必须等待三个子 Agent 全部成功，并合并三个已验证结果。',
    'delegate_tasks 返回后，父 Agent 必须通过 browser_dom 实际读取 https://example.com/ 的页面标题和正文；子 Agent 仍不得获得浏览器。',
    `父 Agent 最终创建 /tmp/artigen-workspace/${label}.md，内容包含子任务状态、综合结论、来源 https://example.com/ 和验证时间。`,
    `再调用 sandbox_shell；script 必须精确为 artigen-report-pdf /tmp/artigen-workspace/${label}.md /tmp/artigen-workspace/${label}.pdf，purpose 说明生成并验证 PDF。`,
    '不得调用名为 artigen-report-pdf 的工具，必须使用 sandbox_shell 的 script 与 purpose 两个参数。',
    '重新检查两个文件，将 Markdown 以 editable/text/markdown 声明，将 PDF 以 pdf/application/pdf 声明；',
    '两项 sources 都使用本次父 Agent 实际观察到的 Example Domain 与 https://example.com/。',
    '不要填写表单、不要登录、不要生成图片，也不要改变任何外部状态。'
  ].join('');
};

const createScenario = ({ runService, userId, label, cancelOne }) => runService.createRun({
  userId,
  objective: objectiveFor({ label, cancelOne }),
  assetIds: [],
  maxCredits: 50,
  capabilities: {
    research: true,
    browser: true,
    files: true,
    shell: true,
    subagents: true
  },
  browserConfig: {
    allowedOrigins: ['https://example.com'],
    persistSession: false
  },
  deliverables: ['report'],
  idempotencyKey: `dev-subagent-hardening-${label}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
});

const waitForScenario = async ({ runService, userId, runId, cancelOne }) => {
  const deadline = Date.now() + 35 * 60_000;
  let lastSnapshot = '';
  let cancelledSubagentId = '';
  let run;
  while (Date.now() < deadline) {
    run = await runService.getRun({ userId, runId });
    const snapshot = JSON.stringify({
      status: run.status,
      subagents: (run.subagents || []).map((item) => ({
        id: item.subagentId,
        role: item.role,
        status: item.status,
        steps: item.progress?.stepCount,
        credits: item.usage?.credits
      }))
    });
    if (snapshot !== lastSnapshot) {
      lastSnapshot = snapshot;
      console.log(JSON.stringify({ event: 'run.progress', runId, ...JSON.parse(snapshot) }));
    }
    if (cancelOne && !cancelledSubagentId && run.subagents?.length === 3) {
      const target = run.subagents.find((item) => ['queued', 'running'].includes(item.status));
      if (target) {
        const cancelled = await runService.cancelSubagent({
          userId,
          runId,
          subagentId: target.subagentId
        });
        cancelledSubagentId = cancelled.subagentId;
        console.log(JSON.stringify({
          event: 'subagent.cancelled-by-smoke',
          runId,
          subagentId: cancelledSubagentId,
          role: cancelled.role
        }));
      }
    }
    if (TERMINAL_STATUSES.has(run.status)) return { run, cancelledSubagentId };
    if (run.status === 'waiting_user') {
      throw new Error('AGENT_DEV_SUBAGENT_SMOKE_UNEXPECTED_APPROVAL');
    }
    await sleep(250);
  }
  throw new Error('AGENT_DEV_SUBAGENT_SMOKE_TIMEOUT');
};

const readBody = async (body, maximumBytes) => {
  const chunks = [];
  let byteSize = 0;
  for await (const rawChunk of assets.toReadable(body)) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    byteSize += chunk.length;
    if (byteSize > maximumBytes) throw new Error('AGENT_DEV_SUBAGENT_SMOKE_ARTIFACT_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const verifyArtifacts = async ({ pool, userId, run, label }) => {
  if (!Array.isArray(run.artifacts) || run.artifacts.length !== 2) {
    throw new Error('AGENT_DEV_SUBAGENT_SMOKE_ARTIFACTS_MISSING');
  }
  const expectedFilenames = [`${label}.md`, `${label}.pdf`];
  const actualFilenames = run.artifacts.map((artifact) => artifact.filename).sort();
  if (JSON.stringify(actualFilenames) !== JSON.stringify(expectedFilenames.sort())) {
    throw new Error(`AGENT_DEV_SUBAGENT_SMOKE_ARTIFACT_DUPLICATE:${actualFilenames.join(',')}`);
  }
  const verified = [];
  for (const artifact of run.artifacts) {
    if (artifact.verificationStatus !== 'passed' || !artifact.assetId) {
      throw new Error(`AGENT_DEV_SUBAGENT_SMOKE_ARTIFACT_UNVERIFIED:${artifact.filename}`);
    }
    const opened = await assets.openAsset({
      assetId: artifact.assetId,
      ownerUserId: userId,
      pool
    });
    if (opened.record.storage_driver !== 's3') {
      throw new Error('AGENT_DEV_SUBAGENT_SMOKE_STORAGE_NOT_SHARED');
    }
    const buffer = await readBody(opened.body, 40 * 1024 * 1024);
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (digest !== artifact.sha256 || buffer.length !== artifact.byteSize) {
      throw new Error(`AGENT_DEV_SUBAGENT_SMOKE_ARTIFACT_DIGEST_MISMATCH:${artifact.filename}`);
    }
    verified.push({
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      byteSize: artifact.byteSize,
      sha256: artifact.sha256,
      verificationStatus: artifact.verificationStatus,
      storageDriver: opened.record.storage_driver
    });
  }
  return verified;
};

const verifyRuntimeState = async ({ pool, userId, run, cancelOne, cancelledSubagentId }) => {
  if (run.status !== 'succeeded') {
    throw new Error(`AGENT_DEV_SUBAGENT_SMOKE_RUN_FAILED:${run.error?.code || run.status}`);
  }
  if (run.subagents?.length !== 3) {
    throw new Error(`AGENT_DEV_SUBAGENT_SMOKE_CHILD_COUNT:${run.subagents?.length || 0}`);
  }
  const statuses = run.subagents.map((item) => item.status);
  if (cancelOne) {
    if (!cancelledSubagentId || statuses.filter((item) => item === 'cancelled').length !== 1 ||
      statuses.filter((item) => item === 'succeeded').length !== 2) {
      throw new Error(`AGENT_DEV_SUBAGENT_SMOKE_CANCEL_STATUSES:${statuses.join(',')}`);
    }
  } else if (statuses.some((item) => item !== 'succeeded')) {
    throw new Error(`AGENT_DEV_SUBAGENT_SMOKE_SUCCESS_STATUSES:${statuses.join(',')}`);
  }

  const audit = await pool.query(
    `SELECT step_count,estimated_credits_used,charged_credits,
            (SELECT count(*) FROM agent_budget_holds WHERE run_id=agent_runs.id) AS hold_count,
            (SELECT status FROM agent_budget_holds WHERE run_id=agent_runs.id) AS hold_status,
            (SELECT charged_credits FROM agent_budget_holds WHERE run_id=agent_runs.id) AS hold_charged,
            (SELECT count(*) FROM agent_events
              WHERE run_id=agent_runs.id AND event_type='run.succeeded') AS success_events
       FROM agent_runs WHERE id=$1 AND user_id=$2`,
    [run.runId, userId]
  );
  const row = audit.rows[0];
  if (!row || Number(row.hold_count) !== 1 || row.hold_status !== 'settled' ||
      Number(row.success_events) !== 1 || Number(row.step_count) > 120) {
    throw new Error('AGENT_DEV_SUBAGENT_SMOKE_SETTLEMENT_INVALID');
  }

  const tools = await pool.query(
    `SELECT DISTINCT tool_name FROM agent_steps
      WHERE run_id=$1 AND subagent_id IS NOT NULL AND tool_name IS NOT NULL
      ORDER BY tool_name`,
    [run.runId]
  );
  const toolNames = tools.rows.map((item) => item.tool_name);
  if (toolNames.some((name) => !['sandbox_shell', 'update_plan'].includes(name))) {
    throw new Error(`AGENT_DEV_SUBAGENT_SMOKE_CHILD_TOOL_ESCALATION:${toolNames.join(',')}`);
  }

  const costs = await pool.query(
    `SELECT (data->>'estimatedCredits')::numeric AS credits
       FROM agent_events
      WHERE run_id=$1 AND event_type='cost.updated'
      ORDER BY id`,
    [run.runId]
  );
  const costSequence = costs.rows.map((item) => Number(item.credits || 0));
  if (costSequence.some((value, index) => index > 0 && value < costSequence[index - 1])) {
    throw new Error(`AGENT_DEV_SUBAGENT_SMOKE_COST_REGRESSION:${costSequence.join(',')}`);
  }

  return {
    stepCount: Number(row.step_count),
    estimatedCredits: Number(row.estimated_credits_used),
    chargedCredits: Number(row.charged_credits),
    holdStatus: row.hold_status,
    holdCharged: Number(row.hold_charged),
    successEvents: Number(row.success_events),
    childTools: toolNames,
    costSequence
  };
};

const main = async () => {
  const pool = getPool();
  pool.on('error', (error) => {
    console.error(`AGENT_DEV_SUBAGENT_SMOKE_POOL_ERROR:${error?.code || 'UNKNOWN'}`);
  });
  const queuePublisher = new AgentQueuePublisher({ env: process.env });
  const runService = createAgentRunService({ pool, env: process.env, queuePublisher });
  const runIds = [];
  let userId = '';
  try {
    const status = await runService.getServiceStatus();
    if (!(status.enabled && status.workerOnline && status.browserReady &&
      status.egressVerified && status.desktopRelayReady && status.subagentsEnabled)) {
      throw new Error(`AGENT_DEV_SUBAGENT_SMOKE_RUNTIME_NOT_READY:${JSON.stringify(status)}`);
    }
    userId = await selectSmokeUser(pool);
    const availableScenarios = [
      { label: 'artigen-subagents-all-success', cancelOne: false },
      { label: 'artigen-subagents-one-cancelled', cancelOne: true }
    ];
    const requestedScenario = String(process.env.ARTIGEN_SMOKE_SCENARIO || 'all')
      .trim()
      .toLowerCase();
    if (!['all', 'success', 'cancel'].includes(requestedScenario)) {
      throw new Error('AGENT_DEV_SUBAGENT_SMOKE_SCENARIO_INVALID');
    }
    const scenarios = requestedScenario === 'all'
      ? availableScenarios
      : availableScenarios.filter((scenario) => (
          requestedScenario === 'cancel' ? scenario.cancelOne : !scenario.cancelOne
        ));
    const evidence = {
      createdAt: new Date().toISOString(),
      requestedScenario,
      gitSha: String(process.env.ARTIGEN_EXPECTED_DEV_SHA || '').trim() || null,
      model: smokeModelProfile.model,
      imageModel: 'Kwai-Kolors/Kolors',
      runs: []
    };

    for (const scenario of scenarios) {
      const created = await createScenario({ runService, userId, ...scenario });
      runIds.push(created.runId);
      console.log(JSON.stringify({ event: 'run.created', runId: created.runId, ...scenario }));
      const result = await waitForScenario({
        runService,
        userId,
        runId: created.runId,
        cancelOne: scenario.cancelOne
      });
      const artifacts = await verifyArtifacts({
        pool,
        userId,
        run: result.run,
        label: scenario.label
      });
      const runtime = await verifyRuntimeState({
        pool,
        userId,
        run: result.run,
        cancelOne: scenario.cancelOne,
        cancelledSubagentId: result.cancelledSubagentId
      });
      evidence.runs.push({
        label: scenario.label,
        runId: result.run.runId,
        status: result.run.status,
        cancelledSubagentId: result.cancelledSubagentId || null,
        subagents: result.run.subagents.map((item) => ({
          subagentId: item.subagentId,
          role: item.role,
          status: item.status,
          stepCount: item.progress?.stepCount,
          credits: item.usage?.credits,
          outputFiles: item.outputFiles
        })),
        artifacts,
        runtime
      });
    }

    const finalStatus = await runService.getServiceStatus();
    const wallet = await pool.query(
      'SELECT frozen_credits FROM wallets WHERE user_id=$1',
      [userId]
    );
    const held = await pool.query(
      `SELECT count(*) FROM agent_budget_holds
        WHERE user_id=$1 AND status='held'`,
      [userId]
    );
    if (!finalStatus.workerOnline || finalStatus.queueDepth !== 0 ||
      Number(wallet.rows[0]?.frozen_credits || 0) !== 0 || Number(held.rows[0]?.count || 0) !== 0) {
      throw new Error('AGENT_DEV_SUBAGENT_SMOKE_FINAL_STATE_INVALID');
    }
    evidence.finalState = {
      workerOnline: finalStatus.workerOnline,
      queueDepth: finalStatus.queueDepth,
      walletFrozenCredits: Number(wallet.rows[0]?.frozen_credits || 0),
      heldBudgets: Number(held.rows[0]?.count || 0)
    };
    const artifactRoot = path.resolve(
      __dirname,
      `../../.artifacts/agent-subagent-hardening-dev-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`
    );
    await fs.mkdir(artifactRoot, { recursive: true });
    await fs.writeFile(
      path.join(artifactRoot, 'evidence.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
      { mode: 0o600 }
    );
    console.log(JSON.stringify({ event: 'smoke.succeeded', artifactRoot, ...evidence.finalState }));
  } finally {
    for (const runId of runIds) {
      if (!userId) break;
      const run = await runService.getRun({ userId, runId }).catch(() => null);
      if (run && !TERMINAL_STATUSES.has(run.status)) {
        await runService.cancelRun({ userId, runId }).catch(() => {});
      }
    }
    await queuePublisher.stop().catch(() => {});
    await pool.end().catch(() => {});
  }
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
