/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('agent_subagents', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    run_id: {
      type: 'uuid',
      notNull: true,
      references: 'agent_runs',
      onDelete: 'CASCADE'
    },
    ordinal: {
      type: 'smallint',
      notNull: true,
      check: 'ordinal BETWEEN 1 AND 3'
    },
    role: { type: 'text', notNull: true },
    label: { type: 'text', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'queued',
      check: "status IN ('queued','running','succeeded','failed','cancelled')"
    },
    request_hash: { type: 'bytea', notNull: true },
    step_count: {
      type: 'smallint',
      notNull: true,
      default: 0,
      check: 'step_count BETWEEN 0 AND 20'
    },
    estimated_credits_used: {
      type: 'numeric(12,4)',
      notNull: true,
      default: 0,
      check: 'estimated_credits_used >= 0'
    },
    usage: { type: 'jsonb', notNull: true, default: '{}' },
    summary: { type: 'text', notNull: true, default: '' },
    output_files: { type: 'jsonb', notNull: true, default: '[]' },
    cancel_requested: { type: 'boolean', notNull: true, default: false },
    error_code: { type: 'text' },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("clock_timestamp() + interval '30 days'")
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    started_at: { type: 'timestamptz' },
    finished_at: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_subagents', 'agent_subagents_run_ordinal_unique', {
    unique: ['run_id', 'ordinal']
  });
  pgm.addConstraint('agent_subagents', 'agent_subagents_public_text_shape_check', {
    check: 'length(role) BETWEEN 1 AND 80 AND length(label) BETWEEN 1 AND 160 AND length(summary) <= 4000'
  });
  pgm.createIndex('agent_subagents', ['run_id', 'created_at'], {
    name: 'agent_subagents_run_created_idx'
  });
  pgm.createIndex('agent_subagents', ['status', 'updated_at'], {
    name: 'agent_subagents_status_updated_idx'
  });

  pgm.createTable('agent_subagent_payloads', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    subagent_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'agent_subagents',
      onDelete: 'CASCADE'
    },
    run_id: {
      type: 'uuid',
      notNull: true,
      references: 'agent_runs',
      onDelete: 'CASCADE'
    },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'smallint', notNull: true, default: 1 },
    iv: { type: 'bytea', notNull: true },
    auth_tag: { type: 'bytea', notNull: true },
    ciphertext: { type: 'bytea', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_subagent_payloads', 'agent_subagent_payloads_crypto_shape_check', {
    check: `
      algorithm='aes-256-gcm-v1'
      AND key_version=1
      AND octet_length(iv)=12
      AND octet_length(auth_tag)=16
      AND octet_length(ciphertext) BETWEEN 1 AND 1048576
    `
  });
  pgm.createIndex('agent_subagent_payloads', ['expires_at'], {
    name: 'agent_subagent_payloads_expiry_idx'
  });

  pgm.createTable('agent_subagent_model_checkpoints', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    subagent_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'agent_subagents',
      onDelete: 'CASCADE'
    },
    run_id: {
      type: 'uuid',
      notNull: true,
      references: 'agent_runs',
      onDelete: 'CASCADE'
    },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'smallint', notNull: true, default: 1 },
    iv: { type: 'bytea', notNull: true },
    auth_tag: { type: 'bytea', notNull: true },
    ciphertext: { type: 'bytea', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint(
    'agent_subagent_model_checkpoints',
    'agent_subagent_model_checkpoints_crypto_shape_check',
    {
      check: `
        algorithm='aes-256-gcm-v1'
        AND key_version=1
        AND octet_length(iv)=12
        AND octet_length(auth_tag)=16
        AND octet_length(ciphertext) BETWEEN 1 AND 1048576
      `
    }
  );
  pgm.createIndex('agent_subagent_model_checkpoints', ['expires_at'], {
    name: 'agent_subagent_model_checkpoints_expiry_idx'
  });

  pgm.addColumns('agent_steps', {
    subagent_id: {
      type: 'uuid',
      references: 'agent_subagents',
      onDelete: 'SET NULL'
    }
  });
  pgm.createIndex('agent_steps', ['run_id', 'subagent_id', 'sequence'], {
    name: 'agent_steps_subagent_sequence_idx'
  });

  pgm.addColumns('agent_events', {
    subagent_id: {
      type: 'uuid',
      references: 'agent_subagents',
      onDelete: 'SET NULL'
    }
  });
  pgm.createIndex('agent_events', ['run_id', 'subagent_id', 'id'], {
    name: 'agent_events_subagent_cursor_idx'
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('agent_events', ['run_id', 'subagent_id', 'id'], {
    name: 'agent_events_subagent_cursor_idx',
    ifExists: true
  });
  pgm.dropColumns('agent_events', ['subagent_id'], { ifExists: true });
  pgm.dropIndex('agent_steps', ['run_id', 'subagent_id', 'sequence'], {
    name: 'agent_steps_subagent_sequence_idx',
    ifExists: true
  });
  pgm.dropColumns('agent_steps', ['subagent_id'], { ifExists: true });
  pgm.dropTable('agent_subagent_model_checkpoints', { ifExists: true, cascade: true });
  pgm.dropTable('agent_subagent_payloads', { ifExists: true, cascade: true });
  pgm.dropTable('agent_subagents', { ifExists: true, cascade: true });
};
