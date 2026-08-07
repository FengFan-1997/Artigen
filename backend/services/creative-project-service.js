const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');
const { getPool } = require('../db/pool');
const {
  decryptProjectPayload,
  encryptProjectPayload
} = require('./project-payload-service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_ASSET_ROLES = new Set(['product', 'style', 'scene', 'logo', 'result', 'export']);
const PROJECT_STATUSES = new Set(['active', 'archived']);
const MAX_PROJECTS_PER_USER = 200;
const MAX_ASSETS_PER_PROJECT = 200;

const resolveUserId = async (client, userId) => {
  const raw = String(userId || '').trim();
  if (!raw) throw new ApiError(401, 'LOGIN_REQUIRED');
  const result = UUID_RE.test(raw)
    ? await client.query('SELECT id FROM users WHERE id=$1::uuid LIMIT 1', [raw])
    : await client.query('SELECT id FROM users WHERE legacy_user_id=$1 LIMIT 1', [raw]);
  if (!result.rowCount) throw new ApiError(401, 'SESSION_INVALID');
  return result.rows[0].id;
};

const cleanText = (value, max, { required = false } = {}) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if ((required && !text) || text.length > max) throw new ApiError(400, 'INVALID_PROJECT_FIELD');
  return text;
};

const cleanList = (value, maxItems, maxLength) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ApiError(400, 'INVALID_PROJECT_FIELD');
  }
  return [...new Set(value.map((item) => cleanText(item, maxLength)).filter(Boolean))];
};

const cleanBrandProfile = (value) => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const colors = cleanList(input.colors, 6, 24);
  if (colors.length > 0 && colors.length < 3) {
    throw new ApiError(400, 'INVALID_BRAND_COLOR_COUNT', { field: 'brandProfile.colors' });
  }
  if (colors.some((color) => !/^#[0-9a-f]{6}$/i.test(color))) {
    throw new ApiError(400, 'INVALID_BRAND_COLOR', { field: 'brandProfile.colors' });
  }
  return {
    brandName: cleanText(input.brandName, 120),
    colors,
    styleKeywords: cleanList(input.styleKeywords, 12, 80),
    prohibitedElements: cleanList(input.prohibitedElements, 12, 120),
    logoAssetId: input.logoAssetId ? assertUuid(input.logoAssetId, 'brandProfile.logoAssetId') : null
  };
};

const cleanProjectPayload = (value) => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    productName: cleanText(input.productName, 160),
    brief: cleanText(input.brief, 4000),
    brandProfile: cleanBrandProfile(input.brandProfile)
  };
};

const cleanVersionPayload = (value) => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    prompt: cleanText(input.prompt, 4000, { required: true }),
    direction: input.direction && typeof input.direction === 'object'
      ? {
          id: cleanText(input.direction.id, 80),
          title: cleanText(input.direction.title, 100),
          summary: cleanText(input.direction.summary, 400),
          prompt: cleanText(input.direction.prompt, 2000)
        }
      : null
  };
};

const assertUuid = (value, field = 'id') => {
  const text = String(value || '').trim();
  if (!UUID_RE.test(text)) throw new ApiError(400, 'INVALID_ID', { field });
  return text;
};

const publicAsset = (row) => ({
  assetId: row.asset_id,
  role: row.role,
  label: row.label || '',
  position: Number(row.position || 0),
  url: `/api/assets/${encodeURIComponent(row.asset_id)}`,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size || 0),
  width: Number(row.width || 0) || null,
  height: Number(row.height || 0) || null,
  createdAt: row.created_at
});

const decryptPayloadRow = (entityType, id, row, env) => {
  if (!row?.ciphertext) return {};
  return decryptProjectPayload({
    entityType,
    entityId: id,
    record: row,
    env
  });
};

