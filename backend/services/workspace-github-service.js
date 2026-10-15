const { ApiError } = require("../lib/api-error");
const {
  createAgentIntegrationService,
} = require("./agent-integration-service");
const { createAgentConnectorService } = require("./agent-connector-service");
const repoName = (value) => {
  if (
    !/^[a-zA-Z0-9_.-]{1,100}$/.test(String(value || "")) ||
    value === "." ||
    value === ".."
  )
    throw new ApiError(400, "GITHUB_REPOSITORY_INVALID");
  return value;
};
const createWorkspaceGithubService = ({
  pool,
  env,
  transaction,
  ownedProject,
  connector,
}) => {
  const api =
    connector ||
    createAgentConnectorService({
      integrationService: createAgentIntegrationService({ pool, env }),
    });
  const binding = ({ userId, projectId }) =>
    transaction(userId, async (client, owner) => {
      await ownedProject(client, owner, projectId);
      return (
        (
          await client.query(
            "SELECT owner,repository FROM workspace_repositories WHERE project_id=$1",
            [projectId],
          )
        ).rows[0] || null
      );
    });
  const bind = async ({ userId, projectId, owner, repository }) => {
    repoName(owner);
    repoName(repository);
    await transaction(userId, (client, id) =>
      ownedProject(client, id, projectId),
    );
    await api.requestReadOnly({
      userId,
      provider: "github",
      method: "GET",
      path: `/repos/${owner}/${repository}`,
    });
    return transaction(userId, async (client, id) => {
      await ownedProject(client, id, projectId);
      await client.query(
        "INSERT INTO workspace_repositories(project_id,owner,repository) VALUES($1,$2,$3) ON CONFLICT(project_id) DO UPDATE SET owner=EXCLUDED.owner,repository=EXCLUDED.repository",
        [projectId, owner, repository],
      );
      return { owner, repository };
    });
  };
  const unbind = ({ userId, projectId }) =>
    transaction(userId, async (client, id) => {
      await ownedProject(client, id, projectId);
      await client.query(
        "DELETE FROM workspace_repositories WHERE project_id=$1",
        [projectId],
      );
      return { disconnected: true };
    });
  const read = async ({ userId, projectId, kind, number, sha, page = 1 }) => {
    const repo = await binding({ userId, projectId });
    if (!repo) throw new ApiError(409, "GITHUB_REPOSITORY_NOT_LINKED");
    const base = `/repos/${repoName(repo.owner)}/${repoName(repo.repository)}`;
    const currentPage = Math.max(1, Math.min(100, Number(page) || 1));
    let path;
    if (kind === "pulls")
      path = `${base}/pulls?state=all&sort=updated&direction=desc&per_page=30&page=${currentPage}`;
    else if (kind === "commits")
      path = `${base}/commits?per_page=30&page=${currentPage}`;
    else if (kind === "pull-files" && /^\d+$/.test(String(number)))
      path = `${base}/pulls/${number}/files?per_page=30&page=${currentPage}`;
    else if (kind === "commit" && /^[a-f0-9]{40}$/i.test(String(sha)))
      path = `${base}/commits/${sha}?per_page=30&page=${currentPage}`;
    else throw new ApiError(400, "GITHUB_QUERY_INVALID");
    const result = await api.requestReadOnly({
      userId,
      provider: "github",
      method: "GET",
      path,
    });
    const data = kind === "commit" ? result.data?.files : result.data;
    if (!Array.isArray(data))
      throw new ApiError(502, "GITHUB_RESPONSE_INVALID");
    const items = data.map((row) =>
      kind === "pulls"
        ? {
            number: row.number,
            title: row.title,
            state: row.merged_at ? "merged" : row.state,
            url: row.html_url,
            updatedAt: row.updated_at,
          }
        : kind === "commits"
          ? {
              sha: row.sha,
              title: String(row.commit?.message || "").split("\n")[0],
              url: row.html_url,
              updatedAt: row.commit?.author?.date,
            }
          : {
              filename: row.filename,
              status: row.status,
              additions: row.additions,
              deletions: row.deletions,
              patch: row.patch || null,
            },
    );
    return {
      items,
      hasMore: items.length === 30,
      page: currentPage,
      repository: repo,
    };
  };
  return { binding, bind, unbind, read };
};
module.exports = { createWorkspaceGithubService, repoName };
