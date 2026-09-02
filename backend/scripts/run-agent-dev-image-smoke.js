#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { readMacOsKeychainSecret } = require('../lib/local-keychain');
const { GENERATION_IMAGE_MODEL } = require('../services/generation-profiles');
const {
  applyAgentSmokeModelProfile,
  resolveAgentSmokeModelProfile
} = require('./lib/agent-dev-model-profile');

const KEYCHAIN_SERVICE = String(
  process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || 'artigen-agent-dev-worker'
).trim();
if (KEYCHAIN_SERVICE !== 'artigen-agent-dev-worker') {
  console.error('AGENT_DEV_IMAGE_SMOKE_KEYCHAIN_SERVICE_INVALID');
  process.exit(64);
}

const referencePath = path.resolve(String(
  process.env.ARTIGEN_SMOKE_REFERENCE_PATH || ''
).trim());
if (!process.env.ARTIGEN_SMOKE_REFERENCE_PATH || !fs.existsSync(referencePath)) {
  console.error('AGENT_DEV_IMAGE_SMOKE_REFERENCE_REQUIRED');
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
  console.error(`AGENT_DEV_IMAGE_SMOKE_KEYCHAIN_INCOMPLETE:${missing.join(',')}`);
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
  AGENT_WORKER_ID: 'artigen-dev-image-smoke-publisher',
  AGENT_PUBLIC_CAPABILITIES: 'files,shell,browser,generate_images',
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

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const outputRoot = path.join(
  PROJECT_ROOT,
  '.artifacts',
  `dev-two-model-image-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`
);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const readBody = async (body, maximumBytes) => {
  const chunks = [];
  let byteSize = 0;
  for await (const rawChunk of assets.toReadable(body)) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    byteSize += chunk.length;
    if (byteSize > maximumBytes) throw new Error('AGENT_DEV_IMAGE_SMOKE_ARTIFACT_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const selectSmokeUser = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (email,display_name,status)
       VALUES ('agent-image-smoke@dev.artigen.invalid','Agent Image DEV Smoke','active')
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
    if (active.rowCount) throw new Error('AGENT_DEV_IMAGE_SMOKE_USER_BUSY');
    await client.query(
      `INSERT INTO wallets (user_id,available_credits,frozen_credits)
       VALUES ($1,100,0)
       ON CONFLICT (user_id) DO UPDATE
         SET available_credits=GREATEST(wallets.available_credits,100),updated_at=now()`,
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

const stageReference = async ({ pool, userId }) => {
  const buffer = await fs.promises.readFile(referencePath);
  return assets.storeAsset({
    pool,
    ownerUserId: userId,
    buffer,
    declaredMime: 'image/png',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 40 * 1024 * 1024,
    maxPixels: 32 * 1000 * 1000,
    retentionClass: 'temporary-input',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    metadata: { source: 'agent-dev-image-smoke', originalFilename: 'product-reference.png' }
  });
};

const assertAspectRatio = ({ width, height, aspectRatio }) => {
  const [ratioWidth, ratioHeight] = aspectRatio.split(':').map(Number);
  if (!width || !height || width * ratioHeight !== height * ratioWidth) {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_RATIO_MISMATCH:${width}x${height}:${aspectRatio}`);
  }
};

const objectiveFor = ({ kind, inputAssetId }) => kind === 'reference'
  ? [
      '生成一张 4:5 的高级产品视觉设计稿。',
      `inputs 目录中只有一张已上传图片，路径末尾为 ${inputAssetId}.png；`,
      '必须且只能把这张图作为 role=product 的单张参考图调用 generate_image 一次，',
      '保持主体身份和关键外观，置于克制的暖灰工作室场景，留出清晰排版空间。',
      '文件名必须为 artigen-dev-kolors-reference.png。',
      '不要用 Shell 或其他方式伪造图片；生成后检查文件并以 role=image、mimeType=image/png 声明。',
      '本任务没有观察任何网页，声明交付物时 sources 必须是空数组，不得填写模型、供应商或产品官网。',
      '不需要浏览器，不要填写表单，不要登录，不要改变任何外部状态。'
    ].join('')
  : [
      '生成一张 1:1 的当代设计工具品牌主视觉稿：深墨色背景，流动的珊瑚橙与冷蓝轨迹，',
      '具有高端编辑感、清晰视觉焦点和充足留白，不要出现文字、水印或界面截图。',
      '必须调用 generate_image 一次且不使用参考图，文件名必须为 artigen-dev-kolors-text.png。',
      '不要用 Shell 或其他方式伪造图片；生成后检查文件并以 role=image、mimeType=image/png 声明。',
      '本任务没有观察任何网页，声明交付物时 sources 必须是空数组，不得填写模型、供应商或产品官网。',
      '不需要浏览器，不要填写表单，不要登录，不要改变任何外部状态。'
    ].join('');

const runImageSmoke = async ({ pool, runService, userId, kind, inputAsset }) => {
  const reference = kind === 'reference';
  const created = await runService.createRun({
    userId,
    objective: objectiveFor({ kind, inputAssetId: inputAsset?.assetId }),
    assetIds: inputAsset ? [inputAsset.assetId] : [],
    maxCredits: 30,
    capabilities: { files: true, shell: true, generate_images: true },
    browserConfig: { allowedOrigins: [], persistSession: false },
    deliverables: ['image'],
    idempotencyKey: `dev-two-model-${kind}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
  });
  const runId = created.runId;
  console.log(JSON.stringify({ event: 'run.created', kind, runId }));

  const deadline = Date.now() + 45 * 60 * 1000;
  let lastStatus = '';
  let run;
  while (Date.now() < deadline) {
    run = await runService.getRun({ userId, runId });
    if (run.status !== lastStatus) {
      lastStatus = run.status;
      console.log(JSON.stringify({ event: 'run.status', kind, runId, status: run.status }));
    }
    if (TERMINAL_STATUSES.has(run.status)) break;
    if (run.status === 'waiting_user') {
      throw new Error(`AGENT_DEV_IMAGE_SMOKE_UNEXPECTED_APPROVAL:${runId}`);
    }
    await sleep(2000);
  }
  if (!run || !TERMINAL_STATUSES.has(run.status)) {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_TIMEOUT:${runId}`);
  }
  if (run.status !== 'succeeded') {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_RUN_FAILED:${runId}:${run.error?.code || run.status}`);
  }
  if (run.model?.name !== smokeModelProfile.model) {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_PLANNER_MODEL_INVALID:${run.model?.name || 'none'}`);
  }

  const imageArtifacts = (run.artifacts || []).filter((artifact) => artifact.role === 'image');
  if (imageArtifacts.length !== 1) {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_ARTIFACT_COUNT:${runId}:${imageArtifacts.length}`);
  }
  const artifact = imageArtifacts[0];
  if (artifact.verificationStatus !== 'passed' || !artifact.assetId) {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_ARTIFACT_UNVERIFIED:${runId}`);
  }

  const steps = await pool.query(
    `SELECT tool_name,sanitized_input,sanitized_output,status
       FROM agent_steps WHERE run_id=$1 AND tool_name='artigen_image_generation'
       ORDER BY sequence`,
    [runId]
  );
  if (steps.rowCount !== 1 || steps.rows[0].status !== 'succeeded') {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_GENERATION_STEP_COUNT:${runId}:${steps.rowCount}`);
  }
  const generationStep = steps.rows[0];
  if (generationStep.sanitized_output?.model !== GENERATION_IMAGE_MODEL) {
    throw new Error(
      `AGENT_DEV_IMAGE_SMOKE_IMAGE_MODEL_INVALID:${generationStep.sanitized_output?.model || 'none'}`
    );
  }
  const expectedReferenceCount = reference ? 1 : 0;
  if (Number(generationStep.sanitized_input?.referenceCount) !== expectedReferenceCount) {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_REFERENCE_COUNT:${runId}`);
  }
  const expectedImageCredits = reference ? 12 : 8;
  if (Number(generationStep.sanitized_output?.costCredits) !== expectedImageCredits) {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_IMAGE_CREDITS:${runId}`);
  }

  const hold = await pool.query(
    `SELECT status,max_credits,charged_credits FROM agent_budget_holds WHERE run_id=$1`,
    [runId]
  );
  if (hold.rowCount !== 1 || hold.rows[0].status !== 'settled') {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_BUDGET_NOT_SETTLED:${runId}`);
  }
  const chargedCredits = Number(hold.rows[0].charged_credits || 0);
  if (chargedCredits < expectedImageCredits || chargedCredits > 30) {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_TOTAL_CREDITS:${runId}:${chargedCredits}`);
  }
  const chargeLedger = await pool.query(
    `SELECT count(*)::int AS count FROM wallet_ledger
      WHERE reference_type='agent_run' AND reference_id=$1 AND entry_type='charge'`,
    [runId]
  );
  if (Number(chargeLedger.rows[0]?.count || 0) > 1) {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_DUPLICATE_CHARGE:${runId}`);
  }

  const opened = await assets.openAsset({ assetId: artifact.assetId, ownerUserId: userId, pool });
  if (opened.record.storage_driver !== 's3') {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_STORAGE_NOT_SHARED:${runId}`);
  }
  const buffer = await readBody(opened.body, 40 * 1024 * 1024);
  const digest = crypto.createHash('sha256').update(buffer).digest('hex');
  if (digest !== artifact.sha256 || buffer.length !== artifact.byteSize) {
    throw new Error(`AGENT_DEV_IMAGE_SMOKE_DIGEST_MISMATCH:${runId}`);
  }
  assertAspectRatio({
    width: Number(opened.record.width || 0),
    height: Number(opened.record.height || 0),
    aspectRatio: reference ? '4:5' : '1:1'
  });
  await fs.promises.mkdir(outputRoot, { recursive: true });
  const localPath = path.join(outputRoot, artifact.filename);
  await fs.promises.writeFile(localPath, buffer, { mode: 0o600 });

  const evidence = {
    kind,
    runId,
    status: run.status,
    plannerModel: run.model.name,
    imageModel: generationStep.sanitized_output.model,
    referenceCount: expectedReferenceCount,
    imageCredits: expectedImageCredits,
    chargedCredits,
    artifact: {
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      byteSize: artifact.byteSize,
      sha256: digest,
      width: Number(opened.record.width || 0),
      height: Number(opened.record.height || 0),
      storageDriver: opened.record.storage_driver,
      verificationStatus: artifact.verificationStatus,
      localPath
    }
  };
  console.log(JSON.stringify({ event: 'run.succeeded', ...evidence }));
  return evidence;
};

