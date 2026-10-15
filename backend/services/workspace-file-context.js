const { ApiError } = require("../lib/api-error");
const normalizeFileEditTargets = (input, assetIds) => {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 10)
    throw new ApiError(400, "AGENT_FILE_TARGET_INVALID");
  const targets = input.map((t, index) => {
    if (
      !t ||
      !assetIds.includes(t.assetId) ||
      !["local", "cloud", "artifact"].includes(t.source) ||
      typeof t.id !== "string" ||
      !t.id ||
      t.id.length > 500 ||
      typeof t.name !== "string" ||
      !t.name ||
      /[\\/\x00-\x1f]/.test(t.name) ||
      t.name.length > 240 ||
      !/^[a-f0-9]{64}$/.test(t.sha256)
    )
      throw new ApiError(400, "AGENT_FILE_TARGET_INVALID");
    return {
      assetId: t.assetId,
      source: t.source,
      id: t.id,
      name: t.name,
      sha256: t.sha256,
      candidateFilename: `revision-${index + 1}.txt`,
    };
  });
  if (new Set(targets.map((t) => t.id)).size !== targets.length)
    throw new ApiError(400, "AGENT_FILE_TARGET_INVALID");
  return targets;
};
const validateFileEditTargets = async (client, owner, targets, projectId) => {
  if (!targets.length) return;
  const rows = await client.query(
    "SELECT id,sha256,mime_type,byte_size FROM assets WHERE id=ANY($1::uuid[]) AND owner_user_id=$2 AND gc_state='active' AND delete_requested_at IS NULL AND (expires_at IS NULL OR expires_at>now()) FOR SHARE",
    [targets.map((t) => t.assetId), owner],
  );
  for (const target of targets) {
    const asset = rows.rows.find((a) => a.id === target.assetId);
    if (
      !asset ||
      !["text/plain", "text/markdown"].includes(asset.mime_type) ||
      Number(asset.byte_size) > 1048576 ||
      asset.sha256.toString("hex") !== target.sha256
    )
      throw new ApiError(409, "AGENT_FILE_TARGET_HASH_MISMATCH");
    if (target.source !== "local") {
      const virtual = target.id.match(/^(asset|artifact):([a-f0-9-]{36})$/i);
      if (!projectId && virtual?.[1] !== "artifact")
        throw new ApiError(400, "AGENT_FILE_TARGET_PROJECT_REQUIRED");
      const id = virtual ? virtual[2] : target.id;
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          id,
        )
      )
        throw new ApiError(400, "AGENT_FILE_TARGET_INVALID");
      const query =
        virtual?.[1] === "asset"
          ? `SELECT a.sha256 FROM project_asset_links l JOIN assets a ON a.id=l.asset_id JOIN creative_projects p ON p.id=l.project_id WHERE l.asset_id=$1 AND p.id=$2 AND p.user_id=$3 AND p.status='active'`
          : virtual?.[1] === "artifact"
            ? `SELECT a.sha256 FROM agent_artifacts a JOIN agent_runs r ON r.id=a.run_id WHERE a.id=$1 AND r.project_id IS NOT DISTINCT FROM $2::uuid AND r.user_id=$3 AND a.verification_status='passed' AND a.expires_at>now()`
            : `SELECT a.sha256 FROM workspace_files f JOIN workspace_file_versions v ON v.file_id=f.id AND v.revision=f.revision JOIN assets a ON a.id=v.asset_id JOIN creative_projects p ON p.id=f.project_id WHERE f.id=$1 AND p.id=$2 AND p.user_id=$3 AND p.status='active'`;
      const source = await client.query(query, [id, projectId || null, owner]);
      if (
        !source.rowCount ||
        source.rows[0].sha256.toString("hex") !== target.sha256
      )
        throw new ApiError(409, "AGENT_FILE_TARGET_SOURCE_CHANGED");
    }
  }
};
const resolveEditTarget = (declaration, targets) => {
  // A server-assigned output name is an explicit revision contract, not a
  // heuristic basename match. Keep the existing frozen Agent tool schema.
  const target = targets.find(
    (t) => t.candidateFilename === declaration.filename,
  );
  return target
    ? {
        source: target.source,
        id: target.id,
        name: target.name,
        sha256: target.sha256,
      }
    : null;
};
module.exports = {
  normalizeFileEditTargets,
  validateFileEditTargets,
  resolveEditTarget,
};
