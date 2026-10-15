const crypto = require("crypto");
const { ApiError } = require("../lib/api-error");
const defaultAssets = require("./asset-storage");
const { assertId } = require("./workspace-service");
const MAX_TEXT_BYTES = 1024 * 1024;
const safePath = (value) => {
  const path = String(value || "").normalize("NFC");
  if (
    !path ||
    path.length > 500 ||
    path.startsWith("/") ||
    /[\\\x00-\x1f]/.test(path) ||
    path.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new ApiError(400, "WORKSPACE_PATH_INVALID");
  return path;
};
const fileView = (row) => ({
  id: row.id,
  path: row.path,
  revision: Number(row.revision || 0),
  assetId: row.asset_id,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size),
  sha256: Buffer.isBuffer(row.sha256) ? row.sha256.toString("hex") : row.sha256,
  url: `/api/assets/${row.asset_id}`,
  originArtifactId: row.origin_artifact_id || null,
  verificationStatus: row.verification_status || "user-edited",
  createdAt: row.created_at,
  editable: true,
  editTarget: row.edit_target || null,
});
const createWorkspaceFilesService = ({
  pool,
  transaction,
  assets = defaultAssets,
}) => {
  const ownedProject = async (client, owner, projectId) => {
    assertId(projectId);
    const result = await client.query(
      "SELECT 1 FROM creative_projects WHERE id=$1 AND user_id=$2 AND status='active' FOR SHARE",
      [projectId, owner],
    );
    if (!result.rowCount) throw new ApiError(404, "PROJECT_NOT_FOUND");
  };
  const listFiles = ({ userId, projectId }) =>
    transaction(userId, async (client, owner) => {
      await ownedProject(client, owner, projectId);
      const result = await client.query(
        `SELECT f.id::text,f.path,f.revision,v.asset_id,a.mime_type,a.byte_size,a.sha256,v.created_at,v.origin_artifact_id,NULL::text AS verification_status,NULL::jsonb AS edit_target
      FROM workspace_files f JOIN workspace_file_versions v ON v.file_id=f.id AND v.revision=f.revision JOIN assets a ON a.id=v.asset_id
      WHERE f.project_id=$1 AND a.gc_state='active'
      UNION ALL SELECT 'artifact:'||ar.id,'任务/'||r.id||'/'||ar.filename,0,ar.asset_id,ar.mime_type,ar.byte_size,ar.sha256,ar.created_at,ar.id,ar.verification_status,ar.verification->'editTarget'
      FROM agent_artifacts ar JOIN agent_runs r ON r.id=ar.run_id JOIN assets a ON a.id=ar.asset_id
      WHERE r.project_id=$1 AND r.user_id=$2 AND ar.verification_status='passed' AND ar.expires_at>now() AND a.gc_state='active'
      AND NOT EXISTS(SELECT 1 FROM workspace_file_versions v JOIN workspace_files f ON f.id=v.file_id WHERE f.project_id=$1 AND v.origin_artifact_id=ar.id)
      UNION ALL SELECT 'asset:'||a.id,'资料/'||COALESCE(NULLIF(l.label,''),a.id::text),0,a.id,a.mime_type,a.byte_size,a.sha256,l.created_at,NULL,NULL,NULL
      FROM project_asset_links l JOIN assets a ON a.id=l.asset_id WHERE l.project_id=$1 AND a.gc_state='active'
      AND NOT EXISTS(SELECT 1 FROM workspace_file_versions v JOIN workspace_files f ON f.id=v.file_id WHERE f.project_id=$1 AND v.asset_id=a.id)
      ORDER BY path LIMIT 1000`,
        [projectId, owner],
      );
      return result.rows.map(fileView);
    });
  const resolveFile = async (client, owner, projectId, id, revision) => {
    await ownedProject(client, owner, projectId);
    if (
      revision !== undefined &&
      (!Number.isSafeInteger(revision) || revision < 0)
    )
      throw new ApiError(400, "WORKSPACE_REVISION_INVALID");
    if (id.startsWith("artifact:")) {
      assertId(id.slice(9));
      const r = await client.query(
        `SELECT ar.asset_id,ar.sha256,ar.mime_type,ar.byte_size,ar.created_at,ar.verification_status,ar.id AS origin_artifact_id,ar.verification->'editTarget' AS edit_target,'任务/'||r.id||'/'||ar.filename AS path
       FROM agent_artifacts ar JOIN agent_runs r ON r.id=ar.run_id JOIN assets a ON a.id=ar.asset_id WHERE ar.id=$1 AND r.project_id=$2 AND r.user_id=$3 AND ar.verification_status='passed' AND ar.expires_at>now() AND a.gc_state='active'`,
        [id.slice(9), projectId, owner],
      );
      if (!r.rowCount) throw new ApiError(404, "WORKSPACE_FILE_NOT_FOUND");
      return { ...r.rows[0], id, revision: 0 };
    }
    if (id.startsWith("asset:")) {
      assertId(id.slice(6));
      const r = await client.query(
        "SELECT a.id AS asset_id,a.sha256,a.mime_type,a.byte_size,a.created_at,'资料/'||COALESCE(NULLIF(l.label,''),a.id::text) AS path FROM project_asset_links l JOIN assets a ON a.id=l.asset_id WHERE l.project_id=$1 AND a.id=$2 AND a.owner_user_id=$3 AND a.gc_state='active' LIMIT 1",
        [projectId, id.slice(6), owner],
      );
      if (!r.rowCount) throw new ApiError(404, "WORKSPACE_FILE_NOT_FOUND");
      return { ...r.rows[0], id, revision: 0 };
    }
    assertId(id);
    const r = await client.query(
      `SELECT f.id,f.path,v.revision,v.asset_id,a.sha256,a.mime_type,a.byte_size,v.created_at,v.origin_artifact_id
      FROM workspace_files f JOIN workspace_file_versions v ON v.file_id=f.id AND v.revision=COALESCE($3::integer,f.revision) JOIN assets a ON a.id=v.asset_id
      WHERE f.id=$1 AND f.project_id=$2 AND a.gc_state='active'`,
      [id, projectId, revision ?? null],
    );
    if (!r.rowCount) throw new ApiError(404, "WORKSPACE_FILE_NOT_FOUND");
    return r.rows[0];
  };
  const textContent = async (row, owner, client) => {
    if (Number(row.byte_size) > MAX_TEXT_BYTES)
      throw new ApiError(413, "WORKSPACE_TEXT_TOO_LARGE");
    const opened = await assets.openAsset({
      assetId: row.asset_id,
      ownerUserId: owner,
      pool: client,
    });
    const chunks = [];
    let size = 0;
    for await (const chunk of assets.toReadable(opened.body)) {
      size += chunk.length;
      if (size > MAX_TEXT_BYTES) {
        assets.destroyReadable?.(opened.body);
        throw new ApiError(413, "WORKSPACE_TEXT_TOO_LARGE");
      }
      chunks.push(Buffer.from(chunk));
    }
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        Buffer.concat(chunks),
      );
    } catch {
      throw new ApiError(415, "WORKSPACE_NOT_UTF8");
    }
  };
  const content = ({ userId, projectId, fileId, revision }) =>
    transaction(userId, async (client, owner) => {
      const row = await resolveFile(client, owner, projectId, fileId, revision);
      return {
        file: fileView(row),
        text: await textContent(row, owner, client),
      };
    });
  const save = async ({
    userId,
    projectId,
    fileId,
    path,
    text,
    expectedRevision,
    baseSha256,
  }) => {
    if (
      typeof text !== "string" ||
      Buffer.byteLength(text) > MAX_TEXT_BYTES ||
      text.includes("\0")
    )
      throw new ApiError(413, "WORKSPACE_TEXT_TOO_LARGE");
    const hash = crypto.createHash("sha256").update(text).digest("hex");
    const inspect = async (client, owner) => {
      await ownedProject(client, owner, projectId);
      const current = fileId
        ? await resolveFile(client, owner, projectId, fileId)
        : null;
      if (
        current &&
        (Number(expectedRevision) !== Number(current.revision) ||
          String(baseSha256) !== fileView(current).sha256)
      )
        throw new ApiError(409, "WORKSPACE_VERSION_CONFLICT");
      if (!current && expectedRevision !== 0)
        throw new ApiError(409, "WORKSPACE_VERSION_CONFLICT");
      return { owner, current, path: safePath(current ? current.path : path) };
    };
    const before = await transaction(userId, inspect);
    if (before.current && fileView(before.current).sha256 === hash)
      return fileView(before.current);
    // No outer connection/lock is held during object storage I/O. Failed final
    // validation leaves a bounded temporary asset for the normal GC to reclaim.
    const stored = await assets.storeAsset({
      pool,
      ownerUserId: before.owner,
      buffer: Buffer.from(text),
      declaredMime: "text/plain",
      allowedMimeTypes: ["text/plain"],
      allowEmptyText: true,
      maxBytes: MAX_TEXT_BYTES,
      retentionClass: "temporary-input",
      expiresAt: new Date(Date.now() + 3600000),
      metadata: { source: "workspace-editor" },
    });
    return transaction(userId, async (client, owner) => {
      const fresh = await inspect(client, owner);
      const current = fresh.current;
      const file = await client.query(
        `INSERT INTO workspace_files(project_id,path) VALUES($1,$2) ON CONFLICT(project_id,path) DO UPDATE SET path=EXCLUDED.path RETURNING *`,
        [projectId, fresh.path],
      );
      const record = file.rows[0];
      if (Number(record.revision) !== Number(current?.revision || 0))
        throw new ApiError(409, "WORKSPACE_VERSION_CONFLICT");
      if (current) {
        const retained = await client.query(
          "UPDATE assets SET expires_at=NULL,retention_class='project-owned' WHERE id=$1 AND owner_user_id=$2 AND gc_state='active' AND delete_requested_at IS NULL AND (expires_at IS NULL OR expires_at>now()) RETURNING id",
          [current.asset_id, owner],
        );
        if (!retained.rowCount)
          throw new ApiError(409, "WORKSPACE_ASSET_UNAVAILABLE");
      }
      if (current && Number(record.revision) === 0)
        await client.query(
          "INSERT INTO workspace_file_versions(file_id,revision,asset_id,origin_artifact_id) VALUES($1,0,$2,$3)",
          [record.id, current.asset_id, current.origin_artifact_id || null],
        );
      const next = Number(record.revision) + 1;
      await client.query(
        "INSERT INTO workspace_file_versions(file_id,revision,asset_id) VALUES($1,$2,$3)",
        [record.id, next, stored.assetId],
      );
      await client.query(
        "UPDATE workspace_files SET revision=$2,updated_at=now() WHERE id=$1",
        [record.id, next],
      );
      const promoted = await client.query(
        "UPDATE assets SET expires_at=NULL,retention_class='project-owned' WHERE id=$1 AND owner_user_id=$2 AND gc_state='active' AND delete_requested_at IS NULL RETURNING id",
        [stored.assetId, owner],
      );
      if (!promoted.rowCount)
        throw new ApiError(409, "WORKSPACE_ASSET_UNAVAILABLE");
      return fileView({
        id: record.id,
        path: fresh.path,
        revision: next,
        asset_id: stored.assetId,
        mime_type: "text/plain",
        byte_size: Buffer.byteLength(text),
        sha256: hash,
        created_at: new Date(),
      });
    });
  };
  const versions = ({ userId, projectId, fileId }) =>
    transaction(userId, async (client, owner) => {
      await resolveFile(client, owner, projectId, fileId);
      if (fileId.includes(":")) return [];
      const result = await client.query(
        'SELECT v.revision,v.created_at AS "createdAt",a.byte_size AS "byteSize",encode(a.sha256,\'hex\') AS sha256 FROM workspace_file_versions v JOIN assets a ON a.id=v.asset_id WHERE file_id=$1 ORDER BY revision DESC',
        [fileId],
      );
      return result.rows;
    });
  return { listFiles, content, save, versions, ownedProject };
};
module.exports = { createWorkspaceFilesService, safePath, MAX_TEXT_BYTES };
