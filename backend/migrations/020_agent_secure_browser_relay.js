/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('agent_runs', {
    sandbox_worker_id: { type: 'text' }
  });
  pgm.addColumns('agent_worker_heartbeats', {
    browser_ready: { type: 'boolean', notNull: true, default: false },
    egress_verified: { type: 'boolean', notNull: true, default: false },
    desktop_relay_ready: { type: 'boolean', notNull: true, default: false },
    sandbox_image_ref: { type: 'text' }
  });

  pgm.createTable('agent_desktop_tickets', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    run_id: { type: 'uuid', notNull: true, references: 'agent_runs', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    approval_id: {
      type: 'uuid',
      notNull: true,
      references: 'agent_approvals',
      onDelete: 'CASCADE'
    },
    worker_id: { type: 'text', notNull: true },
    sandbox_ref: { type: 'text', notNull: true },
    token_hash: { type: 'bytea', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    consumed_at: { type: 'timestamptz' },
    relay_started_at: { type: 'timestamptz' },
    closed_at: { type: 'timestamptz' },
    revoked_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_desktop_tickets', 'agent_desktop_tickets_hash_shape_check', {
    check: 'octet_length(token_hash)=32'
  });
  pgm.createIndex('agent_desktop_tickets', ['run_id', 'expires_at'], {
    name: 'agent_desktop_tickets_run_expiry_idx'
  });
  pgm.createIndex('agent_desktop_tickets', ['worker_id', 'consumed_at'], {
    name: 'agent_desktop_tickets_worker_pending_idx',
    where: 'consumed_at IS NOT NULL AND relay_started_at IS NULL AND revoked_at IS NULL'
  });
};

exports.down = (pgm) => {
  pgm.dropTable('agent_desktop_tickets', { ifExists: true, cascade: true });
  pgm.dropColumns('agent_worker_heartbeats', [
    'browser_ready',
    'egress_verified',
    'desktop_relay_ready',
    'sandbox_image_ref'
  ]);
  pgm.dropColumns('agent_runs', ['sandbox_worker_id']);
};
