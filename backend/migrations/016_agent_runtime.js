/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('agent_runs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    project_id: { type: 'uuid', references: 'creative_projects', onDelete: 'SET NULL' },
    status: {
      type: 'text',
      notNull: true,
      default: 'draft',
      check: "status IN ('draft','queued','provisioning','running','waiting_user','paused','verifying','succeeded','failed','cancelled')"
    },
    idempotency_key: { type: 'text', notNull: true },
    request_hash: { type: 'bytea', notNull: true },
    model_provider: { type: 'text', notNull: true, default: 'openai' },
    model_name: { type: 'text', notNull: true },
    sandbox_provider: { type: 'text', notNull: true, default: 'cua' },
    sandbox_version: { type: 'text', notNull: true },
    sandbox_ref: { type: 'text' },
    display_url: { type: 'text' },
    capabilities: { type: 'jsonb', notNull: true, default: '{}' },
    browser_config: { type: 'jsonb', notNull: true, default: '{}' },
    checkpoint: { type: 'jsonb', notNull: true, default: '{}' },
    completion_checklist: { type: 'jsonb', notNull: true, default: '{}' },
    max_credits: { type: 'integer', notNull: true, check: 'max_credits BETWEEN 0 AND 500' },
    free_credits_reserved: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'free_credits_reserved >= 0 AND free_credits_reserved <= max_credits'
    },
    charged_credits: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'charged_credits >= 0 AND charged_credits <= max_credits'
    },
    estimated_credits_used: {
      type: 'numeric(12,4)',
      notNull: true,
      default: 0,
      check: 'estimated_credits_used >= 0 AND estimated_credits_used <= max_credits'
    },
    refunded_credits: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'refunded_credits >= 0 AND refunded_credits <= charged_credits'
    },
    step_count: { type: 'integer', notNull: true, default: 0, check: 'step_count BETWEEN 0 AND 120' },
    replan_count: { type: 'integer', notNull: true, default: 0, check: 'replan_count BETWEEN 0 AND 3' },
    consecutive_failures: { type: 'integer', notNull: true, default: 0, check: 'consecutive_failures BETWEEN 0 AND 2' },
    unchanged_screenshots: { type: 'integer', notNull: true, default: 0, check: 'unchanged_screenshots BETWEEN 0 AND 3' },
    pause_requested: { type: 'boolean', notNull: true, default: false },
    cancel_requested: { type: 'boolean', notNull: true, default: false },
    error_code: { type: 'text' },
    worker_id: { type: 'text' },
    lease_expires_at: { type: 'timestamptz' },
    expires_at: { type: 'timestamptz', notNull: true, default: pgm.func("clock_timestamp() + interval '30 days'") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    queued_at: { type: 'timestamptz' },
    started_at: { type: 'timestamptz' },
    finished_at: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_runs', 'agent_runs_user_idempotency_unique', {
    unique: ['user_id', 'idempotency_key']
  });
  pgm.createIndex('agent_runs', ['status', 'created_at'], {
    name: 'agent_runs_status_created_idx'
  });
  pgm.createIndex('agent_runs', ['user_id', 'created_at'], {
    name: 'agent_runs_user_created_idx'
  });
  pgm.createIndex('agent_runs', ['user_id'], {
    name: 'agent_runs_one_active_per_user_idx',
    unique: true,
    where: "status IN ('draft','queued','provisioning','running','waiting_user','paused','verifying')"
  });

  pgm.createTable('agent_run_payloads', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    run_id: { type: 'uuid', notNull: true, references: 'agent_runs', onDelete: 'CASCADE' },
    kind: {
      type: 'text',
      notNull: true,
      check: "kind IN ('objective','user_input','approval_context','browser_profile')"
    },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'smallint', notNull: true, default: 1 },
    iv: { type: 'bytea', notNull: true },
    auth_tag: { type: 'bytea', notNull: true },
    ciphertext: { type: 'bytea', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_run_payloads', 'agent_run_payloads_crypto_shape_check', {
    check: `
      algorithm='aes-256-gcm-v1'
      AND key_version > 0
      AND octet_length(iv)=12
      AND octet_length(auth_tag)=16
      AND octet_length(ciphertext) BETWEEN 1 AND 1048576
    `
  });
  pgm.createIndex('agent_run_payloads', ['run_id', 'created_at'], {
    name: 'agent_run_payloads_run_created_idx'
  });

  pgm.createTable('agent_steps', {
    id: { type: 'bigserial', primaryKey: true },
    run_id: { type: 'uuid', notNull: true, references: 'agent_runs', onDelete: 'CASCADE' },
    sequence: { type: 'integer', notNull: true, check: 'sequence BETWEEN 1 AND 120' },
    role: {
      type: 'text',
      notNull: true,
      check: "role IN ('planner','executor','verifier','packager')"
    },
    status: {
      type: 'text',
      notNull: true,
      check: "status IN ('pending','running','waiting_approval','succeeded','failed','skipped')"
    },
    tool_name: { type: 'text' },
    action_fingerprint: { type: 'bytea' },
    risk_level: {
      type: 'text',
      notNull: true,
      default: 'low',
      check: "risk_level IN ('low','medium','high','blocked')"
    },
    summary: { type: 'text', notNull: true, default: '' },
    sanitized_input: { type: 'jsonb', notNull: true, default: '{}' },
    sanitized_output: { type: 'jsonb', notNull: true, default: '{}' },
    started_at: { type: 'timestamptz' },
    finished_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_steps', 'agent_steps_run_sequence_unique', {
    unique: ['run_id', 'sequence']
  });

  pgm.createTable('agent_events', {
    id: { type: 'bigserial', primaryKey: true },
    run_id: { type: 'uuid', notNull: true, references: 'agent_runs', onDelete: 'CASCADE' },
    event_type: { type: 'text', notNull: true },
    phase: { type: 'text' },
    summary: { type: 'text', notNull: true, default: '' },
    data: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('agent_events', ['run_id', 'id'], {
    name: 'agent_events_run_cursor_idx'
  });

  pgm.createTable('agent_artifacts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    run_id: { type: 'uuid', notNull: true, references: 'agent_runs', onDelete: 'CASCADE' },
    asset_id: { type: 'uuid', references: 'assets', onDelete: 'RESTRICT' },
    parent_artifact_id: { type: 'uuid', references: 'agent_artifacts', onDelete: 'SET NULL' },
    role: {
      type: 'text',
      notNull: true,
      check: "role IN ('source','editable','preview','pdf','package','website','image','data')"
    },
    filename: { type: 'text', notNull: true },
    mime_type: { type: 'text', notNull: true },
    byte_size: { type: 'bigint', notNull: true, default: 0, check: 'byte_size >= 0' },
    sha256: { type: 'bytea' },
    version: { type: 'integer', notNull: true, default: 1, check: 'version > 0' },
    verification_status: {
      type: 'text',
      notNull: true,
      default: 'pending',
      check: "verification_status IN ('pending','passed','failed')"
    },
    verification: { type: 'jsonb', notNull: true, default: '{}' },
    sources: { type: 'jsonb', notNull: true, default: '[]' },
    cost_credits: { type: 'integer', notNull: true, default: 0, check: 'cost_credits >= 0' },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('agent_artifacts', ['run_id', 'created_at'], {
    name: 'agent_artifacts_run_created_idx'
  });

  pgm.createTable('agent_approvals', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    run_id: { type: 'uuid', notNull: true, references: 'agent_runs', onDelete: 'CASCADE' },
    step_id: { type: 'bigint', references: 'agent_steps', onDelete: 'SET NULL' },
    action_type: { type: 'text', notNull: true },
    action_fingerprint: { type: 'bytea', notNull: true },
    recipient: { type: 'text', notNull: true, default: '' },
    risk_level: {
      type: 'text',
      notNull: true,
      check: "risk_level IN ('medium','high','blocked')"
    },
    change_summary: { type: 'text', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending','approved','denied','expired')"
    },
    decided_by_user_id: { type: 'uuid', references: 'users', onDelete: 'RESTRICT' },
    expires_at: { type: 'timestamptz', notNull: true },
    decided_at: { type: 'timestamptz' },
    used_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('agent_approvals', ['run_id', 'status'], {
    name: 'agent_approvals_run_status_idx'
  });

  pgm.createTable('agent_budget_holds', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    run_id: { type: 'uuid', notNull: true, unique: true, references: 'agent_runs', onDelete: 'RESTRICT' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    max_credits: { type: 'integer', notNull: true, check: 'max_credits BETWEEN 0 AND 500' },
    free_credits: { type: 'integer', notNull: true, default: 0, check: 'free_credits >= 0' },
    paid_credits: { type: 'integer', notNull: true, default: 0, check: 'paid_credits >= 0' },
    charged_credits: { type: 'integer', notNull: true, default: 0, check: 'charged_credits >= 0' },
    status: {
      type: 'text',
      notNull: true,
      default: 'held',
      check: "status IN ('held','settled','released')"
    },
    expires_at: { type: 'timestamptz', notNull: true },
    resolved_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_budget_holds', 'agent_budget_holds_split_check', {
    check: 'free_credits + paid_credits = max_credits AND charged_credits <= max_credits'
  });
  pgm.createIndex('agent_budget_holds', ['status', 'expires_at'], {
    name: 'agent_budget_holds_expiry_idx'
  });

  pgm.createTable('agent_daily_free_usage', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    usage_date: { type: 'date', notNull: true },
    reserved_credits: { type: 'integer', notNull: true, default: 0, check: 'reserved_credits >= 0' },
    consumed_credits: { type: 'integer', notNull: true, default: 0, check: 'consumed_credits >= 0' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_daily_free_usage', 'agent_daily_free_usage_pk', {
    primaryKey: ['user_id', 'usage_date']
  });

  pgm.createTable('agent_browser_profiles', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    site_origin: { type: 'text', notNull: true },
    label: { type: 'text', notNull: true, default: '' },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'smallint', notNull: true, default: 1 },
    iv: { type: 'bytea', notNull: true },
    auth_tag: { type: 'bytea', notNull: true },
    ciphertext: { type: 'bytea', notNull: true },
    last_used_at: { type: 'timestamptz' },
    expires_at: { type: 'timestamptz', notNull: true },
    revoked_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_browser_profiles', 'agent_browser_profiles_crypto_shape_check', {
    check: `
      algorithm='aes-256-gcm-v1'
      AND key_version > 0
      AND octet_length(iv)=12
      AND octet_length(auth_tag)=16
      AND octet_length(ciphertext) BETWEEN 1 AND 2097152
    `
  });
  pgm.createIndex('agent_browser_profiles', ['user_id', 'site_origin'], {
    name: 'agent_browser_profiles_user_site_idx',
    unique: true,
    where: 'revoked_at IS NULL'
  });

  pgm.createTable('agent_integrations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    provider: {
      type: 'text',
      notNull: true,
      check: "provider IN ('google_drive','github')"
    },
    external_subject: { type: 'text', notNull: true },
    scopes: { type: 'jsonb', notNull: true, default: '[]' },
    secret_ref: { type: 'text', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'active',
      check: "status IN ('active','revoked','error')"
    },
    last_used_at: { type: 'timestamptz' },
    expires_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_integrations', 'agent_integrations_user_provider_unique', {
    unique: ['user_id', 'provider']
  });

  pgm.createTable('agent_integration_secrets', {
    integration_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'agent_integrations',
      onDelete: 'CASCADE'
    },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'smallint', notNull: true, default: 1 },
    iv: { type: 'bytea', notNull: true },
    auth_tag: { type: 'bytea', notNull: true },
    ciphertext: { type: 'bytea', notNull: true },
    rotated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_integration_secrets', 'agent_integration_secrets_crypto_shape_check', {
    check: `
      algorithm='aes-256-gcm-v1'
      AND key_version > 0
      AND octet_length(iv)=12
      AND octet_length(auth_tag)=16
      AND octet_length(ciphertext) BETWEEN 1 AND 262144
    `
  });

  pgm.sql(`
    CREATE FUNCTION reject_agent_event_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'agent_events is append-only' USING ERRCODE = '55000';
    END;
    $$;

    CREATE TRIGGER agent_events_append_only
    BEFORE UPDATE OR DELETE ON agent_events
    FOR EACH ROW EXECUTE FUNCTION reject_agent_event_mutation();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS agent_events_append_only ON agent_events;
    DROP FUNCTION IF EXISTS reject_agent_event_mutation();
  `);
  [
    'agent_integration_secrets',
    'agent_integrations',
    'agent_browser_profiles',
    'agent_daily_free_usage',
    'agent_budget_holds',
    'agent_approvals',
    'agent_artifacts',
    'agent_events',
    'agent_steps',
    'agent_run_payloads',
    'agent_runs'
  ].forEach((table) => pgm.dropTable(table, { ifExists: true, cascade: true }));
};
