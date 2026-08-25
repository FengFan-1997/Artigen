/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('agent_runs', {
    lease_epoch: {
      type: 'bigint',
      notNull: true,
      default: 0,
      check: 'lease_epoch >= 0'
    },
    runtime_profile_hash: { type: 'bytea' },
    runtime_profile_summary: { type: 'jsonb', notNull: true, default: '{}' },
    final_text_sha256: { type: 'bytea' },
    semantic_verification: { type: 'jsonb', notNull: true, default: '{}' },
    platform_overrun_credits: {
      type: 'numeric(12,4)',
      notNull: true,
      default: 0,
      check: 'platform_overrun_credits >= 0'
    }
  });
  pgm.addConstraint('agent_runs', 'agent_runs_v2_1_hash_shape_check', {
    check: `
      (runtime_profile_hash IS NULL OR octet_length(runtime_profile_hash)=32)
      AND (final_text_sha256 IS NULL OR octet_length(final_text_sha256)=32)
      AND jsonb_typeof(runtime_profile_summary)='object'
      AND jsonb_typeof(semantic_verification)='object'
    `
  });
  pgm.addConstraint('agent_model_calls', 'agent_model_calls_id_run_unique', {
    unique: ['id', 'run_id']
  });

  pgm.createTable('agent_model_call_receipts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      references: 'agent_model_calls',
      onDelete: 'CASCADE'
    },
    run_id: {
      type: 'uuid',
      notNull: true,
      references: 'agent_runs',
      onDelete: 'CASCADE'
    },
    worker_id: { type: 'text', notNull: true },
    lease_epoch: { type: 'bigint', notNull: true, check: 'lease_epoch >= 0' },
    state: {
      type: 'text',
      notNull: true,
      default: 'queued',
      check: "state IN ('queued','dispatched','received','consumed','ambiguous')"
    },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'smallint', notNull: true, default: 1 },
    intent_iv: { type: 'bytea', notNull: true },
    intent_auth_tag: { type: 'bytea', notNull: true },
    intent_ciphertext: { type: 'bytea', notNull: true },
    response_iv: { type: 'bytea' },
    response_auth_tag: { type: 'bytea' },
    response_ciphertext: { type: 'bytea' },
    dispatched_at: { type: 'timestamptz' },
    received_at: { type: 'timestamptz' },
    consumed_at: { type: 'timestamptz' },
    ambiguous_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("clock_timestamp() + interval '30 days'")
    }
  });
  pgm.addConstraint('agent_model_call_receipts', 'agent_model_call_receipts_crypto_shape_check', {
    check: `
      algorithm='aes-256-gcm-v1'
      AND key_version=1
      AND octet_length(intent_iv)=12
      AND octet_length(intent_auth_tag)=16
      AND octet_length(intent_ciphertext) BETWEEN 1 AND 1048576
      AND (
        (response_iv IS NULL AND response_auth_tag IS NULL AND response_ciphertext IS NULL)
        OR (
          octet_length(response_iv)=12
          AND octet_length(response_auth_tag)=16
          AND octet_length(response_ciphertext) BETWEEN 1 AND 1048576
        )
      )
    `
  });
  pgm.addConstraint('agent_model_call_receipts', 'agent_model_call_receipts_state_shape_check', {
    check: `
      (state='queued' AND dispatched_at IS NULL AND received_at IS NULL AND consumed_at IS NULL)
      OR (state='dispatched' AND dispatched_at IS NOT NULL AND received_at IS NULL AND consumed_at IS NULL)
      OR (state='received' AND dispatched_at IS NOT NULL AND received_at IS NOT NULL AND consumed_at IS NULL AND response_ciphertext IS NOT NULL)
      OR (state='consumed' AND dispatched_at IS NOT NULL AND received_at IS NOT NULL AND consumed_at IS NOT NULL AND response_ciphertext IS NOT NULL)
      OR (state='ambiguous' AND dispatched_at IS NOT NULL AND received_at IS NULL AND consumed_at IS NULL AND ambiguous_at IS NOT NULL)
    `
  });
  pgm.createIndex('agent_model_call_receipts', ['run_id', 'state', 'updated_at'], {
    name: 'agent_model_call_receipts_run_state_idx'
  });
  pgm.createIndex('agent_model_call_receipts', ['expires_at'], {
    name: 'agent_model_call_receipts_expiry_idx'
  });
  pgm.addConstraint('agent_model_call_receipts', 'agent_model_call_receipts_run_call_fk', {
    foreignKeys: {
      columns: ['id', 'run_id'],
      references: 'agent_model_calls(id,run_id)'
    }
  });

  pgm.createTable('agent_tool_call_receipts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    run_id: {
      type: 'uuid',
      notNull: true,
      references: 'agent_runs',
      onDelete: 'CASCADE'
    },
    subagent_id: {
      type: 'uuid',
      references: 'agent_subagents',
      onDelete: 'SET NULL'
    },
    receipt_key: { type: 'text', notNull: true },
    kind: {
      type: 'text',
      notNull: true,
      check: "kind IN ('sandbox_shell','kolors')"
    },
    state: {
      type: 'text',
      notNull: true,
      check: "state IN ('dispatched','consumed','ambiguous')"
    },
    worker_id: { type: 'text', notNull: true },
    lease_epoch: { type: 'bigint', notNull: true, check: 'lease_epoch >= 0' },
    reservation_key: { type: 'text', notNull: true },
    request_sha256: { type: 'bytea', notNull: true },
    actual_credits: {
      type: 'numeric(12,4)',
      check: 'actual_credits IS NULL OR actual_credits >= 0'
    },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'smallint', notNull: true, default: 1 },
    result_iv: { type: 'bytea' },
    result_auth_tag: { type: 'bytea' },
    result_ciphertext: { type: 'bytea' },
    dispatched_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    consumed_at: { type: 'timestamptz' },
    ambiguous_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("clock_timestamp() + interval '30 days'")
    }
  });
  pgm.addConstraint('agent_tool_call_receipts', 'agent_tool_call_receipts_key_unique', {
    unique: ['run_id', 'receipt_key']
  });
  pgm.addConstraint('agent_tool_call_receipts', 'agent_tool_call_receipts_request_hash_check', {
    check: 'octet_length(request_sha256)=32'
  });
  pgm.addConstraint('agent_tool_call_receipts', 'agent_tool_call_receipts_crypto_shape_check', {
    check: `
      algorithm='aes-256-gcm-v1'
      AND key_version=1
      AND (
        (result_iv IS NULL AND result_auth_tag IS NULL AND result_ciphertext IS NULL)
        OR (
          octet_length(result_iv)=12
          AND octet_length(result_auth_tag)=16
          AND octet_length(result_ciphertext) BETWEEN 1 AND 1048576
        )
      )
    `
  });
  pgm.addConstraint('agent_tool_call_receipts', 'agent_tool_call_receipts_state_shape_check', {
    check: `
      (state='dispatched' AND consumed_at IS NULL AND ambiguous_at IS NULL
        AND result_ciphertext IS NULL AND actual_credits IS NULL)
      OR (state='consumed' AND consumed_at IS NOT NULL AND ambiguous_at IS NULL
        AND result_ciphertext IS NOT NULL AND actual_credits IS NOT NULL)
      OR (state='ambiguous' AND consumed_at IS NULL AND ambiguous_at IS NOT NULL
        AND result_ciphertext IS NULL AND actual_credits IS NULL)
    `
  });
  pgm.createIndex('agent_tool_call_receipts', ['run_id', 'state', 'updated_at'], {
    name: 'agent_tool_call_receipts_run_state_idx'
  });
  pgm.createIndex('agent_tool_call_receipts', ['expires_at'], {
    name: 'agent_tool_call_receipts_expiry_idx'
  });

  pgm.createTable('agent_budget_reservations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    run_id: {
      type: 'uuid',
      notNull: true,
      references: 'agent_runs',
      onDelete: 'CASCADE'
    },
    model_call_id: {
      type: 'uuid',
      references: 'agent_model_calls',
      onDelete: 'SET NULL'
    },
    subagent_id: {
      type: 'uuid',
      references: 'agent_subagents',
      onDelete: 'SET NULL'
    },
    component: {
      type: 'text',
      notNull: true,
      check: "component IN ('router','planner','actor','verifier','subagent','kolors','sandbox','final_summary')"
    },
    reservation_key: { type: 'text', notNull: true },
    reserved_credits: {
      type: 'numeric(12,4)',
      notNull: true,
      check: 'reserved_credits >= 0'
    },
    actual_credits: {
      type: 'numeric(12,4)',
      check: 'actual_credits IS NULL OR actual_credits >= 0'
    },
    state: {
      type: 'text',
      notNull: true,
      default: 'reserved',
      check: "state IN ('reserved','consumed','released')"
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    consumed_at: { type: 'timestamptz' },
    released_at: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_budget_reservations', 'agent_budget_reservations_key_unique', {
    unique: ['run_id', 'reservation_key']
  });
  pgm.addConstraint('agent_budget_reservations', 'agent_budget_reservations_state_shape_check', {
    check: `
      (state='reserved' AND consumed_at IS NULL AND released_at IS NULL)
      OR (state='consumed' AND consumed_at IS NOT NULL AND released_at IS NULL AND actual_credits IS NOT NULL)
      OR (state='released' AND released_at IS NOT NULL AND consumed_at IS NULL)
    `
  });
  pgm.createIndex('agent_budget_reservations', ['run_id', 'state'], {
    name: 'agent_budget_reservations_run_state_idx'
  });
  pgm.createIndex('agent_budget_reservations', ['model_call_id'], {
    name: 'agent_budget_reservations_model_call_unique',
    unique: true,
    where: 'model_call_id IS NOT NULL'
  });
  pgm.addConstraint('agent_budget_reservations', 'agent_budget_reservations_run_call_fk', {
    foreignKeys: {
      columns: ['model_call_id', 'run_id'],
      references: 'agent_model_calls(id,run_id)'
    }
  });
  pgm.addConstraint('agent_tool_call_receipts', 'agent_tool_call_receipts_budget_fk', {
    foreignKeys: {
      columns: ['run_id', 'reservation_key'],
      references: 'agent_budget_reservations(run_id,reservation_key)',
      onDelete: 'CASCADE'
    }
  });
};

exports.down = (pgm) => {
  pgm.dropTable('agent_budget_reservations', { ifExists: true, cascade: true });
  pgm.dropTable('agent_tool_call_receipts', { ifExists: true, cascade: true });
  pgm.dropTable('agent_model_call_receipts', { ifExists: true, cascade: true });
  pgm.dropConstraint('agent_model_calls', 'agent_model_calls_id_run_unique', { ifExists: true });
  pgm.dropConstraint('agent_runs', 'agent_runs_v2_1_hash_shape_check', { ifExists: true });
  pgm.dropColumns('agent_runs', [
    'lease_epoch',
    'runtime_profile_hash',
    'runtime_profile_summary',
    'final_text_sha256',
    'semantic_verification',
    'platform_overrun_credits'
  ], { ifExists: true });
};
