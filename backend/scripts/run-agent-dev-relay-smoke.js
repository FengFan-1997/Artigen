#!/usr/bin/env node

const crypto = require('node:crypto');
const { WebSocket } = require('ws');
const { readMacOsKeychainSecret } = require('../lib/local-keychain');
const {
  applyAgentSmokeModelProfile,
  resolveAgentSmokeModelProfile
} = require('./lib/agent-dev-model-profile');

const KEYCHAIN_SERVICE = String(
  process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || 'artigen-agent-dev-worker'
).trim();
if (KEYCHAIN_SERVICE !== 'artigen-agent-dev-worker') {
  console.error('AGENT_DEV_RELAY_SMOKE_KEYCHAIN_SERVICE_INVALID');
  process.exit(64);
}

const workerSecretNames = [
  'DATABASE_URL',
  'AGENT_PAYLOAD_ENCRYPTION_KEY',
  'SILICONFLOW_API_KEY',
  'AGENT_WORKER_RELAY_SECRET',
  'AGENT_WORKER_RELAY_URL'
];
if (String(process.env.AGENT_MODEL_PROVIDER || 'cloudflare').trim().toLowerCase() === 'cloudflare') {
  workerSecretNames.push('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN');
}
const missing = [];
for (const name of workerSecretNames) {
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
  console.error(`AGENT_DEV_RELAY_SMOKE_KEYCHAIN_INCOMPLETE:${missing.join(',')}`);
  process.exit(78);
}
const smokeModelProfile = resolveAgentSmokeModelProfile({ env: process.env, production: false });

Object.assign(process.env, {
  NODE_ENV: 'production',
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
  AGENT_WORKER_ID: 'artigen-dev-relay-smoke-publisher',
  AGENT_PUBLIC_CAPABILITIES: 'files,shell,browser',
  AGENT_MAX_MINUTES: '45',
  AGENT_MAX_STEPS: '120'
});
applyAgentSmokeModelProfile(process.env, smokeModelProfile);

const { getPool } = require('../db/pool');
const { createAgentRunService, TERMINAL_STATUSES } = require('../services/agent-run-service');
const { AgentQueuePublisher } = require('../services/agent-queue-service');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const selectSmokeUser = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (email,display_name,status)
       VALUES ('agent-relay-smoke@dev.artigen.invalid','Agent DEV Relay Smoke','active')
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
    if (active.rowCount) throw new Error('AGENT_DEV_RELAY_SMOKE_USER_BUSY');
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

const viewerUrl = ({ relayUrl, token }) => {
  const url = new URL(relayUrl);
  if (url.protocol !== 'wss:' || !url.pathname.endsWith('/worker')) {
    throw new Error('AGENT_DEV_RELAY_SMOKE_URL_INVALID');
  }
  url.pathname = `${url.pathname.slice(0, -'/worker'.length)}/viewer`;
  url.searchParams.set('ticket', token);
  return url;
};

const waitForRfb = ({ url, origin, authorization }) => new Promise((resolve, reject) => {
  const websocket = new WebSocket(url, {
    headers: {
      Origin: origin,
      Authorization: authorization
    },
    maxPayload: 1024 * 1024
  });
  const timeout = setTimeout(() => {
    websocket.terminate();
    reject(new Error('AGENT_DEV_RELAY_SMOKE_RFB_TIMEOUT'));
  }, 30_000);
  const finish = (callback) => (value) => {
    clearTimeout(timeout);
    callback(value);
  };
  websocket.once('message', finish((data) => {
    const prefix = Buffer.from(data).subarray(0, 12).toString('ascii');
    if (prefix !== 'RFB 003.008\n') {
      websocket.terminate();
      reject(new Error('AGENT_DEV_RELAY_SMOKE_RFB_INVALID'));
      return;
    }
    resolve(websocket);
  }));
  websocket.once('error', finish(() => {
    reject(new Error('AGENT_DEV_RELAY_SMOKE_WEBSOCKET_FAILED'));
  }));
  websocket.once('unexpected-response', finish((_request, response) => {
    response.resume();
    reject(new Error(`AGENT_DEV_RELAY_SMOKE_HTTP_${response.statusCode || 0}`));
  }));
});

const waitForTicketClosed = async (pool, ticketId) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await pool.query(
      `SELECT consumed_at,relay_started_at,closed_at
         FROM agent_desktop_tickets WHERE id=$1`,
      [ticketId]
    );
    const row = result.rows[0];
    if (row?.closed_at) return row;
    await sleep(250);
  }
  throw new Error('AGENT_DEV_RELAY_SMOKE_TICKET_CLOSE_TIMEOUT');
};

