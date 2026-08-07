const crypto = require('crypto');
const { withTransaction, getPool } = require('../db/pool');
const { ApiError } = require('../lib/api-error');
const taskPayloads = require('./task-payload-service');
const {
  assertProjectContext,
  createPendingProjectVersion,
  linkProjectInputAssets,
  releaseProjectVersion,
  settleProjectVersion
} = require('./creative-project-service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
};

const requestHash = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(canonicalize(value)), 'utf8')
  .digest();

const normalizeAssetIdentity = (value) => ({
  sha256: String(value?.sha256 || '').trim().toLowerCase(),
  mimeType: String(value?.mimeType || value?.mime_type || '').trim().toLowerCase(),
  byteSize: Number(value?.byteSize ?? value?.byte_size ?? 0)
});

const assetIdentitiesEqual = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => {
    const a = normalizeAssetIdentity(value);
    const b = normalizeAssetIdentity(right[index]);
    return Boolean(a.sha256) && a.sha256 === b.sha256 &&
      a.mimeType === b.mimeType && a.byteSize === b.byteSize;
  });
};

const requireIdempotencyKey = (raw) => {
  const key = String(raw || '').trim();
  if (key.length < 8 || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY', { field: 'Idempotency-Key' });
  }
  return key;
};

const resolveUserId = async (client, userId) => {
  const raw = String(userId || '').trim();
  if (!raw) throw new ApiError(401, 'LOGIN_REQUIRED');
  // UUID database IDs and legacy public IDs are separate namespaces. Never
  // combine them in an unordered OR: a legacy value shaped like another
  // user's UUID could otherwise resolve to an arbitrary wallet.
  const result = UUID_RE.test(raw)
    ? await client.query('SELECT id FROM users WHERE id=$1::uuid LIMIT 1', [raw])
    : await client.query('SELECT id FROM users WHERE legacy_user_id=$1 LIMIT 1', [raw]);
  if (!result.rowCount) throw new ApiError(401, 'SESSION_INVALID');
  return result.rows[0].id;
};

const normalizeTaskWarning = (warning) => {
  const rawCode = typeof warning === 'string' ? warning : warning?.code;
  const code = String(rawCode || 'TASK_WARNING')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_:-]/g, '_')
    .slice(0, 100) || 'TASK_WARNING';
  return {
    code,
    messageKey: typeof warning?.messageKey === 'string' && warning.messageKey.trim()
      ? warning.messageKey.trim().slice(0, 160)
      : `warnings.${code.toLowerCase()}`
  };
};

const assertTaskLease = (task, leaseOwner) => {
  if (!leaseOwner) return true;
  const leaseExpiresAt = task?.lease_expires_at
    ? new Date(task.lease_expires_at).getTime()
    : 0;
  const leaseLive = typeof task?.lease_live === 'boolean'
    ? task.lease_live
    : Number.isFinite(leaseExpiresAt) && leaseExpiresAt > Date.now();
  if (
    String(task?.lease_owner || '') !== String(leaseOwner) ||
    !leaseLive
  ) {
    throw new ApiError(409, 'TASK_LEASE_LOST', { retryable: false });
  }
  return true;
};

const assertHoldLive = (task) => {
  const expiresAt = task?.hold_expires_at
    ? new Date(task.hold_expires_at).getTime()
    : 0;
  const holdLive = task?.hold_expires_at
    ? Number.isFinite(expiresAt) && expiresAt > Date.now()
    : task?.hold_live === true;
  if (!holdLive) {
    throw new ApiError(409, 'TASK_TIMEOUT', { retryable: false });
  }
  return true;
};

const publicTask = (row, replayed = false) => {
  const receipt = {
    sku: row.sku || null,
    quotedCredits: Number(row.quoted_credits || 0),
    chargedCredits: Number(row.charged_credits || 0),
    refundedCredits: Number(row.refunded_credits || 0)
  };
  const storedResult = row.result && typeof row.result === 'object' && !Array.isArray(row.result)
    ? row.result
    : null;
  const assets = Array.isArray(storedResult?.assets)
    ? storedResult.assets.map((asset) => {
        const assetId = String(typeof asset === 'string' ? asset : asset?.assetId || '').trim();
        if (!assetId) return null;
        return {
          assetId,
          url: `/api/assets/${encodeURIComponent(assetId)}`,
          mimeType: String(asset?.mimeType || 'application/octet-stream'),
          byteSize: Math.max(0, Number(asset?.byteSize || 0)),
          ...(Number(asset?.width) > 0 ? { width: Number(asset.width) } : {}),
          ...(Number(asset?.height) > 0 ? { height: Number(asset.height) } : {})
        };
      }).filter(Boolean)
    : [];
  const warnings = Array.isArray(storedResult?.warnings)
    ? storedResult.warnings.map(normalizeTaskWarning)
    : [];
  const restoration = storedResult?.restoration && typeof storedResult.restoration === 'object'
    ? {
        colorized: Boolean(storedResult.restoration.colorized),
        ...(storedResult.restoration.sourceAssetId
          ? { sourceAssetId: String(storedResult.restoration.sourceAssetId) }
          : {})
      }
    : null;
  const data = storedResult?.data && typeof storedResult.data === 'object' && !Array.isArray(storedResult.data)
    ? storedResult.data
    : null;
  const result = storedResult
    ? {
        assets,
        receipt,
        warnings,
        ...(data ? { data } : {}),
        ...(restoration ? { restoration } : {})
      }
    : null;
  return {
    taskId: row.id,
    toolId: row.tool_id,
    operation: row.operation,
    projectId: row.project_id || null,
    parentVersionId: row.parent_version_id || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    replayed,
    assets,
    warnings,
    result,
    error: row.error_code
      ? { code: row.error_code, messageKey: `errors.${String(row.error_code).toLowerCase()}`, retryable: false }
      : null,
    receipt
  };
};

