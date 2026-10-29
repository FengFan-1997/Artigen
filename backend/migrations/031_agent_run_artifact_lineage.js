/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('agent_run_source_artifacts', {
    run_id: {
      type: 'uuid',
      notNull: true,
      references: 'agent_runs',
      onDelete: 'CASCADE'
    },
    source_artifact_id: {
      type: 'uuid',
      notNull: true,
      references: 'agent_artifacts',
      onDelete: 'CASCADE'
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('agent_run_source_artifacts', 'agent_run_source_artifacts_unique', {
    primaryKey: ['run_id', 'source_artifact_id']
  });
  pgm.createIndex('agent_run_source_artifacts', ['source_artifact_id'], {
    name: 'agent_run_source_artifacts_source_idx'
  });
};

exports.down = (pgm) => {
  pgm.dropTable('agent_run_source_artifacts');
};