const publicVersion = (row, env) => ({
  versionId: row.id,
  projectId: row.project_id,
  parentVersionId: row.parent_version_id || null,
  taskId: row.task_id || null,
  status: row.status,
  profileId: row.profile_id,
  aspectRatio: row.aspect_ratio,
  seed: row.seed === null ? null : Number(row.seed),
  quotedCredits: Number(row.quoted_credits || 0),
  favorite: Boolean(row.is_favorite),
  outputAssetId: row.output_asset_id || null,
  outputUrl: row.output_asset_id
    ? `/api/assets/${encodeURIComponent(row.output_asset_id)}`
    : null,
  ...decryptPayloadRow('version', row.id, row, env),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const readProjectForOwner = async (client, ownerUserId, projectId, { includeTrashed = false, lock = false } = {}) => {
  const result = await client.query(
    `SELECT project.*, payload.algorithm, payload.key_version, payload.iv,
            payload.auth_tag, payload.ciphertext
       FROM creative_projects project
       JOIN creative_project_payloads payload ON payload.project_id=project.id
      WHERE project.id=$1 AND project.user_id=$2
        AND ($3::boolean OR project.status <> 'trashed')
      ${lock ? 'FOR UPDATE OF project, payload' : ''}`,
    [projectId, ownerUserId, includeTrashed]
  );
  if (!result.rowCount) throw new ApiError(404, 'PROJECT_NOT_FOUND');
  return result.rows[0];
};

const listProjectAssets = async (client, projectId) => {
  const result = await client.query(
    `SELECT link.*, asset.mime_type, asset.byte_size, asset.width, asset.height
       FROM project_asset_links link
       JOIN assets asset ON asset.id=link.asset_id
      WHERE link.project_id=$1
      ORDER BY link.role, link.position, link.created_at`,
    [projectId]
  );
  return result.rows.map(publicAsset);
};

const listProjectVersions = async (client, projectId, env) => {
  const result = await client.query(
    `SELECT *
       FROM project_versions
      WHERE project_id=$1
      ORDER BY created_at DESC
      LIMIT 200`,
    [projectId]
  );
  return result.rows.map((row) => publicVersion(row, env));
};

const createCreativeProjectService = ({ pool = getPool(), env = process.env } = {}) => {
  const transact = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const value = await callback(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  const listProjects = async ({ userId, includeTrashed = false } = {}) => transact(async (client) => {
    const ownerUserId = await resolveUserId(client, userId);
    const result = await client.query(
      `SELECT project.*, payload.algorithm, payload.key_version, payload.iv,
              payload.auth_tag, payload.ciphertext,
              (SELECT count(*)::integer FROM project_versions version
                WHERE version.project_id=project.id) AS version_count
         FROM creative_projects project
         JOIN creative_project_payloads payload ON payload.project_id=project.id
        WHERE project.user_id=$1
          AND ($2::boolean OR project.status <> 'trashed')
        ORDER BY project.updated_at DESC
        LIMIT $3`,
      [ownerUserId, includeTrashed, MAX_PROJECTS_PER_USER]
    );
    return result.rows.map((row) => ({
      projectId: row.id,
      title: row.title,
      status: row.status,
      coverAssetId: row.cover_asset_id || null,
      coverUrl: row.cover_asset_id
        ? `/api/assets/${encodeURIComponent(row.cover_asset_id)}`
        : null,
      revision: Number(row.revision),
      versionCount: Number(row.version_count || 0),
      ...decryptPayloadRow('project', row.id, row, env),
      deletedAt: row.deleted_at,
      purgeAfter: row.purge_after,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  });

  const getProject = async ({ userId, projectId, includeTrashed = false } = {}) => transact(async (client) => {
    const ownerUserId = await resolveUserId(client, userId);
    const id = assertUuid(projectId, 'projectId');
    const row = await readProjectForOwner(client, ownerUserId, id, { includeTrashed });
    return {
      projectId: row.id,
      title: row.title,
      status: row.status,
      coverAssetId: row.cover_asset_id || null,
      coverUrl: row.cover_asset_id
        ? `/api/assets/${encodeURIComponent(row.cover_asset_id)}`
        : null,
      revision: Number(row.revision),
      ...decryptPayloadRow('project', row.id, row, env),
      assets: await listProjectAssets(client, id),
      versions: await listProjectVersions(client, id, env),
      deletedAt: row.deleted_at,
      purgeAfter: row.purge_after,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });

  const createProject = async ({ userId, title, payload = {} } = {}) => transact(async (client) => {
    const ownerUserId = await resolveUserId(client, userId);
    const count = await client.query(
      `SELECT count(*)::integer AS count
         FROM creative_projects
        WHERE user_id=$1 AND status <> 'trashed'`,
      [ownerUserId]
    );
    if (Number(count.rows[0]?.count || 0) >= MAX_PROJECTS_PER_USER) {
      throw new ApiError(409, 'PROJECT_LIMIT_REACHED');
    }
    const safeTitle = cleanText(title, 160, { required: true });
    const safePayload = cleanProjectPayload(payload);
    const id = crypto.randomUUID();
    const encrypted = encryptProjectPayload({
      entityType: 'project',
      entityId: id,
      payload: safePayload,
      env
    });
    await client.query(
      `INSERT INTO creative_projects (id,user_id,title)
       VALUES ($1,$2,$3)`,
      [id, ownerUserId, safeTitle]
    );
    await client.query(
      `INSERT INTO creative_project_payloads
        (project_id,algorithm,key_version,iv,auth_tag,ciphertext)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, encrypted.algorithm, encrypted.keyVersion, encrypted.iv, encrypted.authTag, encrypted.ciphertext]
    );
    return {
      projectId: id,
      title: safeTitle,
      status: 'active',
      revision: 1,
      coverAssetId: null,
      coverUrl: null,
      ...safePayload,
      assets: [],
      versions: []
    };
  });

  const updateProject = async ({
    userId,
    projectId,
    expectedRevision,
    title,
    status,
    payload
  } = {}) => transact(async (client) => {
    const ownerUserId = await resolveUserId(client, userId);
    const id = assertUuid(projectId, 'projectId');
    const current = await readProjectForOwner(client, ownerUserId, id, { lock: true });
    const revision = Number(expectedRevision);
    if (!Number.isSafeInteger(revision) || revision !== Number(current.revision)) {
      throw new ApiError(409, 'PROJECT_REVISION_CONFLICT', { retryable: true });
    }
    const currentPayload = decryptPayloadRow('project', id, current, env);
    const nextPayload = payload === undefined
      ? cleanProjectPayload(currentPayload)
      : cleanProjectPayload({ ...currentPayload, ...payload });
    const nextTitle = title === undefined
      ? current.title
      : cleanText(title, 160, { required: true });
    const nextStatus = status === undefined ? current.status : String(status || '').trim();
    if (!PROJECT_STATUSES.has(nextStatus)) throw new ApiError(400, 'INVALID_PROJECT_STATUS');
    const encrypted = encryptProjectPayload({
      entityType: 'project',
      entityId: id,
      payload: nextPayload,
      env
    });
    const updated = await client.query(
      `UPDATE creative_projects SET
         title=$3, status=$4, revision=revision+1, updated_at=clock_timestamp()
       WHERE id=$1 AND user_id=$2 AND revision=$5
       RETURNING *`,
      [id, ownerUserId, nextTitle, nextStatus, revision]
    );
    if (!updated.rowCount) throw new ApiError(409, 'PROJECT_REVISION_CONFLICT', { retryable: true });
    await client.query(
      `UPDATE creative_project_payloads SET
         algorithm=$2,key_version=$3,iv=$4,auth_tag=$5,ciphertext=$6,updated_at=clock_timestamp()
       WHERE project_id=$1`,
      [id, encrypted.algorithm, encrypted.keyVersion, encrypted.iv, encrypted.authTag, encrypted.ciphertext]
    );
    return {
      projectId: id,
      title: nextTitle,
      status: nextStatus,
      revision: Number(updated.rows[0].revision),
      coverAssetId: updated.rows[0].cover_asset_id || null,
      ...nextPayload,
      updatedAt: updated.rows[0].updated_at
    };
  });

  const trashProject = async ({ userId, projectId } = {}) => transact(async (client) => {
    const ownerUserId = await resolveUserId(client, userId);
    const id = assertUuid(projectId, 'projectId');
    await readProjectForOwner(client, ownerUserId, id, { lock: true });
    const result = await client.query(
      `UPDATE creative_projects SET
         status='trashed',
         deleted_at=clock_timestamp(),
         purge_after=clock_timestamp()+interval '7 days',
         revision=revision+1,
         updated_at=clock_timestamp()
       WHERE id=$1 AND user_id=$2
       RETURNING deleted_at,purge_after,revision`,
      [id, ownerUserId]
    );
    return {
      projectId: id,
      status: 'trashed',
      deletedAt: result.rows[0].deleted_at,
      purgeAfter: result.rows[0].purge_after,
      revision: Number(result.rows[0].revision)
    };
  });

  const restoreProject = async ({ userId, projectId } = {}) => transact(async (client) => {
    const ownerUserId = await resolveUserId(client, userId);
    const id = assertUuid(projectId, 'projectId');
    const result = await client.query(
      `UPDATE creative_projects SET
         status='active',deleted_at=NULL,purge_after=NULL,
         revision=revision+1,updated_at=clock_timestamp()
       WHERE id=$1 AND user_id=$2 AND status='trashed' AND purge_after > clock_timestamp()
       RETURNING revision,updated_at`,
      [id, ownerUserId]
    );
    if (!result.rowCount) throw new ApiError(404, 'PROJECT_NOT_FOUND');
    return {
      projectId: id,
      status: 'active',
      revision: Number(result.rows[0].revision),
      updatedAt: result.rows[0].updated_at
    };
  });

  const linkAsset = async ({ userId, projectId, assetId, role, label = '', position = 0 } = {}) => transact(async (client) => {
    const ownerUserId = await resolveUserId(client, userId);
    const id = assertUuid(projectId, 'projectId');
    const normalizedAssetId = assertUuid(assetId, 'assetId');
    const normalizedRole = String(role || '').trim();
    if (!PROJECT_ASSET_ROLES.has(normalizedRole)) {
      throw new ApiError(400, 'INVALID_PROJECT_ASSET_ROLE', { field: 'role' });
    }
    await readProjectForOwner(client, ownerUserId, id, { lock: true });
    const count = await client.query(
      'SELECT count(*)::integer AS count FROM project_asset_links WHERE project_id=$1',
      [id]
    );
    if (Number(count.rows[0]?.count || 0) >= MAX_ASSETS_PER_PROJECT) {
      throw new ApiError(409, 'PROJECT_ASSET_LIMIT_REACHED');
    }
    const asset = await client.query(
      `SELECT * FROM assets
        WHERE id=$1 AND owner_user_id=$2 AND gc_state='active'
          AND delete_requested_at IS NULL
          AND (expires_at IS NULL OR expires_at > clock_timestamp())
        FOR UPDATE`,
      [normalizedAssetId, ownerUserId]
    );
    if (!asset.rowCount) throw new ApiError(404, 'ASSET_NOT_FOUND');
    const normalizedPosition = Math.max(0, Math.min(10000, Number(position) || 0));
    await client.query(
      `INSERT INTO project_asset_links (project_id,asset_id,role,label,position)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (project_id,asset_id,role)
       DO UPDATE SET label=EXCLUDED.label,position=EXCLUDED.position`,
      [id, normalizedAssetId, normalizedRole, cleanText(label, 160), normalizedPosition]
    );
    await client.query(
      `UPDATE assets SET retention_class='project-owned',expires_at=NULL,delete_requested_at=NULL
        WHERE id=$1`,
      [normalizedAssetId]
    );
    if (['product', 'result'].includes(normalizedRole)) {
      await client.query(
        `UPDATE creative_projects SET
           cover_asset_id=COALESCE(cover_asset_id,$2),
           revision=revision+1,updated_at=clock_timestamp()
         WHERE id=$1`,
        [id, normalizedAssetId]
      );
    }
    return publicAsset({ ...asset.rows[0], asset_id: normalizedAssetId, role: normalizedRole, label, position: normalizedPosition });
  });

  const unlinkAsset = async ({ userId, projectId, assetId, role } = {}) => transact(async (client) => {
    const ownerUserId = await resolveUserId(client, userId);
    const id = assertUuid(projectId, 'projectId');
    const normalizedAssetId = assertUuid(assetId, 'assetId');
    const normalizedRole = String(role || '').trim();
    await readProjectForOwner(client, ownerUserId, id, { lock: true });
    const deleted = await client.query(
      `DELETE FROM project_asset_links
        WHERE project_id=$1 AND asset_id=$2 AND role=$3
        RETURNING asset_id`,
      [id, normalizedAssetId, normalizedRole]
    );
    if (!deleted.rowCount) throw new ApiError(404, 'PROJECT_ASSET_NOT_FOUND');
    const refs = await client.query(
      'SELECT 1 FROM project_asset_links WHERE asset_id=$1 LIMIT 1',
      [normalizedAssetId]
    );
    if (!refs.rowCount) {
      await client.query(
        `UPDATE assets SET
           retention_class='generated-output',
           expires_at=COALESCE(expires_at,clock_timestamp()+interval '30 days')
         WHERE id=$1 AND owner_user_id=$2`,
        [normalizedAssetId, ownerUserId]
      );
    }
    return { projectId: id, assetId: normalizedAssetId, role: normalizedRole };
  });

  const favoriteVersion = async ({ userId, projectId, versionId, favorite } = {}) => transact(async (client) => {
    const ownerUserId = await resolveUserId(client, userId);
    const id = assertUuid(projectId, 'projectId');
    const normalizedVersionId = assertUuid(versionId, 'versionId');
    await readProjectForOwner(client, ownerUserId, id, { lock: true });
    const result = await client.query(
      `UPDATE project_versions SET is_favorite=$3,updated_at=clock_timestamp()
        WHERE id=$1 AND project_id=$2
        RETURNING *`,
      [normalizedVersionId, id, Boolean(favorite)]
    );
    if (!result.rowCount) throw new ApiError(404, 'PROJECT_VERSION_NOT_FOUND');
    return publicVersion(result.rows[0], env);
  });

  const importVersion = async ({
    userId,
    projectId,
    assetId,
    prompt,
    profileId = 'imported-history-v1',
    aspectRatio = ''
  } = {}) => transact(async (client) => {
    const ownerUserId = await resolveUserId(client, userId);
    const id = assertUuid(projectId, 'projectId');
    const normalizedAssetId = assertUuid(assetId, 'assetId');
    await readProjectForOwner(client, ownerUserId, id, { lock: true });
    const versionCount = await client.query(
      'SELECT count(*)::integer AS count FROM project_versions WHERE project_id=$1',
      [id]
    );
    if (Number(versionCount.rows[0]?.count || 0) >= 200) {
      throw new ApiError(409, 'PROJECT_VERSION_LIMIT_REACHED');
    }
    const asset = await client.query(
      `SELECT id FROM assets
        WHERE id=$1 AND owner_user_id=$2 AND gc_state='active'
          AND delete_requested_at IS NULL
          AND (expires_at IS NULL OR expires_at > clock_timestamp())
        FOR UPDATE`,
      [normalizedAssetId, ownerUserId]
    );
    if (!asset.rowCount) throw new ApiError(404, 'ASSET_NOT_FOUND');
    const safeProfileId = cleanText(profileId, 80) || 'imported-history-v1';
    if (!/^[a-z0-9][a-z0-9_.:-]{0,79}$/i.test(safeProfileId)) {
      throw new ApiError(400, 'INVALID_PROJECT_FIELD', { field: 'profileId' });
    }
    const safeAspectRatio = cleanText(aspectRatio, 16);
    if (safeAspectRatio && !/^\d{1,3}:\d{1,3}$/.test(safeAspectRatio)) {
      throw new ApiError(400, 'INVALID_PROJECT_FIELD', { field: 'aspectRatio' });
    }
    const payload = cleanVersionPayload({
      prompt: cleanText(prompt, 4000) || 'Imported generation result'
    });
    const versionId = crypto.randomUUID();
    const encrypted = encryptProjectPayload({
      entityType: 'version',
      entityId: versionId,
      payload,
      env
    });
    const inserted = await client.query(
      `INSERT INTO project_versions
        (id,project_id,status,profile_id,aspect_ratio,quoted_credits,output_asset_id,
         algorithm,key_version,iv,auth_tag,ciphertext)
       VALUES ($1,$2,'success',$3,$4,0,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        versionId,
        id,
        safeProfileId,
        safeAspectRatio,
        normalizedAssetId,
        encrypted.algorithm,
        encrypted.keyVersion,
        encrypted.iv,
        encrypted.authTag,
        encrypted.ciphertext
      ]
    );
    await client.query(
      `INSERT INTO project_asset_links (project_id,asset_id,role,label,position)
       VALUES ($1,$2,'result','imported history',0)
       ON CONFLICT (project_id,asset_id,role) DO NOTHING`,
      [id, normalizedAssetId]
    );
    await client.query(
      `UPDATE assets SET retention_class='project-owned',expires_at=NULL,delete_requested_at=NULL
        WHERE id=$1`,
      [normalizedAssetId]
    );
    await client.query(
      `UPDATE creative_projects SET
         cover_asset_id=$2,revision=revision+1,updated_at=clock_timestamp()
        WHERE id=$1`,
      [id, normalizedAssetId]
    );
    return publicVersion(inserted.rows[0], env);
  });

  return {
    createProject,
    favoriteVersion,
    getProject,
    importVersion,
    linkAsset,
    listProjects,
    restoreProject,
    trashProject,
    unlinkAsset,
    updateProject
  };
};

const assertProjectContext = async ({
  client,
  ownerUserId,
  projectId,
  parentVersionId = null
}) => {
  if (!projectId) return { projectId: null, parentVersionId: null };
  const id = assertUuid(projectId, 'projectId');
  const project = await client.query(
    `SELECT id FROM creative_projects
      WHERE id=$1 AND user_id=$2 AND status <> 'trashed'
      FOR SHARE`,
    [id, ownerUserId]
  );
  if (!project.rowCount) throw new ApiError(404, 'PROJECT_NOT_FOUND', { field: 'projectId' });
  let parentId = null;
  if (parentVersionId) {
    parentId = assertUuid(parentVersionId, 'parentVersionId');
    const parent = await client.query(
      'SELECT id FROM project_versions WHERE id=$1 AND project_id=$2',
      [parentId, id]
    );
    if (!parent.rowCount) {
      throw new ApiError(404, 'PROJECT_VERSION_NOT_FOUND', { field: 'parentVersionId' });
    }
  }
  return { projectId: id, parentVersionId: parentId };
};

const createPendingProjectVersion = async ({
  client,
  task,
  promptPayload,
  env = process.env
}) => {
  if (!task?.project_id || task.operation !== 'generate' || task.tool_id !== 'ai-design') return null;
  const safePayload = cleanVersionPayload(promptPayload);
  const id = crypto.randomUUID();
  const encrypted = encryptProjectPayload({
    entityType: 'version',
    entityId: id,
    payload: safePayload,
    env
  });
  const result = await client.query(
    `INSERT INTO project_versions
      (id,project_id,parent_version_id,task_id,status,profile_id,aspect_ratio,seed,
       quoted_credits,algorithm,key_version,iv,auth_tag,ciphertext)
     VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (task_id) DO NOTHING
     RETURNING id`,
    [
      id,
      task.project_id,
      task.parent_version_id || null,
      task.id,
      String(task.options?.profileId || ''),
      String(task.options?.aspectRatio || ''),
      Number.isInteger(task.options?.seed) ? task.options.seed : null,
      Number(task.quoted_credits || 0),
      encrypted.algorithm,
      encrypted.keyVersion,
      encrypted.iv,
      encrypted.authTag,
      encrypted.ciphertext
    ]
  );
  return result.rows[0]?.id || null;
};

const settleProjectVersion = async ({ client, task, outputAssetIds, result }) => {
  if (!task?.project_id || task.operation !== 'generate' || task.tool_id !== 'ai-design') return null;
  const outputAssetId = String(outputAssetIds?.[0] || '').trim() || null;
  if (!outputAssetId) return null;
  const seed = Number(result?.data?.seed);
  const updated = await client.query(
    `UPDATE project_versions SET
       status='success',
       output_asset_id=$2,
       seed=COALESCE($3,seed),
       updated_at=clock_timestamp()
      WHERE task_id=$1
      RETURNING id,project_id`,
    [task.id, outputAssetId, Number.isSafeInteger(seed) ? seed : null]
  );
  if (!updated.rowCount) throw new ApiError(500, 'PROJECT_VERSION_MISSING');
  await client.query(
    `INSERT INTO project_asset_links (project_id,asset_id,role,label,position)
     VALUES ($1,$2,'result','',0)
     ON CONFLICT (project_id,asset_id,role) DO NOTHING`,
    [updated.rows[0].project_id, outputAssetId]
  );
  await client.query(
    `UPDATE assets SET retention_class='project-owned',expires_at=NULL,delete_requested_at=NULL
      WHERE id=$1`,
    [outputAssetId]
  );
  await client.query(
    `UPDATE creative_projects SET
       cover_asset_id=$2,revision=revision+1,updated_at=clock_timestamp()
      WHERE id=$1`,
    [updated.rows[0].project_id, outputAssetId]
  );
  return updated.rows[0].id;
};

const releaseProjectVersion = async ({ client, task, terminalStatus }) => {
  if (!task?.project_id || task.operation !== 'generate' || task.tool_id !== 'ai-design') return null;
  const status = terminalStatus === 'cancelled' ? 'cancelled' : 'failed';
  const updated = await client.query(
    `UPDATE project_versions SET status=$2,updated_at=clock_timestamp()
      WHERE task_id=$1 AND status='pending'
      RETURNING id`,
    [task.id, status]
  );
  return updated.rows[0]?.id || null;
};

const linkProjectInputAssets = async ({
  client,
  projectId,
  assetIds,
  startPosition = 0,
  roles
}) => {
  if (!projectId || !Array.isArray(assetIds) || !assetIds.length) return 0;
  const semanticRoles = Array.isArray(roles) && roles.length === assetIds.length
    ? roles
    : ['product', 'style', 'scene'].slice(
        Math.max(0, Number(startPosition) || 0),
        Math.max(0, Number(startPosition) || 0) + assetIds.length
      );
  let linked = 0;
  for (const [offset, assetId] of assetIds.entries()) {
    const position = Math.max(0, Number(startPosition) || 0) + offset;
    const role = semanticRoles[offset];
    if (!role) continue;
    const inserted = await client.query(
      `INSERT INTO project_asset_links (project_id,asset_id,role,label,position)
       VALUES ($1,$2,$3,'',$4)
       ON CONFLICT (project_id,asset_id,role) DO NOTHING`,
      [projectId, assetId, role, position]
    );
    await client.query(
      `UPDATE assets SET retention_class='project-owned',expires_at=NULL,delete_requested_at=NULL
        WHERE id=$1`,
      [assetId]
    );
    linked += inserted.rowCount;
  }
  if (linked > 0) {
    await client.query(
      `UPDATE creative_projects SET
         cover_asset_id=COALESCE(
           cover_asset_id,
           (SELECT asset_id FROM project_asset_links
             WHERE project_id=$1 AND role='product'
             ORDER BY position,created_at LIMIT 1)
         ),
         revision=revision+1,
         updated_at=clock_timestamp()
       WHERE id=$1`,
      [projectId]
    );
  }
  return linked;
};

const sweepTrashedProjects = async ({ pool = getPool(), limit = 50 } = {}) => {
  if (!pool || typeof pool.connect !== 'function') return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const candidates = await client.query(
      `SELECT id
         FROM creative_projects
        WHERE status='trashed' AND purge_after <= clock_timestamp()
        ORDER BY purge_after
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [Math.max(1, Math.min(500, Number(limit) || 50))]
    );
    let purged = 0;
    for (const candidate of candidates.rows) {
      const assets = await client.query(
        'SELECT DISTINCT asset_id FROM project_asset_links WHERE project_id=$1',
        [candidate.id]
      );
      await client.query(
        `UPDATE tool_tasks
            SET project_id=NULL,parent_version_id=NULL
          WHERE project_id=$1`,
        [candidate.id]
      );
      const deleted = await client.query(
        `DELETE FROM creative_projects
          WHERE id=$1 AND status='trashed' AND purge_after <= clock_timestamp()
          RETURNING id`,
        [candidate.id]
      );
      if (!deleted.rowCount) continue;
      for (const row of assets.rows) {
        await client.query(
          `UPDATE assets asset SET
             retention_class='generated-output',
             expires_at=COALESCE(asset.expires_at,clock_timestamp()+interval '30 days')
           WHERE asset.id=$1
             AND NOT EXISTS (
               SELECT 1 FROM project_asset_links link WHERE link.asset_id=asset.id
             )`,
          [row.asset_id]
        );
      }
      purged += 1;
    }
    await client.query('COMMIT');
    return purged;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  MAX_ASSETS_PER_PROJECT,
  MAX_PROJECTS_PER_USER,
  PROJECT_ASSET_ROLES,
  assertProjectContext,
  assertUuid,
  cleanBrandProfile,
  cleanProjectPayload,
  cleanVersionPayload,
  createCreativeProjectService,
  createPendingProjectVersion,
  linkProjectInputAssets,
  releaseProjectVersion,
  settleProjectVersion,
  sweepTrashedProjects
};
