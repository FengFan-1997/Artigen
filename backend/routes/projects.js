const { ApiError, sendApiError } = require('../lib/api-error');
const { resolveAuthUser } = require('../lib/auth-utils');
const { getPool, isDatabaseConfigured } = require('../db/pool');
const assets = require('../services/asset-storage');
const { resolveUserId } = require('../services/billing-service');
const {
  createCreativeProjectService
} = require('../services/creative-project-service');
const {
  cleanupUpload,
  parseMultipartRequest
} = require('./tool-tasks');

const requireAuthenticatedUser = (req) => {
  const auth = resolveAuthUser(req);
  if (!auth.ok) throw new ApiError(auth.status || 401, auth.error || 'LOGIN_REQUIRED');
  return auth;
};

const installProjectRoutes = (app, deps = {}) => {
  const rateLimit = typeof deps.rateLimit === 'function'
    ? deps.rateLimit
    : () => (_req, _res, next) => next();
  const limiter = rateLimit('creative_projects', {
    max: Number.parseInt(process.env.PROJECT_RATE_MAX || '120', 10) || 120,
    windowMs: 60 * 1000
  });
  const writeLimiter = rateLimit('creative_projects_write', {
    max: Number.parseInt(process.env.PROJECT_WRITE_RATE_MAX || '30', 10) || 30,
    windowMs: 60 * 1000
  });
  const pool = deps.pool || (isDatabaseConfigured() ? getPool() : null);
  const service = deps.projectService || (pool
    ? createCreativeProjectService({ pool, env: deps.env || process.env })
    : null);
  const requireService = () => {
    if (!service || !isDatabaseConfigured() && !deps.pool) {
      throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    }
    return service;
  };
  const resolveOwnerUserId = async (userId) => {
    if (!pool) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', { retryable: true });
    const client = await pool.connect();
    try {
      return await resolveUserId(client, userId);
    } finally {
      client.release();
    }
  };
  const asyncRoute = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (res.headersSent) return;
      sendApiError(res, error);
    }
  };

  app.get('/api/projects', limiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const projects = await requireService().listProjects({
      userId: auth.dbUserId || auth.userId,
      includeTrashed: String(req.query?.includeTrashed || '') === '1'
    });
    res.json({ ok: true, projects });
  }));

  app.post('/api/projects', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const project = await requireService().createProject({
      userId: auth.dbUserId || auth.userId,
      title: body.title,
      payload: {
        productName: body.productName,
        brief: body.brief,
        brandProfile: body.brandProfile
      }
    });
    res.status(201).json({ ok: true, project });
  }));

  app.get('/api/projects/:projectId', limiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const project = await requireService().getProject({
      userId: auth.dbUserId || auth.userId,
      projectId: req.params.projectId,
      includeTrashed: String(req.query?.includeTrashed || '') === '1'
    });
    res.json({ ok: true, project });
  }));

  app.patch('/api/projects/:projectId', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const project = await requireService().updateProject({
      userId: auth.dbUserId || auth.userId,
      projectId: req.params.projectId,
      expectedRevision: body.revision,
      title: body.title,
      status: body.status,
      payload: {
        ...(Object.prototype.hasOwnProperty.call(body, 'productName')
          ? { productName: body.productName }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(body, 'brief')
          ? { brief: body.brief }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(body, 'brandProfile')
          ? { brandProfile: body.brandProfile }
          : {})
      }
    });
    res.json({ ok: true, project });
  }));

  app.delete('/api/projects/:projectId', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const project = await requireService().trashProject({
      userId: auth.dbUserId || auth.userId,
      projectId: req.params.projectId
    });
    res.json({ ok: true, project });
  }));

  app.post('/api/projects/:projectId/restore', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const project = await requireService().restoreProject({
      userId: auth.dbUserId || auth.userId,
      projectId: req.params.projectId
    });
    res.json({ ok: true, project });
  }));

  app.post('/api/projects/:projectId/assets', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
    let parsed = null;
    try {
      if (contentType.startsWith('multipart/form-data;')) {
        parsed = await parseMultipartRequest(req, {
          maxFiles: 1,
          maxFileBytes: 40 * 1024 * 1024
        });
        if (parsed.files.length !== 1) {
          throw new ApiError(400, 'SINGLE_FILE_REQUIRED', { field: 'files' });
        }
        const role = String(parsed.fields.role || '').trim();
        // Reject missing, trashed, or foreign projects before persisting any
        // bytes. linkAsset repeats the ownership check in its own transaction
        // so a concurrent trash still fails closed.
        await requireService().getProject({
          userId: auth.dbUserId || auth.userId,
          projectId: req.params.projectId
        });
        const ownerUserId = await resolveOwnerUserId(auth.dbUserId || auth.userId);
        const stored = await assets.storeAsset({
          ownerUserId,
          tempPath: parsed.files[0].tempPath,
          declaredMime: parsed.files[0].declaredMime,
          maxBytes: 40 * 1024 * 1024,
          maxPixels: 32 * 1000 * 1000,
          // Keep the upload bounded until the ownership/link transaction
          // succeeds. linkAsset promotes it to project-owned and clears TTL.
          retentionClass: 'temporary-input',
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
          expiresAt: new Date(Date.now() + 60 * 60_000),
          metadata: {
            source: 'creative-project',
            projectId: req.params.projectId,
            role
          }
        });
        const linked = await requireService().linkAsset({
          userId: auth.dbUserId || auth.userId,
          projectId: req.params.projectId,
          assetId: stored.assetId,
          role,
          label: parsed.fields.label,
          position: parsed.fields.position
        });
        return res.status(201).json({ ok: true, asset: linked });
      }
      if (!contentType.startsWith('application/json')) {
        throw new ApiError(415, 'UNSUPPORTED_CONTENT_TYPE');
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const linked = await requireService().linkAsset({
        userId: auth.dbUserId || auth.userId,
        projectId: req.params.projectId,
        assetId: body.assetId,
        role: body.role,
        label: body.label,
        position: body.position
      });
      return res.status(201).json({ ok: true, asset: linked });
    } finally {
      await cleanupUpload(parsed);
    }
  }));

  app.delete('/api/projects/:projectId/assets/:assetId', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const asset = await requireService().unlinkAsset({
      userId: auth.dbUserId || auth.userId,
      projectId: req.params.projectId,
      assetId: req.params.assetId,
      role: req.query?.role
    });
    res.json({ ok: true, asset });
  }));

  app.patch('/api/projects/:projectId/versions/:versionId', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (!Object.prototype.hasOwnProperty.call(body, 'favorite')) {
      throw new ApiError(400, 'INVALID_PROJECT_VERSION_UPDATE');
    }
    const version = await requireService().favoriteVersion({
      userId: auth.dbUserId || auth.userId,
      projectId: req.params.projectId,
      versionId: req.params.versionId,
      favorite: body.favorite
    });
    res.json({ ok: true, version });
  }));

  app.post('/api/projects/:projectId/versions/import', writeLimiter, asyncRoute(async (req, res) => {
    const auth = requireAuthenticatedUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const version = await requireService().importVersion({
      userId: auth.dbUserId || auth.userId,
      projectId: req.params.projectId,
      assetId: body.assetId,
      prompt: body.prompt,
      profileId: body.profileId,
      aspectRatio: body.aspectRatio
    });
    res.status(201).json({ ok: true, version });
  }));
};

module.exports = {
  installProjectRoutes,
  requireAuthenticatedUser
};