const main = async () => {
  const pool = getPool();
  const queuePublisher = new AgentQueuePublisher({ env: process.env });
  const runService = createAgentRunService({ pool, env: process.env, queuePublisher });
  let runId = '';
  let userId = '';
  let websocket = null;
  try {
    const status = await runService.getServiceStatus();
    if (!(
      status.enabled && status.workerOnline && status.browserReady &&
      status.egressVerified && status.desktopRelayReady && status.browserPublicEnabled
    )) {
      throw new Error('AGENT_DEV_RELAY_SMOKE_RUNTIME_NOT_READY');
    }
    userId = await selectSmokeUser(pool);
    const created = await runService.createRun({
      userId,
      objective: [
        '访问 https://example.com/ 并读取页面标题。',
        '随后必须调用 request_user_approval，actionType 使用 enter_password，',
        '请求用户通过桌面接管自行输入密码；模型不得读取、填写或记录任何密码、OTP 或验证码。',
        '不要创建文件，不要提交表单，也不要执行任何会改变外部状态的操作。'
      ].join(''),
      assetIds: [],
      maxCredits: 10,
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
      idempotencyKey: `dev-relay-smoke-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
    });
    runId = created.runId;
    console.log(JSON.stringify({ event: 'run.created', runId }));

    const deadline = Date.now() + 15 * 60_000;
    let run;
    let lastStatus = '';
    while (Date.now() < deadline) {
      run = await runService.getRun({ userId, runId });
      if (run.status !== lastStatus) {
        lastStatus = run.status;
        console.log(JSON.stringify({ event: 'run.status', runId, status: run.status }));
      }
      if (run.status === 'waiting_user') break;
      if (TERMINAL_STATUSES.has(run.status)) {
        throw new Error(`AGENT_DEV_RELAY_SMOKE_RUN_${run.error?.code || run.status}`);
      }
      await sleep(1000);
    }
    if (run?.status !== 'waiting_user' || !run.sandbox?.takeoverAvailable) {
      throw new Error('AGENT_DEV_RELAY_SMOKE_TAKEOVER_NOT_AVAILABLE');
    }
    const approval = run.approvals.find((item) => (
      item.status === 'pending' &&
      item.riskLevel === 'blocked' &&
      item.actionType === 'enter_password'
    ));
    if (!approval) throw new Error('AGENT_DEV_RELAY_SMOKE_APPROVAL_MISSING');

    const ticket = await runService.createDesktopTicket({
      userId,
      runId,
      approvalId: approval.approvalId
    });
    const url = viewerUrl({ relayUrl: process.env.AGENT_WORKER_RELAY_URL, token: ticket.token });
    const origin = `https://${url.host}`;
    let authorization = `Basic ${Buffer.from(`artigen-dev:${devAccessPassword}`).toString('base64')}`;
    devAccessPassword = '';
    try {
      websocket = await waitForRfb({ url, origin, authorization });
    } finally {
      authorization = '';
    }

    const activeTicket = await pool.query(
      `SELECT consumed_at,relay_started_at,closed_at
         FROM agent_desktop_tickets WHERE id=$1`,
      [ticket.ticketId]
    );
    if (
      !activeTicket.rows[0]?.consumed_at ||
      !activeTicket.rows[0]?.relay_started_at ||
      activeTicket.rows[0]?.closed_at
    ) {
      throw new Error('AGENT_DEV_RELAY_SMOKE_TICKET_LIFECYCLE_INVALID');
    }
    websocket.close(1000, 'smoke complete');
    websocket = null;
    const closedTicket = await waitForTicketClosed(pool, ticket.ticketId);
    console.log(JSON.stringify({
      event: 'relay.succeeded',
      runId,
      ticketId: ticket.ticketId,
      rfbVersion: '003.008',
      consumed: Boolean(closedTicket.consumed_at),
      relayStarted: Boolean(closedTicket.relay_started_at),
      closed: Boolean(closedTicket.closed_at)
    }));
  } finally {
    if (websocket) websocket.terminate();
    if (runId && userId) {
      await runService.cancelRun({ userId, runId }).catch(() => {});
    }
    await queuePublisher.stop().catch(() => {});
    await pool.end().catch(() => {});
  }
};

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'relay.failed',
    code: String(error?.code || error?.message || 'AGENT_DEV_RELAY_SMOKE_FAILED')
  }));
  process.exitCode = 1;
});
