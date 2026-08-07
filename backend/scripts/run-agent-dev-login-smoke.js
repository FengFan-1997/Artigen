#!/usr/bin/env node

const crypto = require('node:crypto');
const path = require('node:path');
const { readMacOsKeychainSecret } = require('../lib/local-keychain');
const { CuaSandboxProvider } = require('../services/agent-sandbox-provider');
const { createAgentBrowserService } = require('../services/agent-browser-service');
const {
  KEYSYM,
  connectRfb,
  sleep
} = require('./lib/rfb-smoke-client');

const KEYCHAIN_SERVICE = String(
  process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || 'artigen-agent-dev-worker'
).trim();
if (KEYCHAIN_SERVICE !== 'artigen-agent-dev-worker') {
  console.error('AGENT_DEV_LOGIN_SMOKE_KEYCHAIN_SERVICE_INVALID');
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
let devAccessPassword = readMacOsKeychainSecret({
  service: 'Artigen Dev Access Password',
  account: 'artigen-dev'
});
if (!devAccessPassword) missing.push('ARTIGEN_DEV_ACCESS_PASSWORD');
if (missing.length) {
  console.error(`AGENT_DEV_LOGIN_SMOKE_KEYCHAIN_INCOMPLETE:${missing.join(',')}`);
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
  CUA_PYTHON: path.resolve(__dirname, '../.venv-agent/bin/python'),
  AGENT_SANDBOX_EGRESS_POLICY: 'restricted-v1',
  AGENT_BROWSER_MODE: 'full-approval-v1',
  AGENT_WORKER_ID: 'artigen-dev-login-smoke-publisher',
  AGENT_PUBLIC_CAPABILITIES: 'files,shell,browser',
  AGENT_MAX_MINUTES: '45',
  AGENT_MAX_STEPS: '120',
  ASSET_STORAGE_DRIVER: 's3',
  S3_FORCE_PATH_STYLE: '1'
});

const { getPool } = require('../db/pool');
const { createAgentRunService, TERMINAL_STATUSES } = require('../services/agent-run-service');
const { AgentQueuePublisher } = require('../services/agent-queue-service');
const assets = require('../services/asset-storage');

const relayViewerUrl = ({ relayUrl, token }) => {
  const url = new URL(relayUrl);
  if (url.protocol !== 'wss:' || !url.pathname.endsWith('/worker')) {
    throw new Error('AGENT_DEV_LOGIN_SMOKE_RELAY_URL_INVALID');
  }
  url.pathname = `${url.pathname.slice(0, -'/worker'.length)}/viewer`;
  url.searchParams.set('ticket', token);
  return url;
};

const selectSmokeUser = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (email,display_name,status)
       VALUES ('agent-login-smoke@dev.artigen.invalid','Agent DEV Login Smoke','active')
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
    if (active.rowCount) throw new Error('AGENT_DEV_LOGIN_SMOKE_USER_BUSY');
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

const waitForRun = async ({ runService, userId, runId, acceptWaiting = false }) => {
  const deadline = Date.now() + 20 * 60_000;
  let lastStatus = '';
  let run;
  while (Date.now() < deadline) {
    run = await runService.getRun({ userId, runId });
    if (run.status !== lastStatus) {
      lastStatus = run.status;
      console.log(JSON.stringify({ event: 'run.status', runId, status: run.status }));
    }
    if (acceptWaiting && run.status === 'waiting_user') return run;
    if (TERMINAL_STATUSES.has(run.status)) return run;
    if (!acceptWaiting && run.status === 'waiting_user') {
      throw new Error('AGENT_DEV_LOGIN_SMOKE_UNEXPECTED_APPROVAL');
    }
    await sleep(1000);
  }
  throw new Error('AGENT_DEV_LOGIN_SMOKE_RUN_TIMEOUT');
};

const assertSuccessfulRun = (run, label) => {
  if (run?.status !== 'succeeded') {
    throw new Error(`AGENT_DEV_LOGIN_SMOKE_${label}_${run?.error?.code || run?.status || 'MISSING'}`);
  }
  if (!Array.isArray(run.artifacts) || run.artifacts.length < 2) {
    throw new Error(`AGENT_DEV_LOGIN_SMOKE_${label}_ARTIFACTS_MISSING`);
  }
  if (run.artifacts.some((artifact) => (
    artifact.verificationStatus !== 'passed' || !artifact.assetId
  ))) {
    throw new Error(`AGENT_DEV_LOGIN_SMOKE_${label}_ARTIFACT_UNVERIFIED`);
  }
};

