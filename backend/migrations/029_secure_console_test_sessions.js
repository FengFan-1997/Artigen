/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('sessions', {
    auth_mode: { type: 'text', notNull: true, default: 'standard' },
    entitlement: { type: 'text' }
  });
  pgm.createTable('secure_test_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    admin_principal: { type: 'text', notNull: true },
    test_user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    token_hash: { type: 'bytea', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    redeemed_at: { type: 'timestamptz' },
    revoked_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    metadata: { type: 'jsonb', notNull: true, default: '{}' }
  });
  pgm.createIndex('secure_test_sessions', ['test_user_id', 'expires_at']);
  pgm.createTable('user_entitlements', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    entitlement: { type: 'text', notNull: true },
    enabled: { type: 'boolean', notNull: true, default: true },
    expires_at: { type: 'timestamptz' },
    source: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
};

exports.down = (pgm) => {
  pgm.dropTable('user_entitlements');
  pgm.dropTable('secure_test_sessions');
  pgm.dropColumns('sessions', ['auth_mode', 'entitlement']);
};
