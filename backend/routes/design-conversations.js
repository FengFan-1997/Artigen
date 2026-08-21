const { ApiError, sendApiError } = require('../lib/api-error');
const { resolveAuthUser } = require('../lib/auth-utils');
const { getPool, isDatabaseConfigured } = require('../db/pool');
const billing = require('../services/billing-service');
const assets = require('../services/asset-storage');
const {
  createDesignConversationService,
  getDesignConversationConfig
} = require('../services/design-conversation-service');
const {
  cleanupUpload,
  parseMultipartRequest
} = require('./tool-tasks');
const {
  createModelCallService,
  createProviderScheduler
} = require('../services/agent-model-runtime-service');

const requireAuthenticatedUser = (req) => {
  const auth = resolveAuthUser(req);
  if (!auth.ok) throw new ApiError(auth.status || 401, auth.error || 'LOGIN_REQUIRED');
  return auth;
};

const parseJsonArray = (value, field) => {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    if (!Array.isArray(parsed)) throw new Error('shape');
    return parsed;
  } catch {
    throw new ApiError(400, 'INVALID_JSON_FIELD', { field });
  }
};

const installDesignConversationRoutes = (app, deps = {}) => {
  const env = deps.env || process.env;
  const rateLimit = typeof deps.rateLimit === 'function'
    ? deps.rateLimit
    : () => (_req, _res, next) => next();
  const readLimiter = rateLimit('design_conversations_read', {
    max: Number.parseInt(env.DESIGN_CONVERSATION_READ_RATE_MAX || '240', 10) || 240,
    windowMs: 60 * 1000
  });
  const writeLimiter = rateLimit('design_conversations_write', {
    max: Number.parseInt(env.DESIGN_CONVERSATION_WRITE_RATE_MAX || '30', 10) || 30,
    windowMs: 60 * 1000
  });
  const pool = deps.pool || (isDatabaseConfigured() ? getPool() : null);
  const providerScheduler = deps.providerScheduler || (!deps.designConversationService && pool?.connect
    ? createProviderScheduler({ pool, env })
    : null);
  const modelCallService = deps.modelCallService || (!deps.designConversationService && pool?.query
    ? createModelCallService({ pool, retentionDays: 30 })
    : null);
  const service = deps.designConversationService || (
    pool
      ? createDesignConversationService({
          pool,
          env,
          chatGenerate: deps.callSiliconFlowChat,
          providerScheduler,
          modelCallService
        })
      : null
  );
  const config = getDesignConversationConfig(env);
  const requireService = () => {
    if (!config.enabled) throw new ApiError(404, 'DESIGN_CONVERSATION_DISABLED');
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
            error: { code: String(error?.code || 'DESIGN_EVENT_STREAM_FAILED') }
          })}\n\n`);
          res.end();
        } catch {}
        return;
      }
      sendApiError(res, error);
    }
  };
  const authIdentity = (req) => {
    const auth = requireAuthenticatedUser(req);
    return auth.dbUserId || auth.userId;
  };

  app.get('/api/design-assistant/status', readLimiter, asyncRoute(async (_req, res) => {
    const status = service
      ? await service.getStatus()
      : {
          enabled: config.enabled,
          workerEnabled: config.workerEnabled,
          plannerReady: false,
          model: 'Qwen/Qwen3-8B',
          imageModel: 'Kwai-Kolors/Kolors',
          autoCreditCap: config.autoCreditCap,
          retentionDays: config.retentionDays,
          authorizationIdleMinutes: config.authorizationIdleMinutes,
          queued: 0,
          running: 0
        };
    res.json({ ok: true, status });
  }));

  app.post('/api/design-conversations', writeLimiter, asyncRoute(async (req, res) => {
    const conversation = await requireService().createConversation({
      userId: authIdentity(req),
      projectId: req.body?.projectId || null
    });
    res.status(201).json({ ok: true, conversation });
  }));

  app.get('/api/design-conversations', readLimiter, asyncRoute(async (req, res) => {
    const conversations = await requireService().listConversations({
      userId: authIdentity(req),
      limit: req.query?.limit,
      cursor: req.query?.cursor
    });
    res.json({ ok: true, conversations });
  }));

  app.get('/api/design-conversations/:conversationId', readLimiter, asyncRoute(async (req, res) => {
    const conversation = await requireService().getConversation({
      userId: authIdentity(req),
      conversationId: req.params.conversationId
    });
    res.json({ ok: true, conversation });
  }));

  app.delete('/api/design-conversations/:conversationId', writeLimiter, asyncRoute(async (req, res) => {
    await requireService().deleteConversation({
      userId: authIdentity(req),
      conversationId: req.params.conversationId
    });
    res.status(204).end();
  }));

  app.post('/api/design-conversations/:conversationId/messages', writeLimiter, asyncRoute(async (req, res) => {
    const message = await requireService().addMessage({
      userId: authIdentity(req),
      conversationId: req.params.conversationId,
      message: req.body?.message,
      attachments: req.body?.attachments
    });
    res.status(202).json({ ok: true, message });
  }));

  app.post('/api/design-conversations/:conversationId/attachments', writeLimiter, asyncRoute(async (req, res) => {
    const userId = authIdentity(req);
    const conversationService = requireService();
    await conversationService.getConversation({
      userId,
      conversationId: req.params.conversationId
    });
    if (!pool) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const parsed = await parseMultipartRequest(req, {
      maxFiles: 10,
      maxFileBytes: 40 * 1024 * 1024
    });
    try {
      if (!parsed.files.length) throw new ApiError(400, 'DESIGN_ATTACHMENTS_REQUIRED');
      const clientIds = parseJsonArray(parsed.fields.clientIds, 'clientIds')
        .map((value) => String(value || '').trim());
      if (clientIds.length !== parsed.files.length || clientIds.some((value) => !value)) {
        throw new ApiError(400, 'DESIGN_ATTACHMENTS_INVALID', { field: 'clientIds' });
      }
      const client = await pool.connect();
      let ownerUserId;
      try {
        ownerUserId = await billing.resolveUserId(client, userId);
      } finally {
        client.release();
      }
      const uploaded = [];
      for (const [index, file] of parsed.files.entries()) {
        const stored = await assets.storeAsset({
          pool,
          ownerUserId,
          tempPath: file.tempPath,
          declaredMime: file.declaredMime,
          allowedMimeTypes: [
            'application/pdf',
            'application/zip',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'image/png',
            'image/jpeg',
            'image/webp',
            'text/plain'
          ],
          maxBytes: 40 * 1024 * 1024,
          maxPixels: 32 * 1000 * 1000,
          retentionClass: 'temporary-input',
          expiresAt: new Date(Date.now() + config.retentionDays * 24 * 60 * 60 * 1000),
          metadata: { source: 'design-conversation', clientId: clientIds[index] }
        });
        uploaded.push({ clientId: clientIds[index], assetId: stored.assetId });
      }
      const registered = await conversationService.registerUploadedAssets({
        userId,
        conversationId: req.params.conversationId,
        uploads: uploaded
      });
      res.status(201).json({ ok: true, uploads: registered });
    } finally {
      await cleanupUpload(parsed);
    }
  }));

  app.get('/api/design-conversations/:conversationId/events', readLimiter, asyncRoute(async (req, res) => {
    const userId = authIdentity(req);
    const conversationService = requireService();
    let cursor = Math.max(
      0,
      Number.parseInt(String(req.headers['last-event-id'] || req.query?.after || '0'), 10) || 0
    );
    await conversationService.getConversation({
      userId,
      conversationId: req.params.conversationId
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
        const events = await conversationService.listEvents({
          userId,
          conversationId: req.params.conversationId,
          after: cursor,
          limit: 250
        });
        for (const event of events) {
          cursor = Math.max(cursor, Number(event.eventId || 0));
          res.write(`id: ${event.eventId}\n`);
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } finally {
        polling = false;
      }
    };
    await poll();
    const pollTimer = setInterval(() => void poll().catch(() => {
      if (!closed) res.end();
      closed = true;
    }), 1000);
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

  app.post('/api/design-conversations/:conversationId/executions/:executionId/quote', writeLimiter, asyncRoute(async (req, res) => {
    const execution = await requireService().recordToolQuote({
      userId: authIdentity(req),
      conversationId: req.params.conversationId,
      executionId: req.params.executionId,
      quoteId: req.body?.quoteId
    });
    res.json({ ok: true, execution });
  }));

  app.post('/api/design-conversations/:conversationId/executions/:executionId/agent-quote', writeLimiter, asyncRoute(async (req, res) => {
    const userId = authIdentity(req);
    const conversationService = requireService();
    if (!deps.agentRunService) throw new ApiError(503, 'AGENT_RUNTIME_NOT_CONFIGURED');
    const current = await conversationService.getExecution({
      userId,
      conversationId: req.params.conversationId,
      executionId: req.params.executionId
    });
    if (current.routeKind !== 'agent_run' || current.toolTaskId || current.agentRunId) {
      throw new ApiError(409, 'DESIGN_EXECUTION_ROUTE_MISMATCH');
    }
    const plan = current.plan && typeof current.plan === 'object' ? current.plan : {};
    const quote = await deps.agentRunService.quote({
      userId,
      objective: plan.objective,
      capabilities: plan.capabilities,
      browserConfig: plan.browserConfig,
      deliverables: plan.deliverables,
      maxCredits: current.maxCredits
    });
    let execution = current;
    if (!quote.canStart || Number(quote.maximumCredits || 0) > Number(current.maxCredits || 0)) {
      execution = await conversationService.markExecution({
        userId,
        conversationId: req.params.conversationId,
        executionId: req.params.executionId,
        status: 'waiting_budget',
        errorCode: quote.canStart ? 'DESIGN_EXECUTION_BUDGET_EXCEEDED' : 'INSUFFICIENT_CREDITS'
      });
    }
    res.json({ ok: true, quote, execution });
  }));

  app.post('/api/design-conversations/:conversationId/executions/:executionId/target', writeLimiter, asyncRoute(async (req, res) => {
    const execution = await requireService().attachExecutionTarget({
      userId: authIdentity(req),
      conversationId: req.params.conversationId,
      executionId: req.params.executionId,
      toolTaskId: req.body?.toolTaskId || null,
      agentRunId: req.body?.agentRunId || null
    });
    res.json({ ok: true, execution });
  }));

  app.post('/api/design-conversations/:conversationId/executions/:executionId/budget', writeLimiter, asyncRoute(async (req, res) => {
    const execution = await requireService().increaseExecutionBudget({
      userId: authIdentity(req),
      conversationId: req.params.conversationId,
      executionId: req.params.executionId,
      maxCredits: req.body?.maxCredits
    });
    res.json({ ok: true, execution });
  }));

  app.post('/api/design-conversations/:conversationId/executions/:executionId/cancel', writeLimiter, asyncRoute(async (req, res) => {
    const userId = authIdentity(req);
    const conversationService = requireService();
    const current = await conversationService.getExecution({
      userId,
      conversationId: req.params.conversationId,
      executionId: req.params.executionId
    });
    if (current.toolTaskId) {
      await (deps.cancelToolTask || billing.cancelTask)({ userId, taskId: current.toolTaskId });
    } else if (current.agentRunId) {
      if (!deps.agentRunService) throw new ApiError(503, 'AGENT_RUNTIME_NOT_CONFIGURED');
      await deps.agentRunService.cancelRun({ userId, runId: current.agentRunId });
    }
    const execution = await conversationService.markExecution({
      userId,
      conversationId: req.params.conversationId,
      executionId: req.params.executionId,
      status: 'cancelled'
    });
    res.json({ ok: true, execution });
  }));

  app.get('/api/design-conversations/:conversationId/authorizations', readLimiter, asyncRoute(async (req, res) => {
    const authorizations = await requireService().listAuthorizations({
      userId: authIdentity(req),
      conversationId: req.params.conversationId
    });
    res.json({ ok: true, authorizations });
  }));

  app.post('/api/design-conversations/:conversationId/authorizations', writeLimiter, asyncRoute(async (req, res) => {
    const authorization = await requireService().grantAuthorization({
      userId: authIdentity(req),
      conversationId: req.params.conversationId,
      siteOrigin: req.body?.siteOrigin,
      actionType: req.body?.actionType
    });
    res.status(201).json({ ok: true, authorization });
  }));

  app.delete('/api/design-conversations/:conversationId/authorizations/:authorizationId', writeLimiter, asyncRoute(async (req, res) => {
    await requireService().revokeAuthorization({
      userId: authIdentity(req),
      conversationId: req.params.conversationId,
      authorizationId: req.params.authorizationId
    });
    res.status(204).end();
  }));

  service?.startWorker();
  return { service };
};

module.exports = {
  installDesignConversationRoutes,
  requireAuthenticatedUser
};