const readBody = async (body, maximumBytes) => {
  const chunks = [];
  let byteSize = 0;
  for await (const rawChunk of assets.toReadable(body)) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    byteSize += chunk.length;
    if (byteSize > maximumBytes) throw new Error('AGENT_DEV_LOGIN_SMOKE_ARTIFACT_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const verifySharedArtifacts = async ({ pool, userId, run }) => {
  const verified = [];
  for (const artifact of run.artifacts) {
    const opened = await assets.openAsset({ assetId: artifact.assetId, ownerUserId: userId, pool });
    if (opened.record.storage_driver !== 's3') {
      throw new Error('AGENT_DEV_LOGIN_SMOKE_STORAGE_NOT_SHARED');
    }
    const buffer = await readBody(opened.body, 40 * 1024 * 1024);
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (digest !== artifact.sha256 || buffer.length !== artifact.byteSize) {
      throw new Error('AGENT_DEV_LOGIN_SMOKE_ARTIFACT_DIGEST_MISMATCH');
    }
    verified.push({
      filename: artifact.filename,
      byteSize: artifact.byteSize,
      verificationStatus: artifact.verificationStatus,
      storageDriver: opened.record.storage_driver
    });
  }
  return verified;
};

const waitForTicketClosed = async (pool, ticketId) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await pool.query(
      `SELECT consumed_at,relay_started_at,closed_at
         FROM agent_desktop_tickets WHERE id=$1`,
      [ticketId]
    );
    if (result.rows[0]?.closed_at) return result.rows[0];
    await sleep(250);
  }
  throw new Error('AGENT_DEV_LOGIN_SMOKE_TICKET_CLOSE_TIMEOUT');
};

