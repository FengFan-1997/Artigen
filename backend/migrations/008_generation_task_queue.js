exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('tool_tasks', {
    lease_owner: { type: 'text' },
    lease_expires_at: { type: 'timestamptz' },
    heartbeat_at: { type: 'timestamptz' },
    attempt_count: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'attempt_count BETWEEN 0 AND 2'
    },
    cancel_requested_at: { type: 'timestamptz' },
    provider_dispatched_at: { type: 'timestamptz' }
  });
  pgm.addConstraint('tool_tasks', 'tool_tasks_lease_shape_check', {
    check: `
      (lease_owner IS NULL AND lease_expires_at IS NULL)
      OR
      (
        lease_owner IS NOT NULL
        AND length(lease_owner) BETWEEN 1 AND 160
        AND lease_expires_at IS NOT NULL
      )
    `
  });
  pgm.createIndex(
    'tool_tasks',
    ['status', 'lease_expires_at', 'provider_dispatched_at', 'attempt_count', 'created_at'],
    { name: 'tool_tasks_lease_candidates_idx' }
  );
  pgm.createIndex('tool_tasks', ['cancel_requested_at'], {
    name: 'tool_tasks_cancel_requested_idx',
    where: "cancel_requested_at IS NOT NULL AND status IN ('queued','running')"
  });

  pgm.createTable('tool_task_payloads', {
    task_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'tool_tasks',
      onDelete: 'CASCADE'
    },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'text', notNull: true, default: 'v1' },
    iv: { type: 'bytea', notNull: true },
    auth_tag: { type: 'bytea', notNull: true },
    ciphertext: { type: 'bytea', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('tool_task_payloads', 'tool_task_payload_crypto_shape_check', {
    check: `
      algorithm = 'aes-256-gcm-v1'
      AND octet_length(iv) = 12
      AND octet_length(auth_tag) = 16
      AND octet_length(ciphertext) BETWEEN 1 AND 262144
    `
  });
  pgm.createIndex('tool_task_payloads', ['expires_at'], {
    name: 'tool_task_payloads_expiry_idx'
  });

  pgm.addColumns('assets', {
    retention_class: {
      type: 'text',
      notNull: true,
      default: 'other',
      check: "retention_class IN ('temporary-input','generated-output','editor-transfer','other')"
    },
    delete_requested_at: { type: 'timestamptz' }
  });
  pgm.createIndex('assets', ['retention_class', 'expires_at'], {
    name: 'assets_retention_expiry_idx'
  });
  pgm.createIndex('assets', ['delete_requested_at'], {
    name: 'assets_delete_requested_idx',
    where: 'delete_requested_at IS NOT NULL'
  });

  pgm.createTable('generation_events', {
    id: { type: 'bigserial', primaryKey: true },
    event_type: { type: 'text', notNull: true },
    actor_user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    session_ref: { type: 'text' },
    project_ref: { type: 'text' },
    request_ref: { type: 'text' },
    task_id: { type: 'uuid', references: 'tool_tasks', onDelete: 'SET NULL' },
    quote_id: { type: 'uuid', references: 'tool_task_quotes', onDelete: 'SET NULL' },
    properties: { type: 'jsonb', notNull: true, default: '{}' },
    duration_ms: { type: 'integer', check: 'duration_ms IS NULL OR duration_ms >= 0' },
    occurred_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('generation_events', 'generation_events_type_check', {
    check: `event_type IN (
      'workspace_view','prompt_start','quote_shown','quote_confirmed','auth_blocked',
      'task_queued','task_running','task_success','task_fail','task_cancel',
      'first_image_visible','download','edit','reference','variation','payment_confirmed'
    )`
  });
  pgm.addConstraint('generation_events', 'generation_events_properties_check', {
    check: `
      jsonb_typeof(properties) = 'object'
      AND octet_length(properties::text) <= 8192
      AND (session_ref IS NULL OR length(session_ref) <= 128)
      AND (project_ref IS NULL OR length(project_ref) <= 128)
      AND (request_ref IS NULL OR length(request_ref) <= 128)
    `
  });
  pgm.createIndex('generation_events', ['event_type', 'occurred_at'], {
    name: 'generation_events_funnel_idx'
  });
  pgm.createIndex('generation_events', ['task_id', 'occurred_at'], {
    name: 'generation_events_task_idx',
    where: 'task_id IS NOT NULL'
  });

  pgm.sql(`
    INSERT INTO price_skus (price_version_id, sku, credits, active, metadata)
    SELECT pv.id, seed.sku, seed.credits, true, seed.metadata::jsonb
      FROM price_versions pv
      CROSS JOIN (VALUES
        ('ai-design.generate.v1', 10, '{"operation":"generate"}'),
        ('ai-design.directions.v1', 5, '{"operation":"directions"}')
      ) AS seed(sku, credits, metadata)
     WHERE pv.active = true
       AND pv.effective_at <= now()
       AND pv.version = (
         SELECT max(version) FROM price_versions
          WHERE active = true AND effective_at <= now()
       )
    ON CONFLICT (price_version_id, sku)
    DO UPDATE SET credits = EXCLUDED.credits, active = true, metadata = EXCLUDED.metadata;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM price_skus
     WHERE sku IN ('ai-design.generate.v1', 'ai-design.directions.v1');
  `);
  pgm.dropTable('generation_events', { ifExists: true, cascade: true });
  pgm.dropIndex('assets', ['delete_requested_at'], {
    name: 'assets_delete_requested_idx',
    ifExists: true
  });
  pgm.dropIndex('assets', ['retention_class', 'expires_at'], {
    name: 'assets_retention_expiry_idx',
    ifExists: true
  });
  pgm.dropColumns('assets', ['retention_class', 'delete_requested_at']);
  pgm.dropTable('tool_task_payloads', { ifExists: true, cascade: true });
  pgm.dropConstraint('tool_tasks', 'tool_tasks_lease_shape_check', { ifExists: true });
  pgm.dropIndex(
    'tool_tasks',
    ['status', 'lease_expires_at', 'provider_dispatched_at', 'attempt_count', 'created_at'],
    { name: 'tool_tasks_lease_candidates_idx', ifExists: true }
  );
  pgm.dropIndex('tool_tasks', ['cancel_requested_at'], {
    name: 'tool_tasks_cancel_requested_idx',
    ifExists: true
  });
  pgm.dropColumns('tool_tasks', [
    'lease_owner',
    'lease_expires_at',
    'heartbeat_at',
    'attempt_count',
    'cancel_requested_at',
    'provider_dispatched_at'
  ]);
};