const main = async () => {
  const pool = getPool();
  const queuePublisher = new AgentQueuePublisher({ env: process.env });
  const runService = createAgentRunService({ pool, env: process.env, queuePublisher });
  try {
    const status = await runService.getServiceStatus();
    if (!status.enabled || !status.workerOnline || !status.imageGenerationPublicEnabled) {
      throw new Error(`AGENT_DEV_IMAGE_SMOKE_RUNTIME_NOT_READY:${JSON.stringify({
        enabled: status.enabled,
        workerOnline: status.workerOnline,
        imageGenerationPublicEnabled: status.imageGenerationPublicEnabled
      })}`);
    }
    const userId = await selectSmokeUser(pool);
    const inputAsset = await stageReference({ pool, userId });
    const text = await runImageSmoke({ pool, runService, userId, kind: 'text' });
    const reference = await runImageSmoke({
      pool,
      runService,
      userId,
      kind: 'reference',
      inputAsset
    });
    const finalStatus = await runService.getServiceStatus();
    if (!finalStatus.workerOnline || finalStatus.queueDepth !== 0) {
      throw new Error('AGENT_DEV_IMAGE_SMOKE_WORKER_NOT_IDLE');
    }
    const summary = {
      event: 'smoke.succeeded',
      outputRoot,
      workerOnline: finalStatus.workerOnline,
      queueDepth: finalStatus.queueDepth,
      runs: [text, reference]
    };
    await fs.promises.writeFile(
      path.join(outputRoot, 'evidence.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
      { mode: 0o600 }
    );
    console.log(JSON.stringify(summary));
  } finally {
    await queuePublisher.stop().catch(() => {});
    await pool.end().catch(() => {});
  }
};

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'smoke.failed',
    code: String(error?.code || error?.message || 'AGENT_DEV_IMAGE_SMOKE_FAILED')
  }));
  process.exitCode = 1;
});