const taskWithPreparationState = (row, replayed = false, preparationCompleted = false) => {
  const task = publicTask(row, replayed);
  Object.defineProperties(task, {
    inputPreparationRequired: {
      enumerable: false,
      value: row?.inputs_ready === false
    },
    inputPreparationCompleted: {
      enumerable: false,
      value: Boolean(preparationCompleted)
    }
  });
  return task;
};

const configuredSkuCostMinor = (sku, metadata = {}, env = process.env) => {
  const profileId = String(metadata?.profileId || '').trim();
  const envKey = sku === 'ai-design.product-reference.v1' || profileId === 'product-reference-v1'
    ? 'AI_DESIGN_REFERENCE_COST_MINOR'
    : sku === 'ai-design.generate.v1'
      ? 'AI_DESIGN_GENERATE_COST_MINOR'
      : sku === 'ai-design.directions.v1'
        ? 'AI_DESIGN_DIRECTIONS_COST_MINOR'
        : '';
  const configured = envKey ? Number(env[envKey]) : Number.NaN;
  if (Number.isSafeInteger(configured) && configured >= 0) return configured;
  const fallback = Number(metadata?.providerCostMinor);
  return Number.isSafeInteger(fallback) && fallback >= 0 ? fallback : null;
};

const assertSkuMargin = ({
  sku,
  credits,
  metadata = {},
  revenuePerCreditMinor,
  env = process.env
}) => {
  const minimumGrossMargin = Number(metadata?.minimumGrossMargin);
  const providerCostMinor = configuredSkuCostMinor(sku, metadata, env);
  if (
    !Number.isFinite(minimumGrossMargin) ||
    minimumGrossMargin < 0 ||
    minimumGrossMargin >= 1 ||
    providerCostMinor === null
  ) {
    return null;
  }
  const unitRevenue = Number(revenuePerCreditMinor);
  const estimatedRevenueMinor = Math.round(Number(credits || 0) * unitRevenue);
  const estimatedGrossMargin = estimatedRevenueMinor > 0
    ? (estimatedRevenueMinor - providerCostMinor) / estimatedRevenueMinor
    : -1;
  if (
    !Number.isFinite(estimatedGrossMargin) ||
    estimatedGrossMargin + Number.EPSILON < minimumGrossMargin
  ) {
    throw new ApiError(503, 'SKU_MARGIN_GUARD', {
      retryable: true,
      sku: String(sku || ''),
      minimumGrossMargin
    });
  }
  return {
    estimatedRevenueMinor,
    providerCostMinor,
    estimatedGrossMargin,
    minimumGrossMargin
  };
};

const createQuote = async ({ userId, sku }) => withTransaction(async (client) => {
  const dbUserId = await resolveUserId(client, userId);
  const price = await client.query(
    `SELECT ps.sku, ps.credits, ps.metadata,
            pv.id AS price_version_id, pv.version,
            (
              SELECT min(package.amount_minor::numeric / package.credits)
                FROM payment_packages package
               WHERE package.active=true AND package.currency='CNY'
            ) AS revenue_per_credit_minor
       FROM price_skus ps
       JOIN price_versions pv ON pv.id = ps.price_version_id
      WHERE ps.sku = $1 AND ps.active = true AND pv.active = true
        AND pv.effective_at <= now()
      ORDER BY pv.version DESC
      LIMIT 1
      FOR SHARE OF ps,pv`,
    [sku]
  );
  if (!price.rowCount) throw new ApiError(409, 'SKU_NOT_AVAILABLE', { retryable: true });
  const row = price.rows[0];
  assertSkuMargin({
    sku: row.sku,
    credits: Number(row.credits),
    metadata: row.metadata,
    revenuePerCreditMinor: row.revenue_per_credit_minor
  });
  const quote = await client.query(
    `INSERT INTO tool_task_quotes (user_id, sku, price_version_id, credits, expires_at)
     VALUES ($1, $2, $3, $4, clock_timestamp() + interval '10 minutes')
     RETURNING id, sku, credits, expires_at`,
    [dbUserId, row.sku, row.price_version_id, row.credits]
  );
  return {
    quoteId: quote.rows[0].id,
    sku: quote.rows[0].sku,
    credits: Number(quote.rows[0].credits),
    priceVersion: Number(row.version),
    expiresAt: quote.rows[0].expires_at
  };
});

