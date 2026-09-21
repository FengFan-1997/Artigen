exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('agent_canary_circuit_state', {
    circuit_key: { type: 'text', primaryKey: true },
    enabled: { type: 'boolean', notNull: true, default: false },
    is_open: { type: 'boolean', notNull: true, default: false },
    opened_at: { type: 'timestamptz' },
    opened_by: { type: 'text', notNull: true, default: '' },
    recovered_at: { type: 'timestamptz' },
    recovered_by: { type: 'text', notNull: true, default: '' },
    incidents: { type: 'integer', notNull: true, default: 0 },
    ambiguous_incidents: { type: 'integer', notNull: true, default: 0 },
    last_code: { type: 'text', notNull: true, default: '' },
    last_run_id: { type: 'text', notNull: true, default: '' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.addConstraint('agent_canary_circuit_state', 'agent_canary_circuit_state_shape_check', {
    check: `
      length(circuit_key) BETWEEN 1 AND 80
      AND length(opened_by) <= 120
      AND length(recovered_by) <= 120
      AND length(last_code) <= 120
      AND length(last_run_id) <= 120
      AND incidents >= 0
      AND ambiguous_incidents >= 0
    `
  });
};

exports.down = (pgm) => {
  pgm.dropTable('agent_canary_circuit_state');
};
