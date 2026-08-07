exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('asset_upload_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    owner_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'RESTRICT'
    },
    idempotency_key: { type: 'text', notNull: true },
    tool_id: { type: 'text', notNull: true },
    operation: { type: 'text', notNull: true },
    object_key: { type: 'text', notNull: true, unique: true },
    upload_kind: {
      type: 'text',
      notNull: true,
      check: "upload_kind IN ('single','multipart')"
    },
    provider_upload_id: { type: 'text' },
    declared_mime: { type: 'text', notNull: true },
    declared_size: { type: 'bigint', notNull: true, check: 'declared_size > 0' },
    max_bytes: { type: 'bigint', notNull: true, check: 'max_bytes > 0' },
    max_pixels: { type: 'bigint', notNull: true, default: 0, check: 'max_pixels >= 0' },
    retention_hours: { type: 'integer', notNull: true, default: 1, check: 'retention_hours > 0' },
    allowed_mime_types: { type: 'text[]', notNull: true, default: '{}' },
    part_size: { type: 'integer', check: 'part_size IS NULL OR part_size >= 5242880' },
    status: {
      type: 'text',
      notNull: true,
      default: 'created',
      check: "status IN ('created','uploading','verifying','complete','aborted','failed','expired')"
    },
    asset_id: { type: 'uuid', references: 'assets(id)', onDelete: 'RESTRICT' },
    error_code: { type: 'text' },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' }
  });
  pgm.addConstraint('asset_upload_sessions', 'asset_upload_sessions_owner_idempotency_unique', {
    unique: ['owner_user_id', 'idempotency_key']
  });
  pgm.createIndex('asset_upload_sessions', ['owner_user_id', 'status', 'created_at'], {
    name: 'asset_upload_sessions_owner_status_idx'
  });
  pgm.createIndex('asset_upload_sessions', ['status', 'expires_at'], {
    name: 'asset_upload_sessions_expiry_idx'
  });
};

exports.down = (pgm) => {
  pgm.dropTable('asset_upload_sessions');
};