const createRun = ({ runService, userId, origin, profileId = null, restore = false }) => {
  const timestamp = new Date().toISOString();
  const objective = restore
    ? [
        `访问 ${origin}/artigen，确认保存的单站登录会话已经恢复，页面可直接读取且没有再次要求 Basic Auth 接管。`,
        '不要填写、提交或修改任何表单。',
        `创建 artigen-login-restore.md，记录验证时间 ${timestamp}、页面标题、登录会话恢复结果和来源 URL，`,
        '再用 artigen-report-pdf 生成 artigen-login-restore.pdf；检查并声明 Markdown 与 PDF 两项交付物。'
      ].join('')
    : [
        '这是一次受保护站点登录验收。在进行任何浏览器导航之前，必须立即调用 request_user_approval，',
        `actionType 使用 enter_password，recipient 使用 ${origin}，等待用户通过桌面接管完成登录。`,
        '不要尝试读取、填写、记录或猜测用户名、密码、OTP、验证码，也不要在模型上下文中请求这些值。',
        '接管结束后只读取当前 Artigen DEV 页面，不要填写或提交页面里的任何表单。',
        `创建 artigen-login-session.md，记录验证时间 ${timestamp}、页面标题、接管登录成功和来源 URL，`,
        '再用 artigen-report-pdf 生成 artigen-login-session.pdf；检查并声明 Markdown 与 PDF 两项交付物。'
      ].join('');
  return runService.createRun({
    userId,
    objective,
    assetIds: [],
    maxCredits: 10,
    capabilities: { research: true, browser: true, files: true, shell: true },
    browserConfig: {
      allowedOrigins: [origin],
      persistSession: !restore,
      profileId
    },
    deliverables: ['report'],
    idempotencyKey: `dev-login-smoke-${restore ? 'restore' : 'capture'}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
  });
};

const main = async () => {
  const pool = getPool();
  const queuePublisher = new AgentQueuePublisher({ env: process.env });
  const runService = createAgentRunService({ pool, env: process.env, queuePublisher });
  const sandbox = new CuaSandboxProvider({ env: process.env });
  const browserService = createAgentBrowserService({ sandbox, env: process.env });
  const relayUrl = new URL(process.env.AGENT_WORKER_RELAY_URL);
  const origin = `https://${relayUrl.host}`;
  const runIds = [];
  let userId = '';
  let profileId = '';
  let rfb = null;
  try {
    const status = await runService.getServiceStatus();
    if (!(
      status.enabled && status.workerOnline && status.browserReady &&
      status.egressVerified && status.desktopRelayReady && status.browserPublicEnabled
    )) {
      throw new Error('AGENT_DEV_LOGIN_SMOKE_RUNTIME_NOT_READY');
    }
    userId = await selectSmokeUser(pool);
    const captured = await createRun({ runService, userId, origin });
    runIds.push(captured.runId);
    console.log(JSON.stringify({ event: 'capture.created', runId: captured.runId }));
    const waiting = await waitForRun({
      runService,
      userId,
      runId: captured.runId,
      acceptWaiting: true
    });
    if (waiting.status !== 'waiting_user' || !waiting.sandbox?.takeoverAvailable) {
      throw new Error('AGENT_DEV_LOGIN_SMOKE_TAKEOVER_NOT_AVAILABLE');
    }
    const approval = waiting.approvals.find((item) => (
      item.status === 'pending' && item.riskLevel === 'blocked' && item.actionType === 'enter_password'
    ));
    if (!approval) throw new Error('AGENT_DEV_LOGIN_SMOKE_APPROVAL_MISSING');
    const sandboxRow = await pool.query(
      'SELECT sandbox_ref FROM agent_runs WHERE id=$1',
      [captured.runId]
    );
    const sandboxRef = String(sandboxRow.rows[0]?.sandbox_ref || '');
    if (!sandboxRef) throw new Error('AGENT_DEV_LOGIN_SMOKE_SANDBOX_MISSING');

    const ticket = await runService.createDesktopTicket({
      userId,
      runId: captured.runId,
      approvalId: approval.approvalId
    });
    const viewer = relayViewerUrl({ relayUrl: process.env.AGENT_WORKER_RELAY_URL, token: ticket.token });
    let authorization = `Basic ${Buffer.from(`artigen-dev:${devAccessPassword}`).toString('base64')}`;
    try {
      rfb = await connectRfb({ url: viewer, origin, authorization });
    } finally {
      authorization = '';
    }
    await sleep(500);
    await rfb.chord(KEYSYM.ControlLeft, 'l'.codePointAt(0));
    await rfb.type(`${origin}/artigen`);
    await rfb.press(KEYSYM.Enter);
    await sleep(2500);
    await rfb.type('artigen-dev');
    await rfb.press(KEYSYM.Tab);
    await rfb.type(devAccessPassword);
    devAccessPassword = '';
    await rfb.press(KEYSYM.Enter);
    await sleep(5000);

    const snapshot = await browserService.execute({
      sandboxName: sandboxRef,
      request: { action: 'snapshot', selector: '', url: '', text: '' },
      allowedOrigins: [origin]
    });
    if (!snapshot.url.startsWith(origin) || !snapshot.title || !snapshot.text) {
      throw new Error('AGENT_DEV_LOGIN_SMOKE_LOGIN_NOT_CONFIRMED');
    }
    rfb.close();
    rfb = null;
    const ticketState = await waitForTicketClosed(pool, ticket.ticketId);
    if (!ticketState.consumed_at || !ticketState.relay_started_at || !ticketState.closed_at) {
      throw new Error('AGENT_DEV_LOGIN_SMOKE_TICKET_LIFECYCLE_INVALID');
    }
    await runService.submitInput({
      userId,
      runId: captured.runId,
      message: [
        '登录接管已经结束。继续任务前，必须先调用 browser 工具的 snapshot 动作读取当前页面，',
        '并把工具实际返回的当前 HTTPS URL 作为报告来源；不得仅根据任务描述猜测页面内容或来源。'
      ].join(''),
      takeoverEnded: true,
      takeoverApprovalId: approval.approvalId
    });
    const capturedRun = await waitForRun({ runService, userId, runId: captured.runId });
    assertSuccessfulRun(capturedRun, 'CAPTURE');
    const captureArtifacts = await verifySharedArtifacts({ pool, userId, run: capturedRun });

    const profiles = await runService.listBrowserProfiles({ userId });
    const profile = profiles.find((item) => item.siteOrigin === origin);
    if (!profile) throw new Error('AGENT_DEV_LOGIN_SMOKE_PROFILE_MISSING');
    profileId = profile.profileId;

    const restored = await createRun({
      runService,
      userId,
      origin,
      profileId,
      restore: true
    });
    runIds.push(restored.runId);
    console.log(JSON.stringify({ event: 'restore.created', runId: restored.runId }));
    const restoredRun = await waitForRun({ runService, userId, runId: restored.runId });
    assertSuccessfulRun(restoredRun, 'RESTORE');
    const restoreArtifacts = await verifySharedArtifacts({ pool, userId, run: restoredRun });

    await runService.deleteBrowserProfile({ userId, profileId });
    const remainingProfiles = await runService.listBrowserProfiles({ userId });
    if (remainingProfiles.some((item) => item.profileId === profileId)) {
      throw new Error('AGENT_DEV_LOGIN_SMOKE_PROFILE_REVOKE_FAILED');
    }
    const revoked = await pool.query(
      `SELECT revoked_at,octet_length(ciphertext) AS ciphertext_bytes
         FROM agent_browser_profiles WHERE id=$1`,
      [profileId]
    );
    if (!revoked.rows[0]?.revoked_at || Number(revoked.rows[0]?.ciphertext_bytes) !== 1) {
      throw new Error('AGENT_DEV_LOGIN_SMOKE_PROFILE_ERASURE_FAILED');
    }
    console.log(JSON.stringify({
      event: 'login-session.succeeded',
      captureRunId: captured.runId,
      restoreRunId: restored.runId,
      origin,
      rfbVersion: '003.008',
      ticketClosed: true,
      profileSaved: true,
      profileRestored: true,
      profileRevoked: true,
      artifacts: [...captureArtifacts, ...restoreArtifacts]
    }));
  } finally {
    devAccessPassword = '';
    if (rfb) rfb.terminate();
    for (const runId of runIds) {
      if (userId) await runService.cancelRun({ userId, runId }).catch(() => {});
    }
    if (profileId && userId) {
      await runService.deleteBrowserProfile({ userId, profileId }).catch(() => {});
    }
    if (userId) {
      const profiles = await runService.listBrowserProfiles({ userId }).catch(() => []);
      for (const profile of profiles) {
        if (profile.siteOrigin === origin) {
          await runService.deleteBrowserProfile({
            userId,
            profileId: profile.profileId
          }).catch(() => {});
        }
      }
    }
    await queuePublisher.stop().catch(() => {});
    await pool.end().catch(() => {});
  }
};

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'login-session.failed',
    code: String(error?.code || error?.message || 'AGENT_DEV_LOGIN_SMOKE_FAILED')
  }));
  process.exitCode = 1;
});
