/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('design_conversations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    project_id: { type: 'uuid', references: 'creative_projects', onDelete: 'SET NULL' },
    title: { type: 'text', notNull: true, default: '新的设计任务' },
    status: {
      type: 'text',
      notNull: true,
      default: 'active',
      check: "status IN ('active','archived')"
    },
    auto_credit_cap: {
      type: 'integer',
      notNull: true,
      default: 50,
      check: 'auto_credit_cap BETWEEN 1 AND 500'
    },
    clarification_rounds: {
      type: 'smallint',
      notNull: true,
      default: 0,
      check: 'clarification_rounds BETWEEN 0 AND 1'
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("clock_timestamp() + interval '30 days'")
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('design_conversations', 'design_conversations_title_check', {
    check: 'length(title) BETWEEN 1 AND 160'
  });
  pgm.createIndex('design_conversations', ['user_id', 'updated_at'], {
    name: 'design_conversations_user_updated_idx'
  });
  pgm.createIndex('design_conversations', ['expires_at'], {
    name: 'design_conversations_expiry_idx'
  });

  pgm.createTable('design_messages', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    conversation_id: {
      type: 'uuid',
      notNull: true,
      references: 'design_conversations',
      onDelete: 'CASCADE'
    },
    sequence: { type: 'integer', notNull: true, check: 'sequence > 0' },
    role: { type: 'text', notNull: true, check: "role IN ('user','assistant')" },
    kind: {
      type: 'text',
      notNull: true,
      default: 'text',
      check: "kind IN ('text','clarification','execution','error')"
    },
    status: {
      type: 'text',
      notNull: true,
      default: 'complete',
      check: "status IN ('pending','complete','failed')"
    },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'smallint', notNull: true, default: 1 },
    iv: { type: 'bytea', notNull: true },
    auth_tag: { type: 'bytea', notNull: true },
    ciphertext: { type: 'bytea', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('design_messages', 'design_messages_crypto_shape_check', {
    check: `
      algorithm='aes-256-gcm-v1'
      AND key_version=1
      AND octet_length(iv)=12
      AND octet_length(auth_tag)=16
      AND octet_length(ciphertext) BETWEEN 1 AND 1048576
    `
  });
  pgm.addConstraint('design_messages', 'design_messages_sequence_unique', {
    unique: ['conversation_id', 'sequence']
  });
  pgm.createIndex('design_messages', ['conversation_id', 'sequence'], {
    name: 'design_messages_conversation_sequence_idx'
  });
  pgm.createIndex('design_messages', ['expires_at'], {
    name: 'design_messages_expiry_idx'
  });

  pgm.createTable('design_executions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    conversation_id: {
      type: 'uuid',
      notNull: true,
      references: 'design_conversations',
      onDelete: 'CASCADE'
    },
    source_message_id: { type: 'uuid', references: 'design_messages', onDelete: 'SET NULL' },
    route_kind: {
      type: 'text',
      notNull: true,
      check: "route_kind IN ('reply','local_tool','tool_task','agent_run')"
    },
    status: {
      type: 'text',
      notNull: true,
      default: 'planning',
      check: `status IN (
        'planning','waiting_clarification','waiting_upload','waiting_budget',
        'queued','running','waiting_authorization','succeeded','failed','cancelled'
      )`
    },
    tool_id: { type: 'text' },
    operation: { type: 'text' },
    tool_task_id: { type: 'uuid', references: 'tool_tasks', onDelete: 'SET NULL' },
    agent_run_id: { type: 'uuid', references: 'agent_runs', onDelete: 'SET NULL' },
    local_route: { type: 'text' },
    max_credits: { type: 'integer', notNull: true, default: 50, check: 'max_credits BETWEEN 1 AND 500' },
    quoted_credits: { type: 'integer', check: 'quoted_credits IS NULL OR quoted_credits >= 0' },
    plan: { type: 'jsonb', notNull: true, default: '{}' },
    error_code: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at: { type: 'timestamptz' }
  });
  pgm.addConstraint('design_executions', 'design_executions_single_target_check', {
    check: 'num_nonnulls(tool_task_id,agent_run_id) <= 1'
  });
  pgm.createIndex('design_executions', ['conversation_id', 'created_at'], {
    name: 'design_executions_conversation_created_idx'
  });
  pgm.createIndex('design_executions', ['tool_task_id'], {
    name: 'design_executions_tool_task_idx',
    unique: true,
    where: 'tool_task_id IS NOT NULL'
  });
  pgm.createIndex('design_executions', ['agent_run_id'], {
    name: 'design_executions_agent_run_idx',
    unique: true,
    where: 'agent_run_id IS NOT NULL'
  });

  pgm.createTable('design_conversation_assets', {
    conversation_id: {
      type: 'uuid',
      notNull: true,
      references: 'design_conversations',
      onDelete: 'CASCADE'
    },
    asset_id: { type: 'uuid', notNull: true, references: 'assets', onDelete: 'RESTRICT' },
    client_id: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('design_conversation_assets', 'design_conversation_assets_unique', {
    unique: ['conversation_id', 'client_id']
  });
  pgm.createIndex('design_conversation_assets', ['conversation_id', 'created_at'], {
    name: 'design_conversation_assets_conversation_idx'
  });

  pgm.createTable('design_conversation_events', {
    id: { type: 'bigserial', primaryKey: true },
    conversation_id: {
      type: 'uuid',
      notNull: true,
      references: 'design_conversations',
      onDelete: 'CASCADE'
    },
    event_type: { type: 'text', notNull: true },
    summary: { type: 'text', notNull: true, default: '' },
    data: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('design_conversation_events', ['conversation_id', 'id'], {
    name: 'design_conversation_events_cursor_idx'
  });

  pgm.createTable('design_planning_jobs', {
    message_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'design_messages',
      onDelete: 'CASCADE'
    },
    conversation_id: {
      type: 'uuid',
      notNull: true,
      references: 'design_conversations',
      onDelete: 'CASCADE'
    },
    status: {
      type: 'text',
      notNull: true,
      default: 'queued',
      check: "status IN ('queued','running','succeeded','failed')"
    },
    attempt_count: { type: 'integer', notNull: true, default: 0, check: 'attempt_count BETWEEN 0 AND 3' },
    lease_owner: { type: 'text' },
    lease_expires_at: { type: 'timestamptz' },
    next_attempt_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    error_code: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('design_planning_jobs', ['status', 'next_attempt_at'], {
    name: 'design_planning_jobs_claim_idx'
  });

  pgm.createTable('design_session_authorizations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    conversation_id: {
      type: 'uuid',
      notNull: true,
      references: 'design_conversations',
      onDelete: 'CASCADE'
    },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    site_origin: { type: 'text', notNull: true },
    action_type: { type: 'text', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'active',
      check: "status IN ('active','revoked','expired')"
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("clock_timestamp() + interval '30 minutes'")
    },
    last_used_at: { type: 'timestamptz' },
    revoked_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('design_session_authorizations', 'design_session_authorizations_shape_check', {
    check: `
      length(site_origin) BETWEEN 8 AND 300
      AND length(action_type) BETWEEN 1 AND 100
      AND (
        (status='active' AND revoked_at IS NULL)
        OR (status IN ('revoked','expired'))
      )
    `
  });
  pgm.createIndex('design_session_authorizations', ['conversation_id', 'status', 'expires_at'], {
    name: 'design_session_authorizations_scope_idx'
  });

  pgm.sql(`
    CREATE OR REPLACE FUNCTION prevent_design_conversation_event_mutation()
    RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'design_conversation_events is append-only' USING ERRCODE = '55000';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER design_conversation_events_append_only
    BEFORE UPDATE OR DELETE ON design_conversation_events
    FOR EACH ROW EXECUTE FUNCTION prevent_design_conversation_event_mutation();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS design_conversation_events_append_only ON design_conversation_events');
  pgm.sql('DROP FUNCTION IF EXISTS prevent_design_conversation_event_mutation()');
  pgm.dropTable('design_session_authorizations');
  pgm.dropTable('design_planning_jobs');
  pgm.dropTable('design_conversation_events');
  pgm.dropTable('design_conversation_assets');
  pgm.dropTable('design_executions');
  pgm.dropTable('design_messages');
  pgm.dropTable('design_conversations');
};
