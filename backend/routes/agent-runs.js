const { ApiError, sendApiError } = require('../lib/api-error');
const { resolveAuthUser } = require('../lib/auth-utils');
const assets = require('../services/asset-storage');
const {
  cleanupUpload,
  inspectUploadedFile,
  parseMultipartRequest
} = require('./tool-tasks');
const { getPool, isDatabaseConfigured } = require('../db/pool');
const { agentFeatureEnabled, isProductionIntent } = require('../services/agent-config');
const { createAgentRunService } = require('../services/agent-run-service');
const { AgentQueuePublisher } = require('../services/agent-queue-service');
const {
  createAgentIntegrationService
} = require('../services/agent-integration-service');

const requireAuthenticatedUser = (req) => {
  const auth = resolveAuthUser(req);
  if (!auth.ok) throw new ApiError(auth.status || 401, auth.error || 'LOGIN_REQUIRED');
  return auth;
};

const desktopViewerEndpoint = (env, req) => {
  const configured = String(
    env.AGENT_DESKTOP_RELAY_PUBLIC_URL || env.AGENT_WORKER_RELAY_URL || ''
  ).trim();
  let value = configured;
  if (value) value = value.replace(/\/worker(?:\?.*)?$/, '/viewer');
  if (!value) {
    const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const secure = forwarded === 'https' || req.secure;
    value = `${secure ? 'wss' : 'ws'}://${req.get('host')}/api/agent-desktop/viewer`;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError(503, 'AGENT_DESKTOP_RELAY_NOT_CONFIGURED');
  }
  if (
    !['ws:', 'wss:'].includes(parsed.protocol) ||
    (isProductionIntent(env) && parsed.protocol !== 'wss:') ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new ApiError(503, 'AGENT_DESKTOP_RELAY_NOT_CONFIGURED');
  }
  return parsed.toString();
};

