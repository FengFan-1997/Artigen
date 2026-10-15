const { resolveAuthUser } = require("../lib/auth-utils");
const { ApiError, sendApiError } = require("../lib/api-error");
const { getPool, isDatabaseConfigured } = require("../db/pool");
const {
  createWorkspaceGithubService,
} = require("../services/workspace-github-service");
const {
  createWorkspaceFilesService,
} = require("../services/workspace-files-service");
const { createWorkspaceService } = require("../services/workspace-service");
const installWorkspaceRoutes = (app, deps = {}) => {
  const pool = deps.pool || (isDatabaseConfigured() ? getPool() : null);
  const service =
    deps.service ||
    (pool ? createWorkspaceService({ pool, env: deps.env }) : null);
  const limit = deps.rateLimit
    ? deps.rateLimit("workspace", { max: 120, windowMs: 60000 })
    : (_req, _res, next) => next();
  const route = (work) => async (req, res) => {
    try {
      const auth = resolveAuthUser(req);
      if (!auth.ok)
        throw new ApiError(auth.status || 401, auth.error || "LOGIN_REQUIRED");
      if (!service) throw new ApiError(503, "DATABASE_NOT_CONFIGURED");
      const value = await work(req, auth.dbUserId || auth.userId);
      res.json({ ok: true, ...value });
    } catch (error) {
      sendApiError(res, error);
    }
  };
  app.get(
    "/api/workspace/navigation",
    limit,
    route((req, userId) =>
      service.navigation({
        userId,
        cursor: req.query.cursor,
        projectId: req.query.projectId,
        limit: req.query.limit,
      }),
    ),
  );
  app.patch(
    "/api/workspace/conversations/:conversationId",
    limit,
    route((req, userId) =>
      service.updateConversation({
        userId,
        conversationId: req.params.conversationId,
        title: req.body?.title,
        projectId: req.body?.projectId,
      }),
    ),
  );
  app.get(
    "/api/agent-runs/:runId/messages",
    limit,
    route((req, userId) =>
      service.messages({
        userId,
        runId: req.params.runId,
        cursor: req.query.cursor,
      }),
    ),
  );
  const files =
    pool && service
      ? createWorkspaceFilesService({
          pool,
          transaction: service.transaction,
          assets: deps.assets,
        })
      : null;
  const projectFiles = "/api/workspace/projects/:projectId/files";
  app.get(
    projectFiles,
    limit,
    route(async (req, userId) => ({
      files: await files.listFiles({ userId, projectId: req.params.projectId }),
    })),
  );
  app.get(
    projectFiles + "/:fileId/content",
    limit,
    route((req, userId) =>
      files.content({
        userId,
        ...req.params,
        revision:
          req.query.revision === undefined
            ? undefined
            : Number(req.query.revision),
      }),
    ),
  );
  app.get(
    projectFiles + "/:fileId/versions",
    limit,
    route(async (req, userId) => ({
      versions: await files.versions({ userId, ...req.params }),
    })),
  );
  app.post(
    projectFiles,
    limit,
    route(async (req, userId) => ({
      file: await files.save({
        ...req.body,
        userId,
        projectId: req.params.projectId,
        fileId: null,
      }),
    })),
  );
  app.put(
    projectFiles + "/:fileId",
    limit,
    route(async (req, userId) => ({
      file: await files.save({ ...req.body, userId, ...req.params }),
    })),
  );
  const github =
    pool && files
      ? createWorkspaceGithubService({
          pool,
          env: deps.env,
          transaction: service.transaction,
          ownedProject: files.ownedProject,
          connector: deps.connector,
        })
      : null;
  const repositoryPath = "/api/workspace/projects/:projectId/github";
  app.get(
    repositoryPath,
    limit,
    route(async (req, userId) => ({
      repository: await github.binding({ userId, ...req.params }),
    })),
  );
  app.put(
    repositoryPath,
    limit,
    route(async (req, userId) => ({
      repository: await github.bind({
        owner: req.body?.owner,
        repository: req.body?.repository,
        userId,
        ...req.params,
      }),
    })),
  );
  app.delete(
    repositoryPath,
    limit,
    route((req, userId) => github.unbind({ userId, ...req.params })),
  );
  app.get(
    repositoryPath + "/:kind",
    limit,
    route((req, userId) =>
      github.read({
        kind: req.params.kind,
        number: req.query.number,
        sha: req.query.sha,
        page: req.query.page,
        userId,
        projectId: req.params.projectId,
      }),
    ),
  );
  return { service, pool, route, limit, files };
};
module.exports = { installWorkspaceRoutes };
