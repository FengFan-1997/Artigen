exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('operational_records', {
    id: { type: 'bigserial', primaryKey: true },
    record_kind: { type: 'text', notNull: true },
    record_key: { type: 'text', notNull: true },
    actor_user_id: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL'
    },
    user_ref: { type: 'text', notNull: true, default: '' },
    payload: { type: 'jsonb', notNull: true, default: '{}' },
    occurred_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.addConstraint('operational_records', 'operational_records_kind_key_unique', {
    unique: ['record_kind', 'record_key']
  });
  pgm.addConstraint('operational_records', 'operational_records_shape_check', {
    check: `
      record_kind IN ('usage','image_history','audit_history')
      AND length(record_key) BETWEEN 1 AND 128
      AND length(user_ref) <= 128
      AND jsonb_typeof(payload) = 'object'
      AND octet_length(payload::text) <= 16384
    `
  });

  pgm.createIndex('operational_records', ['record_kind', 'occurred_at'], {
    name: 'operational_records_kind_time_idx'
  });
  pgm.createIndex('operational_records', ['record_kind', 'user_ref', 'occurred_at'], {
    name: 'operational_records_user_time_idx'
  });
  pgm.createIndex('operational_records', ['actor_user_id', 'occurred_at'], {
    name: 'operational_records_actor_time_idx',
    where: 'actor_user_id IS NOT NULL'
  });
};

exports.down = (pgm) => {
  pgm.dropTable('operational_records');
};