const createTaskWithHold = async ({
  userId,
  toolId,
  operation,
  options,
  inputAssetIds,
  inputRetentionHours,
  quoteId,
  sku,
  storedOptions,
  taskPayload,
  payloadTtlMinutes,
  projectId,
  parentVersionId,
  projectVersionPayload,
  requestIdentity,
  deferInputAssets = false,
  idempotencyKey: rawIdempotencyKey
}) => {
  const idempotencyKey = requireIdempotencyKey(rawIdempotencyKey);
  const projectIdentity = projectId
    ? { projectId, parentVersionId: parentVersionId || null }
    : {};
  const hash = requestHash(requestIdentity === undefined
    ? { toolId, operation, options, inputAssetIds, quoteId: quoteId || null, ...projectIdentity }
    : { toolId, operation, options, inputAssets: requestIdentity, quoteId: quoteId || null, ...projectIdentity });

  return withTransaction(async (client) => {
    const dbUserId = await resolveUserId(client, userId);
    const projectContext = await assertProjectContext({
      client,
      ownerUserId: dbUserId,
      projectId,
      parentVersionId
    });
    // Serialize the initial existence check for one user/idempotency key. A
    // unique constraint alone prevents double charges but makes concurrent
    // replays surface as 23505 instead of returning the original task.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`tool-task:${dbUserId}:${idempotencyKey}`]
    );
    const existing = await client.query(
      'SELECT * FROM tool_tasks WHERE user_id = $1 AND idempotency_key = $2 FOR UPDATE',
      [dbUserId, idempotencyKey]
    );
    if (existing.rowCount) {
      let same = Buffer.isBuffer(existing.rows[0].request_hash)
        && crypto.timingSafeEqual(existing.rows[0].request_hash, hash);
      // One-release compatibility for tasks created before uploaded files were
      // reserved by content fingerprint instead of post-storage asset IDs.
      if (!same && requestIdentity !== undefined) {
        const linkedInputs = await client.query(
          `SELECT link.asset_id, asset.sha256, asset.mime_type, asset.byte_size
             FROM tool_task_assets link
             JOIN assets asset ON asset.id=link.asset_id
            WHERE link.task_id=$1 AND link.role='input'
            ORDER BY link.position, link.asset_id`,
          [existing.rows[0].id]
        );
        const linkedIdentity = linkedInputs.rows.map((row) => ({
          sha256: Buffer.isBuffer(row.sha256) ? row.sha256.toString('hex') : String(row.sha256 || ''),
          mimeType: row.mime_type,
          byteSize: row.byte_size
        }));
        if (assetIdentitiesEqual(requestIdentity, linkedIdentity)) {
          const legacyHash = requestHash({
            toolId,
            operation,
            options,
            inputAssetIds: linkedInputs.rows.map((row) => row.asset_id),
            quoteId: quoteId || null,
            ...(projectContext.projectId
              ? {
                  projectId: projectContext.projectId,
                  parentVersionId: projectContext.parentVersionId
                }
              : {})
          });
          same = Buffer.isBuffer(existing.rows[0].request_hash)
            && crypto.timingSafeEqual(existing.rows[0].request_hash, legacyHash);
        }
      }
      if (!same) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
      return taskWithPreparationState(existing.rows[0], true);
    }

    let quotedCredits = 0;
    let lockedSku = null;
    if (sku) {
      if (!quoteId) throw new ApiError(400, 'QUOTE_REQUIRED', { field: 'quoteId' });
      const quote = await client.query(
        `SELECT * FROM tool_task_quotes
          WHERE id = $1 AND user_id = $2
          FOR UPDATE`,
        [quoteId, dbUserId]
      );
      if (!quote.rowCount) throw new ApiError(404, 'QUOTE_NOT_FOUND', { field: 'quoteId' });
      const quoted = quote.rows[0];
      if (quoted.consumed_at) throw new ApiError(409, 'QUOTE_ALREADY_USED', { field: 'quoteId' });
      if (new Date(quoted.expires_at).getTime() <= Date.now()) {
        throw new ApiError(409, 'PRICE_CHANGED', { field: 'quoteId', retryable: true });
      }
      if (quoted.sku !== sku) throw new ApiError(409, 'PRICE_CHANGED', { field: 'quoteId', retryable: true });
      quotedCredits = Number(quoted.credits || 0);
      lockedSku = quoted.sku;
    }

    let balance = null;
    if (quotedCredits > 0) {
      const wallet = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [dbUserId]);
      if (!wallet.rowCount) throw new ApiError(409, 'WALLET_NOT_FOUND');
      const current = wallet.rows[0];
      if (Number(current.available_credits) < quotedCredits) {
        throw new ApiError(402, 'INSUFFICIENT_CREDITS', { retryable: false });
      }
      const updated = await client.query(
        `UPDATE wallets
            SET available_credits = available_credits - $2,
                frozen_credits = frozen_credits + $2,
                version = version + 1,
                updated_at = now()
          WHERE user_id = $1
          RETURNING available_credits, frozen_credits`,
        [dbUserId, quotedCredits]
      );
      balance = updated.rows[0];
    }

    const created = await client.query(
      `INSERT INTO tool_tasks
        (user_id, tool_id, operation, options, quote_id, sku, quoted_credits,
         idempotency_key, request_hash, status, inputs_ready, project_id, parent_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued',$10,$11,$12)
       RETURNING *`,
      [
        dbUserId, toolId, operation, JSON.stringify(storedOptions ?? options ?? {}), quoteId || null,
        lockedSku, quotedCredits, idempotencyKey, hash, !deferInputAssets,
        projectContext.projectId, projectContext.parentVersionId
      ]
    );
    const task = created.rows[0];

    await client.query(
      `INSERT INTO credit_holds (task_id, user_id, credits, expires_at)
       VALUES ($1,$2,$3,clock_timestamp() + interval '30 minutes')`,
      [task.id, dbUserId, quotedCredits]
    );

    if (quotedCredits > 0) {
      await client.query(
        `INSERT INTO wallet_ledger
          (user_id, entry_type, delta_available, delta_frozen, balance_available,
           balance_frozen, reference_type, reference_id, idempotency_key)
         VALUES ($1,'hold',$2,$3,$4,$5,'tool_task',$6,$7)`,
        [
          dbUserId, -quotedCredits, quotedCredits, balance.available_credits,
          balance.frozen_credits, task.id, `hold:${idempotencyKey}`
        ]
      );
    }

    if (quoteId) {
      await client.query('UPDATE tool_task_quotes SET consumed_at = now() WHERE id = $1', [quoteId]);
    }
    for (const [position, assetId] of (inputAssetIds || []).entries()) {
      const linked = await client.query(
        `INSERT INTO tool_task_assets (task_id, asset_id, role, position)
         SELECT $1, id, 'input', $3 FROM assets
          WHERE id = $2 AND owner_user_id = $4
            AND gc_state='active'
            AND delete_requested_at IS NULL
            AND (expires_at IS NULL OR expires_at > clock_timestamp())
         ON CONFLICT DO NOTHING`,
        [task.id, assetId, position, dbUserId]
      );
      if (!linked.rowCount) throw new ApiError(404, 'ASSET_NOT_FOUND', { field: 'inputAssets' });
      if (Number(inputRetentionHours) > 0) {
        const hours = Math.max(1, Math.min(30 * 24, Number(inputRetentionHours)));
        await client.query(
          `UPDATE assets SET
             expires_at=CASE
               WHEN expires_at IS NULL THEN NULL
               ELSE GREATEST(expires_at,clock_timestamp() + ($2 * interval '1 hour'))
             END,
             retention_class=CASE
               WHEN retention_class='other' THEN 'temporary-input'
               ELSE retention_class
             END
           WHERE id=$1`,
          [assetId, hours]
        );
      }
    }
    await linkProjectInputAssets({
      client,
      projectId: projectContext.projectId,
      assetIds: inputAssetIds,
      startPosition: 0,
      roles: Array.isArray(options?.referenceRoles)
        ? options.referenceRoles.slice(0, (inputAssetIds || []).length)
        : undefined
    });
    if (taskPayload) {
      await taskPayloads.insertTaskPayload({
        client,
        taskId: task.id,
        payload: taskPayload,
        ttlMinutes: payloadTtlMinutes
      });
    }
    if (projectContext.projectId && toolId === 'ai-design' && operation === 'generate') {
      await createPendingProjectVersion({
        client,
        task,
        promptPayload: projectVersionPayload || options,
        env: process.env
      });
    }
    return taskWithPreparationState(task);
  });
};

