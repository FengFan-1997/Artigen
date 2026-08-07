/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('agent_runs', {
    queue_expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("clock_timestamp() + interval '24 hours'")
    }
  });
  pgm.createIndex('agent_runs', ['status', 'queue_expires_at'], {
    name: 'agent_runs_queue_expiry_idx',
    where: "status='queued'"
  });

  pgm.addColumns('agent_budget_holds', {
    trial_credits: { type: 'integer', notNull: true, default: 0 },
    daily_free_credits: { type: 'integer', notNull: true, default: 0 }
  });
  pgm.sql(`
    UPDATE agent_budget_holds
       SET daily_free_credits=free_credits
     WHERE free_credits > 0
       AND trial_credits=0
       AND daily_free_credits=0
  `);
  pgm.addConstraint('agent_budget_holds', 'agent_budget_holds_free_split_check', {
    check: `
      trial_credits >= 0
      AND daily_free_credits >= 0
      AND trial_credits + daily_free_credits = free_credits
    `
  });

  pgm.createTable('agent_trial_usage', {
    user_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'users',
      onDelete: 'CASCADE'
    },
    granted_credits: { type: 'integer', notNull: true, default: 0 },
    reserved_credits: { type: 'integer', notNull: true, default: 0 },
    consumed_credits: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_trial_usage', 'agent_trial_usage_balance_check', {
    check: `
      granted_credits BETWEEN 0 AND 500
      AND reserved_credits >= 0
      AND consumed_credits >= 0
      AND reserved_credits + consumed_credits <= granted_credits
    `
  });

  pgm.createTable('agent_worker_heartbeats', {
    worker_id: { type: 'text', primaryKey: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'online',
      check: "status IN ('online','stopping','offline','error')"
    },
    model_provider: { type: 'text', notNull: true },
    model_name: { type: 'text', notNull: true },
    sandbox_provider: { type: 'text', notNull: true },
    sandbox_mode: {
      type: 'text',
      notNull: true,
      check: "sandbox_mode IN ('local','cloud','fixture')"
    },
    concurrency: {
      type: 'integer',
      notNull: true,
      default: 1,
      check: 'concurrency BETWEEN 1 AND 20'
    },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('agent_worker_heartbeats', ['status', 'last_seen_at'], {
    name: 'agent_worker_heartbeats_status_seen_idx'
  });
};

exports.down = (pgm) => {
  pgm.dropTable('agent_worker_heartbeats', { ifExists: true, cascade: true });
  pgm.dropTable('agent_trial_usage', { ifExists: true, cascade: true });
  pgm.dropConstraint('agent_budget_holds', 'agent_budget_holds_free_split_check', {
    ifExists: true
  });
  pgm.dropColumns('agent_budget_holds', ['trial_credits', 'daily_free_credits']);
  pgm.dropIndex('agent_runs', ['status', 'queue_expires_at'], {
    name: 'agent_runs_queue_expiry_idx',
    ifExists: true
  });
  pgm.dropColumns('agent_runs', ['queue_expires_at']);
};
