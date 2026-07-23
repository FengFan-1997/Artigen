exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('behavior_events', {
    id: { type: 'bigserial', primaryKey: true },
    event_id: { type: 'text', notNull: true, unique: true },
    actor_user_id: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL'
    },
    user_ref: { type: 'text', notNull: true, default: '' },
    session_ref: { type: 'text' },
    project_ref: { type: 'text' },
    event_type: { type: 'text', notNull: true },
    category: { type: 'text', notNull: true, default: 'interaction' },
    path: { type: 'text', notNull: true, default: '' },
    action: { type: 'text' },
    element: { type: 'text' },
    properties: { type: 'jsonb', notNull: true, default: '{}' },
    request_id: { type: 'text' },
    ip_hash: { type: 'text' },
    device_category: { type: 'text' },
    occurred_at: { type: 'timestamptz', notNull: true },
    received_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.addConstraint('behavior_events', 'behavior_events_shape_check', {
    check: `
      length(event_id) BETWEEN 1 AND 128
      AND length(user_ref) <= 128
      AND (session_ref IS NULL OR length(session_ref) <= 128)
      AND (project_ref IS NULL OR length(project_ref) <= 128)
      AND length(event_type) BETWEEN 1 AND 64
      AND length(category) BETWEEN 1 AND 64
      AND length(path) <= 512
      AND (action IS NULL OR length(action) <= 96)
      AND (element IS NULL OR length(element) <= 64)
      AND (request_id IS NULL OR length(request_id) <= 128)
      AND (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$')
      AND (device_category IS NULL OR device_category IN ('desktop','mobile','tablet','bot'))
      AND jsonb_typeof(properties) = 'object'
      AND octet_length(properties::text) <= 8192
    `
  });

  pgm.createIndex('behavior_events', ['occurred_at'], {
    name: 'behavior_events_occurred_idx'
  });
  pgm.createIndex('behavior_events', ['event_type', 'occurred_at'], {
    name: 'behavior_events_type_idx'
  });
  pgm.createIndex('behavior_events', ['actor_user_id', 'occurred_at'], {
    name: 'behavior_events_user_idx',
    where: 'actor_user_id IS NOT NULL'
  });
  pgm.createIndex('behavior_events', ['path', 'occurred_at'], {
    name: 'behavior_events_path_idx',
    where: "path <> ''"
  });
};

exports.down = (pgm) => {
  pgm.dropTable('behavior_events');
};