const finalizeTaskInputs = async ({
  userId,
  taskId,
  inputAssetIds,
  startPosition = 0,
  inputRetentionHours
}) => withTransaction(async (client) => {
  const dbUserId = await resolveUserId(client, userId);
  const locked = await client.query(
    `SELECT t.*, h.status AS hold_status, h.expires_at AS hold_expires_at,
            (h.expires_at > clock_timestamp()) AS hold_live
       FROM tool_tasks t
       JOIN credit_holds h ON h.task_id=t.id
      WHERE t.id=$1 AND t.user_id=$2
      FOR UPDATE OF t, h`,
    [taskId, dbUserId]
  );
  if (!locked.rowCount) throw new ApiError(404, 'TASK_NOT_FOUND');
  const task = locked.rows[0];
  if (task.inputs_ready !== false) return taskWithPreparationState(task, true);
  if (task.status !== 'queued' || task.hold_status !== 'held' || task.cancel_requested_at) {
    throw new ApiError(409, task.cancel_requested_at ? 'TASK_CANCELLED' : 'TASK_ALREADY_RESOLVED');
  }
  assertHoldLive(task);

  const basePosition = Math.max(0, Number(startPosition) || 0);
  for (const [offset, assetId] of (inputAssetIds || []).entries()) {
    const linked = await client.query(
      `INSERT INTO tool_task_assets (task_id, asset_id, role, position)
       SELECT $1, id, 'input', $3 FROM assets
        WHERE id=$2 AND owner_user_id=$4
          AND gc_state='active'
          AND delete_requested_at IS NULL
          AND (expires_at IS NULL OR expires_at > clock_timestamp())
       ON CONFLICT DO NOTHING`,
      [task.id, assetId, basePosition + offset, dbUserId]
    );
    if (!linked.rowCount) throw new ApiError(404, 'ASSET_NOT_FOUND', { field: 'inputAssets' });
    if (Number(inputRetentionHours) > 0) {
      const hours = Math.max(1, Math.min(30 * 24, Number(inputRetentionHours)));
      await client.query(
        `UPDATE assets SET
           expires_at=CASE
             WHEN expires_at IS NULL THEN NULL
             ELSE GREATEST(expires_at,clock_timestamp() + ($2 * interval '1 hour'))
           END,
           retention_class=CASE
             WHEN retention_class='other' THEN 'temporary-input'
             ELSE retention_class
           END
         WHERE id=$1`,
        [assetId, hours]
      );
    }
  }
  await linkProjectInputAssets({
    client,
    projectId: task.project_id,
    assetIds: inputAssetIds,
    startPosition: basePosition,
    roles: Array.isArray(task.options?.referenceRoles)
      ? task.options.referenceRoles.slice(basePosition, basePosition + (inputAssetIds || []).length)
      : undefined
  });
  const updated = await client.query(
    `UPDATE tool_tasks
        SET inputs_ready=true, updated_at=now()
      WHERE id=$1 AND inputs_ready=false
        AND EXISTS (
          SELECT 1 FROM credit_holds hold
           WHERE hold.task_id=tool_tasks.id
             AND hold.status='held'
             AND hold.expires_at > clock_timestamp()
        )
      RETURNING *`,
    [task.id]
  );
  if (!updated.rowCount) {
    throw new ApiError(409, 'TASK_TIMEOUT', { retryable: false });
  }
  return taskWithPreparationState(updated.rows[0], false, true);
});

