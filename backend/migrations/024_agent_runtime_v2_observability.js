/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('agent_runs', {
    runtime_version: {
      type: 'smallint',
      notNull: true,
      default: 1,
      check: 'runtime_version BETWEEN 1 AND 2'
    },
    prompt_profile: { type: 'text' },
    prompt_hash: { type: 'bytea' },
    skill_versions: { type: 'jsonb', notNull: true, default: '{}' }
  });
  pgm.addConstraint('agent_runs', 'agent_runs_runtime_prompt_shape_check', {
    check: `
      (runtime_version=1)
      OR (
        runtime_version=2
        AND length(prompt_profile) BETWEEN 1 AND 80
        AND octet_length(prompt_hash)=32
        AND jsonb_typeof(skill_versions)='object'
      )
    `
  });

  pgm.createTable('agent_model_calls', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    run_id: { type: 'uuid', references: 'agent_runs', onDelete: 'CASCADE' },
    subagent_id: { type: 'uuid', references: 'agent_subagents', onDelete: 'CASCADE' },
    conversation_id: { type: 'uuid', references: 'design_conversations', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    provider: { type: 'text', notNull: true },
    model_name: { type: 'text', notNull: true },
    phase: {
      type: 'text',
      notNull: true,
      check: "phase IN ('router','planner','actor','verifier','subagent','evaluation')"
    },
    turn: { type: 'integer', notNull: true, default: 0, check: 'turn >= 0' },
    attempt: { type: 'smallint', notNull: true, default: 1, check: 'attempt BETWEEN 1 AND 3' },
    prompt_profile: { type: 'text' },
    prompt_hash: { type: 'bytea' },
    skill_ids: { type: 'jsonb', notNull: true, default: '[]' },
    thinking_enabled: { type: 'boolean', notNull: true, default: false },
    estimated_input_tokens: { type: 'integer', notNull: true, default: 0, check: 'estimated_input_tokens >= 0' },
    input_tokens: { type: 'integer', notNull: true, default: 0, check: 'input_tokens >= 0' },
    output_tokens: { type: 'integer', notNull: true, default: 0, check: 'output_tokens >= 0' },
    queue_wait_ms: { type: 'integer', notNull: true, default: 0, check: 'queue_wait_ms >= 0' },
    latency_ms: { type: 'integer', notNull: true, default: 0, check: 'latency_ms >= 0' },
    selected_tool: { type: 'text' },
    outcome: {
      type: 'text',
      notNull: true,
      default: 'running',
      check: "outcome IN ('running','succeeded','failed','cancelled')"
    },
    error_code: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at: { type: 'timestamptz' },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("clock_timestamp() + interval '30 days'")
    }
  });
  pgm.addConstraint('agent_model_calls', 'agent_model_calls_scope_check', {
    check: 'num_nonnulls(run_id,conversation_id) <= 1'
  });
  pgm.addConstraint('agent_model_calls', 'agent_model_calls_prompt_hash_check', {
    check: 'prompt_hash IS NULL OR octet_length(prompt_hash)=32'
  });
  pgm.createIndex('agent_model_calls', ['run_id', 'created_at'], {
    name: 'agent_model_calls_run_created_idx'
  });
  pgm.createIndex('agent_model_calls', ['conversation_id', 'created_at'], {
    name: 'agent_model_calls_conversation_created_idx'
  });
  pgm.createIndex('agent_model_calls', ['phase', 'created_at'], {
    name: 'agent_model_calls_phase_created_idx'
  });
  pgm.createIndex('agent_model_calls', ['expires_at'], {
    name: 'agent_model_calls_expiry_idx'
  });

  pgm.createTable('agent_provider_scheduler', {
    provider_key: { type: 'text', primaryKey: true },
    next_available_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createTable('agent_provider_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    provider_key: {
      type: 'text',
      notNull: true,
      references: 'agent_provider_scheduler',
      onDelete: 'CASCADE'
    },
    priority: { type: 'smallint', notNull: true, check: 'priority BETWEEN 1 AND 6' },
    status: {
      type: 'text',
      notNull: true,
      default: 'queued',
      check: "status IN ('queued','granted','cancelled','expired')"
    },
    requested_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') },
    granted_at: { type: 'timestamptz' },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("clock_timestamp() + interval '10 minutes'")
    },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('agent_provider_requests', ['provider_key', 'status', 'priority', 'requested_at'], {
    name: 'agent_provider_requests_claim_idx'
  });
  pgm.createIndex('agent_provider_requests', ['expires_at'], {
    name: 'agent_provider_requests_expiry_idx'
  });

  pgm.createTable('agent_quality_checks', {
    id: { type: 'bigserial', primaryKey: true },
    run_id: { type: 'uuid', references: 'agent_runs', onDelete: 'CASCADE' },
    check_kind: { type: 'text', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      check: "status IN ('passed','failed','skipped')"
    },
    score: { type: 'numeric(5,2)', check: 'score IS NULL OR (score >= 0 AND score <= 100)' },
    codes: { type: 'jsonb', notNull: true, default: '[]' },
    metrics: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("clock_timestamp() + interval '30 days'")
    }
  });
  pgm.createIndex('agent_quality_checks', ['run_id', 'created_at'], {
    name: 'agent_quality_checks_run_created_idx'
  });
  pgm.createIndex('agent_quality_checks', ['expires_at'], {
    name: 'agent_quality_checks_expiry_idx'
  });
};

exports.down = (pgm) => {
  pgm.dropTable('agent_quality_checks', { ifExists: true, cascade: true });
  pgm.dropTable('agent_provider_requests', { ifExists: true, cascade: true });
  pgm.dropTable('agent_provider_scheduler', { ifExists: true, cascade: true });
  pgm.dropTable('agent_model_calls', { ifExists: true, cascade: true });
  pgm.dropConstraint('agent_runs', 'agent_runs_runtime_prompt_shape_check', { ifExists: true });
  pgm.dropColumns('agent_runs', [
    'runtime_version',
    'prompt_profile',
    'prompt_hash',
    'skill_versions'
  ], { ifExists: true });
};