const installAgentRoutes = (app, deps = {}) => {
  const env = deps.env || process.env;
  const rateLimit = typeof deps.rateLimit === 'function'
    ? deps.rateLimit
    : () => (_req, _res, next) => next();
  const readLimiter = rateLimit('agent_runs_read', {
    max: Number.parseInt(env.AGENT_READ_RATE_MAX || '240', 10) || 240,
    windowMs: 60 * 1000
  });
  const writeLimiter = rateLimit('agent_runs_write', {
    max: Number.parseInt(env.AGENT_WRITE_RATE_MAX || '30', 10) || 30,
    windowMs: 60 * 1000
  });
  const pool = deps.pool || (isDatabaseConfigured() ? getPool() : null);
  const queuePublisher = deps.queuePublisher || (
    pool && agentFeatureEnabled(env) ? new AgentQueuePublisher({ env }) : null
  );
  const service = deps.agentRunService || (
    pool
      ? createAgentRunService({ pool, env, queuePublisher })
      : null
  );
  const integrationService = deps.agentIntegrationService || (
    pool ? createAgentIntegrationService({ pool, env }) : null
  );
  const requireService = () => {
    if (!agentFeatureEnabled(env)) throw new ApiError(404, 'AGENT_FEATURE_DISABLED');
    if (!service || (!isDatabaseConfigured() && !deps.pool)) {
      throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    }
    return service;
  };
  const asyncRoute = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (res.headersSent) {
        try {
          res.write(`event: error\ndata: ${JSON.stringify({
            error: { code: String(error?.code || 'AGENT_EVENT_STREAM_FAILED') }
          })}\n\n`);
          res.end();
        } catch {}
        return;
      }
      sendApiError(res, error);
    }
  };

  app.get('/api/agent/status', readLimiter, asyncRoute(async (_req, res) => {
    const status = await requireService().getServiceStatus();
    res.json({ ok: true, status });
  }));

  app.post('/api/agent-assets', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const runService = requireService();
    if (!pool) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const ownerUserId = await runService.resolveUserAccess({
      userId: auth.dbUserId || auth.userId
    });
    const parsed = await parseMultipartRequest(req, {
      maxFiles: 10,
      maxFileBytes: 40 * 1024 * 1024
    });
    try {
      if (!parsed.files.length) throw new ApiError(400, 'AGENT_INPUT_FILES_REQUIRED');
      const uploaded = [];
      for (const file of parsed.files) {
        const declaredMime = String(file.declaredMime || '').startsWith('text/')
          ? 'text/plain'
          : file.declaredMime;
        const allowedMimeTypes = [
          'application/pdf',
          'application/zip',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'image/png',
          'image/jpeg',
          'image/webp',
          'text/plain'
        ];
        const inspected = await inspectUploadedFile({
          tempPath: file.tempPath,
          declaredMime,
          allowedMimeTypes,
          maxBytes: 40 * 1024 * 1024,
          maxPixels: 32 * 1000 * 1000
        });
        const stored = await assets.storeAsset({
          pool,
          ownerUserId,
          tempPath: file.tempPath,
          declaredMime: inspected.mimeType,
          allowedMimeTypes,
          maxBytes: 40 * 1024 * 1024,
          maxPixels: 32 * 1000 * 1000,
          retentionClass: 'temporary-input',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          metadata: { source: 'agent-input' }
        });
        uploaded.push({
          assetId: stored.assetId,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize
        });
      }
      res.status(201).json({ ok: true, assets: uploaded });
    } finally {
      await cleanupUpload(parsed);
    }
  }));

  app.post('/api/agent-runs/quote', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const quote = await requireService().quote({
      userId: auth.dbUserId || auth.userId,
      objective: body.objective,
      capabilities: body.capabilities,
      browserConfig: body.browserConfig,
      deliverables: body.deliverables,
      taskSpec: body.taskSpec,
      maxCredits: body.maxCredits
    });
    res.json({ ok: true, quote });
  }));

  app.post('/api/agent-runs', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const run = await requireService().createRun({
      userId: auth.dbUserId || auth.userId,
      objective: body.objective,
      assetIds: body.assetIds,
      maxCredits: body.maxCredits,
      capabilities: body.capabilities,
      deliverables: body.deliverables,
      taskSpec: body.taskSpec,
      browserConfig: body.browserConfig,
      projectId: body.projectId,
      idempotencyKey: req.headers['idempotency-key']
    });
    res.status(run.replayed ? 200 : 202).json({ ok: true, run });
  }));

  app.get('/api/agent-runs', readLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const runs = await requireService().listRuns({
      userId: auth.dbUserId || auth.userId,
      limit: req.query?.limit,
      cursor: req.query?.cursor
    });
    res.json({ ok: true, runs });
  }));

  app.get('/api/agent-runs/:runId', readLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const run = await requireService().getRun({
      userId: auth.dbUserId || auth.userId,
      runId: req.params.runId
    });
    res.json({ ok: true, run });
  }));

  app.get('/api/agent-runs/:runId/events', readLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const runService = requireService();
    let cursor = Math.max(
      0,
      Number.parseInt(
        String(req.headers['last-event-id'] || req.query?.after || '0'),
        10
      ) || 0
    );
    await runService.getRun({
      userId: auth.dbUserId || auth.userId,
      runId: req.params.runId
    });
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write('retry: 1500\n\n');

    let closed = false;
    let polling = false;
    const poll = async () => {
      if (closed || polling) return;
      polling = true;
      try {
        const events = await runService.listEvents({
          userId: auth.dbUserId || auth.userId,
          runId: req.params.runId,
          after: cursor,
          limit: 250
        });
        for (const event of events) {
          cursor = Math.max(cursor, Number(event.eventId || 0));
          res.write(`id: ${event.eventId}\n`);
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (error) {
        if (!closed) {
          res.write(`event: error\ndata: ${JSON.stringify({
            error: { code: String(error?.code || 'AGENT_EVENT_STREAM_FAILED') }
          })}\n\n`);
          res.end();
        }
        closed = true;
      } finally {
        polling = false;
      }
    };
    await poll();
    const pollTimer = setInterval(() => void poll(), 1000);
    const heartbeat = setInterval(() => {
      if (!closed) res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15_000);
    pollTimer.unref?.();
    heartbeat.unref?.();
    req.once('close', () => {
      closed = true;
      clearInterval(pollTimer);
      clearInterval(heartbeat);
    });
  }));

  for (const action of ['pause', 'resume', 'cancel']) {
    app.post(
      `/api/agent-runs/:runId/${action}`,
      writeLimiter,
      asyncRoute(async (req, res) => {
        const auth = requireAuthenticatedUser(req);
        const method = action === 'pause'
          ? 'pauseRun'
          : action === 'resume'
            ? 'resumeRun'
            : 'cancelRun';
        const run = await requireService()[method]({
          userId: auth.dbUserId || auth.userId,
          runId: req.params.runId
        });
        res.json({ ok: true, run });
      })
    );
  }

  app.post(
    '/api/agent-runs/:runId/subagents/:subagentId/cancel',
    writeLimiter,
    asyncRoute(async (req, res) => {
      const auth = requireAuthenticatedUser(req);
      const subagent = await requireService().cancelSubagent({
        userId: auth.dbUserId || auth.userId,
        runId: req.params.runId,
        subagentId: req.params.subagentId
      });
      res.json({ ok: true, subagent });
    })
  );

  app.post('/api/agent-runs/:runId/input', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    await requireService().submitInput({
      userId: auth.dbUserId || auth.userId,
      runId: req.params.runId,
      message: body.message,
      approvalId: body.approvalId,
      decision: body.decision,
      decisionReason: body.decisionReason,
      takeoverEnded: body.takeoverEnded === true,
      takeoverApprovalId: body.takeoverApprovalId
    });
    res.json({ ok: true });
  }));

  app.post('/api/agent-runs/:runId/desktop-ticket', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const ticket = await requireService().createDesktopTicket({
      userId: auth.dbUserId || auth.userId,
      runId: req.params.runId,
      approvalId: String(body.approvalId || '').trim()
    });
    const viewer = new URL(desktopViewerEndpoint(env, req));
    viewer.searchParams.set('ticket', ticket.token);
    res.status(201).json({
      ok: true,
      ticket: {
        ticketId: ticket.ticketId,
        websocketUrl: viewer.toString(),
        expiresAt: ticket.expiresAt
      }
    });
  }));

  app.get('/api/agent-runs/:runId/artifacts', readLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const artifacts = await requireService().listArtifacts({
      userId: auth.dbUserId || auth.userId,
      runId: req.params.runId
    });
    res.json({ ok: true, artifacts });
  }));

  app.get('/api/agent-browser-profiles', readLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const profiles = await requireService().listBrowserProfiles({
      userId: auth.dbUserId || auth.userId
    });
    res.json({ ok: true, profiles });
  }));

  app.delete('/api/agent-browser-profiles/:profileId', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    await requireService().deleteBrowserProfile({
      userId: auth.dbUserId || auth.userId,
      profileId: req.params.profileId
    });
    res.status(204).end();
  }));

  app.get('/api/integrations', readLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const integrations = await requireService().listIntegrations({
      userId: auth.dbUserId || auth.userId
    });
    res.json({
      ok: true,
      integrations,
      supported: ['google_drive', 'github']
    });
  }));

  app.post('/api/integrations/:provider/connect', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    await requireService().resolveUserAccess({ userId: auth.dbUserId || auth.userId });
    const provider = String(req.params.provider || '').trim();
    if (!['google_drive', 'github'].includes(provider)) {
      throw new ApiError(404, 'AGENT_INTEGRATION_UNSUPPORTED');
    }
    if (!integrationService) {
      throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    }
    const authorization = await integrationService.begin({
      userId: auth.dbUserId || auth.userId,
      provider,
      returnTo: req.body?.returnTo
    });
    res.json({ ok: true, authorization });
  }));

  app.get('/api/integrations/:provider/callback', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    await requireService().resolveUserAccess({ userId: auth.dbUserId || auth.userId });
    const provider = String(req.params.provider || '').trim();
    if (!['google_drive', 'github'].includes(provider)) {
      throw new ApiError(404, 'AGENT_INTEGRATION_UNSUPPORTED');
    }
    if (!integrationService) {
      throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    }
    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    if (!code || !state) throw new ApiError(400, 'AGENT_OAUTH_CALLBACK_INVALID');
    const completed = await integrationService.complete({
      userId: auth.dbUserId || auth.userId,
      provider,
      code,
      state
    });
    const destination = new URL(
      completed.returnTo || '/artigen/agent',
      String(env.APP_ORIGIN || env.PUBLIC_ORIGIN || 'http://localhost:4000')
    );
    destination.searchParams.set('integration', provider);
    destination.searchParams.set('connected', '1');
    res.redirect(303, destination.toString());
  }));

  app.delete('/api/integrations/:provider', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    await requireService().resolveUserAccess({ userId: auth.dbUserId || auth.userId });
    const provider = String(req.params.provider || '').trim();
    if (!['google_drive', 'github'].includes(provider)) {
      throw new ApiError(404, 'AGENT_INTEGRATION_UNSUPPORTED');
    }
    if (!integrationService) {
      throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    }
    await integrationService.revoke({
      userId: auth.dbUserId || auth.userId,
      provider
    });
    res.status(204).end();
  }));

  return {
    queuePublisher,
    service
  };
};

module.exports = {
  desktopViewerEndpoint,
  installAgentRoutes,
  requireAuthenticatedUser
};