const settleTask = async ({
  taskId,
  outputAssetIds,
  result,
  allowEmptyAssets = false,
  leaseOwner
}) => withTransaction(async (client) => {
  const locked = await client.query(
    `SELECT t.*, h.id AS hold_id, h.status AS hold_status, h.credits AS hold_credits,
            h.expires_at AS hold_expires_at, (h.expires_at > clock_timestamp()) AS hold_live,
            (t.lease_expires_at > clock_timestamp()) AS lease_live
       FROM tool_tasks t JOIN credit_holds h ON h.task_id = t.id
      WHERE t.id = $1 FOR UPDATE OF t, h`,
    [taskId]
  );
  if (!locked.rowCount) throw new ApiError(404, 'TASK_NOT_FOUND');
  const task = locked.rows[0];
  if (task.status === 'success') return publicTask(task, true);
  if (task.inputs_ready === false) throw new ApiError(409, 'TASK_INPUTS_NOT_READY');
  assertTaskLease(task, leaseOwner);
  if (task.cancel_requested_at) throw new ApiError(409, 'TASK_CANCELLED');
  if (task.hold_status !== 'held') throw new ApiError(409, 'TASK_ALREADY_RESOLVED');
  assertHoldLive(task);
  if (!Array.isArray(outputAssetIds) || (!allowEmptyAssets && outputAssetIds.length === 0)) {
    throw new ApiError(422, 'INVALID_OUTPUT', { retryable: true });
  }
  for (const [position, assetId] of outputAssetIds.entries()) {
    const linked = await client.query(
      `INSERT INTO tool_task_assets (task_id, asset_id, role, position)
       SELECT $1, id, 'output', $3 FROM assets
        WHERE id = $2 AND owner_user_id = $4
          AND (expires_at IS NULL OR expires_at > clock_timestamp())
       ON CONFLICT DO NOTHING`,
      [task.id, assetId, position, task.user_id]
    );
    if (!linked.rowCount) throw new ApiError(422, 'OUTPUT_PERSIST_FAILED', { retryable: true });
  }
  await settleProjectVersion({
    client,
    task,
    outputAssetIds,
    result
  });

  const settledHold = await client.query(
    `UPDATE credit_holds
        SET status='settled', resolved_at=clock_timestamp()
      WHERE id=$1
        AND status='held'
        AND expires_at > clock_timestamp()
      RETURNING id`,
    [task.hold_id]
  );
  if (!settledHold.rowCount) {
    throw new ApiError(409, 'TASK_TIMEOUT', { retryable: false });
  }

  const credits = Number(task.hold_credits || 0);
  let balance = null;
  if (credits > 0) {
    const wallet = await client.query(
      `UPDATE wallets SET frozen_credits = frozen_credits - $2,
        version = version + 1, updated_at = now()
       WHERE user_id = $1 AND frozen_credits >= $2
       RETURNING available_credits, frozen_credits`,
      [task.user_id, credits]
    );
    if (!wallet.rowCount) throw new ApiError(409, 'WALLET_INVARIANT_VIOLATION');
    balance = wallet.rows[0];
    await client.query(
      `INSERT INTO wallet_ledger
        (user_id, entry_type, delta_available, delta_frozen, balance_available,
         balance_frozen, reference_type, reference_id, idempotency_key)
       VALUES ($1,'charge',0,$2,$3,$4,'tool_task',$5,$6)`,
      [task.user_id, -credits, balance.available_credits, balance.frozen_credits, task.id, `charge:${task.id}`]
    );
  }
  const updated = await client.query(
    `UPDATE tool_tasks SET status='success', charged_credits=$2, result=$3,
      finished_at=now(), lease_owner=NULL, lease_expires_at=NULL,
      updated_at=now()
      WHERE id=$1
        AND ($4::text IS NULL OR (
          lease_owner=$4
          AND lease_expires_at > clock_timestamp()
        ))
      RETURNING *`,
    [
      task.id,
      credits,
      JSON.stringify(result || { assets: outputAssetIds, warnings: [] }),
      leaseOwner || null
    ]
  );
  if (!updated.rowCount) {
    throw new ApiError(409, 'TASK_LEASE_LOST', { retryable: false });
  }
  await taskPayloads.deleteTaskPayload({ client, taskId: task.id });
  return publicTask(updated.rows[0]);
});

