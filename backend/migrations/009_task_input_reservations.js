exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('tool_tasks', {
    inputs_ready: {
      type: 'boolean',
      notNull: true,
      default: true
    }
  });
  pgm.createIndex(
    'tool_tasks',
    ['inputs_ready', 'status', 'lease_expires_at', 'created_at'],
    {
      name: 'tool_tasks_ready_lease_candidates_idx',
      where: "inputs_ready=true AND status IN ('queued','running')"
    }
  );
  // Semantic reference slots are positional. The same opaque asset may be a
  // deliberate product and style reference, so identity cannot include asset_id.
  pgm.dropConstraint('tool_task_assets', 'tool_task_assets_pk');
  pgm.addConstraint('tool_task_assets', 'tool_task_assets_pk', {
    primaryKey: ['task_id', 'role', 'position']
  });
  pgm.createIndex('tool_task_assets', ['asset_id'], {
    name: 'tool_task_assets_asset_idx'
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('tool_task_assets', ['asset_id'], {
    name: 'tool_task_assets_asset_idx',
    ifExists: true
  });
  pgm.dropConstraint('tool_task_assets', 'tool_task_assets_pk', { ifExists: true });
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
          FROM tool_task_assets
         GROUP BY task_id, asset_id, role
        HAVING count(*) > 1
      ) THEN
        RAISE EXCEPTION
          'Cannot roll back 009_task_input_reservations: positional semantic references would be lost';
      END IF;
    END $$;
  `);
  pgm.addConstraint('tool_task_assets', 'tool_task_assets_pk', {
    primaryKey: ['task_id', 'asset_id', 'role']
  });
  pgm.dropIndex(
    'tool_tasks',
    ['inputs_ready', 'status', 'lease_expires_at', 'created_at'],
    { name: 'tool_tasks_ready_lease_candidates_idx', ifExists: true }
  );
  pgm.dropColumns('tool_tasks', ['inputs_ready']);
};