const markTaskRunning = async ({ taskId, leaseOwner }) => withTransaction(async (client) => {
  const locked = await client.query(
    `SELECT t.*, h.status AS hold_status, h.expires_at AS hold_expires_at,
            (h.expires_at > clock_timestamp()) AS hold_live,
            (t.lease_expires_at > clock_timestamp()) AS lease_live
       FROM tool_tasks t JOIN credit_holds h ON h.task_id=t.id
      WHERE t.id=$1 FOR UPDATE OF t, h`,
    [taskId]
  );
  if (!locked.rowCount) throw new ApiError(404, 'TASK_NOT_FOUND');
  const task = locked.rows[0];
  if (task.status === 'running') {
    assertTaskLease(task, leaseOwner);
    if (task.cancel_requested_at) throw new ApiError(409, 'TASK_CANCELLED');
    if (task.hold_status !== 'held') throw new ApiError(409, 'TASK_ALREADY_RESOLVED');
    assertHoldLive(task);
    return publicTask(task, true);
  }
  if (task.status !== 'queued' || task.hold_status !== 'held') {
    throw new ApiError(409, 'TASK_ALREADY_RESOLVED');
  }
  if (task.inputs_ready === false) throw new ApiError(409, 'TASK_INPUTS_NOT_READY');
  assertTaskLease(task, leaseOwner);
  if (task.cancel_requested_at) throw new ApiError(409, 'TASK_CANCELLED');
  assertHoldLive(task);
  const updated = await client.query(
    `UPDATE tool_tasks
        SET status='running', started_at=COALESCE(started_at,now()), updated_at=now()
      WHERE id=$1
        AND EXISTS (
          SELECT 1 FROM credit_holds hold
           WHERE hold.task_id=tool_tasks.id
             AND hold.status='held'
             AND hold.expires_at > clock_timestamp()
        )
      RETURNING *`,
    [taskId]
  );
  if (!updated.rowCount) throw new ApiError(409, 'TASK_TIMEOUT', { retryable: false });
  return publicTask(updated.rows[0]);
});

const releaseTask = async ({
  taskId,
  terminalStatus = 'failed',
  errorCode = 'TASK_FAILED',
  leaseOwner,
  onlyIfInputsPending = false
}) => {
  if (!['failed', 'cancelled'].includes(terminalStatus)) throw new ApiError(500, 'INVALID_TERMINAL_STATUS');
  return withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT t.*, h.id AS hold_id, h.status AS hold_status, h.credits AS hold_credits,
              (t.lease_expires_at > clock_timestamp()) AS lease_live
         FROM tool_tasks t JOIN credit_holds h ON h.task_id = t.id
        WHERE t.id = $1 FOR UPDATE OF t, h`,
      [taskId]
    );
    if (!locked.rowCount) throw new ApiError(404, 'TASK_NOT_FOUND');
    const task = locked.rows[0];
    if (task.status === 'success') throw new ApiError(409, 'TASK_ALREADY_SUCCEEDED');
    if (task.hold_status === 'released') return publicTask(task, true);
    if (onlyIfInputsPending && task.inputs_ready !== false) return publicTask(task, true);
    assertTaskLease(task, leaseOwner);
    if (task.hold_status !== 'held') throw new ApiError(409, 'TASK_ALREADY_RESOLVED');
    const credits = Number(task.hold_credits || 0);
    if (credits > 0) {
      const wallet = await client.query(
        `UPDATE wallets SET available_credits = available_credits + $2,
          frozen_credits = frozen_credits - $2, version = version + 1, updated_at = now()
         WHERE user_id = $1 AND frozen_credits >= $2
         RETURNING available_credits, frozen_credits`,
        [task.user_id, credits]
      );
      if (!wallet.rowCount) throw new ApiError(409, 'WALLET_INVARIANT_VIOLATION');
      await client.query(
        `INSERT INTO wallet_ledger
          (user_id, entry_type, delta_available, delta_frozen, balance_available,
           balance_frozen, reference_type, reference_id, idempotency_key)
         VALUES ($1,'release',$2,$3,$4,$5,'tool_task',$6,$7)`,
        [
          task.user_id, credits, -credits, wallet.rows[0].available_credits,
          wallet.rows[0].frozen_credits, task.id, `release:${task.id}`
        ]
      );
    }
    await client.query("UPDATE credit_holds SET status='released', resolved_at=now() WHERE id=$1", [task.hold_id]);
    const updated = await client.query(
      `UPDATE tool_tasks SET status=$2, refunded_credits=$3, error_code=$4,
        finished_at=now(), lease_owner=NULL, lease_expires_at=NULL,
        updated_at=now() WHERE id=$1 RETURNING *`,
      [task.id, terminalStatus, credits, errorCode]
    );
    await releaseProjectVersion({ client, task, terminalStatus });
    await taskPayloads.deleteTaskPayload({ client, taskId: task.id });
    return publicTask(updated.rows[0]);
  });
};

const requestTaskCancellation = async ({ userId, taskId }) => withTransaction(async (client) => {
  const dbUserId = await resolveUserId(client, userId);
  const locked = await client.query(
    'SELECT * FROM tool_tasks WHERE id=$1 AND user_id=$2 FOR UPDATE',
    [taskId, dbUserId]
  );
  if (!locked.rowCount) throw new ApiError(404, 'TASK_NOT_FOUND');
  const current = locked.rows[0];
  if (['success', 'failed', 'cancelled'].includes(current.status)) return publicTask(current, true);
  const updated = await client.query(
    `UPDATE tool_tasks
        SET cancel_requested_at=COALESCE(cancel_requested_at,now()), updated_at=now()
      WHERE id=$1
      RETURNING *`,
    [taskId]
  );
  await client.query("SELECT pg_notify('artigen_tool_task_cancel',$1)", [taskId]);
  return publicTask(updated.rows[0]);
});

const cancelTask = async ({ userId, taskId }) => withTransaction(async (client) => {
  const dbUserId = await resolveUserId(client, userId);
  const locked = await client.query(
    `SELECT t.*, h.id AS hold_id, h.status AS hold_status, h.credits AS hold_credits
       FROM tool_tasks t
       JOIN credit_holds h ON h.task_id=t.id
      WHERE t.id=$1 AND t.user_id=$2
      FOR UPDATE OF t, h`,
    [taskId, dbUserId]
  );
  if (!locked.rowCount) throw new ApiError(404, 'TASK_NOT_FOUND');
  const task = locked.rows[0];
  if (['success', 'failed', 'cancelled'].includes(task.status)) return publicTask(task, true);
  if (task.hold_status !== 'held') throw new ApiError(409, 'TASK_ALREADY_RESOLVED');
  const credits = Number(task.hold_credits || 0);
  if (credits > 0) {
    const wallet = await client.query(
      `UPDATE wallets SET available_credits=available_credits + $2,
         frozen_credits=frozen_credits - $2,
         version=version + 1,
         updated_at=now()
       WHERE user_id=$1 AND frozen_credits >= $2
       RETURNING available_credits, frozen_credits`,
      [task.user_id, credits]
    );
    if (!wallet.rowCount) throw new ApiError(409, 'WALLET_INVARIANT_VIOLATION');
    await client.query(
      `INSERT INTO wallet_ledger
        (user_id, entry_type, delta_available, delta_frozen, balance_available,
         balance_frozen, reference_type, reference_id, idempotency_key)
       VALUES ($1,'release',$2,$3,$4,$5,'tool_task',$6,$7)`,
      [
        task.user_id,
        credits,
        -credits,
        wallet.rows[0].available_credits,
        wallet.rows[0].frozen_credits,
        task.id,
        `release:${task.id}`
      ]
    );
  }
  await client.query(
    "UPDATE credit_holds SET status='released', resolved_at=now() WHERE id=$1",
    [task.hold_id]
  );
  const updated = await client.query(
    `UPDATE tool_tasks SET
       status='cancelled',
       refunded_credits=$2,
       error_code='TASK_CANCELLED',
       cancel_requested_at=COALESCE(cancel_requested_at,now()),
       finished_at=now(),
       lease_owner=NULL,
       lease_expires_at=NULL,
       updated_at=now()
     WHERE id=$1
     RETURNING *`,
    [task.id, credits]
  );
  await releaseProjectVersion({ client, task, terminalStatus: 'cancelled' });
  await taskPayloads.deleteTaskPayload({ client, taskId: task.id });
  await client.query("SELECT pg_notify('artigen_tool_task_cancel',$1)", [task.id]);
  return publicTask(updated.rows[0]);
});

const getTask = async ({ userId, taskId }) => {
  const client = await getPool().connect();
  try {
    const dbUserId = await resolveUserId(client, userId);
    const task = await client.query('SELECT * FROM tool_tasks WHERE id=$1 AND user_id=$2', [taskId, dbUserId]);
    if (!task.rowCount) throw new ApiError(404, 'TASK_NOT_FOUND');
    return publicTask(task.rows[0]);
  } finally {
    client.release();
  }
};

const releaseExpiredHolds = async () => {
  const pool = getPool();
  const leaseUntil = new Date(Date.now() + 60 * 1000);
  const expired = await pool.query(
    `WITH candidates AS (
       SELECT id
         FROM credit_holds
        WHERE status='held'
          AND expires_at <= clock_timestamp()
          AND (next_release_at IS NULL OR next_release_at <= clock_timestamp())
          AND (release_lease_until IS NULL OR release_lease_until <= clock_timestamp())
        ORDER BY expires_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 100
     )
     UPDATE credit_holds AS hold SET
       release_lease_until=$1::timestamptz,
       release_attempts=hold.release_attempts + 1,
       last_release_error=NULL
     FROM candidates
     WHERE hold.id=candidates.id
     RETURNING hold.id, hold.task_id, hold.release_attempts, hold.release_lease_until`,
    [leaseUntil]
  );
  const outcomes = [];
  for (const row of expired.rows) {
    try {
      outcomes.push(await releaseTask({ taskId: row.task_id, errorCode: 'TASK_TIMEOUT' }));
    } catch (error) {
      const code = String(error?.code || 'RELEASE_FAILED')
        .replace(/[^A-Z0-9_:-]/gi, '_')
        .slice(0, 100);
      const attempts = Math.max(1, Number(row.release_attempts || 1));
      const retrySeconds = Math.min(60 * 60, 15 * (2 ** Math.min(8, attempts - 1)));
      await pool.query(
        `UPDATE credit_holds SET
           release_lease_until=NULL,
           next_release_at=now() + ($3 * interval '1 second'),
           last_release_error=$4
         WHERE id=$1 AND status='held' AND release_lease_until=$2::timestamptz`,
        [row.id, row.release_lease_until, retrySeconds, code]
      ).catch(() => {});
      outcomes.push({ taskId: row.task_id, error: code });
    }
  }
  return outcomes;
};

module.exports = {
  canonicalize,
  assetIdentitiesEqual,
  assertHoldLive,
  assertSkuMargin,
  assertTaskLease,
  configuredSkuCostMinor,
  requestHash,
  requireIdempotencyKey,
  resolveUserId,
  createQuote,
  createTaskWithHold,
  finalizeTaskInputs,
  markTaskRunning,
  settleTask,
  releaseTask,
  requestTaskCancellation,
  cancelTask,
  getTask,
  releaseExpiredHolds,
  publicTask,
  taskWithPreparationState
};
